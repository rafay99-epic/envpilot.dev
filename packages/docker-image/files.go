package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxBatchBytes int64 = 6 * 1024 * 1024

const maxAttempts = 5

const maxRetryAfter = 60 * time.Second

const overallTimeout = 5 * time.Minute

func batchByTotalSize(files []File, budget int64) [][]File {
	var batches [][]File
	var current []File
	var total int64
	for _, f := range files {
		if len(current) > 0 && total+f.Size > budget {
			batches = append(batches, current)
			current = nil
			total = 0
		}
		current = append(current, f)
		total += f.Size
	}
	if len(current) > 0 {
		batches = append(batches, current)
	}
	return batches
}

func retryable(err error) (wait time.Duration, ok bool) {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		switch apiErr.Status {
		case http.StatusTooManyRequests:
			return apiErr.RetryAfter, true
		case http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
			return 0, true
		}
		return 0, false
	}
	var transient *transientError
	if errors.As(err, &transient) {
		return 0, true
	}
	return 0, false
}

func withRetry[T any](ctx context.Context, label string, attempt func() (T, error), sleep func(time.Duration), warn func(string)) (T, error) {
	var zero T
	for i := 1; ; i++ {
		result, err := attempt()
		if err == nil {
			return result, nil
		}
		wait, ok := retryable(err)
		if !ok || i >= maxAttempts {
			return zero, err
		}
		if wait <= 0 {
			wait = 2 * time.Second * time.Duration(i)
		}
		if wait > maxRetryAfter {
			wait = maxRetryAfter
		}
		if deadline, has := ctx.Deadline(); has && time.Until(deadline) < wait {
			return zero, fmt.Errorf("%s: gave up after %s, last error: %w", label, overallTimeout, err)
		}
		warn(fmt.Sprintf("retrying %s in %s (attempt %d/%d)", label, wait, i, maxAttempts))
		sleep(wait)
	}
}

func contained(root, candidate string) bool {
	rel, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	return rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

type stagedFile struct {
	path    string
	dest    string
	content []byte
	mode    fs.FileMode
}

func stageSecretFile(absoluteRoot string, f File) (stagedFile, error) {
	var zero stagedFile
	if filepath.IsAbs(f.Path) || strings.HasPrefix(f.Path, "/") || strings.HasPrefix(f.Path, `\`) {
		return zero, errors.New("refusing an absolute path")
	}
	if f.Content == "" {
		return zero, errors.New("server returned no content for this file")
	}

	destination := filepath.Join(absoluteRoot, f.Path)
	if !contained(absoluteRoot, destination) {
		return zero, errors.New("refusing a path outside the output directory")
	}

	ancestor := filepath.Dir(destination)
	for {
		if _, statErr := os.Lstat(ancestor); statErr == nil {
			break
		}
		if !contained(absoluteRoot, ancestor) {
			break
		}
		ancestor = filepath.Dir(ancestor)
	}
	if _, statErr := os.Lstat(ancestor); statErr == nil {
		realAncestor, evalErr := filepath.EvalSymlinks(ancestor)
		if evalErr != nil {
			return zero, evalErr
		}
		if realAncestor != absoluteRoot && !contained(absoluteRoot, realAncestor) {
			return zero, errors.New("refusing a path that escapes through a symlink")
		}
	}
	if info, statErr := os.Lstat(destination); statErr == nil {
		if info.Mode()&fs.ModeSymlink != 0 {
			return zero, errors.New("refusing to write through a symlink")
		}
	} else if !errors.Is(statErr, fs.ErrNotExist) {
		return zero, statErr
	}

	content, err := base64.StdEncoding.DecodeString(f.Content)
	if err != nil {
		return zero, errors.New("server returned unreadable content for this file")
	}
	if int64(len(content)) != f.Size {
		return zero, fmt.Errorf("content is %d bytes, metadata says %d", len(content), f.Size)
	}

	var mode fs.FileMode
	switch f.Mode {
	case "0400":
		mode = 0o400
	case "0600", "":
		mode = 0o600
	default:
		return zero, fmt.Errorf("unsupported file mode %q", f.Mode)
	}

	return stagedFile{path: f.Path, dest: destination, content: content, mode: mode}, nil
}

func writeAtomic(dest string, content []byte, mode fs.FileMode) error {
	suffix := make([]byte, 8)
	if _, err := rand.Read(suffix); err != nil {
		return err
	}
	temp := fmt.Sprintf("%s.envpilot-%d-%s.tmp", dest, os.Getpid(), hex.EncodeToString(suffix))

	handle, err := os.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return err
	}
	if _, err := handle.Write(content); err != nil {
		handle.Close()
		os.Remove(temp)
		return err
	}
	if err := handle.Close(); err != nil {
		os.Remove(temp)
		return err
	}
	if err := os.Chmod(temp, mode); err != nil {
		os.Remove(temp)
		return err
	}
	if err := os.Rename(temp, dest); err != nil {
		os.Remove(temp)
		return err
	}
	return os.Chmod(dest, mode)
}

func writeSecretFiles(root string, files []File) ([]string, error) {
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, err
	}
	absoluteRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, err
	}
	absoluteRoot, err = filepath.Abs(absoluteRoot)
	if err != nil {
		return nil, err
	}

	staged := make([]stagedFile, 0, len(files))
	for _, f := range files {
		s, err := stageSecretFile(absoluteRoot, f)
		if err != nil {
			return nil, fmt.Errorf("could not write %s — %w", f.Path, err)
		}
		staged = append(staged, s)
	}

	written := make([]string, 0, len(staged))
	for _, s := range staged {
		if err := os.MkdirAll(filepath.Dir(s.dest), 0o700); err != nil {
			return written, fmt.Errorf("could not write %s — %w", s.path, err)
		}
		if err := writeAtomic(s.dest, s.content, s.mode); err != nil {
			return written, fmt.Errorf("could not write %s — %w", s.path, err)
		}
		written = append(written, s.path)
	}
	return written, nil
}

func pullSecretFiles(ctx context.Context, client *http.Client, c *Config, dir string, warn func(string)) ([]string, error) {
	manifest, err := withRetry(ctx, "file metadata",
		func() ([]File, error) { return fetchFiles(ctx, client, c, nil) },
		time.Sleep, warn)
	if err != nil {
		return nil, err
	}
	if len(manifest) == 0 {
		return nil, nil
	}

	var files []File
	for _, batch := range batchByTotalSize(manifest, maxBatchBytes) {
		paths := make([]string, 0, len(batch))
		for _, f := range batch {
			paths = append(paths, f.Path)
		}
		chunk, err := withRetry(ctx, "file contents",
			func() ([]File, error) { return fetchFiles(ctx, client, c, paths) },
			time.Sleep, warn)
		if err != nil {
			return nil, err
		}
		files = append(files, chunk...)
	}

	return writeSecretFiles(dir, files)
}
