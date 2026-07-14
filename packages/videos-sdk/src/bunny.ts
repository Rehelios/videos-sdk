import type { VideoAdapter } from "./adapter";
import { VideoError } from "./errors";
import { toBase64, toBytes } from "./internal/bytes";
import { createHttpClient } from "./internal/http";
import {
  assertSignature,
  hmacSha256Hex,
  parseJson,
  requireHeader,
  requireWebhookSecret,
} from "./internal/webhooks";
import type {
  Asset,
  AssetStatus,
  Caption,
  CaptionFileInput,
  CaptionOps,
  CreateInput,
  IngestOptions,
  ListOptions,
  Playback,
  SignedPlaybackOptions,
  SignedUploadUrlOptions,
  UploadOptions,
  UploadTicket,
  VideoBody,
  WebhookEvent,
  WebhookEventType,
  WebhookOps,
} from "./types";

export interface BunnyConfig {
  readonly libraryId: string;
  readonly apiKey: string;
  readonly pullZone: string;
  readonly tokenAuthKey?: string;
  readonly webhookSecret?: string;
}

export type BunnyCapabilities = {
  readonly dash: false;
  readonly ingestFromUrl: true;
  readonly signedPlayback: true;
  readonly thumbnailAtTime: false;
  readonly captions: true;
  readonly captionSource: "file";
  readonly webhooks: true;
};

const PROVIDER = "bunny";

interface BunnyCaption {
  readonly srclang: string;
  readonly label?: string;
}

interface BunnyVideo {
  readonly guid: string;
  readonly title?: string;
  readonly status?: number;
  readonly length?: number;
  readonly width?: number;
  readonly height?: number;
  readonly dateUploaded?: string;
  readonly captions?: readonly BunnyCaption[];
}

interface BunnyList {
  readonly items: readonly BunnyVideo[];
}

interface BunnyWebhookBody {
  readonly VideoGuid?: string;
  readonly Status?: number;
}

function toWebhookEventType(status: number | undefined): WebhookEventType {
  switch (status) {
    case 3:
      return "asset.ready";
    case 5:
      return "asset.errored";
    case 7:
      return "upload.completed";
    default:
      return "unknown";
  }
}

