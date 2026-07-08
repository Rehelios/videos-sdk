import { afterEach, describe, expect, test } from "bun:test";
import { VideoError } from "../src/errors";
import { createVideos } from "../src/index";
import { rehelios } from "../src/rehelios";

const realFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Response): void {
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init))) as typeof fetch;
}

function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), {
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
      return ok({ id: "vid_1", status: "queued", durationSecs: 12 });
    });
    const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });
    const asset = await videos.create({ title: "Intro" });
    expect(asset.id).toBe("vid_1");
    expect(asset.status).toBe("processing");
    expect(asset.duration).toBe(12);
  });

  test("create sends collectionId + visibility from config", async () => {
    let body: { collectionId?: string; visibility?: string } = {};
    mockFetch((_url, init) => {
      body = JSON.parse(String(init?.body)) as typeof body;
      return ok({ id: "v", status: "created" });
    });
    const videos = createVideos({
      adapter: rehelios({ apiKey: "k", collectionId: "c460", visibility: "public" }),
    });
    await videos.create({ title: "x" });
    expect(body.collectionId).toBe("c460");
    expect(body.visibility).toBe("public");
  });

  test("playback returns HLS, poster, and derived DASH", async () => {
    mockFetch((url) => {
      expect(url).toBe("https://api.rehelios.com/v1/videos/vid_1");
      return ok({
        id: "vid_1",
        status: "ready",
        playbackUrl: "https://media.rehelios.com/org/vid_1/hls/master.m3u8",
        posterUrl: "https://media.rehelios.com/org/vid_1/poster.jpg",
        dashPath: "dash/manifest.mpd",
      });
    });
    const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });
    const playback = await videos.playback("vid_1");
    expect(playback.hls).toBe("https://media.rehelios.com/org/vid_1/hls/master.m3u8");
    expect(playback.poster).toBe("https://media.rehelios.com/org/vid_1/poster.jpg");
    expect(playback.dash).toBe("https://media.rehelios.com/org/vid_1/dash/manifest.mpd");
  });

  test("maps a 404 response to a typed VideoError", async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ success: false, error: { code: "NOT_FOUND" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
    );
    const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });
    const error = await videos.get("missing").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(VideoError);
    expect((error as VideoError).code).toBe("not_found");
    expect((error as VideoError).provider).toBe("rehelios");
  });

  test("an unknown provider status falls back to processing", async () => {
    mockFetch(() => ok({ id: "v", status: "brand_new_state" }));
    const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });
    expect((await videos.get("v")).status).toBe("processing");
  });

  test("signedPlayback tokenizes the playback URL", async () => {
    mockFetch((url) => {
      if (url.endsWith("/playback-token")) return ok({ token: "abc123" });
      return ok({
        id: "v",
        status: "ready",
        playbackUrl: "https://media.rehelios.com/org/v/hls/master.m3u8",
      });
    });
    const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });
    const signed = await videos.signedPlayback("v", { expiresInSeconds: 60 });
    expect(signed).toBe("https://media.rehelios.com/org/v/hls/master.m3u8?token=abc123");
  });

  test("requires an apiKey", () => {
    expect(() => rehelios({ apiKey: "" })).toThrow(VideoError);
  });
});
