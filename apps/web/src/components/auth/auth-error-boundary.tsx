"use client";

import { Component, type ReactNode } from "react";
import { AuthErrorPage } from "./auth-error-page";

/**
 * Detect whether an error is auth-related so the boundary knows to render
 * the AuthErrorPage instead of re-throwing (which would bubble to the
 * nearest parent error boundary).
 */
function isAuthError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("unauthorized") ||
    msg.includes("unauthenticated") ||
    msg.includes("auth") ||
    msg.includes("token") ||
    msg.includes("session") ||
    msg.includes("workos") ||
    msg.includes("sign in") ||
    msg.includes("forbidden") ||
    msg.includes("401") ||
    msg.includes("403")
  );
}

interface AuthErrorBoundaryProps {
  children: ReactNode;
  /** Optional context label for logging. */
  context?: string;
}

interface AuthErrorBoundaryState {
  error: Error | null;
}

export class AuthErrorBoundary extends Component<
  AuthErrorBoundaryProps,
  AuthErrorBoundaryState
> {
  constructor(props: AuthErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): AuthErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(
      `[AuthErrorBoundary${this.props.context ? ` (${this.props.context})` : ""}]`,
      error
    );
  }

  render() {
    if (this.state.error) {
      // Only show the auth error page if it's an auth-related error.
      // Otherwise, re-throw so a parent generic error boundary handles it.
      if (isAuthError(this.state.error)) {
        return <AuthErrorPage error={this.state.error} />;
      }
      throw this.state.error;
    }

    return this.props.children;
  }
}
