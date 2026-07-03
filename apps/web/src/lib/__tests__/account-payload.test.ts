import { describe, expect, it } from "vitest";

import {
  parseAccountShare,
  parseAccountVault,
  serializeAccountShare,
  serializeAccountVault,
} from "@/lib/account-payload";

describe("serializeAccountShare / parseAccountShare", () => {
  it("round-trips a full payload including url", () => {
    const payload = {
      name: "Stripe Dashboard",
      username: "billing@example.com",
      password: "s3cr3t!",
      url: "https://dashboard.stripe.com",
    };
    const serialized = serializeAccountShare(payload);
    expect(parseAccountShare(serialized)).toEqual(payload);
  });

  it("round-trips a payload without a url (omitted, not empty string)", () => {
    const payload = {
      name: "Internal Tool",
      username: "svc-account",
      password: "hunter2",
    };
    const serialized = serializeAccountShare(payload);
    const parsed = parseAccountShare(serialized);
    expect(parsed).toEqual(payload);
    expect(parsed?.url).toBeUndefined();
  });

  it("embeds the t:'account' discriminator in the serialized JSON", () => {
    const serialized = serializeAccountShare({
      name: "n",
      username: "u",
      password: "p",
    });
    expect(JSON.parse(serialized)).toMatchObject({ t: "account" });
  });

  it("round-trips unicode and very long values", () => {
    const longPassword = "p".repeat(5000) + "🔐🔑";
    const payload = {
      name: "日本語アカウント — Ünïcödé",
      username: "用户@例え.jp",
      password: longPassword,
      url: "https://例え.jp/ログイン",
    };
    const serialized = serializeAccountShare(payload);
    expect(parseAccountShare(serialized)).toEqual(payload);
  });

  it("treats an empty-string url as absent", () => {
    const serialized = serializeAccountShare({
      name: "n",
      username: "u",
      password: "p",
      url: "",
    });
    const parsed = parseAccountShare(serialized);
    expect(parsed?.url).toBeUndefined();
  });

  it("returns null for malformed JSON", () => {
    expect(parseAccountShare("not json")).toBeNull();
    expect(parseAccountShare("{unterminated")).toBeNull();
    expect(parseAccountShare("")).toBeNull();
  });

  it("returns null for valid JSON that is not an object", () => {
    expect(parseAccountShare("null")).toBeNull();
    expect(parseAccountShare("42")).toBeNull();
    expect(parseAccountShare('"a string"')).toBeNull();
    expect(parseAccountShare("[1,2,3]")).toBeNull();
  });

  it("returns null when the t discriminator is missing or wrong", () => {
    expect(
      parseAccountShare(
        JSON.stringify({ name: "n", username: "u", password: "p" })
      )
    ).toBeNull();
    expect(
      parseAccountShare(
        JSON.stringify({
          t: "variable",
          name: "n",
          username: "u",
          password: "p",
        })
      )
    ).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(
      parseAccountShare(
        JSON.stringify({ t: "account", username: "u", password: "p" })
      )
    ).toBeNull();
    expect(
      parseAccountShare(
        JSON.stringify({ t: "account", name: "n", password: "p" })
      )
    ).toBeNull();
    expect(
      parseAccountShare(
        JSON.stringify({ t: "account", name: "n", username: "u" })
      )
    ).toBeNull();
  });

  it("returns null when required fields are non-string values", () => {
    expect(
      parseAccountShare(
        JSON.stringify({
          t: "account",
          name: 123,
          username: "u",
          password: "p",
        })
      )
    ).toBeNull();
    expect(
      parseAccountShare(
        JSON.stringify({
          t: "account",
          name: "n",
          username: null,
          password: "p",
        })
      )
    ).toBeNull();
    expect(
      parseAccountShare(
        JSON.stringify({
          t: "account",
          name: "n",
          username: "u",
          password: { nested: true },
        })
      )
    ).toBeNull();
  });

  it("ignores a non-string url field rather than including it", () => {
    const parsed = parseAccountShare(
      JSON.stringify({
        t: "account",
        name: "n",
        username: "u",
        password: "p",
        url: 12345,
      })
    );
    expect(parsed).toEqual({ name: "n", username: "u", password: "p" });
  });
});

describe("serializeAccountVault / parseAccountVault", () => {
  it("round-trips username and password", () => {
    const payload = { username: "svc@example.com", password: "correct-horse" };
    const serialized = serializeAccountVault(payload);
    expect(parseAccountVault(serialized)).toEqual(payload);
  });

  it("round-trips unicode and long values", () => {
    const payload = {
      username: "用户名👤",
      password: "x".repeat(4096) + "💾",
    };
    expect(parseAccountVault(serializeAccountVault(payload))).toEqual(payload);
  });

  it("returns null for malformed JSON", () => {
    expect(parseAccountVault("not json")).toBeNull();
    expect(parseAccountVault("{broken")).toBeNull();
    expect(parseAccountVault("")).toBeNull();
  });

  it("returns null for valid JSON that is not an object", () => {
    expect(parseAccountVault("null")).toBeNull();
    expect(parseAccountVault("[]")).toBeNull();
    expect(parseAccountVault('"str"')).toBeNull();
  });

  it("returns null when username or password is missing", () => {
    expect(parseAccountVault(JSON.stringify({ username: "u" }))).toBeNull();
    expect(parseAccountVault(JSON.stringify({ password: "p" }))).toBeNull();
    expect(parseAccountVault(JSON.stringify({}))).toBeNull();
  });

  it("returns null when username or password are non-string values", () => {
    expect(
      parseAccountVault(JSON.stringify({ username: 1, password: "p" }))
    ).toBeNull();
    expect(
      parseAccountVault(JSON.stringify({ username: "u", password: false }))
    ).toBeNull();
    expect(
      parseAccountVault(JSON.stringify({ username: "u", password: null }))
    ).toBeNull();
  });
});
