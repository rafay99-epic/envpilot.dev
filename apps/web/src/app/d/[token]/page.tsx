"use client";

import { use } from "react";
import { SharedDocReader } from "./shared-reader";

export default function SharedDocPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <SharedDocReader token={token} />;
}
