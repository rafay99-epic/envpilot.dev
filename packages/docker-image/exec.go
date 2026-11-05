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

// Environment names that are not passed to the child process.
//
// The child is the user's application, and it used to inherit the API key,
// so anything that dumps its own environment (a crash reporter, a debug
// endpoint, printenv in an entrypoint script) handed out a credential that
// reads the whole project.
//
// Scope of the fix, stated precisely: the key is no longer in the child's
// OWN environment. A child running as a descendant of envpilot can still
// read it from /proc/<ppid>/environ, because Linux snapshots the initial
// environment block at exec and os.Unsetenv does not rewrite it. Closing
// that would mean replacing this process with the child via syscall.Exec,
// which was tried and REVERTED: as PID 1 under the documented
// ENTRYPOINT ["envpilot", "exec", "--"], it dropped signal handling.
// Treat this as removing the easy path, not as isolation.
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
