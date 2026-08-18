package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
)

// forwardedSignals reach the child so `docker stop` gets to the real app.
var forwardedSignals = []os.Signal{syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP, syscall.SIGQUIT}

// execWithVariables runs command with the pulled variables merged into its
// environment and returns the exit code to use.
//
// Variables are passed straight to the child process — nothing decrypted is
// ever written to a filesystem on this path. Existing environment entries are
// overwritten, because a value set in the Dockerfile is a default and the one
// in Envpilot is the source of truth.
//
// The child's exit code becomes this process's exit code, and a child killed
// by a signal reports 128+signal the way a shell does, so health checks and
// `docker wait` see what they would have seen without the wrapper.
func execWithVariables(command []string, vars []Variable) (int, error) {
	cmd := exec.Command(command[0], command[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	env := os.Environ()
	for _, v := range vars {
		value := ""
		if v.Value != nil {
			value = *v.Value
		}
		env = append(env, v.Key+"="+value)
	}
	cmd.Env = env

	if err := cmd.Start(); err != nil {
		return 1, fmt.Errorf("could not run %s — %w", command[0], err)
	}

	// Relay signals until the child is reaped. Registered AFTER Start so a
	// signal arriving before the child exists cannot be forwarded to nothing.
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
