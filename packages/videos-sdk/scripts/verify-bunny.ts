import { createVideos } from "../src/index";
import { bunny } from "../src/bunny";

const libraryId = process.env.BUNNY_LIBRARY_ID;
const apiKey = process.env.BUNNY_API_KEY;
const pullZone = process.env.BUNNY_PULL_ZONE;

if (!libraryId || !apiKey || !pullZone) {
  throw new Error("Set BUNNY_LIBRARY_ID, BUNNY_API_KEY, and BUNNY_PULL_ZONE.");
}

const videos = createVideos({ adapter: bunny({ libraryId, apiKey, pullZone }) });

console.log("→ list()");
const assets = await videos.list({ limit: 3 });
console.log(`  ok — ${assets.length} asset(s)`);

console.log("→ create()");
const created = await videos.create({ title: "sdk-verify (delete me)" });
console.log(`  created — id=${created.id} status=${created.status}`);

console.log("→ get()");
const one = await videos.get(created.id);
console.log(`  ok — id=${one.id} status=${one.status}`);

console.log("→ playback() (deterministic from the guid)");
const pb = await videos.playback(one.id);
console.log(`  hls: ${pb.hls}`);
console.log(`  poster: ${pb.poster}`);

console.log("→ delete() (cleanup)");
await videos.delete(created.id);
console.log("  deleted");

console.log("\n✓ Bunny adapter verified (create → get → playback → delete).");
