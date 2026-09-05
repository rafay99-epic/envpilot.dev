// Notification review links, tested against the backend source of truth in
// convex/features/integrations/{links,messages}.ts (resolved via the @convex alias).
import { describe, expect, it } from "vitest";

import { reviewPath } from "@convex/features/integrations/links";
import { buildNotificationText } from "@convex/features/integrations/messages";

describe("reviewPath", () => {
  it("links a change action with a requestId straight to the change request", () => {
    expect(reviewPath("change.requested", { requestId: "cr1" }, "acme")).toBe(
      "/dashboard/requests?change=cr1"
    );
  });

  it("links a variable.request action with a requestId straight to the request", () => {
    expect(
      reviewPath("variable.request_approved", { requestId: "vr1" }, "acme")
    ).toBe("/dashboard/requests?request=vr1");
  });

  it("falls back to the org overview when a change action has no requestId", () => {
    expect(reviewPath("change.requested", undefined, "acme")).toBe(
      "/organizations/acme"
    );
  });

  it("sends an unrelated action to the org overview when a slug is given", () => {
    expect(reviewPath("variable.created", { requestId: "vr1" }, "acme")).toBe(
      "/organizations/acme"
    );
  });

  it("falls back to the dashboard when there is no org slug", () => {
    expect(reviewPath("variable.created", undefined, undefined)).toBe(
      "/dashboard"
    );
  });
});

describe("buildNotificationText", () => {
  it("renders a readable title, subject, environments, and a review link for a change request", () => {
    const text = buildNotificationText({
      provider: "slack",
      action: "change.requested",
      details: {
        label: "DATABASE_URL",
        environments: ["production"],
        requestId: "x",
      },
      actorName: "Sara",
      projectName: "Acme",
      link: "https://www.envpilot.dev/dashboard/requests?change=x",
    });

    expect(text).toContain("Change requested");
    expect(text).toContain("DATABASE_URL");
    expect(text).toContain("production");
    expect(text).toContain("Review change");
  });
});
