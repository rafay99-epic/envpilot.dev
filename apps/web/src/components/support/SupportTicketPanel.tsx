"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { AlertTriangle } from "lucide-react";
import { TerminalPanel, terminal } from "@/components/marketing";
import { CategoryPicker, type Category } from "./CategoryPicker";
import { PriorityPicker, type Priority } from "./PriorityPicker";
import { TicketSubmitted } from "./TicketSubmitted";

export function SupportTicketPanel() {
  const submitTicket = useMutation(api.features.support.supportTickets.submit);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<Category>("bug");
  const [priority, setPriority] = useState<Priority>("medium");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    // Cleared after the try/catch rather than in a finally: React Compiler
    // cannot lower try/finally and would skip memoizing this component.
    try {
      await submitTicket({ name, email, category, priority, subject, message });
      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit ticket.");
    }
    setIsSubmitting(false);
  };

  const handleReset = () => {
    setIsSubmitted(false);
    setName("");
    setEmail("");
    setCategory("bug");
    setPriority("medium");
    setSubject("");
    setMessage("");
  };

  return (
    <TerminalPanel
      title={
        isSubmitted ? "support — ticket submitted" : "support — new ticket"
      }
      bodyClassName="p-6 sm:p-8"
    >
      {isSubmitted ? (
        <TicketSubmitted email={email} onReset={handleReset} />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-panel border border-danger-line bg-danger-soft px-4 py-3 font-sans text-[14px] text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Name and Email */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="support-name"
                className={`mb-1.5 block ${terminal.label}`}
              >
                <span className="mr-1.5 text-accent">❯</span> name
              </label>
              <input
                id="support-name"
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                placeholder="Your name"
                className={terminal.input}
              />
            </div>
            <div>
              <label
                htmlFor="support-email"
                className={`mb-1.5 block ${terminal.label}`}
              >
                <span className="mr-1.5 text-accent">❯</span> email
              </label>
              <input
                id="support-email"
                name="email"
                type="email"
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className={terminal.input}
              />
            </div>
          </div>

          <CategoryPicker value={category} onChange={setCategory} />

          <PriorityPicker value={priority} onChange={setPriority} />

          {/* Subject */}
          <div>
            <label
              htmlFor="support-subject"
              className={`mb-1.5 block ${terminal.label}`}
            >
              <span className="mr-1.5 text-accent">❯</span> subject
            </label>
            <input
              id="support-subject"
              name="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              maxLength={200}
              placeholder="Brief description of the issue"
              className={terminal.input}
            />
          </div>

          {/* Message */}
          <div>
            <label
              htmlFor="support-message"
              className={`mb-1.5 block ${terminal.label}`}
            >
              <span className="mr-1.5 text-accent">❯</span> message
            </label>
            <textarea
              id="support-message"
              name="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              maxLength={5000}
              rows={8}
              placeholder="Please describe the issue in detail. Include steps to reproduce, expected behavior, and any error messages you see."
              className={`${terminal.input} resize-y`}
            />
            <p
              className={`mt-1 text-right ${terminal.mono} text-[11px] text-ink-faint`}
            >
              {message.length}/5000
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`${terminal.cta} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {isSubmitting ? "Submitting…" : "Submit ticket"}
          </button>
        </form>
      )}
    </TerminalPanel>
  );
}
