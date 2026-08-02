/**
 * Operational ceiling for one organization's configured notification targets.
 * Plan limits may be lower; an unlimited plan still stops here so list and
 * fanout queries remain bounded.
 */
export const MAX_WEBHOOKS_PER_ORGANIZATION = 100;

export const WEBHOOK_DELIVERY_RECOVERY_BATCH_SIZE = 50;
