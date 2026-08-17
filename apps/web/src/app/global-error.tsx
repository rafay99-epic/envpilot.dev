"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    // This is the last-resort boundary and renders its own document, so it
    // does not inherit the root layout's lang. Without it a screen reader
    // falls back to the user agent's locale on the one page most likely to be
    // read aloud.
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
