"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type OutputTone = "ok" | "out" | "dim" | "warn" | "err";

export interface TerminalScene {
  command: string;
  output: Array<{ text: string; tone?: OutputTone }>;
}

const TONE_CLASSES: Record<OutputTone, string> = {
  ok: "text-accent",
  out: "text-ink-muted",
  dim: "text-ink-faint",
  warn: "text-warning",
  err: "text-danger",
};

/**
 * Scripted terminal session: types each command character by character,
 * reveals output lines one at a time, holds, then advances to the next
 * scene on a loop. Pure timeout state machine — fixed min-height avoids
 * layout shift between scenes.
 */
export function TerminalPlayer({
  scenes,
  className = "",
  typingSpeed = 42,
  lineDelay = 280,
  holdTime = 2800,
}: {
  scenes: TerminalScene[];
  className?: string;
  typingSpeed?: number;
  lineDelay?: number;
  holdTime?: number;
}) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [linesShown, setLinesShown] = useState(0);

  const scene = scenes[sceneIndex];
  const doneTyping = charCount >= scene.command.length;
  const doneOutput = linesShown >= scene.output.length;

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    if (!doneTyping) {
      timeout = setTimeout(() => setCharCount((c) => c + 1), typingSpeed);
    } else if (!doneOutput) {
      timeout = setTimeout(
        () => setLinesShown((l) => l + 1),
        linesShown === 0 ? lineDelay + 200 : lineDelay
      );
    } else {
      timeout = setTimeout(() => {
        setSceneIndex((i) => (i + 1) % scenes.length);
        setCharCount(0);
        setLinesShown(0);
      }, holdTime);
    }

    return () => clearTimeout(timeout);
  }, [
    // charCount must be a dep: each typed character schedules the next one.
    charCount,
    doneTyping,
    doneOutput,
    linesShown,
    scenes.length,
    typingSpeed,
    lineDelay,
    holdTime,
  ]);

  return (
    <div className={`text-[13px] sm:text-sm ${className}`}>
      <div className="flex items-center">
        <span className="mr-2 shrink-0 text-accent">❯</span>
        <span className="text-ink">{scene.command.slice(0, charCount)}</span>
        <span
          className="ml-0.5 inline-block h-4 w-[7px] bg-accent"
          style={{ animation: "blink 1.1s step-end infinite" }}
        />
      </div>
      <AnimatePresence mode="popLayout">
        {scene.output.slice(0, linesShown).map((line, i) => (
          <motion.p
            key={`${sceneIndex}-${i}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={`mt-1 whitespace-pre-wrap ${TONE_CLASSES[line.tone ?? "out"]}`}
          >
            {line.text}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}
