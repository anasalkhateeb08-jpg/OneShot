/**
 * Server configuration, read from environment variables only (master section 23).
 * Secrets (Supabase service key, Polar signing secret) are added in phases 4 and 5.
 * Never put secrets in the repository.
 */

export type NodeEnv = "development" | "production" | "test";

export interface ServerConfig {
  port: number;
  allowedOrigin: string;
  nodeEnv: NodeEnv;
}

export const DEFAULT_PORT = 2567;
export const DEFAULT_ALLOWED_ORIGIN = "http://localhost:5173";

type Env = Readonly<Record<string, string | undefined>>;

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: "${raw}" (expected an integer from 1 to 65535)`);
  }
  return port;
}

function parseOrigin(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === "") return DEFAULT_ALLOWED_ORIGIN;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid ALLOWED_ORIGIN: "${raw}" (expected a URL like https://example.com)`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Invalid ALLOWED_ORIGIN protocol: "${url.protocol}"`);
  }
  return url.origin;
}

function parseNodeEnv(raw: string | undefined): NodeEnv {
  if (raw === "production" || raw === "test") return raw;
  return "development";
}

export function loadConfig(env: Env): ServerConfig {
  return {
    port: parsePort(env.PORT),
    allowedOrigin: parseOrigin(env.ALLOWED_ORIGIN),
    nodeEnv: parseNodeEnv(env.NODE_ENV),
  };
}
