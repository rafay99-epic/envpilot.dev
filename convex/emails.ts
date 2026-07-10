/**
 * Compat barrel — preserves the public `api.emails.*` / `internal.emails.*` paths.
 * Implementation lives in features/emails/.
 */
export {
  sendInvitationEmail,
  sendSessionRevocationEmail,
  sendOrgTransferEmail,
  sendOrgTransferConfirmationEmail,
  sendProjectTransferEmail,
  sendVariableChangeEmail,
  sendMemberUpdateEmail,
  sendRotationReminderEmail,
} from "./features/emails/emails";
