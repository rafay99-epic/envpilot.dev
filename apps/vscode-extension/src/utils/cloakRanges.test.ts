import { describe, it, expect } from "vitest";
import {
  computeCloakRanges,
  detectCloakFormat,
  type CloakFormat,
} from "./cloakRanges";

/**
 * Masking a secret file whole turns a service-account JSON into an
 * unreadable wall of bullets. These assert the opposite property: keys,
 * punctuation and indentation survive, values do not.
 */

/** Render what the user would see: masked spans replaced with `*`. */
function render(format: CloakFormat, source: string): string {
  const lines = source.split("\n");
  const ranges = computeCloakRanges(format, lines);
  const out = [...lines];
  // Apply right-to-left so earlier offsets stay valid.
  for (const r of [...ranges].sort((a, b) => b.start - a.start)) {
    const line = out[r.line];
    out[r.line] =
      line.slice(0, r.start) + "*".repeat(r.end - r.start) + line.slice(r.end);
  }
  return out.join("\n");
}

describe("detectCloakFormat", () => {
  it("routes by extension", () => {
    expect(detectCloakFormat("/a/google-services.json")).toBe("json");
    expect(detectCloakFormat("/a/config.yaml")).toBe("yaml");
    expect(detectCloakFormat("/a/config.yml")).toBe("yaml");
    expect(detectCloakFormat("/a/Secrets.toml")).toBe("toml");
    expect(detectCloakFormat("/a/key.pem")).toBe("pem");
    expect(detectCloakFormat("/a/AuthKey_ABC.p8")).toBe("pem");
    expect(detectCloakFormat("/a/id_ed25519")).toBe("pem");
    expect(detectCloakFormat("/a/upload.jks")).toBe("opaque");
    expect(detectCloakFormat("/a/cert.p12")).toBe("opaque");
    expect(detectCloakFormat("/a/.env.local")).toBe("env");
  });

  it("falls back to the editor's languageId when the name is unhelpful", () => {
    expect(detectCloakFormat("/a/secrets", "json")).toBe("json");
    expect(detectCloakFormat("/a/secrets", "yaml")).toBe("yaml");
    expect(detectCloakFormat("/a/secrets")).toBe("opaque");
  });

  it("prefers the extension over a wrong languageId", () => {
    expect(detectCloakFormat("/a/upload.jks", "json")).toBe("opaque");
  });
});

describe("json", () => {
  it("keeps keys and structure, masks values", () => {
    const src = [
      "{",
      '  "project_info": {',
      '    "project_number": "123456",',
      '    "project_id": "demo-app"',
      "  },",
      '  "api_key": [',
      '    { "current_key": "AIzaSyD-SECRET" }',
      "  ]",
      "}",
    ].join("\n");

    const out = render("json", src);

    // Structure and keys survive — that is the whole point.
    for (const kept of [
      "{",
      '"project_info"',
      '"project_number"',
      '"project_id"',
      '"api_key"',
      "[",
      "]",
      "}",
    ]) {
      expect(out, `structure "${kept}" must stay visible`).toContain(kept);
    }

    // Every value is gone.
    for (const secret of ["123456", "demo-app", "AIzaSyD-SECRET"]) {
      expect(out, `value "${secret}" must be masked`).not.toContain(secret);
    }

    // Line count and indentation are preserved, so the file stays navigable.
    expect(out.split("\n")).toHaveLength(src.split("\n").length);
    expect(out).toContain('    "project_number": ');
  });

  it("never masks a nested container opener", () => {
    const out = render("json", '  "client": [');
    expect(out).toBe('  "client": [');
  });

  it("masks bare array elements", () => {
    const out = render("json", '    "com.example.app",');
    expect(out).not.toContain("com.example.app");
    // Indentation and the trailing comma are structure and stay put.
    expect(out.startsWith("    ")).toBe(true);
    expect(out.endsWith(",")).toBe(true);
  });

  it("handles minified json with several pairs on one line", () => {
    const out = render("json", '{"a":"one","b":2,"c":true}');
    for (const key of ['"a"', '"b"', '"c"']) expect(out).toContain(key);
    for (const value of ["one", "true"]) expect(out).not.toContain(value);
    expect(out.startsWith("{")).toBe(true);
    expect(out.endsWith("}")).toBe(true);
  });

  it("does not leak a value containing an escaped quote", () => {
    // The naive "read to the next comma" approach truncates here and leaks
    // the tail — the escaped quote must not end the string early.
    const out = render("json", '  "k": "a\\"b,c"');
    expect(out).toContain('"k": ');
    expect(out).not.toContain("b,c");
    expect(out).not.toContain("a\\");
  });
});

