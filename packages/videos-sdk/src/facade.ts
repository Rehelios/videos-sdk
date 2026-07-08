import type { VideoAdapter } from "./adapter";
import type {
  Asset,
  Capabilities,
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
  WebhookOps,
} from "./types";

type Gate<Cond extends boolean, T> = Cond extends true ? T : Record<never, never>;

type PlaybackWithDash = Omit<Playback, "dash"> & { readonly dash: string };

export type PlaybackOf<C extends Capabilities> = C["dash"] extends true
  ? PlaybackWithDash
  : Omit<Playback, "dash">;

type ThumbnailArgs<C extends Capabilities> = C["thumbnailAtTime"] extends true
  ? [options?: ThumbnailOptions]
  : [];

interface VideosCore<C extends Capabilities> {
  readonly adapter: VideoAdapter<C>;
  create(input?: CreateInput): Promise<Asset>;
  upload(key: string, body: VideoBody, options?: UploadOptions): Promise<Asset>;
  signedUploadUrl(options?: SignedUploadUrlOptions): Promise<UploadTicket>;
  get(id: string): Promise<Asset>;
  list(options?: ListOptions): Promise<readonly Asset[]>;
  delete(id: string): Promise<void>;
  playback(id: string): Promise<PlaybackOf<C>>;
  thumbnail(id: string, ...args: ThumbnailArgs<C>): string;
}

export type Videos<A extends VideoAdapter> = A extends VideoAdapter<infer C>
  ? VideosCore<C> &
      Gate<
        C["signedPlayback"],
        { signedPlayback(id: string, options: SignedPlaybackOptions): Promise<string> }
      > &
      Gate<
        C["ingestFromUrl"],
        { ingestFromUrl(url: string, options?: IngestOptions): Promise<Asset> }
      > &
      Gate<C["captions"], { readonly captions: CaptionOps }> &
      Gate<C["webhooks"], { readonly webhooks: WebhookOps }>
  : never;

interface VideosFull {
  readonly adapter: VideoAdapter;
  create(input?: CreateInput): Promise<Asset>;
  upload(key: string, body: VideoBody, options?: UploadOptions): Promise<Asset>;
  signedUploadUrl(options?: SignedUploadUrlOptions): Promise<UploadTicket>;
  get(id: string): Promise<Asset>;
  list(options?: ListOptions): Promise<readonly Asset[]>;
  delete(id: string): Promise<void>;
  playback(id: string): Promise<Playback>;
  thumbnail(id: string, options?: ThumbnailOptions): string;
  signedPlayback(id: string, options: SignedPlaybackOptions): Promise<string>;
  ingestFromUrl(url: string, options?: IngestOptions): Promise<Asset>;
  readonly captions: CaptionOps;
  readonly webhooks: WebhookOps;
}

export interface CreateVideosOptions<A extends VideoAdapter> {
  readonly adapter: A;
}

export function createVideos<A extends VideoAdapter>(options: CreateVideosOptions<A>): Videos<A> {
  const { adapter } = options;
  const facade: VideosFull = {
    adapter,
    create: (input) => adapter.create(input),
    upload: (key, body, uploadOptions) => adapter.upload(key, body, uploadOptions),
    signedUploadUrl: (signOptions) => adapter.signedUploadUrl(signOptions),
    get: (id) => adapter.get(id),
    list: (listOptions) => adapter.list(listOptions),
    delete: (id) => adapter.delete(id),
    playback: (id) => adapter.playback(id),
    thumbnail: (id, thumbnailOptions) => adapter.thumbnail(id, thumbnailOptions),
    signedPlayback: (id, signedOptions) => adapter.signedPlayback(id, signedOptions),
    ingestFromUrl: (url, ingestOptions) => adapter.ingestFromUrl(url, ingestOptions),
    captions: adapter.captions,
    webhooks: adapter.webhooks,
  };
  return facade as unknown as Videos<A>;
}
