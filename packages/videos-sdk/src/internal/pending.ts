import { VideoError } from "../errors";

export function rejects<T>(provider: string, operation: string): () => Promise<T> {
  return () =>
    Promise.reject<T>(
      new VideoError(
        "provider_error",
        `The "${operation}" operation is not implemented yet for the "${provider}" adapter.`,
        { provider },
      ),
    );
}
