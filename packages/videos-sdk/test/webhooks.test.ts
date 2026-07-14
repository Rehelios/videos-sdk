import { describe, expect, test } from "bun:test";
import { bunny } from "../src/bunny";
import { cloudflare } from "../src/cloudflare";
import { VideoError } from "../src/errors";
import { createVideos } from "../src/index";
import { mux } from "../src/mux";
import { rehelios } from "../src/rehelios";

const SECRET = "whsec_test";

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hook(body: string, headers: Record<string, string>): Request {
  return new Request("https://example.com/hook", { method: "POST", body, headers });
}

const now = (): string => String(Math.floor(Date.now() / 1000));

describe("mux webhooks", () => {
  const videos = createVideos({
    adapter: mux({ tokenId: "a", tokenSecret: "b", webhookSecret: SECRET }),
  });

  test("verifies a signed asset.ready and normalizes the event", async () => {
    const body = JSON.stringify({ type: "video.asset.ready", data: { id: "as_1" } });
    const t = now();
    const request = hook(body, {
      "mux-signature": `t=${t},v1=${await sign(SECRET, `${t}.${body}`)}`,
    });

    const event = await videos.webhooks.verify(request);
    expect(event.type).toBe("asset.ready");
    expect(event.assetId).toBe("as_1");
  });

  test("reads the asset id off asset_id for an upload event", async () => {
    const body = JSON.stringify({
      type: "video.upload.asset_created",
      data: { id: "up_1", asset_id: "as_9" },
    });
    const t = now();
    const request = hook(body, {
      "mux-signature": `t=${t},v1=${await sign(SECRET, `${t}.${body}`)}`,
    });

    const event = await videos.webhooks.verify(request);
    expect(event.type).toBe("upload.completed");
    expect(event.assetId).toBe("as_9");
  });

  test("rejects a tampered body", async () => {
    const body = JSON.stringify({ type: "video.asset.ready", data: { id: "as_1" } });
    const t = now();
    const signature = await sign(SECRET, `${t}.${body}`);
    const request = hook(JSON.stringify({ type: "video.asset.deleted", data: { id: "as_1" } }), {
      "mux-signature": `t=${t},v1=${signature}`,
    });

    await expect(videos.webhooks.verify(request)).rejects.toThrow(VideoError);
  });

  test("rejects a stale timestamp", async () => {
    const body = JSON.stringify({ type: "video.asset.ready", data: { id: "as_1" } });
    const t = String(Math.floor(Date.now() / 1000) - 3600);
    const request = hook(body, {
      "mux-signature": `t=${t},v1=${await sign(SECRET, `${t}.${body}`)}`,
    });

    await expect(videos.webhooks.verify(request)).rejects.toThrow(/tolerance/);
  });

  test("maps an unmodelled event to unknown instead of throwing", async () => {
    const body = JSON.stringify({ type: "video.asset.track.ready", data: { id: "as_1" } });
    const t = now();
    const request = hook(body, {
      "mux-signature": `t=${t},v1=${await sign(SECRET, `${t}.${body}`)}`,
    });

    expect((await videos.webhooks.verify(request)).type).toBe("unknown");
  });
});

describe("cloudflare webhooks", () => {
  const videos = createVideos({
    adapter: cloudflare({
      accountId: "acc",
      apiToken: "t",
      customerSubdomain: "c.example.com",
      webhookSecret: SECRET,
    }),
  });

  test("verifies the Webhook-Signature header and maps status.state", async () => {
    const body = JSON.stringify({ uid: "uid_1", status: { state: "ready" } });
    const time = now();
    const request = hook(body, {
      "webhook-signature": `time=${time},sig1=${await sign(SECRET, `${time}.${body}`)}`,
    });

    const event = await videos.webhooks.verify(request);
    expect(event.type).toBe("asset.ready");
    expect(event.assetId).toBe("uid_1");
  });

  test("maps the error state to asset.errored", async () => {
    const body = JSON.stringify({ uid: "uid_1", status: { state: "error" } });
    const time = now();
    const request = hook(body, {
      "webhook-signature": `time=${time},sig1=${await sign(SECRET, `${time}.${body}`)}`,
    });

    expect((await videos.webhooks.verify(request)).type).toBe("asset.errored");
  });

  test("rejects a bad signature", async () => {
    const body = JSON.stringify({ uid: "uid_1", status: { state: "ready" } });
    const request = hook(body, { "webhook-signature": `time=${now()},sig1=deadbeef` });

    await expect(videos.webhooks.verify(request)).rejects.toThrow(VideoError);
  });
});

describe("bunny webhooks", () => {
  const videos = createVideos({
    adapter: bunny({ libraryId: "7", apiKey: "k", pullZone: "vz", webhookSecret: SECRET }),
  });

  test("verifies the raw-body signature and maps status 3 to ready", async () => {
    const body = JSON.stringify({ VideoLibraryId: 7, VideoGuid: "guid_1", Status: 3 });
    const request = hook(body, { "x-bunnystream-signature": await sign(SECRET, body) });

    const event = await videos.webhooks.verify(request);
    expect(event.type).toBe("asset.ready");
    expect(event.assetId).toBe("guid_1");
  });

  test("maps status 5 to errored", async () => {
    const body = JSON.stringify({ VideoGuid: "guid_1", Status: 5 });
    const request = hook(body, { "x-bunnystream-signature": await sign(SECRET, body) });

    expect((await videos.webhooks.verify(request)).type).toBe("asset.errored");
  });

  test("rejects a body signed with the wrong secret", async () => {
    const body = JSON.stringify({ VideoGuid: "guid_1", Status: 3 });
    const request = hook(body, { "x-bunnystream-signature": await sign("nope", body) });

    await expect(videos.webhooks.verify(request)).rejects.toThrow(VideoError);
  });
});

describe("rehelios webhooks", () => {
  const videos = createVideos({ adapter: rehelios({ apiKey: "k", webhookSecret: SECRET }) });

  test("verifies the sha256= prefixed signature over timestamp.body", async () => {
    const body = JSON.stringify({ event: "video.ready", videoId: "vid_1" });
    const timestamp = new Date().toISOString();
    const request = hook(body, {
      "x-rehelios-timestamp": timestamp,
      "x-rehelios-signature": `sha256=${await sign(SECRET, `${timestamp}.${body}`)}`,
    });

    const event = await videos.webhooks.verify(request);
    expect(event.type).toBe("asset.ready");
    expect(event.assetId).toBe("vid_1");
  });

  test("maps video.failed to asset.errored", async () => {
    const body = JSON.stringify({ event: "video.failed", videoId: "vid_1" });
    const timestamp = new Date().toISOString();
    const request = hook(body, {
      "x-rehelios-timestamp": timestamp,
      "x-rehelios-signature": `sha256=${await sign(SECRET, `${timestamp}.${body}`)}`,
    });

    expect((await videos.webhooks.verify(request)).type).toBe("asset.errored");
  });

  test("throws invalid_request when no webhookSecret is configured", async () => {
    const unsigned = createVideos({ adapter: rehelios({ apiKey: "k" }) });
    const request = hook("{}", { "x-rehelios-timestamp": new Date().toISOString() });

    await expect(unsigned.webhooks.verify(request)).rejects.toThrow(/webhookSecret/);
  });
});
