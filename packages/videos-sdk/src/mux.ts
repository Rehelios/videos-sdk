import type { VideoAdapter } from "./adapter";
import { VideoError } from "./errors";
import { createHttpClient } from "./internal/http";
import {
  assertFreshTimestamp,
  assertSignature,
  hmacSha256Hex,
  parseJson,
  parseSignatureHeader,
  requireHeader,
  requireWebhookSecret,
} from "./internal/webhooks";
import type {
  Asset,
  AssetStatus,
  Caption,
  CaptionOps,
  CaptionUrlInput,
  IngestOptions,
  ListOptions,
  Playback,
  SignedPlaybackOptions,
  SignedUploadUrlOptions,
  ThumbnailOptions,
  UploadOptions,
  UploadTicket,
  VideoBody,
  WebhookEvent,
  WebhookEventType,
  WebhookOps,
} from "./types";

export interface MuxConfig {
  readonly tokenId: string;
  readonly tokenSecret: string;
  readonly signingKeyId?: string;
  readonly signingKeySecret?: string;
  readonly webhookSecret?: string;
}

export type MuxCapabilities = {
  readonly dash: false;
  readonly ingestFromUrl: true;
  readonly signedPlayback: true;
  readonly thumbnailAtTime: true;
  readonly captions: true;
  readonly captionSource: "url";
  readonly webhooks: true;
};

const PROVIDER = "mux";

interface MuxData<T> {
  readonly data: T;
}

interface MuxPlaybackId {
  readonly id: string;
  readonly policy: string;
}

interface MuxTrack {
  readonly id: string;
  readonly type?: string;
  readonly text_type?: string;
  readonly language_code?: string;
  readonly name?: string;
}

interface MuxAsset {
  readonly id: string;
  readonly status?: string;
  readonly duration?: number;
  readonly aspect_ratio?: string;
  readonly created_at?: string;
  readonly playback_ids?: readonly MuxPlaybackId[];
  readonly tracks?: readonly MuxTrack[];
}

interface MuxUpload {
  readonly id: string;
  readonly url: string;
  readonly asset_id?: string;
}

interface MuxWebhookBody {
  readonly type?: string;
  readonly data?: { readonly id?: string; readonly asset_id?: string };
}

const WEBHOOK_EVENTS: Record<string, WebhookEventType> = {
  "video.asset.ready": "asset.ready",
  "video.asset.errored": "asset.errored",
  "video.asset.deleted": "asset.deleted",
  "video.upload.asset_created": "upload.completed",
};

function toStatus(status: string | undefined): AssetStatus {
  switch (status) {
    case "preparing":
      return "processing";
    case "ready":
      return "ready";
    case "errored":
      return "errored";
    default:
      return "processing";
  }
}

function toAsset(asset: MuxAsset): Asset {
  return {
    id: asset.id,
    status: toStatus(asset.status),
    raw: asset,
    ...(asset.duration !== undefined ? { duration: asset.duration } : {}),
    ...(asset.created_at !== undefined
      ? { createdAt: new Date(Number(asset.created_at) * 1000) }
      : {}),
  };
}