function toStatus(status: number | undefined): AssetStatus {
  switch (status) {
    case 0:
      return "waiting_upload";
    case 1:
      return "uploading";
    case 2:
    case 3:
    case 7:
    case 8:
      return "processing";
    case 4:
      return "ready";
    case 5:
    case 6:
      return "errored";
    default:
      return "processing";
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function bunny(config: BunnyConfig): VideoAdapter<BunnyCapabilities> {
  if (config.libraryId === "" || config.apiKey === "" || config.pullZone === "") {
    throw new VideoError("invalid_request", "bunny() requires libraryId, apiKey, and pullZone.", {
      provider: PROVIDER,
    });
  }

  const cdn = `https://${config.pullZone}.b-cdn.net`;
  const http = createHttpClient({
    baseUrl: `https://video.bunnycdn.com/library/${config.libraryId}`,
    provider: PROVIDER,
    headers: { AccessKey: config.apiKey },
  });

  function toAsset(video: BunnyVideo): Asset {
    return {
      id: video.guid,
      status: toStatus(video.status),
      raw: video,
      ...(video.length != null ? { duration: video.length } : {}),
      ...(video.width != null ? { width: video.width } : {}),
      ...(video.height != null ? { height: video.height } : {}),
      ...(video.dateUploaded !== undefined ? { createdAt: new Date(video.dateUploaded) } : {}),
      ...(video.title !== undefined ? { passthrough: video.title } : {}),
    };
  }

  const toCaption = (videoId: string, caption: BunnyCaption): Caption => ({
    id: caption.srclang,
    language: caption.srclang,
    label: caption.label ?? caption.srclang,
    url: `${cdn}/${videoId}/captions/${caption.srclang}.vtt`,
  });

  const captions: CaptionOps<CaptionFileInput> = {
    list: async (assetId: string): Promise<readonly Caption[]> => {
      const video = await http.get<BunnyVideo>(`/videos/${assetId}`);
      return (video.captions ?? []).map((caption) => toCaption(assetId, caption));
    },

    add: async (assetId: string, input: CaptionFileInput): Promise<Caption> => {
      await http.post(`/videos/${assetId}/captions/${input.language}`, {
        srclang: input.language,
        label: input.label,
        captionsFile: toBase64(await toBytes(input.body)),
      });
      return toCaption(assetId, { srclang: input.language, label: input.label });
    },

    remove: async (assetId: string, captionId: string): Promise<void> => {
      await http.del(`/videos/${assetId}/captions/${captionId}`);
    },
  };

  const webhooks: WebhookOps = {
    verify: async (request: Request): Promise<WebhookEvent> => {
      const secret = requireWebhookSecret(PROVIDER, config.webhookSecret, "webhookSecret");
      const signature = requireHeader(PROVIDER, request, "x-bunnystream-signature");
      const raw = await request.text();
      assertSignature(PROVIDER, await hmacSha256Hex(secret, raw), signature);

      const body = parseJson<BunnyWebhookBody>(PROVIDER, raw);
      return {
        type: toWebhookEventType(body.Status),
        raw: body,
        ...(body.VideoGuid !== undefined ? { assetId: body.VideoGuid } : {}),
      };
    },
  };

  const createVideo = (title: string): Promise<BunnyVideo> =>
    http.post<BunnyVideo>("/videos", { title });

  return {
    name: PROVIDER,
    capabilities: {
      dash: false,
      ingestFromUrl: true,
      signedPlayback: true,
      thumbnailAtTime: false,
      captions: true,
      captionSource: "file",
      webhooks: true,
    },
    raw: config,

    create: async (input?: CreateInput): Promise<Asset> =>
      toAsset(await createVideo(input?.title ?? "Untitled")),

    upload: async (key: string, body: VideoBody, options?: UploadOptions): Promise<Asset> => {
      const created = await createVideo(key);
      const put = await fetch(
        `https://video.bunnycdn.com/library/${config.libraryId}/videos/${created.guid}`,
        {
          method: "PUT",
          headers: {
            AccessKey: config.apiKey,
            ...(options?.contentType !== undefined ? { "content-type": options.contentType } : {}),
          },
          body: body as BodyInit,
        },
      );
      if (!put.ok) {
        throw new VideoError("upload_failed", `Bunny upload returned ${put.status}.`, {
          provider: PROVIDER,
          status: put.status,
        });
      }
      return toAsset(await http.get<BunnyVideo>(`/videos/${created.guid}`));
    },

    signedUploadUrl: async (options?: SignedUploadUrlOptions): Promise<UploadTicket> => {
      const created = await createVideo(options?.key ?? "upload");
      return {
        id: created.guid,
        url: `https://video.bunnycdn.com/library/${config.libraryId}/videos/${created.guid}`,
        method: "PUT",
      };
    },

    get: async (id: string): Promise<Asset> => toAsset(await http.get<BunnyVideo>(`/videos/${id}`)),

    list: async (options?: ListOptions): Promise<readonly Asset[]> => {
      const query = new URLSearchParams();
      if (options?.limit !== undefined) query.set("itemsPerPage", String(options.limit));
      if (options?.cursor !== undefined) query.set("page", options.cursor);
      const suffix = query.size > 0 ? `?${query.toString()}` : "";
      const page = await http.get<BunnyList>(`/videos${suffix}`);
      return page.items.map(toAsset);
    },

    delete: async (id: string): Promise<void> => {
      await http.del(`/videos/${id}`);
    },

    playback: (id: string): Promise<Playback> =>
      Promise.resolve({
        hls: `${cdn}/${id}/playlist.m3u8`,
        poster: `${cdn}/${id}/thumbnail.jpg`,
      }),

    thumbnail: (id: string): string => `${cdn}/${id}/thumbnail.jpg`,

    signedPlayback: async (id: string, options: SignedPlaybackOptions): Promise<string> => {
      if (config.tokenAuthKey === undefined) {
        throw new VideoError(
          "invalid_request",
          "bunny() signedPlayback requires tokenAuthKey in the adapter config.",
          { provider: PROVIDER },
        );
      }
      const expires = Math.floor(Date.now() / 1000) + options.expiresInSeconds;
      const path = `/${id}/playlist.m3u8`;
      const token = await sha256Hex(`${config.tokenAuthKey}${path}${expires}`);
      return `${cdn}${path}?token=${token}&expires=${expires}`;
    },

    ingestFromUrl: async (url: string, options?: IngestOptions): Promise<Asset> => {
      const created = await createVideo(options?.title ?? "Imported");
      await http.post(`/videos/${created.guid}/fetch`, { url });
      return toAsset(await http.get<BunnyVideo>(`/videos/${created.guid}`));
    },

    captions,
    webhooks,
  };
}
