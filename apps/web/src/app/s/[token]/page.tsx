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

export default function ShareViewerPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [step, setStep] = useState<ViewerStep>("email");
  const [clientKey, setClientKey] = useState<Uint8Array | null>(null);
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
  const [hasPassphrase, setHasPassphrase] = useState(false);
  // one-time shares are destroyed on view; time-limited shares stay available
  // until they expire — drives the reveal-screen copy so it isn't misleading.
  const [shareMode, setShareMode] = useState<"one_time" | "time_limited">(
    "one_time"
  );

  // Store encrypted payload in memory only (not sessionStorage) to prevent XSS exposure
  const encryptedPayloadRef = useRef<string | null>(null);

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
      setClientKey(key);
    } catch (error) {
      log.warn("share_key_invalid", {
        token,
        reason: error instanceof Error ? error.message : "unknown_error",
      });
      setStep("error");
      setErrorMessage("Invalid decryption key in URL.");
    }
  }, []);

  // OTP countdown timer
  useEffect(() => {
    if (step !== "otp") return;
    if (otpCountdown <= 0) return;

    const interval = setInterval(() => {
      setOtpCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [step, otpCountdown]);

  const maskEmail = (email: string) => {
    const [local, domain] = email.split("@");
    if (!domain) return email;
    const masked =
      local.length <= 2
        ? local[0] + "***"
        : local[0] + "***" + local[local.length - 1];
    return `${masked}@${domain}`;
  };

  const handleVerifyEmail = async () => {
    if (!email.trim()) return;

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
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;
    if (!clientKey) return;

    try {
      // Hash the OTP client-side for comparison
      const otpHash = await sha256Hex(otp);

      const result = await verifyOtp.mutateAsync({
        token,
        email: email.trim(),
        otp,
        otpHash,
      });

      setHasPassphrase(result.hasPassphrase);
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
  };

  const handleDecryptWithPassphrase = async () => {
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

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full max-w-md">
      {/* Terminal-style card */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <div className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>
          <span className="ml-2 font-mono text-xs text-zinc-500">
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
                <Shield className="h-5 w-5 text-green-500" />
                <h2 className="font-mono text-sm font-semibold text-zinc-100">
                  A secret has been shared with you
                </h2>
              </div>
              <p className="text-sm text-zinc-400">
                Enter your email to verify access.
              </p>
              <div className="space-y-3">
                <input
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
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  autoFocus
                />
                <button
                  onClick={handleVerifyEmail}
                  disabled={!email.trim() || verifyEmail.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {verifyEmail.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  Verify Email
                </button>
              </div>
              <p className="text-xs text-zinc-600">
                Your email must match the recipient list.
              </p>
            </div>
          )}

          {/* Step 2: OTP */}
          {step === "otp" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-green-500" />
                <h2 className="font-mono text-sm font-semibold text-zinc-100">
                  Verify your identity
                </h2>
              </div>
              <p className="text-sm text-zinc-400">
                A 6-digit code was sent to{" "}
                <span className="text-zinc-200">{maskedEmail}</span>
              </p>
              <div className="space-y-3">
                <input
                  type="text"
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
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-center font-mono text-2xl tracking-[0.3em] text-zinc-100 placeholder:text-zinc-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  maxLength={6}
                  autoFocus
                />
                <button
                  onClick={handleVerifyOtp}
                  disabled={otp.length !== 6 || verifyOtp.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {verifyOtp.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Verify Code"
                  )}
                </button>
              </div>
              {errorMessage && (
                <p className="text-xs text-red-400">{errorMessage}</p>
              )}
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>
                  Code expires in{" "}
                  <span className={otpCountdown < 60 ? "text-amber-400" : ""}>
                    {formatCountdown(otpCountdown)}
                  </span>
                </span>
                {otpCountdown === 0 && (
                  <button
                    onClick={handleResendOtp}
                    disabled={verifyEmail.isPending}
                    className="flex items-center gap-1 text-green-400 hover:text-green-300 disabled:opacity-50"
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
                <Lock className="h-5 w-5 text-green-500" />
                <h2 className="font-mono text-sm font-semibold text-zinc-100">
                  Enter passphrase
                </h2>
              </div>
              <p className="text-sm text-zinc-400">
                This secret is protected with an additional passphrase.
              </p>
              <div className="space-y-3">
                <input
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
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  autoFocus
                />
                <button
                  onClick={handleDecryptWithPassphrase}
                  disabled={!passphrase}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Decrypt
                </button>
              </div>
              {errorMessage && (
                <p className="text-xs text-red-400">{errorMessage}</p>
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
                      <Eye className="h-5 w-5 text-green-500" />
                      <h2 className="font-mono text-sm font-semibold text-zinc-100">
                        Account revealed
                      </h2>
                    </div>

                    <div className="space-y-3 rounded-lg bg-zinc-800 p-3">
                      {/* Name */}
                      <div>
                        <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                          Account
                        </span>
                        <span className="font-mono text-sm text-zinc-100">
                          {accountPayload.name}
                        </span>
                      </div>

                      {/* URL — plain text, never a clickable link */}
                      {accountPayload.url && (
                        <div>
                          <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                            URL
                          </span>
                          <span className="block break-all font-mono text-sm text-zinc-300">
                            {accountPayload.url}
                          </span>
                        </div>
                      )}

                      {/* Username */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                            Username
                          </span>
                          <code className="block break-all font-mono text-sm text-green-400">
                            {accountPayload.username}
                          </code>
                        </div>
                        <button
                          onClick={() =>
                            handleCopyField("username", accountPayload.username)
                          }
                          className="shrink-0 rounded-md bg-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-600"
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
                          <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                            Password
                          </span>
                          <code className="block break-all font-mono text-sm text-green-400">
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
                            className="rounded-md bg-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-600"
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
                            className="rounded-md bg-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-600"
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

                    <div className="flex items-start gap-2 rounded-lg bg-amber-900/20 px-3 py-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <p className="text-xs text-amber-400">
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
                    <Eye className="h-5 w-5 text-green-500" />
                    <h2 className="font-mono text-sm font-semibold text-zinc-100">
                      Secret revealed
                    </h2>
                  </div>
                  <div className="relative">
                    <div className="max-h-48 overflow-auto rounded-lg bg-zinc-800 p-3">
                      {secretKey ? (
                        <code className="break-all font-mono text-sm">
                          <span className="text-blue-400">{secretKey}</span>
                          <span className="text-zinc-500">=</span>
                          <span className="text-green-400">{secretValue}</span>
                        </code>
                      ) : (
                        <code className="break-all font-mono text-sm text-green-400">
                          {decryptedSecret}
                        </code>
                      )}
                    </div>
                    <button
                      onClick={handleCopy}
                      className="absolute right-2 top-2 rounded-md bg-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-600"
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
                  <div className="flex items-start gap-2 rounded-lg bg-amber-900/20 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <p className="text-xs text-amber-400">
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
                <AlertTriangle className="h-5 w-5 text-red-400" />
                <h2 className="font-mono text-sm font-semibold text-zinc-100">
                  Cannot access secret
                </h2>
              </div>
              <p className="text-sm text-zinc-400">{errorMessage}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
