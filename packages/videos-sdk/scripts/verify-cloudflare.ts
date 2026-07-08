import { createVideos } from "../src/index";
import { cloudflare } from "../src/cloudflare";

const accountId = process.env.CF_ACCOUNT_ID;
const apiToken = process.env.CF_API_TOKEN;
const customerSubdomain = process.env.CF_CUSTOMER_SUBDOMAIN;

if (!accountId || !apiToken || !customerSubdomain) {
  throw new Error("Set CF_ACCOUNT_ID, CF_API_TOKEN, and CF_CUSTOMER_SUBDOMAIN.");
}

const videos = createVideos({ adapter: cloudflare({ accountId, apiToken, customerSubdomain }) });

console.log("→ list()");
const assets = await videos.list({ limit: 3 });
console.log(`  ok — ${assets.length} asset(s)`);

console.log("→ create() (direct upload)");
const created = await videos.create();
console.log(`  created — id=${created.id} status=${created.status}`);

console.log("→ get()");
const one = await videos.get(created.id);
console.log(`  ok — id=${one.id} status=${one.status}`);

console.log("→ playback() (deterministic from the uid)");
const pb = await videos.playback(one.id);
console.log(`  hls: ${pb.hls}`);
console.log(`  dash: ${pb.dash}`);

console.log("→ delete() (cleanup)");
await videos.delete(created.id);
console.log("  deleted");

console.log("\n✓ Cloudflare adapter verified (create → get → playback → delete).");
