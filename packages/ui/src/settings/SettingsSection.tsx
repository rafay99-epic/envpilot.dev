import type { ReactNode } from "react";

/**
 * A settings section is a hairline and two columns — never a card.
 *
 * One border level is the rule for this whole surface: only interactive
 * controls (inputs, buttons, toggles, swatches) draw a border, because there a
 * border means "touchable". Containers get a rule and whitespace instead, which
 * is what stops settings turning into cards inside cards.
 */
export function SettingsSection({
  title,
  description,
  aside,
  children,
  tone = "default",
}: {
  title: string;
  description?: ReactNode;
  /** Extra content under the description in the label column. */
  aside?: ReactNode;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section className="grid gap-4 border-t border-line py-8 first:border-t-0 first:pt-2 md:grid-cols-[14rem_1fr] md:gap-10">
      <div className="md:sticky md:top-24 md:self-start">
        <h2
          className={`text-[15px] font-semibold ${
            tone === "danger" ? "text-danger" : "text-ink"
          }`}
        >
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-[13px] leading-relaxed text-ink-subtle">
            {description}
          </p>
        )}
        {aside && <div className="mt-3">{aside}</div>}
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}

/** Label + control + hint, stacked. The control supplies its own border. */
export function SettingsField({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      {label && (
        <label
          htmlFor={htmlFor}
          className="mb-1.5 block font-mono text-[12px] text-ink-subtle"
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Inline setting: text on the left, a single control hard right. */
export function SettingsRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: ReactNode;
  control: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-ink">{label}</p>
        {description && (
          <p className="mt-1 text-[13px] leading-relaxed text-ink-subtle">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
