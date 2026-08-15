"use client";

import { useState } from "react";
import { FRAMEWORK_LOGOS } from "@/constants/framework-logos";
import { PROJECT_TYPES, type ProjectType } from "@/constants/templates";
import {
  Wrench,
  TrendingUp,
  Layout,
  Server,
  Layers,
  Smartphone,
  Database,
  Container,
  BarChart3,
} from "lucide-react";

/**
 * Lucide icon component map for fallback rendering when SVGL image fails to load.
 */
const CATEGORY_ICON_MAP: Record<
  string,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  "trending-up": TrendingUp,
  layout: Layout,
  server: Server,
  layers: Layers,
  smartphone: Smartphone,
  database: Database,
  container: Container,
  "bar-chart-3": BarChart3,
};

function RailsLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 255"
      width={size}
      height={size}
    >
      <defs>
        <linearGradient x1="84.8%" y1="111.4%" x2="58.3%" y2="64.6%" id="ra">
          <stop stopColor="#FB7655" offset="0%" />
          <stop stopColor="#E42B1E" offset="41%" />
          <stop stopColor="#900" offset="99%" />
        </linearGradient>
        <linearGradient x1="116.7%" y1="60.9%" x2="1.7%" y2="19.3%" id="rb">
          <stop stopColor="#871101" offset="0%" />
          <stop stopColor="#911209" offset="100%" />
        </linearGradient>
        <linearGradient x1="75.8%" y1="219.3%" x2="39%" y2="7.8%" id="rc">
          <stop stopColor="#871101" offset="0%" />
          <stop stopColor="#911209" offset="100%" />
        </linearGradient>
        <linearGradient x1="50%" y1="7.2%" x2="66.5%" y2="79.1%" id="rd">
          <stop stopColor="#FFF" offset="0%" />
          <stop stopColor="#E57252" offset="23%" />
          <stop stopColor="#DE3B20" offset="46%" />
          <stop stopColor="#A60003" offset="100%" />
        </linearGradient>
        <linearGradient x1="46.2%" y1="16.3%" x2="49.9%" y2="83%" id="re">
          <stop stopColor="#FFF" offset="0%" />
          <stop stopColor="#E4714E" offset="23%" />
          <stop stopColor="#BE1A0D" offset="56%" />
          <stop stopColor="#A80D00" offset="100%" />
        </linearGradient>
        <linearGradient x1="37%" y1="15.6%" x2="49.5%" y2="92.5%" id="rf">
          <stop stopColor="#FFF" offset="0%" />
          <stop stopColor="#E46342" offset="18%" />
          <stop stopColor="#C82410" offset="40%" />
          <stop stopColor="#A80D00" offset="100%" />
        </linearGradient>
        <linearGradient x1="13.6%" y1="58.3%" x2="85.8%" y2="-46.7%" id="rg">
          <stop stopColor="#FFF" offset="0%" />
          <stop stopColor="#C81F11" offset="54%" />
          <stop stopColor="#BF0905" offset="100%" />
        </linearGradient>
        <linearGradient x1="27.6%" y1="21.1%" x2="50.7%" y2="79.1%" id="rh">
          <stop stopColor="#FFF" offset="0%" />
          <stop stopColor="#DE4024" offset="31%" />
          <stop stopColor="#BF190B" offset="100%" />
        </linearGradient>
        <linearGradient x1="-20.7%" y1="122.3%" x2="104.2%" y2="-6.3%" id="ri">
          <stop stopColor="#BD0012" offset="0%" />
          <stop stopColor="#FFF" offset="7%" />
          <stop stopColor="#FFF" offset="17%" />
          <stop stopColor="#C82F1C" offset="27%" />
          <stop stopColor="#820C01" offset="33%" />
          <stop stopColor="#A31601" offset="46%" />
          <stop stopColor="#B31301" offset="72%" />
          <stop stopColor="#E82609" offset="100%" />
        </linearGradient>
        <linearGradient x1="58.8%" y1="65.2%" x2="12%" y2="50.1%" id="rj">
          <stop stopColor="#8C0C01" offset="0%" />
          <stop stopColor="#990C00" offset="54%" />
          <stop stopColor="#A80D0E" offset="100%" />
        </linearGradient>
        <linearGradient x1="79.3%" y1="62.8%" x2="23.1%" y2="17.9%" id="rk">
          <stop stopColor="#7E110B" offset="0%" />
          <stop stopColor="#9E0C00" offset="100%" />
        </linearGradient>
        <linearGradient x1="92.9%" y1="74.1%" x2="59.8%" y2="39.7%" id="rl">
          <stop stopColor="#79130D" offset="0%" />
          <stop stopColor="#9E120B" offset="100%" />
        </linearGradient>
        <linearGradient x1="56.6%" y1="101.7%" x2="3.1%" y2="12%" id="ro">
          <stop stopColor="#8B2114" offset="0%" />
          <stop stopColor="#9E100A" offset="43%" />
          <stop stopColor="#B3100C" offset="100%" />
        </linearGradient>
        <linearGradient x1="30.9%" y1="35.6%" x2="92.5%" y2="100.7%" id="rp">
          <stop stopColor="#B31000" offset="0%" />
          <stop stopColor="#910F08" offset="44%" />
          <stop stopColor="#791C12" offset="100%" />
        </linearGradient>
        <radialGradient cx="32%" cy="40.2%" r="69.6%" id="rm">
          <stop stopColor="#A80D00" offset="0%" />
          <stop stopColor="#7E0E08" offset="100%" />
        </radialGradient>
        <radialGradient cx="13.5%" cy="40.9%" r="88.4%" id="rn">
          <stop stopColor="#A30C00" offset="0%" />
          <stop stopColor="#800E08" offset="100%" />
        </radialGradient>
      </defs>
      <path
        d="M197.5 167.8 51.9 254.2l188.5-12.8 14.5-190-57.4 116.4Z"
        fill="url(#ra)"
      />
      <path d="m240.7 241.3-16.2-111.8-44.1 58.2 60.3 53.6Z" fill="url(#rb)" />
      <path d="m240.9 241.3-118.7-9.4-69.6 22 188.3-12.6Z" fill="url(#rc)" />
      <path d="m52.7 254 29.7-97.1-65.2 13.9L52.7 254Z" fill="url(#rd)" />
      <path d="m180.4 188-27.4-106.7-78 73.2L180.3 188Z" fill="url(#re)" />
      <path d="m248.7 82.7-73.8-60.2-20.5 66.4 94.3-6.2Z" fill="url(#rf)" />
      <path d="m214.2 1-43.4 24L143.4.7l70.8.3Z" fill="url(#rg)" />
      <path d="m0 203.4 18.2-33.2-14.7-39.5L0 203.4Z" fill="url(#rh)" />
      <path
        d="m2.5 129.5 14.8 42L81.6 157 155 88.8 175.7 23 143 0 87.6 20.8C70.1 37 36.3 69 35 69.8c-1.2.6-22.4 40.6-32.5 59.7Z"
        fill="#FFF"
      />
      <path
        d="M54.4 54c37.9-37.4 86.7-59.6 105.4-40.7 18.8 18.9-1 64.8-39 102.3-37.8 37.5-86 61-104.7 42-18.8-18.8.5-66 38.3-103.5Z"
        fill="url(#ri)"
      />
      <path
        d="m52.7 254 29.5-97.5 97.6 31.4c-35.3 33.1-74.6 61-127 66Z"
        fill="url(#rj)"
      />
      <path
        d="m155 88.6 25.2 99.3c29.5-31 56-64.3 68.9-105.6l-94 6.3Z"
        fill="url(#rk)"
      />
      <path
        d="M248.8 82.8c10-30.2 12.4-73.7-35-81.8l-38.7 21.5 73.7 60.3Z"
        fill="url(#rl)"
      />
      <path
        d="M0 203c1.4 50 37.4 50.7 52.8 51.1l-35.5-82.9L0 203Z"
        fill="#9E1209"
      />
      <path
        d="m155.2 88.8 69.3 42.4c1.4.8 19.7-30.8 23.8-48.6l-93 6.2Z"
        fill="url(#rm)"
      />
      <path
        d="m82.1 156.5 39.3 75.9c23.3-12.7 41.5-28 58.1-44.5l-97.4-31.4Z"
        fill="url(#rn)"
      />
      <path
        d="m17.2 171.3-5.6 66.4c10.5 14.3 25 15.6 40.1 14.5-11-27.4-32.9-82-34.5-80.9Z"
        fill="url(#ro)"
      />
      <path
        d="m174.8 22.7 78.1 11C248.8 16 236 4.5 214.1 1l-39.3 21.7Z"
        fill="url(#rp)"
      />
    </svg>
  );
}

function ConvexLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="28 28 128 132"
      fill="none"
      width={size}
      height={size}
    >
      <path
        fill="#F3B01C"
        d="M108.092 130.021c18.166-2.018 35.293-11.698 44.723-27.854-4.466 39.961-48.162 65.218-83.83 49.711-3.286-1.425-6.115-3.796-8.056-6.844-8.016-12.586-10.65-28.601-6.865-43.135 10.817 18.668 32.81 30.111 54.028 28.122Z"
      />
      <path
        fill="#8D2676"
        d="M53.401 90.174c-7.364 17.017-7.682 36.94 1.345 53.336-31.77-23.902-31.423-75.052-.388-98.715 2.87-2.187 6.282-3.485 9.86-3.683 14.713-.776 29.662 4.91 40.146 15.507-21.3.212-42.046 13.857-50.963 33.555Z"
      />
      <path
        fill="#EE342F"
        d="M114.637 61.855C103.89 46.87 87.069 36.668 68.639 36.358c35.625-16.17 79.446 10.047 84.217 48.807.444 3.598-.139 7.267-1.734 10.512-6.656 13.518-18.998 24.002-33.42 27.882 10.567-19.599 9.263-43.544-3.065-61.704Z"
      />
    </svg>
  );
}

function AstroLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 85 107"
      width={size}
      height={size}
    >
      <path
        fill="#17191E"
        d="M27.59 91.136c-4.834-4.418-6.246-13.703-4.232-20.429 3.492 4.241 8.33 5.584 13.342 6.343 7.737 1.17 15.336.732 22.523-2.804.822-.405 1.582-.943 2.48-1.489.675 1.957.85 3.932.615 5.943-.573 4.896-3.01 8.678-6.885 11.545-1.55 1.147-3.19 2.172-4.79 3.253-4.917 3.323-6.247 7.22-4.4 12.888.044.139.084.277.183.614-2.51-1.124-4.344-2.76-5.742-4.911-1.475-2.27-2.177-4.78-2.214-7.498-.019-1.322-.019-2.656-.197-3.96-.434-3.178-1.926-4.601-4.737-4.683-2.884-.084-5.166 1.699-5.771 4.507-.046.216-.113.429-.18.68l.004.001ZM0 69.587s14.314-6.973 28.668-6.973L39.49 29.12c.405-1.62 1.588-2.72 2.924-2.72 1.335 0 2.518 1.1 2.924 2.72L56.16 62.614c17 0 28.668 6.973 28.668 6.973S60.514 3.352 60.467 3.219C59.769 1.261 58.591 0 57.003 0H27.827c-1.588 0-2.718 1.261-3.464 3.22C24.311 3.35 0 69.586 0 69.586Z"
      />
    </svg>
  );
}

function PostHogLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 50 30"
      width={size}
      height={size}
    >
      <path
        fill="#1D4AFF"
        d="M10.891 17.206a1 1 0 0 1-1.788 0l-.882-1.763a1 1 0 0 1 0-.894l.882-1.763a1 1 0 0 1 1.788 0l.882 1.763a1 1 0 0 1 0 .894l-.882 1.763zm0 9.997a1 1 0 0 1-1.788 0L8.22 25.44a1 1 0 0 1 0-.894l.882-1.763a1 1 0 0 1 1.788 0l.882 1.763a1 1 0 0 1 0 .894l-.882 1.763z"
      />
      <path
        fill="#F9BD2B"
        d="M0 23.408c0-.89 1.077-1.337 1.707-.707l4.583 4.583c.63.63.184 1.708-.707 1.708H1a1 1 0 0 1-1-1v-4.584zm0-4.828a1 1 0 0 0 .293.708l9.411 9.41a1 1 0 0 0 .707.294h5.17c.89 0 1.337-1.077.707-1.707l-14.58-14.58C1.077 12.074 0 12.52 0 13.41v5.17zm0-9.997a1 1 0 0 0 .293.707L19.7 28.7a1 1 0 0 0 .707.293h5.17c.89 0 1.337-1.078.707-1.708L1.707 2.707C1.077 2.077 0 2.523 0 3.414v5.17zm9.997 0a1 1 0 0 0 .293.707l17.994 17.995c.63.63 1.707.183 1.707-.708v-5.169a1 1 0 0 0-.293-.707L11.704 2.707c-.63-.63-1.707-.184-1.707.707v5.17zm11.704-5.876c-.63-.63-1.707-.184-1.707.707v5.17a1 1 0 0 0 .293.706l7.997 7.998c.63.63 1.707.183 1.707-.708v-5.169a1 1 0 0 0-.293-.707l-7.997-7.997z"
      />
      <path
        fill="#000"
        d="m42.525 23.53-9.413-9.412c-.63-.63-1.707-.184-1.707.707v13.167a1 1 0 0 0 1 1h14.58a1 1 0 0 0 1-1v-1.2c0-.552-.449-.993-.997-1.064a7.723 7.723 0 0 1-4.463-2.197zm-6.321 2.263a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z"
      />
      <path
        fill="#1D4AFF"
        d="M0 27.992a1 1 0 0 0 1 1h4.583c.891 0 1.337-1.078.707-1.708l-4.583-4.583c-.63-.63-1.707-.184-1.707.707v4.584zm9.997-16.995-8.29-8.29C1.077 2.077 0 2.523 0 3.414v5.17a1 1 0 0 0 .293.706l9.704 9.705v-7.998zm-8.29 1.707c-.63-.63-1.707-.184-1.707.707v5.17a1 1 0 0 0 .293.706l9.704 9.705v-7.998l-8.29-8.29z"
      />
      <path
        fill="#F54E00"
        d="M19.994 11.411a1 1 0 0 0-.293-.707l-7.997-7.997c-.63-.63-1.707-.184-1.707.707v5.17a1 1 0 0 0 .293.706l9.704 9.705V11.41zm-9.997 17.58h5.583c.891 0 1.337-1.077.707-1.707l-6.29-6.29v7.998zm0-17.994v7.583a1 1 0 0 0 .293.708l9.704 9.704v-7.584a1 1 0 0 0-.293-.707l-9.704-9.704z"
      />
    </svg>
  );
}

