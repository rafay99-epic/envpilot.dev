"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { SettingsSection } from "@envpilot/ui";
import {
  TerminalButton,
  TerminalWindow,
} from "@/components/dashboard/terminal-ui";

export function IntegrationsSettings() {
  return (
    <div id="integrations">
      <SettingsSection
        title="IDE extensions"
        description="Install extensions to sync variables to your local environment"
        aside={
          <p className="text-[13px] leading-relaxed text-ink-subtle">
            Available on{" "}
            <a
              href="https://open-vsx.org/extension/envpilot/envpilot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-muted underline decoration-ink-faint underline-offset-2 transition-colors hover:text-ink"
            >
              Open VSX Registry
            </a>{" "}
            &mdash; compatible with any VS Code fork including Cursor,
            Antigravity, VSCodium, and more.
          </p>
        }
      >
        <ul className="-my-1">
          <IntegrationCard
            name="VS Code Extension"
            description="Sync environment variables directly to your workspace"
            icon={
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
              </svg>
            }
            installed={false}
            href="https://marketplace.visualstudio.com/items?itemName=EnvPilot.envpilot"
          />
          <IntegrationCard
            name="Cursor Extension"
            description="Envpilot support for Cursor editor"
            icon={
              <svg
                className="h-6 w-6"
                viewBox="0 0 466.73 532.09"
                fill="currentColor"
              >
                <path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z" />
              </svg>
            }
            installed={false}
            href="https://open-vsx.org/extension/envpilot/envpilot"
          />
          <IntegrationCard
            name="Antigravity Extension"
            description="Envpilot support for Antigravity editor"
            icon={
              <svg className="h-6 w-6" viewBox="0 0 16 15" fill="none">
                <mask
                  id="ag-mask"
                  style={{ maskType: "alpha" }}
                  maskUnits="userSpaceOnUse"
                  x="0"
                  y="0"
                  width="16"
                  height="15"
                >
                  <path
                    d="M14.08 13.984C14.945 14.63 16.25 14.2 15.05 13.01C11.476 9.54 12.23 0 7.79 0C3.35 0 4.1 9.54 0.53 13.01C-0.77 14.31 0.64 14.63 1.5 13.984C4.86 11.71 4.65 7.7 7.79 7.7C10.934 7.7 10.72 11.71 14.08 13.984Z"
                    fill="black"
                  />
                </mask>
                <g mask="url(#ag-mask)">
                  <g filter="url(#ag-f0)">
                    <path
                      d="M-0.66 -3.23C-0.92 -0.91 1.08 1.23 3.81 1.54C6.55 1.85 8.98 0.22 9.24 -2.11C9.51 -4.43 7.5 -6.57 4.77 -6.88C2.04 -7.19 -0.4 -5.55 -0.66 -3.23Z"
                      fill="#FFE432"
                    />
                  </g>
                  <g filter="url(#ag-f1)">
                    <path
                      d="M9.88 4.37C10.57 7.32 13.566 9.14 16.58 8.44C19.59 7.74 21.48 4.78 20.8 1.83C20.11 -1.12 17.11 -2.94 14.1 -2.24C11.09 -1.54 9.2 1.42 9.88 4.37Z"
                      fill="#FC413D"
                    />
                  </g>
                  <g filter="url(#ag-f2)">
                    <path
                      d="M-8.05 6.35C-7.19 9.39 -3.29 10.95 0.65 9.83C4.6 8.7 7.09 5.33 6.23 2.28C5.36 -0.76 1.46 -2.32 -2.48 -1.2C-6.42 -0.08 -8.92 3.3 -8.05 6.35Z"
                      fill="#00B95C"
                    />
                  </g>
                  <g filter="url(#ag-f3)">
                    <path
                      d="M-8.05 6.35C-7.19 9.39 -3.29 10.95 0.65 9.83C4.6 8.7 7.09 5.33 6.23 2.28C5.36 -0.76 1.46 -2.32 -2.48 -1.2C-6.42 -0.08 -8.92 3.3 -8.05 6.35Z"
                      fill="#00B95C"
                    />
                  </g>
                  <g filter="url(#ag-f4)">
                    <path
                      d="M-4.92 8.87C-2.75 11.08 0.98 10.94 3.42 8.56C5.86 6.17 6.08 2.43 3.91 0.22C1.74 -2 -2 -1.86 -4.44 0.53C-6.87 2.92 -7.09 6.65 -4.92 8.87Z"
                      fill="#00B95C"
                    />
                  </g>
                  <g filter="url(#ag-f5)">
                    <path
                      d="M6.43 17.23C7.1 20.13 9.91 21.953 12.71 21.3C15.5 20.66 17.22 17.78 16.54 14.88C15.87 11.98 13.06 10.15 10.27 10.8C7.47 11.45 5.75 14.33 6.43 17.23Z"
                      fill="#3186FF"
                    />
                  </g>
                  <g filter="url(#ag-f6)">
                    <path
                      d="M1.67 -5.95C0.25 -2.8 1.8 0.95 5.11 2.44C8.43 3.93 12.26 2.59 13.67 -0.56C15.08 -3.7 13.54 -7.45 10.222 -8.94C6.91 -10.43 3.08 -9.09 1.67 -5.95Z"
                      fill="#FBBC04"
                    />
                  </g>
                  <g filter="url(#ag-f7)">
                    <path
                      d="M-2.11 24.39C-5.53 23.05 0.31 12.02 1.76 8.32C3.21 4.62 7.16 2.71 10.57 4.05C13.99 5.39 18.04 12.78 16.58 16.477C15.13 20.17 1.3 25.73 -2.11 24.39Z"
                      fill="#3186FF"
                    />
                  </g>
                  <g filter="url(#ag-f8)">
                    <path
                      d="M18.58 10.66C17.67 11.727 15.28 11.18 13.25 9.44C11.22 7.71 10.32 5.43 11.23 4.36C12.15 3.3 14.53 3.84 16.56 5.58C18.592 7.32 19.5 9.59 18.58 10.66Z"
                      fill="#749BFF"
                    />
                  </g>
                  <g filter="url(#ag-f9)">
                    <path
                      d="M11.76 5.23C15.52 7.77 19.85 7.94 21.43 5.6C23.01 3.26 21.24 -0.7 17.48 -3.24C13.72 -5.78 9.39 -5.95 7.81 -3.61C6.23 -1.27 7.99 2.68 11.76 5.23Z"
                      fill="#FC413D"
                    />
                  </g>
                  <g filter="url(#ag-f10)">
                    <path
                      d="M-0.59 1.09C-1.52 3.34 -1.22 5.6 0.09 6.14C1.39 6.68 3.21 5.3 4.14 3.05C5.07 0.8 4.77 -1.46 3.46 -2C2.15 -2.54 0.34 -1.16 -0.59 1.09Z"
                      fill="#FFEE48"
                    />
                  </g>
                </g>
                <defs>
                  <filter
                    id="ag-f0"
                    x="-2.12817"
                    y="-8.35998"
                    width="12.8393"
                    height="11.383"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="0.722959"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f1"
                    x="2.75168"
                    y="-9.38089"
                    width="25.1763"
                    height="24.96"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="3.49513"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f2"
                    x="-14.1669"
                    y="-7.50196"
                    width="26.5068"
                    height="23.6338"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.97119"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f3"
                    x="-14.1669"
                    y="-7.50196"
                    width="26.5068"
                    height="23.6338"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.97119"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f4"
                    x="-12.3607"
                    y="-7.29981"
                    width="23.709"
                    height="23.6846"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.97119"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f5"
                    x="0.634962"
                    y="5.02095"
                    width="21.7027"
                    height="22.0616"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.82351"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f6"
                    x="-3.97547"
                    y="-14.6666"
                    width="23.2857"
                    height="22.8313"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.5589"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f7"
                    x="-7.7407"
                    y="-0.945408"
                    width="29.1982"
                    height="30.1105"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.2852"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f8"
                    x="6.78641"
                    y="-0.27231"
                    width="16.2415"
                    height="15.5681"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.04485"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f9"
                    x="3.77526"
                    y="-8.71693"
                    width="21.687"
                    height="19.4212"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="1.72712"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                  <filter
                    id="ag-f10"
                    x="-5.40727"
                    y="-6.39238"
                    width="14.3639"
                    height="16.9254"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend
                      mode="normal"
                      in="SourceGraphic"
                      in2="BackgroundImageFix"
                      result="shape"
                    />
                    <feGaussianBlur
                      stdDeviation="2.1376"
                      result="effect1_foregroundBlur"
                    />
                  </filter>
                </defs>
              </svg>
            }
            installed={false}
            href="https://open-vsx.org/extension/envpilot/envpilot"
          />
        </ul>
      </SettingsSection>

      <SettingsSection
        title="CLI tool"
        description="Manage variables from your terminal"
        aside={
          <a
            href="https://www.npmjs.com/package/@envpilot/cli"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] text-ink-subtle transition-colors hover:text-ink-muted"
          >
            View on npm
            <ExternalLink className="h-3 w-3" />
          </a>
        }
      >
        <CliInstallCommand />
      </SettingsSection>
    </div>
  );
}

