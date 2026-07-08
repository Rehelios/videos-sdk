import type { VideoAdapter } from "./adapter";
import { VideoError } from "./errors";
import { createHttpClient, putBinary } from "./internal/http";
import { rejects } from "./internal/pending";
import type {
  Asset,
  AssetStatus,
  Caption,
  CaptionOps,
  CreateInput,
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

export interface ReheliosConfig {
  readonly apiKey: string;
  readonly apiBaseUrl?: string;
  readonly playbackHost?: string;
}

export type ReheliosCapabilities = {
  readonly dash: true;
  readonly ingestFromUrl: true;
  readonly signedPlayback: true;
  readonly thumbnailAtTime: true;
  readonly captions: true;
  readonly webhooks: true;
};

const PROVIDER = "rehelios";
const DEFAULT_API_BASE_URL = "https://api.rehelios.com";
const DEFAULT_PLAYBACK_HOST = "https://stream.rehelios.com";

interface ReheliosVideo {
  readonly id: string;
  readonly status: string;
  readonly duration_seconds?: number;
  readonly width?: number;
  readonly height?: number;
  readonly created_at?: string;
  readonly passthrough?: string;
}

interface ReheliosVideoList {
  readonly data: readonly ReheliosVideo[];
}

interface ReheliosUploadTicket {
  readonly id: string;
  readonly upload_url: string;
  readonly protocol?: string;
}

interface ReheliosPlaybackToken {
  readonly token: string;
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  "waiting_upload",
  "uploading",
  "processing",
  "ready",
  "errored",
]);

function toStatus(value: string): AssetStatus {
  return KNOWN_STATUSES.has(value) ? (value as AssetStatus) : "processing";
}

function toAsset(video: ReheliosVideo): Asset {
  return {
    id: video.id,
    status: toStatus(video.status),
    raw: video,
    ...(video.duration_seconds !== undefined ? { duration: video.duration_seconds } : {}),
    ...(video.width !== undefined ? { width: video.width } : {}),
    ...(video.height !== undefined ? { height: video.height } : {}),
    ...(video.created_at !== undefined ? { createdAt: new Date(video.created_at) } : {}),
    ...(video.passthrough !== undefined ? { passthrough: video.passthrough } : {}),
  };
}

export function rehelios(config: ReheliosConfig): VideoAdapter<ReheliosCapabilities> {
  if (config.apiKey === "") {
    throw new VideoError("invalid_request", "rehelios() requires an apiKey.", {
      provider: PROVIDER,
    });
  }

  const host = config.playbackHost ?? DEFAULT_PLAYBACK_HOST;
  const http = createHttpClient({
    baseUrl: config.apiBaseUrl ?? DEFAULT_API_BASE_URL,
    provider: PROVIDER,
    headers: { authorization: `Bearer ${config.apiKey}` },
  });

  const capabilities: ReheliosCapabilities = {
    dash: true,
    ingestFromUrl: true,
    signedPlayback: true,
    thumbnailAtTime: true,
    captions: true,
    webhooks: true,
  };

  const captions: CaptionOps = {
    list: rejects<readonly Caption[]>(PROVIDER, "captions.list"),
    add: rejects<Caption>(PROVIDER, "captions.add"),
    remove: rejects<void>(PROVIDER, "captions.remove"),
  };

  const webhooks: WebhookOps = {
    verify: rejects<WebhookEvent>(PROVIDER, "webhooks.verify"),
  };

  return {
    name: PROVIDER,
    capabilities,
    raw: config,

    create: async (input?: CreateInput): Promise<Asset> => {
      const video = await http.post<ReheliosVideo>("/v1/videos", input ?? {});
      return toAsset(video);
    },

    upload: async (key: string, body: VideoBody, options?: UploadOptions): Promise<Asset> => {
      const ticket = await http.post<ReheliosUploadTicket>("/v1/uploads", { key });
      await putBinary(ticket.upload_url, body, PROVIDER, options);
      return toAsset(await http.get<ReheliosVideo>(`/v1/videos/${ticket.id}`));
    },

    signedUploadUrl: async (options?: SignedUploadUrlOptions): Promise<UploadTicket> => {
      const ticket = await http.post<ReheliosUploadTicket>("/v1/uploads", options ?? {});
      return {
        id: ticket.id,
        url: ticket.upload_url,
        method: ticket.protocol === "tus" ? "TUS" : "PUT",
      };
    },

    get: async (id: string): Promise<Asset> =>
      toAsset(await http.get<ReheliosVideo>(`/v1/videos/${id}`)),

    list: async (options?: ListOptions): Promise<readonly Asset[]> => {
      const query = new URLSearchParams();
      if (options?.limit !== undefined) query.set("limit", String(options.limit));
      if (options?.cursor !== undefined) query.set("cursor", options.cursor);
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      const page = await http.get<ReheliosVideoList>(`/v1/videos${suffix}`);
      return page.data.map(toAsset);
    },

    delete: async (id: string): Promise<void> => {
      await http.del(`/v1/videos/${id}`);
    },

    playback: (id: string): Promise<Playback> =>
      Promise.resolve({
        hls: `${host}/v/${id}/playlist.m3u8`,
        dash: `${host}/v/${id}/manifest.mpd`,
        poster: `${host}/v/${id}/thumbnail.jpg`,
      }),

    thumbnail: (id: string, options?: ThumbnailOptions): string => {
      const base = `${host}/v/${id}/thumbnail.jpg`;
      return options?.time === undefined ? base : `${base}?time=${options.time}`;
    },

    signedPlayback: async (id: string, options: SignedPlaybackOptions): Promise<string> => {
      const { token } = await http.post<ReheliosPlaybackToken>(`/v1/videos/${id}/playback-token`, {
        expires_in: options.expiresInSeconds,
      });
      return `${host}/v/${id}/playlist.m3u8?token=${token}`;
    },

    ingestFromUrl: async (url: string, options?: IngestOptions): Promise<Asset> => {
      const video = await http.post<ReheliosVideo>("/v1/videos", {
        input_url: url,
        ...(options ?? {}),
      });
      return toAsset(video);
    },

    captions,
    webhooks,
  };
}
