package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
)

var forwardedSignals = []os.Signal{syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP, syscall.SIGQUIT}

// Environment names that must never reach the child process.
//
// The child is the user's application. Handing it the API key means anything
// that dumps its own environment (a crash reporter, /proc/self/environ, a
// debug endpoint, a sidecar reading the process table) walks away with a
// credential that can read the whole project and environment. The usage text
// already promises the key is not passed through; this makes it true.
var strippedChildEnv = map[string]struct{}{
	"ENVPILOT_TOKEN":      {},
	"ENVPILOT_TOKEN_FILE": {},
}

// childEnv is the parent environment minus envpilot's own credential
// variables, plus the pulled variables.
func childEnv(parent []string, vars []Variable) []string {
	env := make([]string, 0, len(parent)+len(vars))
	for _, entry := range parent {
		name := entry
		if i := strings.IndexByte(entry, '='); i >= 0 {
			name = entry[:i]
		}
		if _, stripped := strippedChildEnv[name]; stripped {
			continue
		}
		env = append(env, entry)
	}
	for _, v := range vars {
		value := ""
		if v.Value != nil {
			value = *v.Value
		}
		env = append(env, v.Key+"="+value)
	}
	return env
}

func execWithVariables(command []string, vars []Variable) (int, error) {
	cmd := exec.Command(command[0], command[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = childEnv(os.Environ(), vars)

	if err := cmd.Start(); err != nil {
		return 1, fmt.Errorf("could not run %s — %w", command[0], err)
	}

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, forwardedSignals...)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case sig := <-signals:
				if cmd.Process != nil {
					_ = cmd.Process.Signal(sig)
				}
			case <-done:
				return
			}
		}
	}()

	err := cmd.Wait()
	close(done)
	signal.Stop(signals)

	if err == nil {
		return 0, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		if status, ok := exitErr.Sys().(syscall.WaitStatus); ok {
			if status.Signaled() {
				return 128 + int(status.Signal()), nil
			}
			return status.ExitStatus(), nil
		}
		return exitErr.ExitCode(), nil
	}
	return 1, err
}
