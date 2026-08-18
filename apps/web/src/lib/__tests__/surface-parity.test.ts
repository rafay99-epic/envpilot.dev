// PARITY FENCE for machine surfaces and their tier gates.
//
// A surface (REST API, MCP server, GitHub Action, Docker image) is only real
// if four things agree: the surface exists, it maps to a registry feature,
// that feature is seeded, and both tiers carry a value for it. Miss any one
// and the failure is silent in a different way each time:
//
//   * no SURFACE_GATE entry  → TypeScript catches it (Record is exhaustive)
//   * gate not in SEED_FEATURES → the admin panel has no toggle for it, so
//     the flag can never be turned on for anyone
//   * gate missing from a tier  → that tier falls through to defaultValue,
//     which is how a paid feature quietly becomes free (or vice versa)
//
// Docker exists as its own surface precisely so it can be priced, disabled
// and audited independently of the REST API. This suite is what stops it
// from silently collapsing back into `public_api`.
import { describe, expect, it } from "vitest";

import {
  SURFACES,
  SURFACE_GATE,
  SURFACE_GATE_MESSAGE,
  SURFACE_LABEL,
  SURFACE_LIMIT,
  type SurfaceGate,
} from "@convex/lib/surfaces";
import { SEED_FEATURES } from "@convex/lib/seedData";

const seededKeys = new Set(SEED_FEATURES.map((f) => f.key));
const gates = [...new Set(Object.values(SURFACE_GATE))];

describe("surface → gate wiring", () => {
  it("every surface maps to a gate", () => {
    for (const surface of SURFACES) {
      expect(SURFACE_GATE[surface]).toBeTruthy();
    }
  });

  it("every gate is a seeded registry feature, so the admin panel can toggle it", () => {
    for (const gate of gates) {
      expect(
        seededKeys.has(gate),
        `${gate} is missing from SEED_FEATURES`
      ).toBe(true);
    }
  });

  it("every gate is a boolean in the Integrations category", () => {
    for (const gate of gates) {
      const feature = SEED_FEATURES.find((f) => f.key === gate);
      expect(feature?.valueType).toBe("boolean");
      expect(feature?.category).toBe("Integrations");
    }
  });

  it("every gate has upgrade copy that names the surface", () => {
    for (const gate of gates) {
      const message = SURFACE_GATE_MESSAGE[gate];
      expect(message, `${gate} has no upgrade message`).toBeTruthy();
      expect(message.length).toBeGreaterThan(20);
    }
  });
});

describe("docker is an independent surface", () => {
  it("does not share the REST API's gate", () => {
    // The whole point. If this ever equals public_api again, disabling the
    // REST API would kill every running container, and any REST-scoped key
    // would authorize a container pull.
    expect(SURFACE_GATE.docker).toBe("docker_image");
    expect(SURFACE_GATE.docker).not.toBe(SURFACE_GATE.rest_api);
  });

  it("has its own registry feature", () => {
    expect(seededKeys.has("docker_image")).toBe(true);
  });

  it("has its own upgrade message, not the REST API's", () => {
    expect(SURFACE_GATE_MESSAGE.docker_image).not.toBe(
      SURFACE_GATE_MESSAGE.public_api
    );
    expect(SURFACE_GATE_MESSAGE.docker_image).toMatch(/Docker/);
  });
});

describe("github_action still rides public_api", () => {
  it("is unchanged — the Action pulls through the REST surface", () => {
    // Not an oversight, a deliberate difference from docker: the Action's
    // pull path IS /api/v1/secrets. Pinned so nobody "fixes" it by symmetry.
    expect(SURFACE_GATE.github_action).toBe("public_api");
  });
});

describe("gate coverage", () => {
  const EXPECTED_GATES: SurfaceGate[] = [
    "public_api",
    "mcp_server",
    "docker_image",
  ];

  it("no surface introduces a gate this suite does not know about", () => {
    expect(gates.toSorted()).toEqual(EXPECTED_GATES.toSorted());
  });
});

describe("per-surface key limits", () => {
  const limitKeys = Object.values(SURFACE_LIMIT).filter(
    (k): k is string => typeof k === "string"
  );

  it("every limit key is a seeded numeric Integrations feature", () => {
    for (const key of limitKeys) {
      const feature = SEED_FEATURES.find((f) => f.key === key);
      expect(feature, `${key} is missing from SEED_FEATURES`).toBeDefined();
      expect(feature?.valueType).toBe("numeric");
      expect(feature?.category).toBe("Integrations");
    }
  });

  it("docker and the Action each have their own limit key", () => {
    // Separate keys, so one surface's quota can never be spent by the other.
    expect(SURFACE_LIMIT.docker).toBe("docker_image_limit");
    expect(SURFACE_LIMIT.github_action).toBe("github_action_limit");
    expect(SURFACE_LIMIT.docker).not.toBe(SURFACE_LIMIT.github_action);
  });

  it("limit keys are distinct across surfaces", () => {
    expect(new Set(limitKeys).size).toBe(limitKeys.length);
  });

  it("every surface has a human label for denial messages", () => {
    for (const surface of SURFACES) {
      expect(SURFACE_LABEL[surface]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