function base64Url(input: string | ArrayBuffer): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function signMuxToken(
  playbackId: string,
  keyId: string,
  keySecretBase64: string,
  exp: number,
): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: keyId }));
  const payload = base64Url(JSON.stringify({ sub: playbackId, aud: "v", exp }));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(atob(keySecretBase64)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(signature)}`;
}

export function mux(config: MuxConfig): VideoAdapter<MuxCapabilities> {
  if (config.tokenId === "" || config.tokenSecret === "") {
    throw new VideoError("invalid_request", "mux() requires tokenId and tokenSecret.", {
      provider: PROVIDER,
    });
  }

  const http = createHttpClient({
    baseUrl: "https://api.mux.com/video/v1",
    provider: PROVIDER,
    headers: { authorization: `Basic ${btoa(`${config.tokenId}:${config.tokenSecret}`)}` },
  });

  const getAsset = async (id: string): Promise<MuxAsset> =>
    (await http.get<MuxData<MuxAsset>>(`/assets/${id}`)).data;

  const playbackIdOf = (asset: MuxAsset): string => {
    const ids = asset.playback_ids ?? [];
    return ids.find((p) => p.policy === "public")?.id ?? ids[0]?.id ?? asset.id;
  };

  const publicPlaybackId = async (id: string): Promise<string> => playbackIdOf(await getAsset(id));

  const toCaption = (track: MuxTrack, playbackId: string): Caption => ({
    id: track.id,
    language: track.language_code ?? "",
    label: track.name ?? track.language_code ?? "",
    url: `https://stream.mux.com/${playbackId}/text/${track.id}.vtt`,
  });

  const captions: CaptionOps<CaptionUrlInput> = {
    list: async (assetId: string): Promise<readonly Caption[]> => {
      const asset = await getAsset(assetId);
      const playbackId = playbackIdOf(asset);
      return (asset.tracks ?? [])
        .filter((track) => track.type === "text")
        .map((track) => toCaption(track, playbackId));
    },

    add: async (assetId: string, input: CaptionUrlInput): Promise<Caption> => {
      const track = (
        await http.post<MuxData<MuxTrack>>(`/assets/${assetId}/tracks`, {
          url: input.url,
          type: "text",
          text_type: "subtitles",
          language_code: input.language,
          name: input.label,
        })
      ).data;
      return toCaption(track, await publicPlaybackId(assetId));
    },

    remove: async (assetId: string, captionId: string): Promise<void> => {
      await http.del(`/assets/${assetId}/tracks/${captionId}`);
    },
  };

  const webhooks: WebhookOps = {
    verify: async (request: Request): Promise<WebhookEvent> => {
      const secret = requireWebhookSecret(PROVIDER, config.webhookSecret, "webhookSecret");
      const parts = parseSignatureHeader(requireHeader(PROVIDER, request, "mux-signature"));
      const timestamp = parts["t"] ?? "";
      const signature = parts["v1"] ?? "";
      assertFreshTimestamp(PROVIDER, Number(timestamp));
      const raw = await request.text();
      assertSignature(PROVIDER, await hmacSha256Hex(secret, `${timestamp}.${raw}`), signature);

      const body = parseJson<MuxWebhookBody>(PROVIDER, raw);
      const type = WEBHOOK_EVENTS[body.type ?? ""] ?? "unknown";
      const assetId =
        type === "upload.completed" ? (body.data?.asset_id ?? body.data?.id) : body.data?.id;
      return { type, raw: body, ...(assetId !== undefined ? { assetId } : {}) };
    },
  };

  const createUpload = async (): Promise<MuxUpload> =>
    (
      await http.post<MuxData<MuxUpload>>("/uploads", {
        new_asset_settings: { playback_policy: ["public"] },
        cors_origin: "*",
      })
    ).data;

  return {
    name: PROVIDER,
    capabilities: {
      dash: false,
      ingestFromUrl: true,
      signedPlayback: true,
      thumbnailAtTime: true,
      captions: true,
      captionSource: "url",
      webhooks: true,
    },
    raw: config,

    create: async (): Promise<Asset> => {
      const upload = await createUpload();
      return { id: upload.id, status: "waiting_upload", raw: upload };
    },

    upload: async (_key: string, body: VideoBody, options?: UploadOptions): Promise<Asset> => {
      const upload = await createUpload();
      const put = await fetch(upload.url, {
        method: "PUT",
        ...(options?.contentType !== undefined
          ? { headers: { "content-type": options.contentType } }
          : {}),
        body: body as BodyInit,
      });
      if (!put.ok) {
        throw new VideoError("upload_failed", `Mux upload returned ${put.status}.`, {
          provider: PROVIDER,
          status: put.status,
        });
      }
      for (let attempt = 0; attempt < 30; attempt++) {
        const current = (await http.get<MuxData<MuxUpload>>(`/uploads/${upload.id}`)).data;
        if (current.asset_id !== undefined) return toAsset(await getAsset(current.asset_id));
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new VideoError("provider_error", "Mux upload did not produce an asset in time.", {
        provider: PROVIDER,
      });
    },

    signedUploadUrl: async (_options?: SignedUploadUrlOptions): Promise<UploadTicket> => {
      const upload = await createUpload();
      return { id: upload.id, url: upload.url, method: "PUT" };
    },

    get: async (id: string): Promise<Asset> => toAsset(await getAsset(id)),

    list: async (options?: ListOptions): Promise<readonly Asset[]> => {
      const query = new URLSearchParams();
      if (options?.limit !== undefined) query.set("limit", String(options.limit));
      if (options?.cursor !== undefined) query.set("page", options.cursor);
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      const page = await http.get<MuxData<readonly MuxAsset[]>>(`/assets${suffix}`);
      return page.data.map(toAsset);
    },

    delete: async (id: string): Promise<void> => {
      await http.del(`/assets/${id}`);
    },

    playback: async (id: string): Promise<Playback> => {
      const playbackId = await publicPlaybackId(id);
      return {
        hls: `https://stream.mux.com/${playbackId}.m3u8`,
        poster: `https://image.mux.com/${playbackId}/thumbnail.jpg`,
      };
    },

    thumbnail: (id: string, options?: ThumbnailOptions): string => {
      const base = `https://image.mux.com/${id}/thumbnail.jpg`;
      return options?.time === undefined ? base : `${base}?time=${options.time}`;
    },

    signedPlayback: async (id: string, options: SignedPlaybackOptions): Promise<string> => {
      if (config.signingKeyId === undefined || config.signingKeySecret === undefined) {
        throw new VideoError(
          "invalid_request",
          "mux() signedPlayback requires signingKeyId and signingKeySecret in the adapter config.",
          { provider: PROVIDER },
        );
      }
      const playbackId = await publicPlaybackId(id);
      const exp = Math.floor(Date.now() / 1000) + options.expiresInSeconds;
      const token = await signMuxToken(
        playbackId,
        config.signingKeyId,
        config.signingKeySecret,
        exp,
      );
      return `https://stream.mux.com/${playbackId}.m3u8?token=${token}`;
    },

    ingestFromUrl: async (url: string, _options?: IngestOptions): Promise<Asset> => {
      const asset = await http.post<MuxData<MuxAsset>>("/assets", {
        input: [{ url }],
        playback_policy: ["public"],
      });
      return toAsset(asset.data);
    },

    captions,
    webhooks,
  };
}
