import type { VideoAdapter } from "./adapter";
import { VideoError } from "./errors";
import { createHttpClient } from "./internal/http";
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
  readonly appUrl?: string;
  readonly collectionId?: string;
  readonly visibility?: "public" | "private";
}

export type ReheliosCapabilities = {
  readonly dash: true;
  readonly ingestFromUrl: true;
  readonly signedPlayback: true;
  readonly thumbnailAtTime: false;
  readonly captions: true;
  readonly webhooks: true;
};

const PROVIDER = "rehelios";
const DEFAULT_API_BASE_URL = "https://api.rehelios.com";
const DEFAULT_APP_URL = "https://app.rehelios.com";

interface Envelope<T> {
  readonly success: boolean;
  readonly data: T;
}

interface ReheliosVideo {
  readonly id: string;
  readonly status: string;
  readonly title?: string;
  readonly collectionId?: string | null;
  readonly durationSecs?: number | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly createdAt?: string;
  readonly playbackUrl?: string | null;
  readonly posterUrl?: string | null;
  readonly dashPath?: string | null;
}

interface ReheliosUploadInit {
  readonly uploadId: string;
  readonly key: string;
  readonly partSize: number;
  readonly urls: readonly string[];
}

interface ReheliosPage {
  readonly items: readonly ReheliosVideo[];
}

function toStatus(value: string): AssetStatus {
  switch (value) {
    case "created":
      return "waiting_upload";
    case "uploading":
      return "uploading";
    case "queued":
    case "transcoding":
      return "processing";
    case "ready":
      return "ready";
    case "failed":
      return "errored";
    default:
      return "processing";
  }
}

function toAsset(video: ReheliosVideo): Asset {
  return {
    id: video.id,
    status: toStatus(video.status),
    raw: video,
    ...(video.durationSecs != null ? { duration: video.durationSecs } : {}),
    ...(video.width != null ? { width: video.width } : {}),
    ...(video.height != null ? { height: video.height } : {}),
    ...(video.createdAt !== undefined ? { createdAt: new Date(video.createdAt) } : {}),
    ...(video.title !== undefined ? { passthrough: video.title } : {}),
  };
}

function toPlayback(video: ReheliosVideo): Playback {
  const hls = video.playbackUrl ?? "";
  const poster = video.posterUrl ?? "";
  const base = hls.replace(/\/hls\/master\.m3u8$/, "");
  return {
    hls,
    poster,
    ...(video.dashPath ? { dash: `${base}/${video.dashPath}` } : {}),
  };
}

async function toBlob(body: VideoBody): Promise<Blob> {
  if (body instanceof Blob) return body;
  if (typeof body === "string") return new Blob([body]);
  if (body instanceof Uint8Array || body instanceof ArrayBuffer)
    return new Blob([body as BlobPart]);
  return new Response(body).blob();
}