describe("yaml", () => {
  it("masks scalars, keeps keys, comments and nesting", () => {
    const src = [
      "# deployment secrets",
      "database:",
      "  host: db.internal",
      "  password: hunter2",
      "- name: item",
    ].join("\n");

    expect(render("yaml", src)).toBe(
      [
        "# deployment secrets",
        "database:",
        "  host: ***********",
        "  password: *******",
        "- name: ****",
      ].join("\n")
    );
  });

  it("leaves a parent key with no inline value alone", () => {
    expect(render("yaml", "database:")).toBe("database:");
  });

  it("masks bare sequence items", () => {
    // A YAML list can hold secrets directly ("- sk_live_..."), and those
    // lines carry no key for the key:value rule to latch onto.
    const out = render("yaml", "tokens:\n  - sk_live_secret\n  - another");
    expect(out).toContain("tokens:");
    expect(out).not.toContain("sk_live_secret");
    expect(out).not.toContain("another");
    // The dash and indentation are structure.
    expect(out).toContain("  - ");
  });
});

describe("toml", () => {
  it("masks values, keeps section headers and comments", () => {
    const src = [
      "# creds",
      "[database]",
      'password = "hunter2"',
      "port = 5432",
    ].join("\n");

    expect(render("toml", src)).toBe(
      ["# creds", "[database]", "password = *********", "port = ****"].join(
        "\n"
      )
    );
  });
});

describe("pem", () => {
  it("keeps the armour markers, masks the body", () => {
    const src = [
      "-----BEGIN PRIVATE KEY-----",
      "MIIEvQIBADANBgkq",
      "hkiG9w0BAQEFAASC",
      "-----END PRIVATE KEY-----",
    ].join("\n");

    const out = render("pem", src);
    expect(out).toContain("-----BEGIN PRIVATE KEY-----");
    expect(out).toContain("-----END PRIVATE KEY-----");
    expect(out).not.toContain("MIIEvQIBADANBgkq");
    expect(out).not.toContain("hkiG9w0BAQEFAASC");
  });

  it("masks an embedded PEM block inside another format", () => {
    const src = [
      '  "private_key": "x",',
      "-----BEGIN PRIVATE KEY-----",
      "SECRETBODY",
      "-----END PRIVATE KEY-----",
    ].join("\n");
    const out = render("json", src);
    expect(out).toContain("-----BEGIN PRIVATE KEY-----");
    expect(out).not.toContain("SECRETBODY");
  });
});

describe("leaks that review caught", () => {
  it("masks elements of an inline JSON array", () => {
    // The keyed opener is structural, so the elements on the same line were
    // sailing straight through.
    const out = render("json", '  "scopes": ["sk_live_aaa", "sk_live_bbb"],');
    expect(out).toContain('"scopes"');
    expect(out).toContain("[");
    expect(out).not.toContain("sk_live_aaa");
    expect(out).not.toContain("sk_live_bbb");
  });

  it("masks values of an inline JSON object", () => {
    const out = render(
      "json",
      '  "creds": { "user": "root", "pass": "s3cret" }'
    );
    expect(out).toContain('"creds"');
    expect(out).not.toContain("root");
    expect(out).not.toContain("s3cret");
  });

  it("masks a YAML block scalar body until it dedents", () => {
    const src = [
      "signing:",
      "  private_key: |",
      "    LINE-ONE-SECRET",
      "    LINE-TWO-SECRET",
      "  alias: upload",
    ].join("\n");
    const out = render("yaml", src);
    expect(out).toContain("private_key: |");
    expect(out).not.toContain("LINE-ONE-SECRET");
    expect(out).not.toContain("LINE-TWO-SECRET");
    // The block ended, so the next key is parsed normally again.
    expect(out).toContain("alias:");
    expect(out).not.toContain("upload");
  });

  it("handles a chomping indicator on the block scalar", () => {
    const out = render("yaml", "key: |-\n  SECRET-BODY");
    expect(out).not.toContain("SECRET-BODY");
  });

  it("masks a multi-line TOML array", () => {
    const src = [
      "tokens = [",
      '  "sk_live_aaa",',
      '  "sk_live_bbb",',
      "]",
    ].join("\n");
    const out = render("toml", src);
    expect(out).toContain("tokens = ");
    expect(out).not.toContain("sk_live_aaa");
    expect(out).not.toContain("sk_live_bbb");
  });

  it("masks a TOML multiline string", () => {
    const src = ['key = """', "SECRET-BODY", '"""'].join("\n");
    const out = render("toml", src);
    expect(out).not.toContain("SECRET-BODY");
  });

  it("masks colon-separated .properties secrets", () => {
    // .properties/.ini accept `:` as well as `=`; the TOML parser only took
    // `=`, so these stayed fully visible.
    const out = render("properties", "db.password: hunter2\napi.key=sk_live_x");
    expect(out).toContain("db.password");
    expect(out).toContain("api.key");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("sk_live_x");
  });

  it("routes .properties and .ini to their own parser", () => {
    expect(detectCloakFormat("/a/app.properties")).toBe("properties");
    expect(detectCloakFormat("/a/app.ini")).toBe("properties");
  });
});

