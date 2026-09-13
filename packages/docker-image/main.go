package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"time"
)

var version = "dev"

func main() {
	os.Exit(run(os.Args[1:]))
}

func writeOut(path, content string) error {
	_ = os.Remove(path)
	handle, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	if _, err := handle.WriteString(content); err != nil {
		handle.Close()
		return err
	}
	return handle.Close()
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

	client := &http.Client{
		Timeout: 120 * time.Second,
		Transport: &http.Transport{
			DialContext:         (&net.Dialer{Timeout: 10 * time.Second}).DialContext,
			TLSHandshakeTimeout: 10 * time.Second,
		},
	}

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
		for _, p := range written {
			warn("wrote " + p)
		}
		warn(fmt.Sprintf("%d secret file%s for %s/%s", len(written), plural(len(written)), cfg.Project, cfg.Environment))
		return 0
	}

	vars, err := withRetry("variables",
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
		if err := writeOut(args.Out, content); err != nil {
			fmt.Fprintf(os.Stderr, "envpilot: could not write %s — %s\n", args.Out, err)
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
