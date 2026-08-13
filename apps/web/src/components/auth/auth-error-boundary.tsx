"use client";

import { Component, type ReactNode } from "react";
import { AuthErrorPage } from "./auth-error-page";
import { isAuthError } from "@/lib/auth-errors";
import { createLogger } from "@/lib/logger";

const MAX_AUTO_RETRIES = 2;
const log = createLogger("components/auth-error-boundary");

interface AuthErrorBoundaryProps {
  children: ReactNode;
  /** Optional context label for logging. */
  context?: string;
}

interface AuthErrorBoundaryState {
  error: Error | null;
  /**
   * True while an auto-retry timer is pending. Must live in state (not just
   * the instance field): React renders the error state BEFORE
   * componentDidCatch runs, so an instance-field check alone would flash the
   * full error page during the retry window.
   */
  retrying: boolean;
}

export class AuthErrorBoundary extends Component<
  AuthErrorBoundaryProps,
  AuthErrorBoundaryState
> {
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: AuthErrorBoundaryProps) {
    super(props);
    this.state = { error: null, retrying: false };
  }

  static getDerivedStateFromError(
    error: Error
  ): Partial<AuthErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Auth errors are frequently the transient token-propagation race (a
    // Convex query fires before the WorkOS identity is attached to the
    // socket) which self-heals — auto-retry before surfacing the full-page
    // error, mirroring (dashboard)/error.tsx.
    if (isAuthError(error) && this.retryCount < MAX_AUTO_RETRIES) {
      this.retryCount += 1;
      const delay = this.retryCount * 1000;
      log.warn("auth_boundary_retrying", {
        context: this.props.context ?? "unspecified",
        attempt: this.retryCount,
        delay_ms: delay,
        message: error.message,
      });
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.setState({ error: null, retrying: false });
      }, delay);
      // setState from componentDidCatch flushes before paint, so the retry
      // indicator renders without the full error page flashing first.
      this.setState({ retrying: true });
      return;
    }

    log.error(
      "auth_boundary_error",
      { context: this.props.context ?? "unspecified" },
      error
    );
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  handleRetry = () => {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryCount = 0;
    this.setState({ error: null, retrying: false });
  };

  render() {
    if (this.state.error) {
      if (isAuthError(this.state.error)) {
        // Auto-retry pending — show the suite's standard retry indicator
        // instead of flashing the full error page for a self-healing race.
        if (this.state.retrying) {
          return (
            <div className="flex min-h-screen items-center justify-center bg-canvas">
              <p className="font-mono text-sm text-ink-subtle">
                <span className="text-accent">$</span> retrying...
              </p>
            </div>
          );
        }
        return (
          <AuthErrorPage error={this.state.error} onRetry={this.handleRetry} />
        );
      }
      // Not auth-related — re-throw so a parent generic error boundary
      // handles it.
      throw this.state.error;
    }

    return this.props.children;
  }
}
