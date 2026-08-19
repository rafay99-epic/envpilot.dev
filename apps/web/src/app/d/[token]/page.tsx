"use client";

import { Suspense, use } from "react";
import { SharedDocLoading, SharedDocReader } from "./shared-reader";

function Reader({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <SharedDocReader token={token} />;
}

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
