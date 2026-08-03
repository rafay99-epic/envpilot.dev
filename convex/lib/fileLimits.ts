/**
 * Hard structural ceiling on active secret files per project.
 *
 * ONE definition, because four independent copies of `1000` disagreed the
 * moment any of them moved. Everything downstream is derived from it:
 *
 *   - the write path refuses the insert that would exceed it,
 *   - `files.list` and the API pull refuse a PARTIAL listing past it,
 *   - the path-collision scan refuses an incomplete uniqueness check past it,
 *   - the fileDownload rate-limit burst is sized to it, so a cold pull of any
 *     project the write path accepts fits in one burst by construction.
 *
 * That last coupling is why this must be enforced at the INSERT rather than
 * inferred from the collision scan: the scan only rejects a project that is
 * ALREADY over, so it happily allowed the write that took a project to 1001
 * — one row past every reader's bound, leaving it unlistable and unpullable.
 */
export const MAX_PROJECT_FILES = 1000;
