import type { VideoAdapter } from "./adapter";
import { VideoError } from "./errors";
import { rejects } from "./internal/pending";
import type {
  Asset,
  Caption,
  CaptionOps,
  Playback,
  UploadTicket,
  WebhookEvent,
  WebhookOps,
} from "./types";

export interface BunnyConfig {
  readonly libraryId: string;
  readonly apiKey: string;
  readonly pullZone: string;
  readonly tokenAuthKey?: string;
}

export type BunnyCapabilities = {
  readonly dash: false;
  readonly ingestFromUrl: true;
  readonly signedPlayback: true;
  readonly thumbnailAtTime: false;
  readonly captions: true;
  readonly webhooks: true;
};

const PROVIDER = "bunny";

export function bunny(config: BunnyConfig): VideoAdapter<BunnyCapabilities> {
  if (config.libraryId === "" || config.apiKey === "" || config.pullZone === "") {
    throw new VideoError("invalid_request", "bunny() requires libraryId, apiKey, and pullZone.", {
      provider: PROVIDER,
    });
  }

  const cdn = `https://${config.pullZone}.b-cdn.net`;

  const capabilities: BunnyCapabilities = {
    dash: false,
    ingestFromUrl: true,
    signedPlayback: true,
    thumbnailAtTime: false,
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
        hls: `${cdn}/${id}/playlist.m3u8`,
        poster: `${cdn}/${id}/thumbnail.jpg`,
      }),
    thumbnail: (id: string): string => `${cdn}/${id}/thumbnail.jpg`,
    signedPlayback: rejects<string>(PROVIDER, "signedPlayback"),
    ingestFromUrl: rejects<Asset>(PROVIDER, "ingestFromUrl"),
    captions,
    webhooks,
  };
}
