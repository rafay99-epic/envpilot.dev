import { createHmac } from "node:crypto";

export function createArtifactCompletionProof(input: {
  artifactId: string;
  version: number;
  objectKey: string;
  size: number;
}): string {
  const secret = process.env.WORKOS_API_KEY;
  if (!secret) {
    throw new Error(
      "WORKOS_API_KEY is required to finalize verified artifact uploads"
    );
  }
  return createHmac("sha256", secret)
    .update("envpilot:artifact-completion:v1\0")
    .update(input.artifactId)
    .update("\0")
    .update(String(input.version))
    .update("\0")
    .update(input.objectKey)
    .update("\0")
    .update(String(input.size))
    .digest("hex");
}
