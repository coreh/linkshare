import { createHmac, timingSafeEqual } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export function getOrCreateSecret(projectRoot: string): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;

  const secretPath = join(projectRoot, ".linkshare-secret");
  try {
    const existing = readFileSync(secretPath, "utf-8").trim();
    if (existing) return existing;
  } catch {
    // File doesn't exist yet
  }

  const secret = crypto.randomUUID() + crypto.randomUUID();
  try {
    writeFileSync(secretPath, secret + "\n", { mode: 0o600 });
  } catch {
    // Read-only filesystem (e.g. Vercel) — secret lives only in memory.
    // Set AUTH_SECRET env var for persistent sessions.
  }
  return secret;
}

export function createAuthToken(path: string, secret: string): string {
  const timestamp = Date.now().toString();
  const hmac = createHmac("sha256", secret)
    .update(`${path}:${timestamp}`)
    .digest("hex");
  return `${timestamp}:${hmac}`;
}

export function verifyAuthToken(
  token: string,
  path: string,
  secret: string,
): boolean {
  try {
    const colonIdx = token.indexOf(":");
    if (colonIdx === -1) return false;

    const timestamp = token.substring(0, colonIdx);
    const hmac = token.substring(colonIdx + 1);

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Date.now() - ts > TOKEN_EXPIRY) return false;

    const expected = createHmac("sha256", secret)
      .update(`${path}:${timestamp}`)
      .digest("hex");

    if (hmac.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
  } catch {
    return false;
  }
}

function decodeCookie(cookieValue: string): Record<string, string> {
  // Try base64 first (new format), then raw JSON, then URL-decoded JSON
  try {
    return JSON.parse(atob(cookieValue)) as Record<string, string>;
  } catch {
    // Not base64
  }
  try {
    return JSON.parse(cookieValue) as Record<string, string>;
  } catch {
    // Not raw JSON
  }
  try {
    return JSON.parse(decodeURIComponent(cookieValue)) as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

export function getAuthedPaths(
  cookieValue: string | undefined,
  secret: string,
): Set<string> {
  if (!cookieValue) return new Set();
  const data = decodeCookie(cookieValue);
  const paths = new Set<string>();
  for (const [path, token] of Object.entries(data)) {
    if (verifyAuthToken(token, path, secret)) {
      paths.add(path);
    }
  }
  return paths;
}

export function addAuthedPath(
  cookieValue: string | undefined,
  path: string,
  secret: string,
): string {
  let data: Record<string, string> = {};
  if (cookieValue) {
    data = decodeCookie(cookieValue);
  }
  data[path] = createAuthToken(path, secret);
  // Base64-encode to avoid URL-encoding issues with cookies
  return btoa(JSON.stringify(data));
}
