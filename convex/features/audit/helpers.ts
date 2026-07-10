import { Id } from "../../_generated/dataModel";
import { resolveFeatureValue } from "../featureRegistry/resolver";

/**
 * Get the audit log retention cutoff timestamp for an organization.
 * Returns null if no retention limit applies (unlimited).
 */
export async function getRetentionCutoff(
  db: any,
  organizationId: Id<"organizations">
): Promise<number | null> {
  const resolved = await resolveFeatureValue(
    db,
    organizationId,
    "audit_log_retention_days"
  );
  const days = resolved.value as number | null;
  if (days === null) return null; // unlimited
  return Date.now() - days * 24 * 60 * 60 * 1000;
}
