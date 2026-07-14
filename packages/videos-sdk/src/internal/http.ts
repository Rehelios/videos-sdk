import { VideoError, type VideoErrorCode } from "../errors";
import type { VideoBody } from "../types";

export interface HttpClientOptions {
  readonly baseUrl: string;
  readonly headers: Record<string, string>;
  readonly provider: string;
}

export interface HttpClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  postForm<T>(path: string, form: FormData): Promise<T>;
  putForm<T>(path: string, form: FormData): Promise<T>;
  del(path: string): Promise<void>;
}

function codeForStatus(status: number): VideoErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "provider_error";
}

const MAX_RATE_LIMIT_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 20_000;

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
    }
    const at = Date.parse(retryAfter);
    if (!Number.isNaN(at)) {
      return Math.min(Math.max(at - Date.now(), 0), MAX_RETRY_DELAY_MS);
    }
  }
  const backoff = BASE_RETRY_DELAY_MS * 2 ** attempt + Math.random() * BASE_RETRY_DELAY_MS;
  return Math.min(backoff, MAX_RETRY_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { baseUrl, headers, provider } = options;

  async function request(path: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          ...init,
          headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
        });
      } catch (cause) {
        throw new VideoError("network", `Request to ${provider} failed.`, { provider, cause });
      }
      if (response.ok) return response;
      if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        await sleep(retryDelayMs(response, attempt));
        continue;
      }
      const detail = await response.text().catch(() => "");
      throw new VideoError(
        codeForStatus(response.status),
        detail === "" ? `${provider} returned ${response.status}.` : detail,
        { provider, status: response.status },
      );
    }
  }

  return {
    async get<T>(path: string): Promise<T> {
      const response = await request(path, { method: "GET" });
      return (await response.json()) as T;
    },
    async post<T>(path: string, body?: unknown): Promise<T> {
      const init: RequestInit = { method: "POST" };
      if (body !== undefined) {
        init.headers = { "content-type": "application/json" };
        init.body = JSON.stringify(body);
      }
      const response = await request(path, init);
      return (await response.json()) as T;
    },
    async postForm<T>(path: string, form: FormData): Promise<T> {
      const response = await request(path, { method: "POST", body: form });
      return (await jsonOrEmpty(response, provider)) as T;
    },
    async putForm<T>(path: string, form: FormData): Promise<T> {
      const response = await request(path, { method: "PUT", body: form });
      return (await jsonOrEmpty(response, provider)) as T;
    },
    async del(path: string): Promise<void> {
      await request(path, { method: "DELETE" });
    },
  };
}

async function jsonOrEmpty(response: Response, provider: string): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new VideoError("provider_error", `${provider} returned a malformed JSON body.`, {
      provider,
      status: response.status,
      cause,
    });
  }
}

export interface PutBinaryOptions {
  readonly contentType?: string;
  readonly signal?: AbortSignal;
}

export async function putBinary(
  url: string,
  body: VideoBody,
  provider: string,
  options?: PutBinaryOptions,
): Promise<void> {
  const init: RequestInit = { method: "PUT", body: body as BodyInit };
  if (options?.contentType !== undefined) {
    init.headers = { "content-type": options.contentType };
  }
  if (options?.signal !== undefined) {
    init.signal = options.signal;
  }
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    throw new VideoError("network", `Upload to ${provider} failed.`, { provider, cause });
  }
  if (!response.ok) {
    throw new VideoError("upload_failed", `${provider} upload returned ${response.status}.`, {
      provider,
      status: response.status,
    });
  }
}
