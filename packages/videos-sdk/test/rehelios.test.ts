import { afterEach, describe, expect, test } from "bun:test";
import { VideoError } from "../src/errors";
import { createVideos } from "../src/index";
import { rehelios } from "../src/rehelios";

const realFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Response): void {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init))) as typeof fetch;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("rehelios adapter", () => {
  test("create posts to /v1/videos and normalizes the asset", async () => {
    mockFetch((url, init) => {
      expect(url).toBe("https://api.rehelios.com/v1/videos");
      expect(init?.method).toBe("POST");
      return json({ id: "vid_1", status: "processing", duration_seconds: 12 });
    });
    const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });
    const asset = await videos.create({ title: "Intro" });
    expect(asset.id).toBe("vid_1");
    expect(asset.status).toBe("processing");
    expect(asset.duration).toBe(12);
  });

  test("playback builds HLS + DASH URLs with no network call", async () => {
    mockFetch(() => {
      throw new Error("playback must not hit the network");
    });
    const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });
    const playback = await videos.playback("vid_1");
    expect(playback.hls).toBe("https://stream.rehelios.com/v/vid_1/playlist.m3u8");
    expect(playback.dash).toBe("https://stream.rehelios.com/v/vid_1/manifest.mpd");
  });

  test("maps a 404 response to a typed VideoError", async () => {
    mockFetch(() => json({ message: "gone" }, 404));
    const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });
    const error = await videos.get("missing").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(VideoError);
    expect((error as VideoError).code).toBe("not_found");
    expect((error as VideoError).provider).toBe("rehelios");
  });

  test("an unknown provider status falls back to processing", async () => {
    mockFetch(() => json({ id: "v", status: "brand_new_state" }));
    const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });
    expect((await videos.get("v")).status).toBe("processing");
  });

  test("signedPlayback returns a tokenized manifest URL", async () => {
    mockFetch((url) => {
      expect(url).toBe("https://api.rehelios.com/v1/videos/v/playback-token");
      return json({ token: "abc123" });
    });
    const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });
    const signed = await videos.signedPlayback("v", { expiresInSeconds: 60 });
    expect(signed).toBe("https://stream.rehelios.com/v/v/playlist.m3u8?token=abc123");
  });

  test("requires an apiKey", () => {
    expect(() => rehelios({ apiKey: "" })).toThrow(VideoError);
  });
});
