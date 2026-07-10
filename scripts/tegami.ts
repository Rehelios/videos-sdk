import { tegami } from "tegami";
import { runCli } from "tegami/cli";
import { simpleGenerator } from "tegami/generators/simple";
import { github } from "tegami/plugins/github";

await runCli(
  tegami({
    changelogDir: ".tegami/changes",
    generator: simpleGenerator(),
    // Configure the npm provider here, NOT via `plugins: [npm(...)]` — Tegami
    // already prepends `npm(options.npm)` to the plugin list, so passing it again
    // registers it twice and `applyDraft` bumps every version twice.
    npm: { trustedPublish: { provider: "github", workflow: "release.yml" } },
    // `versionPr: false` disables the "Version Packages" PR. release.yml drafts,
    // versions and publishes in a single job instead — see the header there.
    plugins: [github({ repo: "rehelios/videos-sdk", versionPr: false })],
  }),
);
