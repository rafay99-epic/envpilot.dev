"use client";

import { Suspense, use } from "react";
import { SharedDocLoading, SharedDocReader } from "../shared-reader";

function Reader({
  params,
}: {
  params: Promise<{ token: string; docSlug: string }>;
}) {
  const { token, docSlug } = use(params);
  return <SharedDocReader token={token} docSlug={docSlug} />;
}

export default function SharedModulePage({
  params,
}: {
  params: Promise<{ token: string; docSlug: string }>;
}) {
  return (
    <Suspense fallback={<SharedDocLoading />}>
      <Reader params={params} />
    </Suspense>
  );
}
