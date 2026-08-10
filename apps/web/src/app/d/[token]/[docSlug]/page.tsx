"use client";

import { use } from "react";
import { SharedDocReader } from "../shared-reader";

/** One page inside a shared module. */
export default function SharedModulePage({
  params,
}: {
  params: Promise<{ token: string; docSlug: string }>;
}) {
  const { token, docSlug } = use(params);
  return <SharedDocReader token={token} docSlug={docSlug} />;
}
