import {
  Folder,
  Globe,
  Smartphone,
  Server,
  Terminal,
  Database,
  Cloud,
  Package,
  Zap,
  Lock,
  BarChart2,
  Rocket,
  type LucideProps,
} from "lucide-react";
import {
  LEGACY_ICON_MAP,
  DEFAULT_PROJECT_ICON,
  type ProjectIcon as ProjectIconName,
} from "@/constants/project";
import {
  isFrameworkIcon,
  parseFrameworkType,
} from "@/constants/framework-logos";
import { FrameworkLogo } from "./framework-logo";

const ICON_COMPONENTS: Record<ProjectIconName, React.FC<LucideProps>> = {
  folder: Folder,
  globe: Globe,
  smartphone: Smartphone,
  server: Server,
  terminal: Terminal,
  database: Database,
  cloud: Cloud,
  package: Package,
  zap: Zap,
  lock: Lock,
  "bar-chart-2": BarChart2,
  rocket: Rocket,
};

interface ProjectIconProps {
  icon: string | undefined | null;
  size?: number;
  className?: string;
}

/**
 * Renders a project icon. Supports:
 * - Framework logos via "framework:<type>" prefix (renders SVGL CDN image)
 * - Lucide icon names (renders Lucide component)
 * - Legacy emoji icons (mapped to Lucide equivalents)
 */
export function ProjectIcon({
  icon,
  size = 20,
  className = "text-ink-faint",
}: ProjectIconProps) {
  // Framework logo icon (e.g., "framework:nextjs")
  if (icon && isFrameworkIcon(icon)) {
    const projectType = parseFrameworkType(icon);
    if (projectType) {
      return (
        <FrameworkLogo
          projectType={projectType}
          size={size}
          className={className}
        />
      );
    }
  }

  const resolved = resolveIcon(icon);
  const Component = ICON_COMPONENTS[resolved] ?? Folder;
  return <Component size={size} className={className} />;
}

/** Resolves an icon string (possibly a legacy emoji) to a valid ProjectIconName. */
function resolveIcon(icon: string | undefined | null): ProjectIconName {
  if (!icon) return DEFAULT_PROJECT_ICON;
  if (icon in ICON_COMPONENTS) return icon as ProjectIconName;
  if (icon in LEGACY_ICON_MAP) return LEGACY_ICON_MAP[icon];
  return DEFAULT_PROJECT_ICON;
}
