import type { VideoAdapter } from "./adapter";
import { VideoError } from "./errors";
import { createHttpClient } from "./internal/http";
import { rejects } from "./internal/pending";
import type {
  Asset,
  AssetStatus,
  Caption,
  CaptionOps,
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
  WebhookOps,
} from "./types";

export interface MuxConfig {
  readonly tokenId: string;
  readonly tokenSecret: string;
  readonly signingKeyId?: string;
  readonly signingKeySecret?: string;
}

export type MuxCapabilities = {
  readonly dash: false;
  readonly ingestFromUrl: true;
  readonly signedPlayback: true;
  readonly thumbnailAtTime: true;
  readonly captions: true;
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

interface MuxAsset {
  readonly id: string;
  readonly status?: string;
  readonly duration?: number;
  readonly aspect_ratio?: string;
  readonly created_at?: string;
  readonly playback_ids?: readonly MuxPlaybackId[];
}

interface MuxUpload {
  readonly id: string;
  readonly url: string;
  readonly asset_id?: string;
}

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

  const publicPlaybackId = async (id: string): Promise<string> => {
    const asset = await getAsset(id);
    const ids = asset.playback_ids ?? [];
    return ids.find((p) => p.policy === "public")?.id ?? ids[0]?.id ?? id;
  };

  const captions: CaptionOps = {
    list: rejects<readonly Caption[]>(PROVIDER, "captions.list"),
    add: rejects<Caption>(PROVIDER, "captions.add"),
    remove: rejects<void>(PROVIDER, "captions.remove"),
  };

  const webhooks: WebhookOps = {
    verify: rejects<WebhookEvent>(PROVIDER, "webhooks.verify"),
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
