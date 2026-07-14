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

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { baseUrl, headers, provider } = options;

  async function request(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
      });
    } catch (cause) {
      throw new VideoError("network", `Request to ${provider} failed.`, { provider, cause });
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new VideoError(
        codeForStatus(response.status),
        detail === "" ? `${provider} returned ${response.status}.` : detail,
        { provider, status: response.status },
      );
    }
    return response;
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
      return (await jsonOrEmpty(response)) as T;
    },
    async putForm<T>(path: string, form: FormData): Promise<T> {
      const response = await request(path, { method: "PUT", body: form });
      return (await jsonOrEmpty(response)) as T;
    },
    async del(path: string): Promise<void> {
      await request(path, { method: "DELETE" });
    },
  };
}

async function jsonOrEmpty(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
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
