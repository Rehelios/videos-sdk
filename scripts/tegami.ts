import { tegami } from "tegami";
import { runCli } from "tegami/cli";
import { simpleGenerator } from "tegami/generators/simple";
import { github } from "tegami/plugins/github";
import { npm } from "tegami/providers/npm";

await runCli(
  tegami({
    changelogDir: ".tegami/changes",
    generator: simpleGenerator(),
    plugins: [
      // `trustedPublish` powers `tegami npm pretrust`: run it once locally
      // (after `npm login`) to publish a placeholder and configure npm trusted
      // publishing for `release.yml` — no manual npmjs.com setup, no first
      // publish by hand. CI then publishes real versions via OIDC.
      npm({ trustedPublish: { provider: "github", workflow: "release.yml" } }),
      github({ repo: "rehelios/videos-sdk" }),
    ],
  }),
);
