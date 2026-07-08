import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/rehelios.ts", "src/mux.ts", "src/bunny.ts", "src/cloudflare.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  target: "es2022",
});
