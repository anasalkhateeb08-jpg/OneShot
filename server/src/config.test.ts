import { describe, expect, it } from "vitest";
import { DEFAULT_ALLOWED_ORIGIN, DEFAULT_PORT, loadConfig } from "./config";

describe("loadConfig", () => {
  it("uses safe defaults when nothing is set", () => {
    expect(loadConfig({})).toEqual({
      port: DEFAULT_PORT,
      allowedOrigin: DEFAULT_ALLOWED_ORIGIN,
      nodeEnv: "development",
    });
  });

  it("reads valid values", () => {
    const cfg = loadConfig({
      PORT: "8080",
      ALLOWED_ORIGIN: "https://oneshot.example/some/path",
      NODE_ENV: "production",
    });
    expect(cfg.port).toBe(8080);
    expect(cfg.allowedOrigin).toBe("https://oneshot.example");
    expect(cfg.nodeEnv).toBe("production");
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/Invalid PORT/);
    expect(() => loadConfig({ PORT: "0" })).toThrow(/Invalid PORT/);
    expect(() => loadConfig({ PORT: "70000" })).toThrow(/Invalid PORT/);
    expect(() => loadConfig({ PORT: "80.5" })).toThrow(/Invalid PORT/);
  });

  it("rejects an invalid origin", () => {
    expect(() => loadConfig({ ALLOWED_ORIGIN: "not a url" })).toThrow(/ALLOWED_ORIGIN/);
    expect(() => loadConfig({ ALLOWED_ORIGIN: "ftp://example.com" })).toThrow(/protocol/);
  });

  it("treats an unknown NODE_ENV as development", () => {
    expect(loadConfig({ NODE_ENV: "staging" }).nodeEnv).toBe("development");
  });
});
