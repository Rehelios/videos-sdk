import type {
  Asset,
  Capabilities,
  CaptionInputOf,
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

export interface VideoAdapter<C extends Capabilities = Capabilities> {
  readonly name: string;
  readonly capabilities: C;
  readonly raw: unknown;

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
  readonly captions: CaptionOps<CaptionInputOf<C>>;
  readonly webhooks: WebhookOps;
}
