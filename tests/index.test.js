import { vi, describe, it, expect, beforeEach } from "vitest";

process.env.GHOST_API_KEY =
  "a1b2c3d4e5f6078901234567890abcdef:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

let logs = "";
let run;
let period = "daily";
let excerptMode = "excerpt";
let mockPosts = [];

describe("GitHub Action", () => {
  beforeEach(async () => {
    logs = "";

    vi.resetModules();
    vi.doMock(import("@actions/core"), async (importOriginal) => {
      let original = await importOriginal();

      return {
        ...original,
        getInput: vi.fn((name) => {
          if (name === "url") return "https://example.com";
          if (name === "period") return period;
          if (name === "tags") return "Digest";
          if (name === "timezone") return "America/Chicago";
          if (name === "excerpt_mode") return excerptMode;

          return "";
        }),
        getBooleanInput: vi.fn(() => true),
        debug: vi.fn((log) => (logs += log + "\n")),
        setFailed: vi.fn((log) => (logs += log + "\n")),
        info: vi.fn((log) => (logs += log + "\n")),
      };
    });
  });

  it("should generate a digest correctly", async () => {
    ({ run } = await import("../src/index.ts"));
    await run();

    expect(logs).toContain("Generating daily digest starting from");
    expect(logs).toContain("Processing post: Test Post 1");
    expect(logs).toContain("Processing post: Test Post 2");
    expect(logs).toContain("Creating newsletter post...");
  });

  it("should generate a weekly digest correctly", async () => {
    period = "weekly";
    ({ run } = await import("../src/index.ts"));
    await run();

    expect(logs).toContain("Generating weekly digest starting from");
    expect(logs).toContain("Processing post: Test Post 1");
    expect(logs).toContain("Processing post: Test Post 2");
    expect(logs).toContain("Creating newsletter post...");
  });

  it("should handle excerpt mode (default) correctly", async () => {
    excerptMode = "excerpt";
    ({ run } = await import("../src/index.ts"));
    await run();

    expect(logs).toContain("Processing post: Test Post 1");
    expect(logs).toContain("Excerpt of test post 1");
    expect(logs).toContain("[View article]");
    expect(logs).not.toContain("Full content of test post 1");
  });

  it("should handle full mode correctly", async () => {
    excerptMode = "full";
    ({ run } = await import("../src/index.ts"));
    await run();

    expect(logs).toContain("Processing post: Test Post 1");
    expect(logs).toContain("Full content of test post 1");
    expect(logs).toContain("[View article]");
  });

  it("should handle printable mode correctly", async () => {
    excerptMode = "printable";
    ({ run } = await import("../src/index.ts"));
    await run();

    expect(logs).toContain("Processing post: Test Post 1");
    expect(logs).toContain("Full content of test post 1");
    expect(logs).not.toContain("[View article]");
  });

  it("should fail with invalid excerpt mode", async () => {
    excerptMode = "invalid";
    ({ run } = await import("../src/index.ts"));
    await run();

    expect(logs).toContain("Invalid excerpt_mode: invalid");
  });
});
