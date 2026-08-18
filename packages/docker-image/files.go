package main

import (
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

// maxBatchBytes is the per-request content budget.
//
// The server refuses any single request whose files total over 8 MiB. Stay
// under it with headroom rather than at it: the server counts plaintext bytes,
// but the response also carries base64 and JSON overhead.
const maxBatchBytes int64 = 6 * 1024 * 1024

// maxRateLimitAttempts bounds the 429 retry loop so a genuinely wedged limiter
// still fails the build rather than hanging it forever.
const maxRateLimitAttempts = 5

// maxRetryAfter caps the server's cooldown so a bad header cannot stall a
// build for hours.
const maxRetryAfter = 60 * time.Second

// batchByTotalSize greedily packs files into batches under budget bytes.
//
// A file larger than the budget gets its own batch. The server may still
// refuse it, but failing on that one file with a clear message beats silently
// dropping it from the pull.
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

// withRateLimitRetry runs attempt, retrying only on a 429 and only for the
// cooldown the SERVER asked for.
//
// Batching deliberately turns one logical pull into several requests, so a
// large project can legitimately reach the per-key limit mid-pull. Treating
// that as terminal would fail the build with half the keystores written.
func withRateLimitRetry[T any](label string, attempt func() (T, error), sleep func(time.Duration), warn func(string)) (T, error) {
	var zero T
	for i := 1; ; i++ {
		result, err := attempt()
		if err == nil {
			return result, nil
		}
		var apiErr *APIError
		is429 := errors.As(err, &apiErr) && apiErr.Status == http.StatusTooManyRequests
		if !is429 || i >= maxRateLimitAttempts {
			return zero, err
		}
		wait := apiErr.RetryAfter
		if wait <= 0 {
			wait = 5 * time.Second
		}
		if wait > maxRetryAfter {
			wait = maxRetryAfter
		}
		warn(fmt.Sprintf("rate limited on %s, waiting %s (attempt %d/%d)", label, wait, i, maxRateLimitAttempts))
		sleep(wait)
	}
}

// contained reports whether candidate is strictly inside root.
func contained(root, candidate string) bool {
	rel, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	return rel != "." && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

// writeSecretFile writes one secret file to its recorded path.
//
// The path comes from the server and the server validates it, but this is the
// process that actually creates files, so it re-checks containment itself. A
// server bug or a tampered response must not be able to write outside the
// output directory.
func writeSecretFile(root string, f File, hasContent bool) error {
	if filepath.IsAbs(f.Path) || strings.HasPrefix(f.Path, "/") || strings.HasPrefix(f.Path, `\`) {
		return errors.New("refusing an absolute path")
	}
	if !hasContent {
		// A metadata-only row reaching the write path means the batching logic
		// asked for the wrong thing. Fail loudly rather than write an empty
		// file over a real one.
		return errors.New("server returned no content for this file")
	}

	absoluteRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return err
	}
	absoluteRoot, err = filepath.Abs(absoluteRoot)
	if err != nil {
		return err
	}

	destination := filepath.Join(absoluteRoot, f.Path)
	if !contained(absoluteRoot, destination) {
		return errors.New("refusing a path outside the output directory")
	}

	// Lexical containment is not enough: a directory inside the output root can
	// be a symlink pointing out of it, and the cleaned path still looks
	// contained. Resolve the deepest EXISTING ancestor for real.
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
			return evalErr
		}
		if realAncestor != absoluteRoot && !contained(absoluteRoot, realAncestor) {
			return errors.New("refusing a path that escapes through a symlink")
		}
	}
	if info, statErr := os.Lstat(destination); statErr == nil {
		if info.Mode()&fs.ModeSymlink != 0 {
			return errors.New("refusing to write through a symlink")
		}
	} else if !errors.Is(statErr, fs.ErrNotExist) {
		return statErr
	}

	content, err := base64.StdEncoding.DecodeString(f.Content)
	if err != nil {
		return errors.New("server returned unreadable content for this file")
	}

	mode := fs.FileMode(0o600)
	if f.Mode == "0400" {
		mode = 0o400
	}

	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return err
	}

	// A pre-existing file keeps its old (possibly world-readable) mode while
	// new secret contents land in it, so stage into a fresh exclusive temp at
	// the restrictive mode and rename over the target instead.
	suffix := make([]byte, 8)
	if _, err := rand.Read(suffix); err != nil {
		return err
	}
	temp := fmt.Sprintf("%s.envpilot-%d-%s.tmp", destination, os.Getpid(), hex.EncodeToString(suffix))

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
	// O_CREATE applies mode through umask; chmod sets it exactly.
	if err := os.Chmod(temp, mode); err != nil {
		os.Remove(temp)
		return err
	}
	if err := os.Rename(temp, destination); err != nil {
		os.Remove(temp)
		return err
	}
	return os.Chmod(destination, mode)
}

// pullSecretFiles fetches every secret file for the configured
// project/environment and writes it under dir. Returns the paths written.
func pullSecretFiles(client *http.Client, c *Config, dir string, warn func(string)) ([]string, error) {
	manifest, err := withRateLimitRetry("file metadata",
		func() ([]File, error) { return fetchFiles(client, c, nil) },
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
		chunk, err := withRateLimitRetry("file contents",
			func() ([]File, error) { return fetchFiles(client, c, paths) },
			time.Sleep, warn)
		if err != nil {
			return nil, err
		}
		files = append(files, chunk...)
	}

	// Create and canonicalize the root BEFORE any write: writeSecretFile
	// resolves symlinks on it, which fails on a directory that does not exist
	// yet.
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}

	written := make([]string, 0, len(files))
	for _, f := range files {
		if err := writeSecretFile(dir, f, f.Content != ""); err != nil {
			return nil, fmt.Errorf("could not write %s — %w", f.Path, err)
		}
		written = append(written, f.Path)
	}
	return written, nil
}
