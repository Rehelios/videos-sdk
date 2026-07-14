import { bunny } from "../src/bunny";
import { cloudflare } from "../src/cloudflare";
import { createVideos } from "../src/index";
import { mux } from "../src/mux";
import { rehelios } from "../src/rehelios";

function use(_value: unknown): void {}

export async function muxGating(): Promise<void> {
  const videos = createVideos({ adapter: mux({ tokenId: "a", tokenSecret: "b" }) });

  const playback = await videos.playback("id");
  use(playback.hls);
  // @ts-expect-error Mux does not support DASH, so `dash` is absent from the type.
  use(playback.dash);

  use(videos.thumbnail("id", { time: 5 }));
  void videos.signedPlayback("id", { expiresInSeconds: 60 });
  void videos.ingestFromUrl("https://example.com/in.mp4");
  void videos.captions.list("id");
  void videos.webhooks.verify(new Request("https://example.com/hook"));

  void videos.captions.add("id", {
    language: "en",
    label: "English",
    url: "https://example.com/en.vtt",
  });
  void videos.captions.add("id", {
    language: "en",
    label: "English",
    // @ts-expect-error Mux only ingests captions from a URL, never from a file.
    body: "WEBVTT",
  });
}

export async function cloudflareGating(): Promise<void> {
  const videos = createVideos({
    adapter: cloudflare({
      accountId: "a",
      apiToken: "b",
      customerSubdomain: "customer-x.cloudflarestream.com",
    }),
  });

  const playback = await videos.playback("id");
  const dash: string = playback.dash;
  use(dash);
  use(videos.thumbnail("id", { time: 3 }));
}

export function bunnyGating(): void {
  const videos = createVideos({
    adapter: bunny({ libraryId: "1", apiKey: "k", pullZone: "vz-demo" }),
  });

  use(videos.thumbnail("id"));
  // @ts-expect-error Bunny thumbnails have no time offset.
  use(videos.thumbnail("id", { time: 5 }));

  void videos.captions.add("id", { language: "en", label: "English", body: "WEBVTT" });
  void videos.captions.add("id", {
    language: "en",
    label: "English",
    // @ts-expect-error Bunny uploads the caption file itself; it takes no URL.
    url: "https://example.com/en.vtt",
  });
}

export async function reheliosGating(): Promise<void> {
  const videos = createVideos({ adapter: rehelios({ apiKey: "k" }) });

  const playback = await videos.playback("id");
  use(playback.dash);
  void videos.signedPlayback("id", { expiresInSeconds: 120 });
}
