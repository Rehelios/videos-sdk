export type AssetStatus = "waiting_upload" | "uploading" | "processing" | "ready" | "errored";

export interface Asset {
  readonly id: string;
  readonly status: AssetStatus;
  readonly duration?: number;
  readonly width?: number;
  readonly height?: number;
  readonly createdAt?: Date;
  readonly passthrough?: string;
  readonly raw: unknown;
}

export interface Playback {
  readonly hls: string;
  readonly poster: string;
  readonly dash?: string;
}

export type UploadMethod = "PUT" | "POST" | "TUS";

export interface UploadTicket {
  readonly url: string;
  readonly id: string;
  readonly method: UploadMethod;
}

export type VideoBody = Blob | ReadableStream<Uint8Array> | Uint8Array | ArrayBuffer | string;

export interface CreateInput {
  readonly title?: string;
  readonly passthrough?: string;
}

export interface UploadProgress {
  readonly bytesUploaded: number;
  readonly bytesTotal: number;
}

export interface UploadOptions {
  readonly contentType?: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: UploadProgress) => void;
}

export interface SignedUploadUrlOptions {
  readonly key?: string;
  readonly maxSizeBytes?: number;
  readonly expiresInSeconds?: number;
}

export interface ListOptions {
  readonly limit?: number;
  readonly cursor?: string;
}

export interface ThumbnailOptions {
  readonly time?: number;
}

export interface SignedPlaybackOptions {
  readonly expiresInSeconds: number;
}

export interface IngestOptions {
  readonly title?: string;
  readonly passthrough?: string;
}

export type CaptionSource = "file" | "url";

export interface Capabilities {
  readonly dash: boolean;
  readonly ingestFromUrl: boolean;
  readonly signedPlayback: boolean;
  readonly thumbnailAtTime: boolean;
  readonly captions: boolean;
  readonly captionSource: CaptionSource;
  readonly webhooks: boolean;
}

export interface Caption {
  readonly id: string;
  readonly language: string;
  readonly label: string;
  readonly url?: string;
}

interface CaptionInputBase {
  readonly language: string;
  readonly label: string;
}

export interface CaptionFileInput extends CaptionInputBase {
  readonly body: VideoBody;
}

export interface CaptionUrlInput extends CaptionInputBase {
  readonly url: string;
}

export type AddCaptionInput = CaptionFileInput | CaptionUrlInput;

export type CaptionInputOf<C extends Capabilities> = C["captionSource"] extends "url"
  ? CaptionUrlInput
  : CaptionFileInput;

export interface CaptionOps<I extends AddCaptionInput = AddCaptionInput> {
  list(assetId: string): Promise<readonly Caption[]>;
  add(assetId: string, input: I): Promise<Caption>;
  remove(assetId: string, captionId: string): Promise<void>;
}

export type WebhookEventType =
  | "asset.ready"
  | "asset.errored"
  | "upload.completed"
  | "asset.deleted"
  | "unknown";

export interface WebhookEvent {
  readonly type: WebhookEventType;
  readonly assetId?: string;
  readonly raw: unknown;
}

export interface WebhookOps {
  verify(request: Request): Promise<WebhookEvent>;
}
