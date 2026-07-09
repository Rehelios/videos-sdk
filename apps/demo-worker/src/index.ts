import { createVideos } from "videos-sdk";
import { rehelios } from "videos-sdk/rehelios";

export interface Env {
  readonly REHELIOS_API_KEY: string;
  readonly DEMO_COLLECTION_ID: string;
  readonly ALLOWED_ORIGINS: string;
  readonly REHELIOS_API_BASE_URL?: string;
  readonly MAX_UPLOAD_BYTES?: string;
  readonly DEMO_RATE_LIMIT?: RateLimiter;
}

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

const DEFAULT_API_BASE_URL = "https://api.rehelios.com";
const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const DEMO_TTL_MS = 10 * 60 * 1000;
const MAX_TITLE_LENGTH = 120;
const CLEANUP_PAGE_SIZE = 100;

const ROUTES = [
  { method: "POST", pattern: /^\/v1\/videos$/, kind: "create" },
  { method: "POST", pattern: /^\/v1\/videos\/[^/]+\/upload-init$/, kind: "upload-init" },
  { method: "POST", pattern: /^\/v1\/videos\/[^/]+\/upload-complete$/, kind: "passthrough" },
  { method: "GET", pattern: /^\/v1\/videos\/[^/]+$/, kind: "passthrough" },
] as const;

type RouteKind = (typeof ROUTES)[number]["kind"];

function matchRoute(method: string, pathname: string): RouteKind | undefined {
  return ROUTES.find((route) => route.method === method && route.pattern.test(pathname))?.kind;
}

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  if (origin === null || !allowedOrigins(env).includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function fail(message: string, status: number, headers: Record<string, string>): Response {
  return json({ success: false, error: { message } }, status, headers);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function demoTitle(body: Record<string, unknown>): string {
  const title = typeof body["title"] === "string" ? body["title"] : "demo";
  return title.slice(0, MAX_TITLE_LENGTH) || "demo";
}

function maxUploadBytes(env: Env): number {
  const configured = Number(env.MAX_UPLOAD_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_UPLOAD_BYTES;
}

function createBody(body: Record<string, unknown>, env: Env): Record<string, unknown> {
  return {
    title: demoTitle(body),
    collectionId: env.DEMO_COLLECTION_ID,
    visibility: "public",
  };
}

type UploadInitResult =
  | { readonly ok: true; readonly body: Record<string, unknown> }
  | { readonly ok: false; readonly error: string };

function uploadInitBody(body: Record<string, unknown>, env: Env): UploadInitResult {
  const size = Number(body["size"]);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "A positive size is required." };
  }
  if (size > maxUploadBytes(env)) {
    return { ok: false, error: `The demo accepts files up to ${maxUploadBytes(env)} bytes.` };
  }
  const contentType = typeof body["contentType"] === "string" ? body["contentType"] : "";
  if (!contentType.startsWith("video/")) {
    return { ok: false, error: "Only video/* uploads are allowed." };
  }
  const filename = typeof body["filename"] === "string" ? body["filename"] : "demo";
  return { ok: true, body: { filename: filename.slice(0, MAX_TITLE_LENGTH), contentType, size } };
}

async function rateLimited(request: Request, env: Env): Promise<boolean> {
  if (env.DEMO_RATE_LIMIT === undefined) return false;
  const ip = request.headers.get("cf-connecting-ip") ?? "anon";
  const { success } = await env.DEMO_RATE_LIMIT.limit({ key: ip });
  return !success;
}

function demoVideos(env: Env) {
  return createVideos({
    adapter: rehelios({
      apiKey: env.REHELIOS_API_KEY,
      apiBaseUrl: env.REHELIOS_API_BASE_URL ?? DEFAULT_API_BASE_URL,
      collectionId: env.DEMO_COLLECTION_ID,
      visibility: "public",
    }),
  });
}

async function proxy(
  request: Request,
  env: Env,
  kind: RouteKind,
  cors: Record<string, string>,
): Promise<Response> {
  const upstreamBase = env.REHELIOS_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const url = new URL(request.url);
  const upstreamUrl = `${upstreamBase}${url.pathname}`;

  let body: string | undefined;
  if (kind === "create") {
    body = JSON.stringify(createBody(await readJson(request), env));
  } else if (kind === "upload-init") {
    const result = uploadInitBody(await readJson(request), env);
    if (!result.ok) return fail(result.error, 400, cors);
    body = JSON.stringify(result.body);
  } else if (request.method === "POST") {
    body = await request.text();
  }

  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers: {
      "x-api-key": env.REHELIOS_API_KEY,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body } : {}),
  });

  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
  for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
  return response;
}

async function cleanup(env: Env): Promise<void> {
  const videos = demoVideos(env);
  const assets = await videos.list({ limit: CLEANUP_PAGE_SIZE });
  const cutoff = Date.now() - DEMO_TTL_MS;
  const expired = assets.filter(
    (asset) => asset.createdAt !== undefined && asset.createdAt.getTime() < cutoff,
  );
  await Promise.allSettled(expired.map((asset) => videos.delete(asset.id)));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (Object.keys(cors).length === 0) return fail("Origin not allowed.", 403, {});

    const kind = matchRoute(request.method, new URL(request.url).pathname);
    if (kind === undefined) return fail("Not available on the demo endpoint.", 403, cors);

    if (await rateLimited(request, env)) return fail("Slow down.", 429, cors);

    return proxy(request, env, kind, cors);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanup(env));
  },
};
