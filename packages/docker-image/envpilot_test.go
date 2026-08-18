package main

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func envFrom(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func tokenFile(t *testing.T, contents string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "token")
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func base(extra map[string]string) map[string]string {
	m := map[string]string{"ENVPILOT_PROJECT": "checkout", "ENVPILOT_ENVIRONMENT": "production"}
	for k, v := range extra {
		m[k] = v
	}
	return m
}

// ── config ──────────────────────────────────────────────────────────────

func TestTokenFileWinsOverInline(t *testing.T) {
	cfg, err := resolveConfig(&Args{}, envFrom(base(map[string]string{
		"ENVPILOT_TOKEN":      "envpk_inline",
		"ENVPILOT_TOKEN_FILE": tokenFile(t, "envpk_mounted"),
	})))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Token != "envpk_mounted" {
		t.Fatalf("got %q, want the mounted token", cfg.Token)
	}
}

func TestTokenFileTrimsTrailingNewline(t *testing.T) {
	cfg, err := resolveConfig(&Args{}, envFrom(base(map[string]string{
		"ENVPILOT_TOKEN_FILE": tokenFile(t, "envpk_mounted\n"),
	})))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Token != "envpk_mounted" {
		t.Fatalf("got %q, want the newline trimmed", cfg.Token)
	}
}

func TestEmptyTokenFileRefused(t *testing.T) {
	_, err := resolveConfig(&Args{}, envFrom(base(map[string]string{
		"ENVPILOT_TOKEN_FILE": tokenFile(t, "  \n"),
	})))
	var cfgErr *ConfigError
	if !errors.As(err, &cfgErr) || !strings.Contains(err.Error(), "empty") {
		t.Fatalf("want an empty-file ConfigError, got %v", err)
	}
}

func TestUnreadableTokenFileRefused(t *testing.T) {
	_, err := resolveConfig(&Args{}, envFrom(base(map[string]string{
		"ENVPILOT_TOKEN_FILE": "/nope/missing",
	})))
	if err == nil || !strings.Contains(err.Error(), "could not be read") {
		t.Fatalf("want a read failure, got %v", err)
	}
}

func TestCredentialRequired(t *testing.T) {
	_, err := resolveConfig(&Args{}, envFrom(base(nil)))
	if err == nil || !strings.Contains(err.Error(), "No API key") {
		t.Fatalf("want a missing-key error, got %v", err)
	}
}

func TestFlagsBeatEnvironment(t *testing.T) {
	cfg, err := resolveConfig(
		&Args{Project: "billing", Env: "staging"},
		envFrom(base(map[string]string{"ENVPILOT_TOKEN": "envpk_x"})),
	)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Project != "billing" || cfg.Environment != "staging" {
		t.Fatalf("flags did not win: %+v", cfg)
	}
}

func TestAPIURLDefaultAndTrailingSlash(t *testing.T) {
	cfg, _ := resolveConfig(&Args{}, envFrom(base(map[string]string{"ENVPILOT_TOKEN": "t"})))
	if cfg.APIURL != DefaultAPIURL {
		t.Fatalf("got %q, want the default", cfg.APIURL)
	}
	cfg, _ = resolveConfig(&Args{APIURL: "https://envpilot.internal/"}, envFrom(base(map[string]string{"ENVPILOT_TOKEN": "t"})))
	if cfg.APIURL != "https://envpilot.internal" {
		t.Fatalf("trailing slash not stripped: %q", cfg.APIURL)
	}
}

func TestMissingInputIsNamed(t *testing.T) {
	_, err := resolveConfig(&Args{}, envFrom(map[string]string{"ENVPILOT_TOKEN": "t", "ENVPILOT_ENVIRONMENT": "prod"}))
	if err == nil || !strings.Contains(err.Error(), "No project") {
		t.Fatalf("want No project, got %v", err)
	}
	_, err = resolveConfig(&Args{}, envFrom(map[string]string{"ENVPILOT_TOKEN": "t", "ENVPILOT_PROJECT": "checkout"}))
	if err == nil || !strings.Contains(err.Error(), "No environment") {
		t.Fatalf("want No environment, got %v", err)
	}
}

// ── args ────────────────────────────────────────────────────────────────

func TestParseRuntimeExec(t *testing.T) {
	a, err := parseArgs([]string{"exec", "--project", "checkout", "-e", "production", "--files", "--", "node", "server.js"})
	if err != nil {
		t.Fatal(err)
	}
	if a.Command != "exec" || a.Project != "checkout" || a.Env != "production" || !a.WithFiles {
		t.Fatalf("bad parse: %+v", a)
	}
	if strings.Join(a.Rest, " ") != "node server.js" {
		t.Fatalf("rest was %v", a.Rest)
	}
}

func TestChildFlagsSurviveAfterDoubleDash(t *testing.T) {
	a, err := parseArgs([]string{"exec", "--", "npm", "run", "build", "--", "-q"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(a.Rest, " ") != "npm run build -- -q" {
		t.Fatalf("rest was %v", a.Rest)
	}
	if a.Quiet {
		t.Fatal("a child's -q was consumed as ours")
	}
}

func TestExecNeedsACommand(t *testing.T) {
	if _, err := parseArgs([]string{"exec", "-p", "checkout"}); err == nil || !strings.Contains(err.Error(), "needs a command") {
		t.Fatalf("want needs-a-command, got %v", err)
	}
}

func TestUnknownCommandAndFlag(t *testing.T) {
	if _, err := parseArgs([]string{"yolo"}); err == nil || !strings.Contains(err.Error(), "Unknown command") {
		t.Fatalf("want unknown command, got %v", err)
	}
	if _, err := parseArgs([]string{"pull", "--nope"}); err == nil || !strings.Contains(err.Error(), "Unknown flag") {
		t.Fatalf("want unknown flag, got %v", err)
	}
}

func TestValueFlagNeedsAValue(t *testing.T) {
	if _, err := parseArgs([]string{"pull", "--project"}); err == nil {
		t.Fatal("want an error for a dangling --project")
	}
	if _, err := parseArgs([]string{"pull", "--project", "--env"}); err == nil {
		t.Fatal("want an error when the value looks like a flag")
	}
}

func TestHelpAndVersionWinAnywhere(t *testing.T) {
	a, err := parseArgs([]string{"--version"})
	if err != nil || !a.Version {
		t.Fatalf("bare --version should parse, got %+v %v", a, err)
	}
	a, err = parseArgs([]string{"pull", "--help"})
	if err != nil || !a.Help {
		t.Fatalf("--help after a command should parse, got %+v %v", a, err)
	}
}

// ── dotenv ──────────────────────────────────────────────────────────────

func vars(pairs ...string) []Variable {
	out := make([]Variable, 0, len(pairs)/2)
	for i := 0; i < len(pairs); i += 2 {
		v := pairs[i+1]
		out = append(out, Variable{Key: pairs[i], Value: &v})
	}
	return out
}

func TestDotenvQuotesEverything(t *testing.T) {
	got := buildDotenv(vars("MSG", "hello world # not a comment"))
	if got != "MSG='hello world # not a comment'\n" {
		t.Fatalf("got %q", got)
	}
}

func TestDotenvEscapesSingleQuotes(t *testing.T) {
	if got := buildDotenv(vars("K", "it's")); got != `K='it'\''s'`+"\n" {
		t.Fatalf("got %q", got)
	}
}

func TestDotenvKeepsMultilineValues(t *testing.T) {
	got := buildDotenv(vars("PEM", "-----BEGIN-----\nabc\n-----END-----"))
	if got != "PEM='-----BEGIN-----\nabc\n-----END-----'\n" {
		t.Fatalf("got %q", got)
	}
}

func TestDotenvEmpty(t *testing.T) {
	if got := buildDotenv(nil); got != "" {
		t.Fatalf("got %q", got)
	}
}

// ── batching ────────────────────────────────────────────────────────────

func file(path string, size int64) File {
	return File{Name: path, Path: path, Mode: "0600", Size: size, Content: "ZGF0YQ=="}
}

func TestBatchPacksUnderBudget(t *testing.T) {
	got := batchByTotalSize([]File{file("a", 4), file("b", 4), file("c", 4)}, 8)
	if len(got) != 2 || len(got[0]) != 2 || len(got[1]) != 1 {
		t.Fatalf("unexpected batching: %v", got)
	}
}

func TestOversizedFileGetsOwnBatch(t *testing.T) {
	got := batchByTotalSize([]File{file("small", 1), file("huge", 999)}, 8)
	if len(got) != 2 || got[1][0].Path != "huge" {
		t.Fatalf("oversized file was dropped or merged: %v", got)
	}
}

func TestBatchEmpty(t *testing.T) {
	if got := batchByTotalSize(nil, 8); len(got) != 0 {
		t.Fatalf("got %v", got)
	}
}

// ── retry ───────────────────────────────────────────────────────────────

func TestRetryHonorsServerCooldown(t *testing.T) {
	var waits []time.Duration
	calls := 0
	got, err := withRateLimitRetry("test", func() (string, error) {
		calls++
		if calls == 1 {
			return "", &APIError{Message: "slow down", Status: http.StatusTooManyRequests, RetryAfter: 3 * time.Second}
		}
		return "ok", nil
	}, func(d time.Duration) { waits = append(waits, d) }, func(string) {})
	if err != nil || got != "ok" {
		t.Fatalf("got %q %v", got, err)
	}
	if len(waits) != 1 || waits[0] != 3*time.Second {
		t.Fatalf("waits were %v", waits)
	}
}

func TestRetryCapsHostileCooldown(t *testing.T) {
	var waits []time.Duration
	calls := 0
	_, _ = withRateLimitRetry("test", func() (string, error) {
		calls++
		if calls == 1 {
			return "", &APIError{Message: "slow down", Status: http.StatusTooManyRequests, RetryAfter: 99999 * time.Second}
		}
		return "ok", nil
	}, func(d time.Duration) { waits = append(waits, d) }, func(string) {})
	if len(waits) != 1 || waits[0] != maxRetryAfter {
		t.Fatalf("waits were %v", waits)
	}
}

func TestRetryIgnoresNon429(t *testing.T) {
	calls := 0
	_, err := withRateLimitRetry("test", func() (string, error) {
		calls++
		return "", &APIError{Message: "denied", Status: 403}
	}, func(time.Duration) {}, func(string) {})
	if err == nil || calls != 1 {
		t.Fatalf("retried a non-429: calls=%d err=%v", calls, err)
	}
}

func TestRetryGivesUp(t *testing.T) {
	calls := 0
	_, err := withRateLimitRetry("test", func() (string, error) {
		calls++
		return "", &APIError{Message: "slow down", Status: http.StatusTooManyRequests, RetryAfter: time.Second}
	}, func(time.Duration) {}, func(string) {})
	if err == nil || calls != maxRateLimitAttempts {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
}

// ── safe file writes ────────────────────────────────────────────────────

func TestWritesAt0600AndCreatesParents(t *testing.T) {
	dir := t.TempDir()
	if err := writeSecretFile(dir, file("nested/deep/key.pem", 4), true); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(dir, "nested/deep/key.pem")
	body, err := os.ReadFile(p)
	if err != nil || string(body) != "data" {
		t.Fatalf("body %q err %v", body, err)
	}
	info, _ := os.Stat(p)
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode %v", info.Mode().Perm())
	}
}

func TestHonorsMode0400(t *testing.T) {
	dir := t.TempDir()
	f := file("ro.pem", 4)
	f.Mode = "0400"
	if err := writeSecretFile(dir, f, true); err != nil {
		t.Fatal(err)
	}
	info, _ := os.Stat(filepath.Join(dir, "ro.pem"))
	if info.Mode().Perm() != 0o400 {
		t.Fatalf("mode %v", info.Mode().Perm())
	}
}

func TestReplacesExistingFileAtRestrictiveMode(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "k.pem")
	if err := os.WriteFile(target, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	f := file("k.pem", 3)
	f.Content = "bmV3" // "new"
	if err := writeSecretFile(dir, f, true); err != nil {
		t.Fatal(err)
	}
	body, _ := os.ReadFile(target)
	info, _ := os.Stat(target)
	if string(body) != "new" || info.Mode().Perm() != 0o600 {
		t.Fatalf("body %q mode %v — a world-readable file kept its mode", body, info.Mode().Perm())
	}
}

func TestRefusesAbsolutePath(t *testing.T) {
	if err := writeSecretFile(t.TempDir(), file("/etc/passwd", 4), true); err == nil ||
		!strings.Contains(err.Error(), "absolute path") {
		t.Fatalf("got %v", err)
	}
}

func TestRefusesTraversal(t *testing.T) {
	if err := writeSecretFile(t.TempDir(), file("../../escaped", 4), true); err == nil ||
		!strings.Contains(err.Error(), "outside the output directory") {
		t.Fatalf("got %v", err)
	}
}

func TestRefusesSymlinkedDirectoryEscape(t *testing.T) {
	dir := t.TempDir()
	outside := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "holder"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "holder", "link")); err != nil {
		t.Fatal(err)
	}
	err := writeSecretFile(dir, file("holder/link/key.pem", 4), true)
	if err == nil || !strings.Contains(err.Error(), "escapes through a symlink") {
		t.Fatalf("got %v", err)
	}
	if _, statErr := os.Stat(filepath.Join(outside, "key.pem")); statErr == nil {
		t.Fatal("wrote outside the output directory")
	}
}

func TestRefusesMetadataOnlyRow(t *testing.T) {
	if err := writeSecretFile(t.TempDir(), file("k.pem", 4), false); err == nil ||
		!strings.Contains(err.Error(), "no content") {
		t.Fatalf("got %v", err)
	}
}
