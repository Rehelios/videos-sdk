import type { VideoAdapter } from "./adapter";
import { VideoError } from "./errors";
import { rejects } from "./internal/pending";
import type {
  Asset,
  Caption,
  CaptionOps,
  Playback,
  ThumbnailOptions,
  UploadTicket,
  WebhookEvent,
  WebhookOps,
} from "./types";

export interface CloudflareConfig {
  readonly accountId: string;
  readonly apiToken: string;
  readonly customerSubdomain: string;
}

export type CloudflareCapabilities = {
  readonly dash: true;
  readonly ingestFromUrl: true;
  readonly signedPlayback: true;
  readonly thumbnailAtTime: true;
  readonly captions: true;
  readonly webhooks: true;
};

const PROVIDER = "cloudflare";

export function cloudflare(config: CloudflareConfig): VideoAdapter<CloudflareCapabilities> {
  if (config.accountId === "" || config.apiToken === "" || config.customerSubdomain === "") {
    throw new VideoError(
      "invalid_request",
      "cloudflare() requires accountId, apiToken, and customerSubdomain.",
      { provider: PROVIDER },
    );
  }

  const cdn = `https://${config.customerSubdomain}`;

  const capabilities: CloudflareCapabilities = {
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
    create: rejects<Asset>(PROVIDER, "create"),
    upload: rejects<Asset>(PROVIDER, "upload"),
    signedUploadUrl: rejects<UploadTicket>(PROVIDER, "signedUploadUrl"),
    get: rejects<Asset>(PROVIDER, "get"),
    list: rejects<readonly Asset[]>(PROVIDER, "list"),
    delete: rejects<void>(PROVIDER, "delete"),
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
    signedPlayback: rejects<string>(PROVIDER, "signedPlayback"),
    ingestFromUrl: rejects<Asset>(PROVIDER, "ingestFromUrl"),
    captions,
    webhooks,
  };
}
