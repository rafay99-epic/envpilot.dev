package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Variable struct {
	Key   string  `json:"key"`
	Value *string `json:"value"`
}

type File struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Mode    string `json:"mode"`
	Size    int64  `json:"size"`
	SHA256  string `json:"sha256"`
	Content string `json:"content"`
}

type APIError struct {
	Message    string
	Status     int
	RetryAfter time.Duration
}

func (e *APIError) Error() string { return e.Message }

type transientError struct{ msg string }

func (e *transientError) Error() string { return e.msg }

func retryAfterOf(resp *http.Response) time.Duration {
	raw := strings.TrimSpace(resp.Header.Get("Retry-After"))
	if raw == "" {
		return 0
	}
	seconds, err := strconv.ParseFloat(raw, 64)
	if err != nil || seconds < 0 {
		return 0
	}
	return time.Duration(seconds * float64(time.Second))
}

func errorFor(resp *http.Response) *APIError {
	msg := fmt.Sprintf("Request failed with status %d", resp.StatusCode)
	if body, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10)); err == nil {
		var parsed struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(body, &parsed) == nil && parsed.Error != "" {
			msg = parsed.Error
		}
	}
	return &APIError{Message: msg, Status: resp.StatusCode, RetryAfter: retryAfterOf(resp)}
}

func (c *Config) get(ctx context.Context, client *http.Client, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.APIURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		if strings.Contains(err.Error(), "x509") {
			return nil, errors.New("TLS failed: this image has no CA certificates (" + c.APIURL + ")")
		}
		return nil, &transientError{msg: "could not reach " + c.APIURL}
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, errorFor(resp)
	}
	return io.ReadAll(resp.Body)
}

func fetchVariables(ctx context.Context, client *http.Client, c *Config) ([]Variable, error) {
	q := url.Values{}
	q.Set("environment", c.Environment)
	q.Set("surface", Surface)
	path := "/api/v1/projects/" + url.PathEscape(c.Project) + "/variables?" + q.Encode()

	body, err := c.get(ctx, client, path)
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Variables []Variable `json:"variables"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("could not parse the variables response")
	}

	missing := 0
	for _, v := range parsed.Variables {
		if v.Value == nil {
			missing++
		}
	}
	if missing > 0 {
		return nil, &APIError{
			Message: fmt.Sprintf("Refusing a partial pull — %d variable(s) came back without a value.", missing),
			Status:  502,
		}
	}
	return parsed.Variables, nil
}

func fetchFiles(ctx context.Context, client *http.Client, c *Config, paths []string) ([]File, error) {
	q := url.Values{}
	q.Set("project", c.Project)
	q.Set("environment", c.Environment)
	q.Set("surface", Surface)
	if paths == nil {
		q.Set("metadataOnly", "1")
	} else {
		for _, p := range paths {
			q.Add("path", p)
		}
	}

	body, err := c.get(ctx, client, "/api/v1/files?"+q.Encode())
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Files []File `json:"files"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("could not parse the files response")
	}
	return parsed.Files, nil
}