/** Hairline row — the install control is the only thing that draws a border. */
function IntegrationCard({
  name,
  description,
  icon,
  installed,
  href,
}: {
  name: string;
  description: string;
  icon: React.ReactNode;
  installed: boolean;
  href?: string;
}) {
  const button = installed ? (
    <TerminalButton variant="secondary">
      <Check className="h-3 w-3" /> Installed
    </TerminalButton>
  ) : href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-panel border border-accent-line bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-line"
    >
      Install
      <ExternalLink className="h-3 w-3" />
    </a>
  ) : (
    <TerminalButton>Install</TerminalButton>
  );

  return (
    <li className="flex items-center justify-between gap-4 border-t border-line py-4 first:border-0">
      <div className="flex min-w-0 items-center gap-4">
        <div className="shrink-0 text-ink-muted">{icon}</div>
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink">{name}</p>
          <p className="text-[13px] text-ink-subtle">{description}</p>
        </div>
      </div>
      {button}
    </li>
  );
}

function CliInstallCommand() {
  const [copied, setCopied] = useState(false);
  const command = "npm install -g @envpilot/cli";

  function handleCopy() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <TerminalWindow title="terminal">
      <div className="flex items-center justify-between p-4 font-mono text-sm">
        <code className="text-accent">
          <span className="text-ink-subtle">$</span> {command}
        </code>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink-muted"
          title="Copy to clipboard"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-accent" />
              <span className="text-accent">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </TerminalWindow>
  );
}
