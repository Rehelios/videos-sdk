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

export function mux(config: MuxConfig): VideoAdapter<MuxCapabilities> {
  if (config.tokenId === "" || config.tokenSecret === "") {
    throw new VideoError("invalid_request", "mux() requires tokenId and tokenSecret.", {
      provider: PROVIDER,
    });
  }

  const capabilities: MuxCapabilities = {
    dash: false,
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
        hls: `https://stream.mux.com/${id}.m3u8`,
        poster: `https://image.mux.com/${id}/thumbnail.jpg`,
      }),
    thumbnail: (id: string, options?: ThumbnailOptions): string => {
      const base = `https://image.mux.com/${id}/thumbnail.jpg`;
      return options?.time === undefined ? base : `${base}?time=${options.time}`;
    },
    signedPlayback: rejects<string>(PROVIDER, "signedPlayback"),
    ingestFromUrl: rejects<Asset>(PROVIDER, "ingestFromUrl"),
    captions,
    webhooks,
  };
}
