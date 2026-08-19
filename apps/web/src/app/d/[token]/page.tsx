"use client";

import { Suspense, use } from "react";
import { SharedDocLoading, SharedDocReader } from "./shared-reader";

function Reader({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <SharedDocReader token={token} />;
}

// The token is per-link data and can't live in the prerendered shell, so it
// reads inside the boundary: the branded chrome paints on click, the reader
// streams in behind it.
export default function SharedDocPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <Suspense fallback={<SharedDocLoading />}>
      <Reader params={params} />
    </Suspense>
  );
}
