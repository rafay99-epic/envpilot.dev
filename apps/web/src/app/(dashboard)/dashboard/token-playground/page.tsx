"use client";

import { useState } from "react";
import { Eye, EyeOff, Play, Terminal, Copy, Check } from "lucide-react";
import {
  TerminalWindow,
  TerminalInput,
  TerminalSelect,
  TerminalButton,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";

/**
 * TEMPORARY DEMO PAGE — remove when asked (not linked from any nav,
 * no e2e coverage on purpose).
 *
 * CI/CD token playground — paste a service token, pick an environment, and
 * run the exact request the GitHub Action makes (GET /api/v1/secrets with
 * Bearer auth). Lets you verify a token's scope and see the returned
 * variables before wiring it into a real pipeline.
 *
 * The token is held in component state only and sent solely to this app's
 * own machine endpoint — never persisted, never logged.
 */

type PullResult = {
  project: { name: string; slug: string };
  environment: string;
  variables: Array<{ key: string; value: string }>;
};

const ENVIRONMENTS = ["development", "staging", "production"];

export default function TokenPlaygroundPage() {
  const [token, setToken] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [result, setResult] = useState<PullResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const curlCommand = [
    `curl -H "Authorization: Bearer ${token.trim() || "<your envpk_… token>"}" \\`,
    `  "${typeof window !== "undefined" ? window.location.origin : "https://www.envpilot.dev"}/api/v1/secrets?environment=${environment}"`,
  ].join("\n");

  async function runPull() {
    setIsRunning(true);
    setStatus(null);
    setResult(null);
    setErrorMessage(null);
    setRevealed(false);
    try {
      const response = await fetch(
        `/api/v1/secrets?environment=${encodeURIComponent(environment)}`,
        { headers: { Authorization: `Bearer ${token.trim()}` } }
      );
      setStatus(response.status);
      const body = await response.json();
      if (response.ok) {
        setResult(body as PullResult);
      } else {
        setErrorMessage((body as { error?: string }).error ?? "Request failed");
      }
    } catch {
      setErrorMessage("Network error — is the dev server running?");
    } finally {
      setIsRunning(false);
    }
  }

  async function copyCurl() {
    await navigator.clipboard.writeText(curlCommand);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 1500);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 font-mono text-xl text-zinc-900 dark:text-zinc-100">
          <Terminal className="h-5 w-5 text-green-500" />
          <span className="text-green-400">$</span> envpilot token-playground
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Run the exact request the GitHub Action makes and inspect what a
          service token can see. Create tokens under Project → Settings → CI/CD
          Tokens.
        </p>
      </div>

      <TerminalWindow title="request">
        <div className="space-y-4 p-4">
          <div>
            <label
              htmlFor="playground-token"
              className="mb-1 block font-mono text-xs text-zinc-500 dark:text-zinc-400"
            >
              service token
            </label>
            <TerminalInput
              id="playground-token"
              type="password"
              placeholder="envpk_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label
                htmlFor="playground-environment"
                className="mb-1 block font-mono text-xs text-zinc-500 dark:text-zinc-400"
              >
                environment
              </label>
              <TerminalSelect
                id="playground-environment"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
              >
                {ENVIRONMENTS.map((env) => (
                  <option key={env} value={env}>
                    {env}
                  </option>
                ))}
              </TerminalSelect>
            </div>
            <TerminalButton
              onClick={runPull}
              disabled={isRunning || !token.trim()}
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              {isRunning ? "Pulling…" : "Pull secrets"}
            </TerminalButton>
          </div>

          <div className="relative rounded-lg bg-zinc-100 p-3 font-mono text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400">
            <pre className="overflow-x-auto whitespace-pre-wrap">
              {curlCommand}
            </pre>
            <button
              onClick={copyCurl}
              className="absolute top-2 right-2 rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              title="Copy curl command"
            >
              {copiedCurl ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </TerminalWindow>

      {(status !== null || errorMessage) && (
        <TerminalWindow title="response">
          <div className="space-y-3 p-4">
            {status !== null && (
              <div className="flex items-center gap-2 font-mono text-sm">
                <span className="text-zinc-500">HTTP</span>
                <TerminalBadge color={status === 200 ? "green" : "red"}>
                  {status}
                </TerminalBadge>
                {result && (
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {result.project.name} · {result.environment} ·{" "}
                    {result.variables.length} variable
                    {result.variables.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            )}

            {errorMessage && (
              <p className="font-mono text-sm text-red-500">{errorMessage}</p>
            )}

            {result && result.variables.length === 0 && (
              <p className="font-mono text-sm text-zinc-500">
                No variables in this project include the “{environment}”
                environment.
              </p>
            )}

            {result && result.variables.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setRevealed((r) => !r)}
                  className="flex items-center gap-1 font-mono text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                >
                  {revealed ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" /> hide values
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" /> reveal values
                    </>
                  )}
                </button>
                <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {result.variables.map((variable) => (
                    <div
                      key={variable.key}
                      className="flex items-center justify-between gap-4 px-4 py-2 font-mono text-sm"
                    >
                      <code className="text-zinc-900 dark:text-zinc-100">
                        {variable.key}
                      </code>
                      <code className="max-w-[50%] truncate text-zinc-500 dark:text-zinc-400">
                        {revealed ? variable.value : "••••••••"}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TerminalWindow>
      )}
    </div>
  );
}
