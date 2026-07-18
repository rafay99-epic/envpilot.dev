import { diagrams as authCutover } from "./the-auth-cutover";
import { diagrams as deletionThatIsReal } from "./deletion-that-is-real";
import { diagrams as convexQuotaWar } from "./the-convex-quota-war";
import { diagrams as rolesAsData } from "./roles-as-data";
import { diagrams as oneKeyTwoEnvironments } from "./one-key-two-environments";
import { diagrams as oneCoreThreeFaces } from "./one-core-three-faces";
import { diagrams as oneTokenModel } from "./one-token-model";
import { diagrams as sixPrsToFindOneBug } from "./six-prs-to-find-one-bug";
import { diagrams as extensionThatLeaked } from "./the-extension-that-leaked";
import { diagrams as deletingBackwardsCompat } from "./deleting-backwards-compatibility";

/**
 * One module per post so diagram sources sit next to nothing else and posts
 * never collide. Keys are slug-prefixed; MDX references them by that key,
 * e.g. `<Mermaid name="auth-cutover-bridge" />`.
 */
export const DIAGRAMS = {
  ...authCutover,
  ...deletionThatIsReal,
  ...convexQuotaWar,
  ...rolesAsData,
  ...oneKeyTwoEnvironments,
  ...oneCoreThreeFaces,
  ...oneTokenModel,
  ...sixPrsToFindOneBug,
  ...extensionThatLeaked,
  ...deletingBackwardsCompat,
};

export type DiagramName = keyof typeof DIAGRAMS;