export function rehelios(config: ReheliosConfig): VideoAdapter<ReheliosCapabilities> {
  if (config.apiKey === "") {
    throw new VideoError("invalid_request", "rehelios() requires an apiKey.", {
      provider: PROVIDER,
    });
  }

  const app = (config.appUrl ?? DEFAULT_APP_URL).replace(/\/$/, "");
  const http = createHttpClient({
    baseUrl: config.apiBaseUrl ?? DEFAULT_API_BASE_URL,
    provider: PROVIDER,
    headers: { "x-api-key": config.apiKey },
  });

  const capabilities: ReheliosCapabilities = {
    dash: true,
    ingestFromUrl: true,
    signedPlayback: true,
    thumbnailAtTime: false,
    captions: true,
    webhooks: true,
  };

  const createBody = (title: string): Record<string, unknown> => ({
    title,
    ...(config.collectionId !== undefined ? { collectionId: config.collectionId } : {}),
    ...(config.visibility !== undefined ? { visibility: config.visibility } : {}),
  });

  const getVideo = async (id: string): Promise<ReheliosVideo> =>
    (await http.get<Envelope<ReheliosVideo>>(`/v1/videos/${id}`)).data;

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
      const title = input?.title ?? "Untitled";
      const video = await http.post<Envelope<ReheliosVideo>>("/v1/videos", createBody(title));
      return toAsset(video.data);
    },

    upload: async (key: string, body: VideoBody, options?: UploadOptions): Promise<Asset> => {
      const created = (await http.post<Envelope<ReheliosVideo>>("/v1/videos", createBody(key)))
        .data;
      const blob = await toBlob(body);
      const init = (
        await http.post<Envelope<ReheliosUploadInit>>(`/v1/videos/${created.id}/upload-init`, {
          filename: key,
          contentType:
            options?.contentType ?? (blob.type === "" ? "application/octet-stream" : blob.type),
          size: blob.size,
        })
      ).data;

      const parts: { partNumber: number; etag: string }[] = [];
      for (let i = 0; i < init.urls.length; i++) {
        const url = init.urls[i];
        if (url === undefined) continue;
        const start = i * init.partSize;
        const end = Math.min(start + init.partSize, blob.size);
        const response = await fetch(url, { method: "PUT", body: blob.slice(start, end) });
        if (!response.ok) {
          throw new VideoError("upload_failed", `Part ${i + 1} failed (${response.status}).`, {
            provider: PROVIDER,
            status: response.status,
          });
        }
        parts.push({ partNumber: i + 1, etag: response.headers.get("etag") ?? "" });
        options?.onProgress?.({ bytesUploaded: end, bytesTotal: blob.size });
      }

      await http.post(`/v1/videos/${created.id}/upload-complete`, {
        uploadId: init.uploadId,
        parts,
      });
      return toAsset(await getVideo(created.id));
    },

    signedUploadUrl: async (options?: SignedUploadUrlOptions): Promise<UploadTicket> => {
      const title = options?.key ?? "upload";
      const created = (await http.post<Envelope<ReheliosVideo>>("/v1/videos", createBody(title)))
        .data;
      const init = (
        await http.post<Envelope<ReheliosUploadInit>>(`/v1/videos/${created.id}/upload-init`, {
          filename: title,
          contentType: "application/octet-stream",
          ...(options?.maxSizeBytes !== undefined ? { size: options.maxSizeBytes } : {}),
        })
      ).data;
      const first = init.urls[0];
      return { id: created.id, url: first ?? "", method: "PUT" };
    },

    get: async (id: string): Promise<Asset> => toAsset(await getVideo(id)),

    list: async (options?: ListOptions): Promise<readonly Asset[]> => {
      const query = new URLSearchParams();
      if (options?.limit !== undefined) query.set("pageSize", String(options.limit));
      if (options?.cursor !== undefined) query.set("page", options.cursor);
      if (config.collectionId !== undefined) query.set("collectionId", config.collectionId);
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      const page = await http.get<Envelope<ReheliosPage>>(`/v1/videos${suffix}`);
      return page.data.items.map(toAsset);
    },

    delete: async (id: string): Promise<void> => {
      await http.del(`/v1/videos/${id}`);
    },

    playback: async (id: string): Promise<Playback> => toPlayback(await getVideo(id)),

    thumbnail: (id: string, _options?: ThumbnailOptions): string => `${app}/embed/${id}/poster.jpg`,

    signedPlayback: async (id: string, options: SignedPlaybackOptions): Promise<string> => {
      const [{ token }, video] = await Promise.all([
        http
          .post<Envelope<{ token: string }>>(`/v1/videos/${id}/playback-token`, {
            expiresIn: options.expiresInSeconds,
          })
          .then((res) => res.data),
        getVideo(id),
      ]);
      const url = video.playbackUrl ?? `${app}/embed/${id}`;
      return `${url}${url.includes("?") ? "&" : "?"}token=${token}`;
    },

    ingestFromUrl: async (url: string, options?: IngestOptions): Promise<Asset> => {
      const video = await http.post<Envelope<ReheliosVideo>>("/v1/videos/import", {
        url,
        ...(options?.title !== undefined ? { title: options.title } : {}),
        ...(config.collectionId !== undefined ? { collectionId: config.collectionId } : {}),
        ...(config.visibility !== undefined ? { visibility: config.visibility } : {}),
      });
      return toAsset(video.data);
    },

    captions,
    webhooks,
  };
}
