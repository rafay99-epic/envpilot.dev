"use client";

import type { ReactNode } from "react";
import {
  Bug,
  User,
  CreditCard,
  Terminal,
  Puzzle,
  HelpCircle,
} from "lucide-react";
import { terminal } from "@/components/marketing";
import { CHOICE_CLASSES } from "./choice-classes";

export type Category =
  | "bug"
  | "account"
  | "billing"
  | "cli"
  | "extension"
  | "other";

const CATEGORIES: { value: Category; label: string; icon: ReactNode }[] = [
  {
    value: "bug",
    label: "Bug Report",
    icon: <Bug className="h-4 w-4" />,
  },
  {
    value: "account",
    label: "Account",
    icon: <User className="h-4 w-4" />,
  },
  {
    value: "billing",
    label: "Billing",
    icon: <CreditCard className="h-4 w-4" />,
  },
  {
    value: "cli",
    label: "CLI",
    icon: <Terminal className="h-4 w-4" />,
  },
  {
    value: "extension",
    label: "VS Code Extension",
    icon: <Puzzle className="h-4 w-4" />,
  },
  {
    value: "other",
    label: "Other",
    icon: <HelpCircle className="h-4 w-4" />,
  },
];

// The label names the whole button group, so it is a span + role="group"
// rather than a <label>, which may only name a single control.
export function CategoryPicker({
  value,
  onChange,
}: {
  value: Category;
  onChange: (value: Category) => void;
}) {
  return (
    <div>
      <span
        id="support-category-label"
        className={`mb-1.5 block ${terminal.label}`}
      >
        <span className="mr-1.5 text-accent">❯</span> category
      </span>
      <div
        role="group"
        aria-labelledby="support-category-label"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => onChange(cat.value)}
            aria-pressed={value === cat.value}
            className={CHOICE_CLASSES(value === cat.value)}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}
