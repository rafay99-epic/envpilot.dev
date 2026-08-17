import {
  BookOpen,
  FileText,
  Gauge,
  Github,
  Monitor,
  Network,
  Plug,
  Puzzle,
  Rocket,
  Shield,
  Terminal,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Shared icon map for docs frontmatter `icon` keys.
 * Used by the sidebar sections and the article header.
 */
export const DOC_ICONS: Record<string, LucideIcon> = {
  "chevron-right": Rocket,
  terminal: Terminal,
  puzzle: Puzzle,
  monitor: Monitor,
  shield: Shield,
  users: Users,
  "file-text": FileText,
  zap: Zap,
  book: BookOpen,
  plug: Plug,
  github: Github,
  network: Network,
  gauge: Gauge,
};
