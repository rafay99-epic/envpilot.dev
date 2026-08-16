// The shared UI package, re-exported unchanged, then MarketingShell shadowed
// by the web-wired version that injects this app's nav links, footer links
// and auth buttons. An explicit named export wins over `export *`, so
// consumers of "@/components/marketing" get ours.
//
// The component lives in its own module so this file exports no component at
// all: a barrel that both re-exports a namespace and defines a component
// gives Fast Refresh no boundary it can reason about.
export * from "@envpilot/ui";
export { MarketingShell } from "./MarketingShell";
