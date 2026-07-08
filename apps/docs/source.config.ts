import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      engine: createJavaScriptRegexEngine(),
    },
  },
});
