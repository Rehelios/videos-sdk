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

export interface CloudflareConfig {
  readonly accountId: string;
  readonly apiToken: string;
  readonly customerSubdomain: string;
  readonly maxDurationSeconds?: number;
}

const DEFAULT_MAX_DURATION = 21600;

export type CloudflareCapabilities = {
  readonly dash: true;
  readonly ingestFromUrl: true;
  readonly signedPlayback: true;
  readonly thumbnailAtTime: true;
  readonly captions: true;
  readonly webhooks: true;
};

const PROVIDER = "cloudflare";

interface Wrapped<T> {
  readonly result: T;
  readonly success: boolean;
}

interface CloudflareVideo {
  readonly uid: string;
  readonly status?: { readonly state?: string } | null;
  readonly duration?: number | null;
  readonly input?: { readonly width?: number; readonly height?: number } | null;
  readonly created?: string;
  readonly meta?: Record<string, unknown> | null;
}

interface DirectUpload {
  readonly uid: string;
  readonly uploadURL: string;
}

function toStatus(state: string | undefined): AssetStatus {
  switch (state) {
    case "pendingupload":
      return "waiting_upload";
    case "downloading":
      return "uploading";
    case "queued":
    case "inprogress":
      return "processing";
    case "ready":
      return "ready";
    case "error":
      return "errored";
    default:
      return "processing";
  }
}

export function cloudflare(config: CloudflareConfig): VideoAdapter<CloudflareCapabilities> {
  if (config.accountId === "" || config.apiToken === "" || config.customerSubdomain === "") {
    throw new VideoError(
      "invalid_request",
      "cloudflare() requires accountId, apiToken, and customerSubdomain.",
      { provider: PROVIDER },
    );
  }

  const cdn = `https://${config.customerSubdomain}`;
  const http = createHttpClient({
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream`,
    provider: PROVIDER,
    headers: { authorization: `Bearer ${config.apiToken}` },
  });

  const maxDuration = config.maxDurationSeconds ?? DEFAULT_MAX_DURATION;

  function toAsset(video: CloudflareVideo): Asset {
    return {
      id: video.uid,
      status: toStatus(video.status?.state ?? undefined),
      raw: video,
      ...(video.duration != null && video.duration > 0 ? { duration: video.duration } : {}),
      ...(video.input?.width != null && video.input.width > 0 ? { width: video.input.width } : {}),
      ...(video.input?.height != null && video.input.height > 0
        ? { height: video.input.height }
        : {}),
      ...(video.created !== undefined ? { createdAt: new Date(video.created) } : {}),
    };
  }

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
    capabilities: {
      dash: true,
      ingestFromUrl: true,
      signedPlayback: true,
      thumbnailAtTime: true,
      captions: true,
      webhooks: true,
    },
    raw: config,

    create: async (): Promise<Asset> => {
      const upload = (
        await http.post<Wrapped<DirectUpload>>("/direct_upload", {
          maxDurationSeconds: maxDuration,
        })
      ).result;
      return toAsset({ uid: upload.uid, status: { state: "pendingupload" } });
    },

    signedUploadUrl: async (_options?: SignedUploadUrlOptions): Promise<UploadTicket> => {
      const upload = (
        await http.post<Wrapped<DirectUpload>>("/direct_upload", {
          maxDurationSeconds: maxDuration,
        })
      ).result;
      return { id: upload.uid, url: upload.uploadURL, method: "POST" };
    },

    upload: async (key: string, body: VideoBody, options?: UploadOptions): Promise<Asset> => {
      const upload = (
        await http.post<Wrapped<DirectUpload>>("/direct_upload", {
          maxDurationSeconds: maxDuration,
        })
      ).result;
      const form = new FormData();
      const blob =
        body instanceof Blob
          ? body
          : new Blob(
              [body as BlobPart],
              options?.contentType !== undefined ? { type: options.contentType } : undefined,
            );
      form.append("file", blob, key);
      const put = await fetch(upload.uploadURL, { method: "POST", body: form });
      if (!put.ok) {
        throw new VideoError("upload_failed", `Cloudflare upload returned ${put.status}.`, {
          provider: PROVIDER,
          status: put.status,
        });
      }
      return toAsset((await http.get<Wrapped<CloudflareVideo>>(`/${upload.uid}`)).result);
    },

    get: async (id: string): Promise<Asset> =>
      toAsset((await http.get<Wrapped<CloudflareVideo>>(`/${id}`)).result),

    list: async (options?: ListOptions): Promise<readonly Asset[]> => {
      const query = new URLSearchParams();
      if (options?.limit !== undefined) query.set("limit", String(options.limit));
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      const page = await http.get<Wrapped<readonly CloudflareVideo[]>>(suffix);
      return page.result.map(toAsset);
    },

    delete: async (id: string): Promise<void> => {
      await http.del(`/${id}`);
    },

    playback: (id: string): Promise<Playback> =>
      Promise.resolve({
        hls: `${cdn}/${id}/manifest/video.m3u8`,
        dash: `${cdn}/${id}/manifest/video.mpd`,
        poster: `${cdn}/${id}/thumbnails/thumbnail.jpg`,
      }),

    thumbnail: (id: string, options?: ThumbnailOptions): string => {
      const base = `${cdn}/${id}/thumbnails/thumbnail.jpg`;
      return options?.time === undefined ? base : `${base}?time=${options.time}s`;
    },

    signedPlayback: async (id: string, options: SignedPlaybackOptions): Promise<string> => {
      const { token } = (
        await http.post<Wrapped<{ token: string }>>(`/${id}/token`, {
          exp: Math.floor(Date.now() / 1000) + options.expiresInSeconds,
        })
      ).result;
      return `${cdn}/${token}/manifest/video.m3u8`;
    },

    ingestFromUrl: async (url: string, options?: IngestOptions): Promise<Asset> => {
      const video = await http.post<Wrapped<CloudflareVideo>>("/copy", {
        url,
        ...(options?.title !== undefined ? { meta: { name: options.title } } : {}),
      });
      return toAsset(video.result);
    },

    captions,
    webhooks,
  };
}
