import type { PageSection } from "@/components/marketing";

export const SECTIONS: readonly PageSection[] = [
  { id: "top", n: "00", label: "intro", status: "~ · not linked · run init" },
  {
    id: "features",
    n: "01",
    label: "vault",
    status: "backend-api · production · 47 vars, 3 files, 2 accounts",
  },
  {
    id: "integrations",
    n: "02",
    label: "surfaces",
    status: "backend-api · 6 surfaces · 1 scoped key",
  },
  {
    id: "access",
    n: "03",
    label: "access",
    status: "backend-api · 6 roles · 41 capabilities",
  },
  {
    id: "audit",
    n: "04",
    label: "audit",
    status: "backend-api · 142 events · last 7 days",
  },
  {
    id: "pricing",
    n: "05",
    label: "plans",
    status: "acme · free plan · 3 of 3 projects",
  },
  { id: "why", n: "06", label: "why", status: "MIT · read the source" },
  {
    id: "faq",
    n: "07",
    label: "start",
    status: "ready · npm i -g @envpilot/cli",
  },
];

export const SECTION_IDS = SECTIONS.map((section) => section.id);
