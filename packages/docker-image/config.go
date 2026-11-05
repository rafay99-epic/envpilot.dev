package main

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

const DefaultAPIURL = "https://www.envpilot.dev"

const Surface = "docker"

type Config struct {
	APIURL      string
	Token       string
	Project     string
	Environment string
}

type ConfigError struct{ msg string }

func (e *ConfigError) Error() string { return e.msg }

func configErrorf(format string, a ...any) error {
	return &ConfigError{msg: fmt.Sprintf(format, a...)}
}

func resolveToken(getenv func(string) string) (string, error) {
	if path := strings.TrimSpace(getenv("ENVPILOT_TOKEN_FILE")); path != "" {
		raw, err := os.ReadFile(path)
		if err != nil {
			return "", configErrorf("ENVPILOT_TOKEN_FILE points at %s, which could not be read.", path)
		}
		token := strings.TrimSpace(string(raw))
		if token == "" {
			return "", configErrorf("ENVPILOT_TOKEN_FILE points at %s, which is empty.", path)
		}
		return token, nil
	}

	if inline := strings.TrimSpace(getenv("ENVPILOT_TOKEN")); inline != "" {
		return inline, nil
	}

	return "", configErrorf("No API key. Set ENVPILOT_TOKEN_FILE to a mounted secret (preferred) or ENVPILOT_TOKEN.")
}

// assertSecureAPIURL refuses a plaintext base URL.
//
// The token travels in an Authorization header on every request, so http://
// puts a key that can read the whole project and environment on the wire in
// clear. Loopback stays allowed so a local dev server can be exercised.
func assertSecureAPIURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		return configErrorf("API URL is not a valid URL: %s", raw)
	}
	if parsed.Scheme == "https" {
		return nil
	}
	host := parsed.Hostname()
	if parsed.Scheme == "http" && (host == "localhost" || host == "127.0.0.1" || host == "::1") {
		return nil
	}
	return configErrorf(
		"Refusing to send the API key over %s. Use an https API URL (got %s).",
		parsed.Scheme, raw,
	)
}

func resolveConfig(args *Args, getenv func(string) string) (*Config, error) {
	project := args.Project
	if project == "" {
		project = strings.TrimSpace(getenv("ENVPILOT_PROJECT"))
	}
	if project == "" {
		return nil, configErrorf("No project. Pass --project <slug> or set ENVPILOT_PROJECT.")
	}

	environment := args.Env
	if environment == "" {
		environment = strings.TrimSpace(getenv("ENVPILOT_ENVIRONMENT"))
	}
	if environment == "" {
		return nil, configErrorf("No environment. Pass --env <name> or set ENVPILOT_ENVIRONMENT.")
	}

	apiURL := args.APIURL
	if apiURL == "" {
		apiURL = strings.TrimSpace(getenv("ENVPILOT_API_URL"))
	}
	if apiURL == "" {
		apiURL = DefaultAPIURL
	}
	apiURL = strings.TrimRight(apiURL, "/")
	if err := assertSecureAPIURL(apiURL); err != nil {
		return nil, err
	}

	token, err := resolveToken(getenv)
	if err != nil {
		return nil, err
	}

	return &Config{
		APIURL:      apiURL,
		Token:       token,
		Project:     project,
		Environment: environment,
	}, nil
}
