"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { SITE_URLS } from "@/components/marketing";
import { TerminalButton } from "@/components/dashboard/terminal-ui";

/**
 * Shown once MCP is OAuth only (lib/mcpRetirement.ts), to people who manage
 * a key MCP used to accept, until they press OK. After that it never comes
 * back; the API Keys page keeps a short note for anyone who needs the steps.
 */
export function McpMigrationCard() {
  const status = useQuery(api.features.api.mcpRetirement.status, {});
  const dismiss = useMutation(api.features.api.mcpRetirement.dismiss);
  const [isSaving, setIsSaving] = useState(false);

  const card = status?.card;
  if (!card) return null;

  // Promise.finally, not try/finally: the React Compiler skips any
  // component containing a try/finally block.
  const handleOk = () => {
    setIsSaving(true);
    void dismiss({})
      .catch((err: unknown) => {
        toast.error(
          err instanceof Error ? err.message : "Could not save. Try again."
        );
      })
      .finally(() => setIsSaving(false));
  };

  return (
    <section
      data-testid="mcp-migration-card"
      aria-labelledby="mcp-migration-title"
      className="mb-6 rounded-lg border border-line bg-surface px-5 py-4"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="font-mono text-xs text-warning">mcp · action needed</p>
          <h2 id="mcp-migration-title" className="text-sm font-medium text-ink">
            The MCP server now uses sign-in
          </h2>
          <p className="text-sm text-ink-muted">
            API keys no longer work with the Envpilot MCP server. Remove the
            Authorization header from your MCP config and reconnect. Your client
            opens Envpilot sign-in, and your agent sees exactly what your role
            sees. REST, GitHub Action and Docker keys are not affected.
          </p>
          <p className="font-mono text-xs text-ink-subtle">
            Your MCP keys: {card.keys.join(", ")}
          </p>
          <a
            href={`${SITE_URLS.docs}/mcp/setup`}
            target="_blank"
            rel="noreferrer"
            className="inline-block font-mono text-xs text-ink underline underline-offset-2"
          >
            Set up sign-in
          </a>
        </div>
        <TerminalButton
          type="button"
          variant="primary"
          onClick={handleOk}
          disabled={isSaving}
          data-testid="mcp-migration-ok"
        >
          OK
        </TerminalButton>
      </div>
    </section>
  );
}
