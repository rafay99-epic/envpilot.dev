// Command envpilot pulls Envpilot variables and secret files into a Docker
// build or a running container.
//
// Three commands, no state: `pull` writes a dotenv, `files` writes secret
// files, `exec` injects variables into a child process. Nothing is cached and
// no config is persisted, so the same binary behaves identically in a BuildKit
// mount and as a container ENTRYPOINT.
//
// Written in Go for one reason: it must run inside whatever base image the
// user picked. Go with CGO_ENABLED=0 produces a genuinely static binary with
// no dynamic loader, so it works in scratch, distroless, alpine (musl) and
// debian (glibc) alike. A Bun- or Node-compiled binary cannot: both link
// against a libc and die with "exec: no such file or directory" the moment the
// base image's loader does not match.
//
// Exit codes: 0 success, 1 request or write failure, 2 bad invocation, and for
// `exec` the child's own code (or 128+signal).
package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

// version is injected at build time with
// -ldflags "-X main.version=$(jq -r .version package.json)".
// The publish workflow asserts it matches package.json before pushing, so the
// two can never drift.
var version = "dev"

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(argv []string) int {
	args, err := parseArgs(argv)
	if err != nil {
		fmt.Fprintf(os.Stderr, "envpilot: %s\n", err)
		return 2
	}
	if args.Help {
		fmt.Fprintln(os.Stdout, usage)
		return 0
	}
	if args.Version {
		fmt.Fprintln(os.Stdout, version)
		return 0
	}

	// Progress goes to stderr so `pull` can stream dotenv text on stdout.
	warn := func(msg string) {
		if !args.Quiet {
			fmt.Fprintf(os.Stderr, "envpilot: %s\n", msg)
		}
	}

	cfg, err := resolveConfig(args, os.Getenv)
	if err != nil {
		fmt.Fprintf(os.Stderr, "envpilot: %s\n", err)
		return 2
	}

	// A container start that cannot reach the API must fail fast rather than
	// hang a deploy behind a default that has no timeout at all.
	client := &http.Client{Timeout: 60 * time.Second}

	dir := args.Dir
	if dir == "" {
		dir = "."
	}

	if args.Command == "files" {
		written, err := pullSecretFiles(client, cfg, dir, warn)
		if err != nil {
			fmt.Fprintf(os.Stderr, "envpilot: %s\n", err)
			return 1
		}
		// Paths and counts only. Contents are NEVER logged: masking a
		// multi-megabyte binary is not meaningful, so the rule is that they
		// never reach the log in the first place.
		for _, p := range written {
			warn("wrote " + p)
		}
		warn(fmt.Sprintf("%d secret file%s for %s/%s", len(written), plural(len(written)), cfg.Project, cfg.Environment))
		return 0
	}

	vars, err := withRateLimitRetry("variables",
		func() ([]Variable, error) { return fetchVariables(client, cfg) },
		time.Sleep, warn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "envpilot: %s\n", err)
		return 1
	}
	warn(fmt.Sprintf("pulled %d variable%s from %s/%s", len(vars), plural(len(vars)), cfg.Project, cfg.Environment))

	if args.Command == "pull" {
		content := buildDotenv(vars)
		if args.Out == "" {
			fmt.Fprint(os.Stdout, content)
			return 0
		}
		// O_TRUNC, not append, and an explicit chmod: an existing file at this
		// path would otherwise keep its old, possibly world-readable, mode.
		handle, err := os.OpenFile(args.Out, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
		if err != nil {
			fmt.Fprintf(os.Stderr, "envpilot: could not write %s — %s\n", args.Out, err)
			return 1
		}
		if _, err := handle.WriteString(content); err != nil {
			handle.Close()
			fmt.Fprintf(os.Stderr, "envpilot: could not write %s — %s\n", args.Out, err)
			return 1
		}
		if err := handle.Close(); err != nil {
			fmt.Fprintf(os.Stderr, "envpilot: could not write %s — %s\n", args.Out, err)
			return 1
		}
		if err := os.Chmod(args.Out, 0o600); err != nil {
			fmt.Fprintf(os.Stderr, "envpilot: could not secure %s — %s\n", args.Out, err)
			return 1
		}
		warn("wrote " + args.Out)
		return 0
	}

	if args.WithFiles {
		written, err := pullSecretFiles(client, cfg, dir, warn)
		if err != nil {
			fmt.Fprintf(os.Stderr, "envpilot: %s\n", err)
			return 1
		}
		warn(fmt.Sprintf("%d secret file%s written", len(written), plural(len(written))))
	}

	code, err := execWithVariables(args.Rest, vars)
	if err != nil {
		fmt.Fprintf(os.Stderr, "envpilot: %s\n", err)
		return 1
	}
	return code
}

func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}
