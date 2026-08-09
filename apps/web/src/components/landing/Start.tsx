import Link from "next/link";
import {
  SITE_URLS,
  TerminalCommand,
  TerminalPanel,
  terminal,
} from "@/components/marketing";
import { FAQ_ITEMS } from "./faq-data";

const FIRST_RUN = [
  "npm install -g @envpilot/cli",
  "envpilot login",
  "envpilot init",
];

export function Start() {
  return (
    <section id="faq" className="scroll-mt-24 py-24 sm:py-28">
      <div className={terminal.shell}>
        <TerminalCommand
          cmd="envpilot --help"
          comment="the questions people actually send before signing up."
        />

        <div
          className={`mt-12 divide-y divide-white/[0.06] border-y ${terminal.line}`}
        >
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-sans text-[16px] font-medium text-zinc-200 [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  aria-hidden
                  className={`${terminal.mono} text-zinc-600 transition-transform group-open:rotate-45`}
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl font-sans text-[16px] leading-relaxed text-zinc-400">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
        <Link
          href="/faq"
          className={`mt-6 inline-block ${terminal.mono} text-[13px] text-zinc-500 transition-colors hover:text-green-400`}
        >
          → more questions answered
        </Link>

        <div className="mt-24 grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="max-w-md font-sans text-[clamp(2rem,4.5vw,3rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-zinc-100">
              Three commands and you&apos;ll never paste one again.
            </h2>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <Link
                href="/sign-up"
                className="inline-flex items-center rounded-md bg-green-500 px-6 py-3 font-sans text-[15px] font-semibold text-[#08090A] shadow-[0_0_32px_-10px_rgba(34,197,94,0.9)] transition-colors hover:bg-green-400"
              >
                Start free
              </Link>
              <Link
                href={SITE_URLS.docs}
                className="inline-flex items-center rounded-md px-6 py-3 font-sans text-[15px] text-zinc-300 ring-1 ring-white/[0.08] transition-colors hover:text-zinc-100 hover:ring-white/20"
              >
                Read the docs
              </Link>
            </div>
            <p className={`mt-6 ${terminal.mono} text-[12px] text-zinc-600`}>
              free plan · no card · MIT licensed · self-host any time
            </p>
          </div>

          <TerminalPanel title="bash — first run">
            <div className={`${terminal.mono} text-[13px] leading-[1.95]`}>
              {FIRST_RUN.map((line) => (
                <p key={line} className="text-zinc-200">
                  <span aria-hidden className="mr-2 text-green-400">
                    ❯
                  </span>
                  {line}
                </p>
              ))}
              <p className="mt-1 text-green-400">
                ✓ backend-api / development linked
              </p>
              <p className="text-zinc-600">
                run anything with `envpilot run -- …`
              </p>
            </div>
          </TerminalPanel>
        </div>
      </div>
    </section>
  );
}
