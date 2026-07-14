import { afterEach, describe, expect, test } from "bun:test";
import { VideoError } from "../src/errors";
import { rehelios } from "../src/rehelios";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function videos() {
  return rehelios({ apiKey: "key" });
}

function rateLimited(retryAfter = "0"): Response {
  return new Response("slow down", { status: 429, headers: { "retry-after": retryAfter } });
}

function ok(): Response {
  return new Response(JSON.stringify({ success: true, data: { id: "v1", status: "ready" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function respondWith(responses: Response[]): () => number {
  let calls = 0;
  globalThis.fetch = (() => {
    const response = responses[calls] ?? ok();
    calls += 1;
    return Promise.resolve(response);
  }) as typeof fetch;
  return () => calls;
}

describe("http client rate limiting", () => {
  test("retries a 429 and returns the eventual success", async () => {
    const calls = respondWith([rateLimited(), rateLimited(), ok()]);

    const asset = await videos().get("v1");

    expect(asset.id).toBe("v1");
    expect(calls()).toBe(3);
  });

  test("gives up after the retry budget and throws rate_limited", async () => {
    const calls = respondWith(Array.from({ length: 10 }, () => rateLimited()));

    const error = (await videos()
      .get("v1")
      .catch((cause: unknown) => cause)) as VideoError;

    expect(error).toBeInstanceOf(VideoError);
    expect(error.code).toBe("rate_limited");
    expect(error.status).toBe(429);
    expect(calls()).toBe(6);
  });

  test("honours a Retry-After delay before retrying", async () => {
    const calls = respondWith([rateLimited("1"), ok()]);

    const startedAt = Date.now();
    await videos().get("v1");

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900);
    expect(calls()).toBe(2);
  });

  test("does not retry when Retry-After asks for longer than the ceiling", async () => {
    const calls = respondWith([rateLimited("120"), ok()]);

    const startedAt = Date.now();
    const error = (await videos()
      .get("v1")
      .catch((cause: unknown) => cause)) as VideoError;

    expect(error.code).toBe("rate_limited");
    expect(calls()).toBe(1);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  test("falls back to backoff when Retry-After is unparseable", async () => {
    const calls = respondWith([rateLimited("soon"), ok()]);

    const asset = await videos().get("v1");

    expect(asset.id).toBe("v1");
    expect(calls()).toBe(2);
  });

  test("does not retry a non-429 failure", async () => {
    const calls = respondWith([new Response("nope", { status: 500 })]);

    const error = (await videos()
      .get("v1")
      .catch((cause: unknown) => cause)) as VideoError;

    expect(error.code).toBe("provider_error");
    expect(calls()).toBe(1);
  });
});

describe("rehelios apiBaseUrl normalization", () => {
  test("a base url that already carries /v1 does not produce /v1/v1", async () => {
    const urls: string[] = [];
    globalThis.fetch = ((input: string | URL | Request) => {
      urls.push(String(input));
      return Promise.resolve(ok());
    }) as typeof fetch;

    await rehelios({ apiKey: "key", apiBaseUrl: "https://api.rehelios.com/v1" }).get("v1");
    await rehelios({ apiKey: "key", apiBaseUrl: "https://api.rehelios.com/" }).get("v1");

    expect(urls).toEqual([
      "https://api.rehelios.com/v1/videos/v1",
      "https://api.rehelios.com/v1/videos/v1",
    ]);
  });
});
