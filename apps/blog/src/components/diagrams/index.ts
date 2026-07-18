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
import { diagrams as feature72Days } from "./the-feature-that-lived-72-days";
import { diagrams as mobileNeverShipped } from "./the-mobile-app-that-never-shipped";
import { diagrams as ciRoundTrip } from "./the-ci-round-trip";
import { diagrams as billingStripe } from "./billing-when-stripe-is-not-an-option";
import { diagrams as testGateOff } from "./the-test-gate-we-switched-off";
import { diagrams as authHidUs } from "./how-our-own-auth-hid-us-from-google";
import { diagrams as oneSecret } from "./one-secret-guarded-everything";
import { diagrams as featuresAsData } from "./features-as-data";

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
  ...feature72Days,
  ...mobileNeverShipped,
  ...ciRoundTrip,
  ...billingStripe,
  ...testGateOff,
  ...authHidUs,
  ...oneSecret,
  ...featuresAsData,
};

export type DiagramName = keyof typeof DIAGRAMS;
