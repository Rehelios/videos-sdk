import { llms } from 'fumadocs-core/source';
import { appName, docsContentRoute, gitConfig, siteUrl } from '@/lib/shared';
import { absoluteLinks, source } from '@/lib/source';

export const revalidate = false;

const summary =
  'Agnostic, type-safe video SDK. One small, honest API across Rehelios, Mux, Bunny Stream, and Cloudflare Stream — swap the adapter, keep every call site, and let the compiler catch what a provider cannot do.';

export function GET() {
  const tree = absoluteLinks(llms(source).index().replace(/^#\s.*\n+/, '')).trim();

  const body = [
    `# ${appName}`,
    `> ${summary}`,
    'Install with `npm install videos-sdk`. The core package has no provider dependencies; every adapter is a subpath export: `videos-sdk/rehelios`, `videos-sdk/mux`, `videos-sdk/bunny`, `videos-sdk/cloudflare`.',
    `Each page below is also available as Markdown — take its path after \`/docs\` and request \`${siteUrl}${docsContentRoute}/<path>/content.md\`. For example, ${siteUrl}${docsContentRoute}/getting-started/content.md`,
    `The entire documentation as one Markdown file: ${siteUrl}/llms-full.txt`,
    '## Documentation',
    tree,
    '## Optional',
    [
      `- [Source repository](https://github.com/${gitConfig.user}/${gitConfig.repo}): adapters, tests, and the capability types.`,
      '- [npm package](https://www.npmjs.com/package/videos-sdk): published as `videos-sdk`, unscoped and public.',
    ].join('\n'),
  ].join('\n\n');

  return new Response(`${body}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
