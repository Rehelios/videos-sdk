import { appName, siteUrl } from '@/lib/shared';
import { getLLMText, source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  const pages = await Promise.all(source.getPages().map((page) => getLLMText(page)));

  const header = `# ${appName}\n\nThe complete documentation of ${siteUrl}, as one Markdown file.`;

  return new Response(`${header}\n\n${pages.join('\n---\n\n')}`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
