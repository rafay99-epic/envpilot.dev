package main

import (
	"fmt"
	"os"
	"strings"
)

// DefaultAPIURL is the production Envpilot deployment.
const DefaultAPIURL = "https://www.envpilot.dev"

// Surface identifies this client to the server's single authorization core.
//
// Every request declares it. That is not cosmetic: the server uses it to check
// BOTH that the key was minted for this surface and that the org's plan
// includes the docker_image feature. Omitting it would fall back to the
// server's rest_api inference, so the image would ride the REST API's tier
// gate and any REST-scoped key would work here — exactly the coupling this
// surface exists to avoid.
const Surface = "docker"

// Config is everything needed to make a request, resolved from flags and the
// environment. There is no config file and no login state: a container gets
// exactly what its operator passed in, and nothing persists between runs.
type Config struct {
	APIURL      string
	Token       string
	Project     string
	Environment string
}

// ConfigError is a bad invocation. Callers print it and exit 2.
type ConfigError struct{ msg string }

func (e *ConfigError) Error() string { return e.msg }

func configErrorf(format string, a ...any) error {
	return &ConfigError{msg: fmt.Sprintf(format, a...)}
}

// resolveToken reads the API key.
//
// ENVPILOT_TOKEN_FILE wins over ENVPILOT_TOKEN because a mounted file is the
// safer of the two: an environment variable is readable through
// `docker inspect` and /proc/<pid>/environ by anyone with daemon access, while
// a Compose/BuildKit secret is a tmpfs mount that never enters the image or
// its history.
//
// There is deliberately no --token flag. A credential on a command line lands
// in ps, in shell history, and in build logs.
func resolveToken(getenv func(string) string) (string, error) {
	if path := strings.TrimSpace(getenv("ENVPILOT_TOKEN_FILE")); path != "" {
		raw, err := os.ReadFile(path)
		if err != nil {
			// Naming the path is safe and is almost always the actual mistake
			// (wrong mount target). The contents never reach the message.
			return "", configErrorf("ENVPILOT_TOKEN_FILE points at %s, which could not be read.", path)
		}
		// Trailing newlines are near-universal in mounted secret files and a
		// stray one turns every request into an opaque 401.
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

// resolveConfig merges parsed flags over environment variables.
//
// Flags win so a single image can serve several environments without being
// rebuilt, which is the whole point of pulling config at runtime.
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
