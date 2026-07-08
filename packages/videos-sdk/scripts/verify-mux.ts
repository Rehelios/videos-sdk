import { createVideos } from "../src/index";
import { mux } from "../src/mux";

const tokenId = process.env.MUX_TOKEN_ID;
const tokenSecret = process.env.MUX_TOKEN_SECRET;

if (!tokenId || !tokenSecret) {
  throw new Error("Set MUX_TOKEN_ID and MUX_TOKEN_SECRET in the environment.");
}

const videos = createVideos({ adapter: mux({ tokenId, tokenSecret }) });

const TEST_URL = "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

console.log("→ list()");
const assets = await videos.list({ limit: 3 });
console.log(`  ok — ${assets.length} asset(s)`);

console.log("→ ingestFromUrl() (creates a test asset)");
const created = await videos.ingestFromUrl(TEST_URL, { title: "sdk-verify (delete me)" });
console.log(`  created — id=${created.id} status=${created.status}`);

console.log("→ get()");
const one = await videos.get(created.id);
console.log(`  ok — id=${one.id} status=${one.status} duration=${one.duration ?? "-"}`);

console.log("→ playback() (resolves the public playback id)");
const pb = await videos.playback(one.id);
console.log(`  hls: ${pb.hls}`);
console.log(`  poster: ${pb.poster}`);

console.log("→ delete() (cleanup)");
await videos.delete(created.id);
console.log("  deleted");

console.log("\n✓ Mux adapter verified end-to-end (ingest → get → playback → delete).");