function T3Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 258 199"
      fill="none"
      width={size}
      height={size}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M165.735 25.07L188.947 0.97H0.47V25.07H165.735Z"
        fill="black"
      />
      <path
        d="M163.981 96.32L254.022 3.68L221.206 3.68L145.617 80.76L163.981 96.32Z"
        fill="black"
      />
      <path
        d="M233.658 131.418C233.658 155.075 214.48 174.254 190.823 174.254C171.715 174.254 155.513 161.738 150 144.439L146.625 133.848L127.329 153.143L129.092 157.336C139.215 181.421 163.034 198.354 190.823 198.354C227.791 198.354 257.759 168.386 257.759 131.418C257.759 106.937 244.399 85.74 224.956 74.09L220.395 71.36L202.727 89.25L210.788 93.51C224.403 100.696 233.658 114.981 233.658 131.418Z"
        fill="black"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M88.26 192.669L88.26 45.65H64.16L64.16 192.669H88.26Z"
        fill="black"
      />
    </svg>
  );
}

/**
 * Renders a framework logo for a given project type.
 * Uses SVGL CDN for most logos, inline SVGs for Rails/Convex/Astro/PostHog/T3,
 * and falls back to a Lucide icon if the image fails to load.
 */
export function FrameworkLogo({
  projectType,
  size = 24,
  className = "",
}: {
  projectType: ProjectType;
  size?: number;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);

  // Inline SVG logos
  if (projectType === "rails") return <RailsLogo size={size} />;
  if (projectType === "convex") return <ConvexLogo size={size} />;
  if (projectType === "astro") return <AstroLogo size={size} />;
  if (projectType === "posthog") return <PostHogLogo size={size} />;
  if (projectType === "t3") return <T3Logo size={size} />;

  if (projectType === "custom") {
    return (
      <Wrench className={className} style={{ width: size, height: size }} />
    );
  }

  const url = FRAMEWORK_LOGOS[projectType];

  if (!url || imgError) {
    const iconName = PROJECT_TYPES[projectType]?.icon;
    const IconComponent = CATEGORY_ICON_MAP[iconName];
    if (IconComponent) {
      return (
        <IconComponent
          className={className}
          style={{ width: size, height: size }}
        />
      );
    }
    return (
      <Wrench className={className} style={{ width: size, height: size }} />
    );
  }

  return (
    <img
      src={url}
      alt={PROJECT_TYPES[projectType]?.label ?? projectType}
      width={size}
      height={size}
      className={className}
      loading="lazy"
      onError={() => setImgError(true)}
    />
  );
}
