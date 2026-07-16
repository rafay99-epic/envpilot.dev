import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation | Envpilot",
  description:
    "Complete documentation for Envpilot. Learn about the CLI tool, VS Code extension, web dashboard, security architecture, and role-based permissions.",
};

export default function DocsPage() {
  redirect("/getting-started");
}
