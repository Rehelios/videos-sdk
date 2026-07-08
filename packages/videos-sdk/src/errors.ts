export type VideoErrorCode =
  | "unauthorized"
  | "not_found"
  | "unsupported_operation"
  | "upload_failed"
  | "rate_limited"
  | "provider_error"
  | "network"
  | "invalid_request";

export interface VideoErrorOptions {
  readonly provider?: string;
  readonly status?: number;
  readonly cause?: unknown;
}

export class VideoError extends Error {
  readonly code: VideoErrorCode;
  readonly provider: string | undefined;
  readonly status: number | undefined;

  constructor(code: VideoErrorCode, message: string, options: VideoErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "VideoError";
    this.code = code;
    this.provider = options.provider;
    this.status = options.status;
  }
}

export function unsupportedOperation(provider: string, operation: string): never {
  throw new VideoError(
    "unsupported_operation",
    `The "${provider}" adapter does not support the "${operation}" operation.`,
    { provider },
  );
}
