import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { AuroraGlow, GridLines, Noise, Reveal } from "@envpilot/ui";
import { DocsShell } from "@/components/shell";

export default function NotFound() {
  return (
    <DocsShell>
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black,transparent)]"
        >
          <AuroraGlow />
          <GridLines />
        </div>
        <Noise />

        <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center px-4 py-28 text-center sm:px-6">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/5 px-3 py-1 font-mono text-[11px] tracking-widest text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 [animation:pulse-glow_2.4s_ease-in-out_infinite]" />
              {"// 404"}
            </span>

            <span className="mt-6 flex h-14 w-14 items-center justify-center rounded-xl border border-green-500/30 bg-green-500/10 text-green-400">
              <FileQuestion className="h-6 w-6" />
            </span>

            <h1 className="mt-6 font-sans text-3xl font-bold tracking-tight text-zinc-100 md:text-4xl">
              Page not found
            </h1>
            <p className="mt-3 max-w-md font-mono text-sm leading-relaxed text-zinc-500">
              This doc doesn&apos;t exist or has been moved.
            </p>

            <Link
              href="/getting-started"
              className="mt-8 inline-flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20"
            >
              Back to docs
            </Link>
          </Reveal>
        </div>
      </div>
    </DocsShell>
  );
}
