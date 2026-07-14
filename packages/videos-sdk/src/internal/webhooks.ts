import { VideoError } from "../errors";
import { toHex } from "./bytes";

export const DEFAULT_TOLERANCE_SECONDS = 300;

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

export function equalsConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function requireWebhookSecret(
  provider: string,
  secret: string | undefined,
  field: string,
): string {
  if (secret === undefined || secret === "") {
    throw new VideoError(
      "invalid_request",
      `${provider}() webhooks.verify requires ${field} in the adapter config.`,
      { provider },
    );
  }
  return secret;
}

export function requireHeader(provider: string, request: Request, name: string): string {
  const value = request.headers.get(name);
  if (value === null || value === "") {
    throw new VideoError("unauthorized", `Missing the ${name} header.`, { provider });
  }
  return value;
}

export function parseSignatureHeader(value: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const pair of value.split(",")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    parts[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return parts;
}

export function assertSignature(provider: string, expected: string, received: string): void {
  if (!equalsConstantTime(expected, received.toLowerCase())) {
    throw new VideoError("unauthorized", `The ${provider} webhook signature does not match.`, {
      provider,
    });
  }
}

export function assertFreshTimestamp(
  provider: string,
  seconds: number,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): void {
  if (!Number.isFinite(seconds)) {
    throw new VideoError("unauthorized", `The ${provider} webhook timestamp is malformed.`, {
      provider,
    });
  }
  const age = Math.abs(Math.floor(Date.now() / 1000) - seconds);
  if (age > toleranceSeconds) {
    throw new VideoError(
      "unauthorized",
      `The ${provider} webhook timestamp is outside the ${toleranceSeconds}s tolerance.`,
      { provider },
    );
  }
}

export function parseJson<T>(provider: string, raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (cause) {
    throw new VideoError("provider_error", `The ${provider} webhook body is not valid JSON.`, {
      provider,
      cause,
    });
  }
}
