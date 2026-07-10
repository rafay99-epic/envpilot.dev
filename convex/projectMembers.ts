/**
 * Compat barrel — preserves the public `api.projectMembers.*` path.
 * Implementation lives in features/projects/members.ts.
 */
export {
  listByProject,
  getProjectMembership,
  getAssignableOrgMembers,
  addMember,
  removeMember,
  setMemberEnvironments,
} from "./features/projects/members";
