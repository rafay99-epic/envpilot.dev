"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Shield,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
} from "lucide-react";
import {
  base64UrlToClientKey,
  decryptFromShare,
  sha256Hex,
} from "@/lib/share-crypto";
import { parseAccountShare } from "@/lib/account-payload";
import { useVerifyShareEmail, useVerifyShareOtp } from "@/hooks/useShareSecret";
import { createLogger } from "@/lib/logger";

type ViewerStep = "email" | "otp" | "passphrase" | "revealed" | "error";
const log = createLogger("app/share-viewer");

function maskEmail(address: string) {
  const [local, domain] = address.split("@");
  if (!domain) return address;
  const masked =
    local.length <= 2
      ? local[0] + "***"
      : local[0] + "***" + local[local.length - 1];
  return `${masked}@${domain}`;
}

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ShareViewerPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [step, setStep] = useState<ViewerStep>("email");
  const [email, setEmail] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [decryptedSecret, setDecryptedSecret] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(300); // 5 minutes
  // one-time shares are destroyed on view; time-limited shares stay available
  // until they expire — drives the reveal-screen copy so it isn't misleading.
  const [shareMode, setShareMode] = useState<"one_time" | "time_limited">(
    "one_time"
  );

  // Store encrypted payload in memory only (not sessionStorage) to prevent XSS exposure
  const encryptedPayloadRef = useRef<string | null>(null);
  // The URL-hash key is only ever read by the verify/decrypt handlers, never
  // during render, so it lives in a ref and its arrival costs no render.
  const clientKeyRef = useRef<Uint8Array | null>(null);
  // The viewer is a linear flow, so at most one mutating request is ever
  // legitimate at a time. A ref closes the double-submit window that
  // `isPending` leaves open, since that flag only flips on the next render.
  const submittingRef = useRef(false);

  const verifyEmail = useVerifyShareEmail();
  const verifyOtp = useVerifyShareOtp();

  // Extract client key from URL hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1); // Remove #
    if (!hash) {
      setStep("error");
      setErrorMessage(
        "Decryption key missing from URL. The link may have been truncated or modified."
      );
      return;
    }

    try {
      const key = base64UrlToClientKey(hash);
      if (key.length !== 32) {
        throw new Error("Invalid key length");
      }
      clientKeyRef.current = key;
    } catch (error) {
      log.warn("share_key_invalid", {
        token,
        reason: error instanceof Error ? error.message : "unknown_error",
      });
      setStep("error");
      setErrorMessage("Invalid decryption key in URL.");
    }
  }, [token]);

  // One interval per active countdown: the tick lives in the functional
  // updater and the effect owns teardown, so the timer is not rebuilt each
  // second. Flipping to inactive at zero stops it.
  const countdownActive = step === "otp" && otpCountdown > 0;
  useEffect(() => {
    if (!countdownActive) return;

    const interval = setInterval(() => {
      setOtpCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [countdownActive]);

  const handleVerifyEmail = async () => {
    if (!email.trim()) return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      await verifyEmail.mutateAsync({ token, email: email.trim() });
      setMaskedEmail(maskEmail(email.trim()));
      setOtpCountdown(300);
      setStep("otp");
    } catch (err) {
      log.error(
        "share_email_verification_failed",
        { token, email: email.trim() },
        err
      );
      setStep("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to verify email"
      );
    }
    // Released after the try/catch rather than in a finally block. The catch
    // swallows, so this runs on both paths, and React Compiler bails on any
    // function containing a try statement with a finalizer.
    submittingRef.current = false;
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;
    const clientKey = clientKeyRef.current;
    if (!clientKey) return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      // Hash the OTP client-side for comparison
      const otpHash = await sha256Hex(otp);

      const result = await verifyOtp.mutateAsync({
        token,
        email: email.trim(),
        otp,
        otpHash,
      });

      if (result.mode) setShareMode(result.mode);

      if (result.hasPassphrase) {
        // Need passphrase before decrypting — keep in memory only
        encryptedPayloadRef.current = result.encryptedPayload;
        setOtp("");
        setEmail("");
        setStep("passphrase");
      } else {
        // Decrypt directly
        try {
          const decrypted = await decryptFromShare(
            result.encryptedPayload,
            clientKey
          );
          setDecryptedSecret(decrypted);
          setOtp("");
          setEmail("");
          setStep("revealed");
        } catch (decryptErr) {
          log.error("share_secret_decrypt_failed", { token }, decryptErr);
          setStep("error");
          setErrorMessage(
            "Failed to decrypt the secret. The link may be corrupted."
          );
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Verification failed";
      if (
        message.includes("expired") ||
        message.includes("destroyed") ||
        message.includes("revoked") ||
        message.includes("locked out") ||
        message.includes("invalid")
      ) {
        setStep("error");
        setErrorMessage(message);
      } else {
        // Stay on OTP step for retry-able errors
        log.warn("share_otp_verification_failed", {
          token,
          email: email.trim(),
          reason: message,
        });
        setErrorMessage(message);
      }
    }
    // Released after the try/catch, not in a finally block. See
    // handleVerifyEmail.
    submittingRef.current = false;
  };

  const handleDecryptWithPassphrase = async () => {
    const clientKey = clientKeyRef.current;
    if (!passphrase || !clientKey) return;

    try {
      const encryptedPayload = encryptedPayloadRef.current;
      if (!encryptedPayload) {
        throw new Error("Encrypted data not found. Please start over.");
      }

      const decrypted = await decryptFromShare(
        encryptedPayload,
        clientKey,
        passphrase
      );
      encryptedPayloadRef.current = null;
      setDecryptedSecret(decrypted);
      setPassphrase("");
      setStep("revealed");
    } catch (decryptErr) {
      // Most likely wrong passphrase — don't spam Sentry with these
      log.warn("share_passphrase_decrypt_failed", {
        token,
        reason:
          decryptErr instanceof Error ? decryptErr.message : "unknown_error",
      });
      setErrorMessage("Incorrect passphrase. Please try again.");
    }
  };

  const handleResendOtp = async () => {
    if (!email.trim()) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setErrorMessage("");
    try {
      await verifyEmail.mutateAsync({ token, email: email.trim() });
      setOtp("");
      setOtpCountdown(300);
    } catch (err) {
      log.error("share_otp_resend_failed", { token, email: email.trim() }, err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to resend code"
      );
    }
    // Released after the try/catch, not in a finally block. See
    // handleVerifyEmail.
    submittingRef.current = false;
  };

  const handleCopy = async () => {
    if (!decryptedSecret) return;
    try {
      await navigator.clipboard.writeText(decryptedSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (clipErr) {
      log.warn("share_clipboard_write_failed", {
        token,
        reason:
          clipErr instanceof Error ? clipErr.message : "restricted_context",
      });
    }
  };

  const handleCopyField = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (clipErr) {
      log.warn("share_clipboard_write_failed", {
        token,
        reason:
          clipErr instanceof Error ? clipErr.message : "restricted_context",
      });
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Terminal-style card */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-line bg-surface/80 px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-danger-soft" />
            <div className="h-3 w-3 rounded-full bg-warning-soft" />
            <div className="h-3 w-3 rounded-full bg-accent-soft" />
          </div>
          <span className="ml-2 font-mono text-xs text-ink-subtle">
            {step === "email" && "secret-share"}
            {step === "otp" && "verify-identity"}
            {step === "passphrase" && "enter-passphrase"}
            {step === "revealed" && "secret-revealed"}
            {step === "error" && "error"}
          </span>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Email */}
          {step === "email" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-accent" />
                <h2 className="font-mono text-sm font-semibold text-ink">
                  A secret has been shared with you
                </h2>
              </div>
              <p className="text-sm text-ink-muted">
                Enter your email to verify access.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="share-email"
                    className="block text-[10px] font-medium uppercase tracking-wide text-ink-subtle"
                  >
                    Email
                  </label>
                  <input
                    id="share-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMessage("");
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      !verifyEmail.isPending &&
                      handleVerifyEmail()
                    }
                    disabled={verifyEmail.isPending}
                    placeholder="your@email.com"
                    className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-accent-line focus:outline-none focus:ring-1 focus:ring-accent-line"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleVerifyEmail}
                  disabled={!email.trim() || verifyEmail.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {verifyEmail.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Verify Email
                </button>
              </div>
              <p className="text-xs text-ink-faint">
                Your email must match the recipient list.
              </p>
            </div>
          )}

          {/* Step 2: OTP */}
          {step === "otp" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-accent" />
                <h2 className="font-mono text-sm font-semibold text-ink">
                  Verify your identity
                </h2>
              </div>
              <p className="text-sm text-ink-muted">
                A 6-digit code was sent to{" "}
                <span className="text-ink">{maskedEmail}</span>
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="share-otp"
                    className="block text-[10px] font-medium uppercase tracking-wide text-ink-subtle"
                  >
                    6-digit code
                  </label>
                  <input
                    id="share-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setOtp(val);
                      setErrorMessage("");
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      otp.length === 6 &&
                      !verifyOtp.isPending &&
                      handleVerifyOtp()
                    }
                    disabled={verifyOtp.isPending}
                    placeholder="000000"
                    className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2.5 text-center font-mono text-2xl tracking-[0.3em] text-ink placeholder:text-ink-faint focus:border-accent-line focus:outline-none focus:ring-1 focus:ring-accent-line"
                    maxLength={6}
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleVerifyOtp}
                  disabled={otp.length !== 6 || verifyOtp.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {verifyOtp.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Verify Code"
                  )}
                </button>
              </div>
              {errorMessage && (
                <p className="text-xs text-danger">{errorMessage}</p>
              )}
              <div className="flex items-center justify-between text-xs text-ink-subtle">
                <span>
                  Code expires in{" "}
                  <span className={otpCountdown < 60 ? "text-warning" : ""}>
                    {formatCountdown(otpCountdown)}
                  </span>
                </span>
                {otpCountdown === 0 && (
                  <button
                    onClick={handleResendOtp}
                    disabled={verifyEmail.isPending}
                    className="flex items-center gap-1 text-accent hover:text-accent disabled:opacity-50"
                  >
                    {verifyEmail.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Request new code
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 2.5: Passphrase */}
          {step === "passphrase" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-accent" />
                <h2 className="font-mono text-sm font-semibold text-ink">
                  Enter passphrase
                </h2>
              </div>
              <p className="text-sm text-ink-muted">
                This secret is protected with an additional passphrase.
              </p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="share-passphrase"
                    className="block text-[10px] font-medium uppercase tracking-wide text-ink-subtle"
                  >
                    Passphrase
                  </label>
                  <input
                    id="share-passphrase"
                    type="password"
                    value={passphrase}
                    onChange={(e) => {
                      setPassphrase(e.target.value);
                      setErrorMessage("");
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      passphrase &&
                      handleDecryptWithPassphrase()
                    }
                    placeholder="Enter passphrase"
                    className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-accent-line focus:outline-none focus:ring-1 focus:ring-accent-line"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleDecryptWithPassphrase}
                  disabled={!passphrase}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Decrypt
                </button>
              </div>
              {errorMessage && (
                <p className="text-xs text-danger">{errorMessage}</p>
              )}
            </div>
          )}

          {/* Step 3: Revealed */}
          {step === "revealed" &&
            decryptedSecret &&
            (() => {
              // Account shares serialize to JSON with a `t: "account"` marker;
              // parseAccountShare is null-safe and returns null for the
              // variable KEY=VALUE format, so we can call it unconditionally.
              const accountPayload = parseAccountShare(decryptedSecret);

              if (accountPayload) {
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Eye className="h-5 w-5 text-accent" />
                      <h2 className="font-mono text-sm font-semibold text-ink">
                        Account revealed
                      </h2>
                    </div>

                    <div className="space-y-3 rounded-lg bg-surface-raised p-3">
                      {/* Name */}
                      <div>
                        <span className="block text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                          Account
                        </span>
                        <span className="font-mono text-sm text-ink">
                          {accountPayload.name}
                        </span>
                      </div>

                      {/* URL — plain text, never a clickable link */}
                      {accountPayload.url && (
                        <div>
                          <span className="block text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                            URL
                          </span>
                          <span className="block break-all font-mono text-sm text-ink-muted">
                            {accountPayload.url}
                          </span>
                        </div>
                      )}

                      {/* Username */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                            Username
                          </span>
                          <code className="block break-all font-mono text-sm text-accent">
                            {accountPayload.username}
                          </code>
                        </div>
                        <button
                          onClick={() =>
                            handleCopyField("username", accountPayload.username)
                          }
                          className="shrink-0 rounded-md bg-surface-hover px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-hover"
                        >
                          {copiedField === "username" ? (
                            <span className="flex items-center gap-1">
                              <Check className="h-3 w-3" /> Copied
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Copy className="h-3 w-3" /> Copy
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Password */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                            Password
                          </span>
                          <code className="block break-all font-mono text-sm text-accent">
                            {showAccountPassword
                              ? accountPayload.password
                              : "•".repeat(
                                  Math.min(accountPayload.password.length, 24)
                                )}
                          </code>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() =>
                              setShowAccountPassword((prev) => !prev)
                            }
                            className="rounded-md bg-surface-hover p-1.5 text-ink-muted hover:bg-surface-hover"
                            title={
                              showAccountPassword
                                ? "Hide password"
                                : "Show password"
                            }
                          >
                            {showAccountPassword ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() =>
                              handleCopyField(
                                "password",
                                accountPayload.password
                              )
                            }
                            className="rounded-md bg-surface-hover px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-hover"
                          >
                            {copiedField === "password" ? (
                              <span className="flex items-center gap-1">
                                <Check className="h-3 w-3" /> Copied
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Copy className="h-3 w-3" /> Copy
                              </span>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <p className="text-xs text-warning">
                        {shareMode === "one_time"
                          ? "These credentials have been permanently destroyed. Close this tab when done."
                          : "These credentials remain accessible from this link until it expires. Close this tab when done."}
                      </p>
                    </div>
                  </div>
                );
              }

              // Parse KEY=VALUE format (first = is the delimiter)
              const eqIndex = decryptedSecret.indexOf("=");
              const secretKey =
                eqIndex > 0 ? decryptedSecret.slice(0, eqIndex) : null;
              const secretValue =
                eqIndex > 0
                  ? decryptedSecret.slice(eqIndex + 1)
                  : decryptedSecret;

              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-accent" />
                    <h2 className="font-mono text-sm font-semibold text-ink">
                      Secret revealed
                    </h2>
                  </div>
                  <div className="relative">
                    <div className="max-h-48 overflow-auto rounded-lg bg-surface-raised p-3">
                      {secretKey ? (
                        <code className="break-all font-mono text-sm">
                          <span className="text-info">{secretKey}</span>
                          <span className="text-ink-subtle">=</span>
                          <span className="text-accent">{secretValue}</span>
                        </code>
                      ) : (
                        <code className="break-all font-mono text-sm text-accent">
                          {decryptedSecret}
                        </code>
                      )}
                    </div>
                    <button
                      onClick={handleCopy}
                      className="absolute right-2 top-2 rounded-md bg-surface-hover px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-hover"
                    >
                      {copied ? (
                        <span className="flex items-center gap-1">
                          <Check className="h-3 w-3" /> Copied
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Copy className="h-3 w-3" /> Copy
                        </span>
                      )}
                    </button>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p className="text-xs text-warning">
                      {shareMode === "one_time"
                        ? "This secret has been permanently destroyed. Close this tab when done."
                        : "This secret remains accessible from this link until it expires. Close this tab when done."}
                    </p>
                  </div>
                </div>
              );
            })()}

          {/* Error state */}
          {step === "error" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-danger" />
                <h2 className="font-mono text-sm font-semibold text-ink">
                  Cannot access secret
                </h2>
              </div>
              <p className="text-sm text-ink-muted">{errorMessage}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
