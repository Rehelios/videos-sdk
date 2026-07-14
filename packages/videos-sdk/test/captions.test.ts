import { afterEach, describe, expect, test } from "bun:test";
import { bunny } from "../src/bunny";
import { cloudflare } from "../src/cloudflare";
import { createVideos } from "../src/index";
import { mux } from "../src/mux";
import { rehelios } from "../src/rehelios";

const realFetch = globalThis.fetch;

interface Call {
  url: string;
  method: string;
  body: unknown;
}

function record(response: (url: string) => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    return Promise.resolve(response(url));
  }) as typeof fetch;
  return calls;
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("bunny captions", () => {
  test("add base64-encodes the file and posts it under the language code", async () => {
    const calls = record(() => json({ success: true }));
    const videos = createVideos({
      adapter: bunny({ libraryId: "7", apiKey: "k", pullZone: "vz-demo" }),
    });

    const caption = await videos.captions.add("vid", {
      language: "en",
      label: "English",
      body: "WEBVTT",
    });

    const call = calls[0];
    expect(call?.url).toBe("https://video.bunnycdn.com/library/7/videos/vid/captions/en");
    expect(call?.method).toBe("POST");
    expect(JSON.parse(String(call?.body))).toEqual({
      srclang: "en",
      label: "English",
      captionsFile: btoa("WEBVTT"),
    });
    expect(caption.url).toBe("https://vz-demo.b-cdn.net/vid/captions/en.vtt");
  });

  test("list reads the captions array off the video", async () => {
    record(() => json({ guid: "vid", captions: [{ srclang: "es", label: "Espanol" }] }));
    const videos = createVideos({
      adapter: bunny({ libraryId: "7", apiKey: "k", pullZone: "vz-demo" }),
    });

    const [caption] = await videos.captions.list("vid");
    expect(caption).toEqual({
      id: "es",
      language: "es",
      label: "Espanol",
      url: "https://vz-demo.b-cdn.net/vid/captions/es.vtt",
    });
  });

  test("remove deletes by language code", async () => {
    const calls = record(() => json({}));
    const videos = createVideos({
      adapter: bunny({ libraryId: "7", apiKey: "k", pullZone: "vz-demo" }),
    });

    await videos.captions.remove("vid", "en");
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe("https://video.bunnycdn.com/library/7/videos/vid/captions/en");
  });
});

describe("cloudflare captions", () => {
  test("add uploads the file as multipart under the language path", async () => {
    const calls = record(() =>
      json({ success: true, result: { language: "en", label: "English" } }),
    );
    const videos = createVideos({
      adapter: cloudflare({ accountId: "acc", apiToken: "t", customerSubdomain: "c.example.com" }),
    });

    const caption = await videos.captions.add("uid", {
      language: "en",
      label: "English",
      body: "WEBVTT",
    });

    const call = calls[0];
    expect(call?.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acc/stream/uid/captions/en",
    );
    expect(call?.method).toBe("PUT");
    expect(call?.body).toBeInstanceOf(FormData);
    expect((call?.body as FormData | undefined)?.get("file")).toBeInstanceOf(Blob);
    expect(caption).toEqual({ id: "en", language: "en", label: "English" });
  });

  test("list unwraps the result envelope", async () => {
    record(() => json({ success: true, result: [{ language: "fr" }] }));
    const videos = createVideos({
      adapter: cloudflare({ accountId: "acc", apiToken: "t", customerSubdomain: "c.example.com" }),
    });

    expect(await videos.captions.list("uid")).toEqual([{ id: "fr", language: "fr", label: "fr" }]);
  });
});

describe("rehelios captions", () => {
  test("add posts multipart to the subtitles upload route", async () => {
    const calls = record(() => json({ success: true, data: { language: "en", name: "English" } }));
    const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });

    const caption = await videos.captions.add("vid", {
      language: "en",
      label: "English",
      body: "WEBVTT",
    });

    const call = calls[0];
    expect(call?.url).toBe("https://api.rehelios.com/v1/videos/vid/subtitles/upload");
    expect(call?.method).toBe("POST");
    const form = call?.body as FormData;
    expect(form.get("language")).toBe("en");
    expect(form.get("name")).toBe("English");
    expect(caption).toEqual({ id: "en", language: "en", label: "English" });
  });

  test("list reads subtitleTracks off the video detail", async () => {
    record(() =>
      json({
        success: true,
        data: {
          id: "vid",
          status: "ready",
          subtitleTracks: [{ language: "pt", name: "Portugues" }],
        },
      }),
    );
    const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });

    expect(await videos.captions.list("vid")).toEqual([
      { id: "pt", language: "pt", label: "Portugues" },
    ]);
  });
});

describe("mux captions", () => {
  test("add creates a text track from a URL", async () => {
    const calls = record((url) =>
      url.endsWith("/tracks")
        ? json({ data: { id: "trk_1", type: "text", language_code: "en", name: "English" } })
        : json({ data: { id: "as_1", playback_ids: [{ id: "pb_1", policy: "public" }] } }),
    );
    const videos = createVideos({ adapter: mux({ tokenId: "a", tokenSecret: "b" }) });

    const caption = await videos.captions.add("as_1", {
      language: "en",
      label: "English",
      url: "https://example.com/en.vtt",
    });

    const call = calls[0];
    expect(call?.url).toBe("https://api.mux.com/video/v1/assets/as_1/tracks");
    expect(JSON.parse(String(call?.body))).toEqual({
      url: "https://example.com/en.vtt",
      type: "text",
      text_type: "subtitles",
      language_code: "en",
      name: "English",
    });
    expect(caption.url).toBe("https://stream.mux.com/pb_1/text/trk_1.vtt");
  });

  test("list keeps only text tracks", async () => {
    record(() =>
      json({
        data: {
          id: "as_1",
          playback_ids: [{ id: "pb_1", policy: "public" }],
          tracks: [
            { id: "trk_v", type: "video" },
            { id: "trk_t", type: "text", language_code: "en", name: "English" },
          ],
        },
      }),
    );
    const videos = createVideos({ adapter: mux({ tokenId: "a", tokenSecret: "b" }) });

    const captions = await videos.captions.list("as_1");
    expect(captions).toHaveLength(1);
    expect(captions[0]?.id).toBe("trk_t");
  });

  test("remove deletes the track by id", async () => {
    const calls = record(() => json({}));
    const videos = createVideos({ adapter: mux({ tokenId: "a", tokenSecret: "b" }) });

    await videos.captions.remove("as_1", "trk_t");
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toBe("https://api.mux.com/video/v1/assets/as_1/tracks/trk_t");
  });
});
