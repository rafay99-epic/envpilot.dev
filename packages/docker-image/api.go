package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Client for the two public REST endpoints this image reads. Both authorize
// through _authorizeRequest on the server, which checks the docker surface's
// own tier gate (docker_image) rather than the REST API's.

// Variable is one key/value pair.
type Variable struct {
	Key   string  `json:"key"`
	Value *string `json:"value"`
}

// File is one secret file. Content is base64 and absent in metadata-only
// replies.
type File struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Mode    string `json:"mode"`
	Size    int64  `json:"size"`
	SHA256  string `json:"sha256"`
	Content string `json:"content"`
}

// APIError is any non-2xx response. Message is the server's {error} body when
// it sent one, which is safe to print as-is: the API never echoes the
// credential.
type APIError struct {
	Message    string
	Status     int
	RetryAfter time.Duration // zero when the server sent no usable header
}

func (e *APIError) Error() string { return e.Message }

// retryAfterOf parses Retry-After (seconds form).
//
// An empty header must NOT fall through to zero-as-a-value: that reads as
// "retry immediately" and turns a malformed header into a hot loop against
// the limiter. Callers treat a zero duration as "absent" and use their own
// default.
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
		// A non-JSON body (a proxy error page, usually) leaves the status as
		// the only signal, which is fine.
		if json.Unmarshal(body, &parsed) == nil && parsed.Error != "" {
			msg = parsed.Error
		}
	}
	return &APIError{Message: msg, Status: resp.StatusCode, RetryAfter: retryAfterOf(resp)}
}

func (c *Config) get(client *http.Client, path string) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, c.APIURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		// net/http embeds the full URL in its errors. The URL carries no
		// credential (the key is a header), but it does carry the project and
		// environment, so keep the message short rather than echoing it.
		return nil, fmt.Errorf("could not reach %s", c.APIURL)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, errorFor(resp)
	}
	return io.ReadAll(resp.Body)
}

// fetchVariables reads every variable for the configured project and
// environment.
func fetchVariables(client *http.Client, c *Config) ([]Variable, error) {
	q := url.Values{}
	q.Set("environment", c.Environment)
	q.Set("surface", Surface)
	path := "/api/v1/projects/" + url.PathEscape(c.Project) + "/variables?" + q.Encode()

	body, err := c.get(client, path)
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Variables []Variable `json:"variables"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("could not parse the variables response")
	}

	// A row without a value means the server declined to decrypt it. Writing
	// an empty string there would silently hand the app a blank credential,
	// so refuse the whole pull instead.
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

// fetchFiles reads secret files. With paths nil the reply is metadata only —
// path, size and checksum, nothing decrypted — which is what makes batching
// possible, since the caller otherwise has no way to know the sizes.
func fetchFiles(client *http.Client, c *Config, paths []string) ([]File, error) {
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

	body, err := c.get(client, "/api/v1/files?"+q.Encode())
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