describe("opaque", () => {
  it("masks everything when there is no structure worth keeping", () => {
    const out = render("opaque", "binary-ish\nbytes");
    expect(out).not.toContain("binary-ish");
    expect(out).not.toContain("bytes");
  });

  it("keeps indentation visible when masking a whole line", () => {
    // Indentation is shape, not secret — masking it collapses the outline.
    expect(render("opaque", "    indented-secret")).toBe("    ***************");
  });

  it("leaves blank lines untouched in every format", () => {
    for (const f of ["json", "yaml", "toml", "opaque"] as CloakFormat[]) {
      expect(render(f, "a\n\nb")).toContain("\n\n");
    }
  });
});

describe("regression: values that used to stay visible", () => {
  it("masks a TOML inline array that carries a trailing comment", () => {
    // `# note` made the line stop looking like a closed array, so the parser
    // opened continuation state and left the value on THIS line readable.
    const out = render("toml", 'tokens = ["secret"] # note');
    expect(out).not.toContain("secret");
    expect(out).toContain("tokens");
    expect(out).toContain("# note");
  });

  it("masks a TOML multi-line literal string body", () => {
    const out = render("toml", "key = '''\nsecret-body\n'''");
    expect(out).not.toContain("secret-body");
    expect(out).toContain("key =");
  });

  it("keeps TOML inline-table keys readable and masks their values", () => {
    const out = render("toml", 'creds = { user = "admin", pass = "hunter2" }');
    expect(out).toContain("user");
    expect(out).toContain("pass");
    expect(out).not.toContain("admin");
    expect(out).not.toContain("hunter2");
  });

  it("masks a YAML block scalar written as |2- (indent before chomp)", () => {
    const out = render("yaml", "key: |2-\n    secret-line\n");
    expect(out).not.toContain("secret-line");
    expect(out).toContain("key: |2-");
  });

  it("masks a whitespace-separated .properties value", () => {
    const out = render("properties", "keystore.password hunter2");
    expect(out).not.toContain("hunter2");
    expect(out).toContain("keystore.password");
  });

  it("masks every line of a backslash-continued .properties value", () => {
    const out = render("properties", "key=first\\\nsecond\\\nthird");
    expect(out).not.toContain("first");
    expect(out).not.toContain("second");
    expect(out).not.toContain("third");
    expect(out).toContain("key=");
  });

  it("fails closed on an unrecognised .properties line", () => {
    // No `=`, no `:`, no whitespace separator after a key-shaped token.
    const out = render("properties", "bare-token-with-no-separator");
    expect(out).not.toContain("bare-token-with-no-separator");
  });

  it("keeps JSON object keys readable inside an inline container", () => {
    const out = render("json", '"creds": {"user": "admin"}');
    expect(out).toContain("user");
    expect(out).toContain("creds");
    expect(out).not.toContain("admin");
  });
});

describe("regression: TOML continuation state", () => {
  it("keeps masking past a nested array that closes on its own line", () => {
    // The middle line ends with `]` while the OUTER array is still open. A
    // terminal-bracket test closed cloaking there and left every element
    // below it readable.
    const out = render("toml", 'a = [\n  [1, 2],\n  "secret-elem"\n]');
    expect(out).not.toContain("secret-elem");
    expect(out).toContain("a = [");
  });

  it("does not close a ''' body on a nested \"\"\"", () => {
    const out = render(
      "toml",
      "k = '''\ncontains \"\"\" inside\nstill-secret\n'''"
    );
    expect(out).not.toContain("still-secret");
  });

  it("ignores brackets inside quotes and comments when counting depth", () => {
    const out = render("toml", 'a = [\n  "has ] bracket",\n  "secret-elem"\n]');
    expect(out).not.toContain("secret-elem");
  });

  it("fails closed on a TOML line the key regex does not match", () => {
    // Escaped quoted key — legal TOML, outside the regex. Leaving it in
    // plaintext is not an acceptable default for a known-secret file.
    const out = render("toml", '"key\\"esc" = "secret-value"');
    expect(out).not.toContain("secret-value");
  });

  it("still leaves comments and table headers readable", () => {
    const out = render("toml", "# a note\n[section]\nk = 1");
    expect(out).toContain("# a note");
    expect(out).toContain("[section]");
  });
});
