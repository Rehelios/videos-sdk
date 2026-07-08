import { tegami } from "tegami";
import { runCli } from "tegami/cli";
import { simpleGenerator } from "tegami/generators/simple";
import { github } from "tegami/plugins/github";
import { npm } from "tegami/providers/npm";

await runCli(
  tegami({
    changelogDir: ".tegami/changes",
    generator: simpleGenerator(),
    plugins: [npm(), github({ repo: "rehelios/videos-sdk" })],
  }),
);
