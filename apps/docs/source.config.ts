import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

type Attributes = { type: string; name?: string | null; value?: unknown }[];

const alerts: Record<string, string> = {
  info: 'NOTE',
  warn: 'WARNING',
  warning: 'WARNING',
  error: 'CAUTION',
};

function attribute(attributes: Attributes, name: string): string | undefined {
  const found = attributes.find(
    (candidate) => candidate.type === 'mdxJsxAttribute' && candidate.name === name,
  );

  return typeof found?.value === 'string' ? found.value : undefined;
}

function quote(body: string, kind: string): string {
  const lines = body.split('\n').map((line) => (line ? `> ${line}` : '>'));

  return [`> [!${kind}]`, ...lines].join('\n');
}

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: {
        headingIds: false,
        stringify(node, _parent, state, info) {
          if (node.type === 'mdxJsxTextElement') {
            return state.containerPhrasing(node, info) || undefined;
          }

          if (node.type !== 'mdxJsxFlowElement' || !node.name) return undefined;

          if (node.name === 'Card') {
            const title = attribute(node.attributes, 'title') ?? '';
            const href = attribute(node.attributes, 'href');
            const description = attribute(node.attributes, 'description');
            const link = href ? `[${title}](${href})` : title;

            return description ? `- ${link}: ${description}` : `- ${link}`;
          }

          if (node.name === 'Tab') {
            const label = attribute(node.attributes, 'value');
            const body = state.containerFlow(node, info);

            return label ? `**${label}**\n\n${body}` : body;
          }

          if (node.name === 'Callout') {
            const kind = alerts[attribute(node.attributes, 'type') ?? 'info'] ?? 'NOTE';

            return quote(state.containerFlow(node, info), kind);
          }

          return state.containerFlow(node, info) || undefined;
        },
      },
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {},
});
