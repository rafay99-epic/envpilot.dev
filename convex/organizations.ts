/**
 * Compat barrel — preserves the public `api.organizations.*` paths.
 * Implementation lives in features/organizations/.
 */
export {
  listForUser,
  getById,
  getBySlug,
  getMembers,
  getMembersInternal,
  getMembership,
} from "./features/organizations/queries";
export {
  create,
  update,
  remove,
  removeMember,
  updateMemberRole,
  transferOwnership,
} from "./features/organizations/mutations";
export {
  getMemberSessions,
  revokeMemberCliToken,
  revokeMemberExtensionSession,
  revokeAllMemberSessions,
} from "./features/organizations/memberSessions";
