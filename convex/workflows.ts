import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

/**
 * Workflow manager for durable multi-step operations.
 *
 * Workflows survive server restarts, provide retry logic,
 * and allow reactive status observation.
 *
 * Use for operations that span multiple mutations/actions
 * and need guaranteed completion (e.g., bulk import, member removal).
 */
export const workflowManager = new WorkflowManager(components.workflow);
