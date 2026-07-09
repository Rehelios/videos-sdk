import { siteUrl } from '@/lib/shared';
import { source } from '@/lib/source';

export const revalidate = false;

function urlEntry(path: string, priority: string) {
  return `  <url>\n    <loc>${siteUrl}${path}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

export function GET() {
  const entries = [
    urlEntry('/', '1.0'),
    ...source.getPages().map((page) => urlEntry(page.url, '0.8')),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
  ].join('\n');

  return new Response(`${xml}\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
