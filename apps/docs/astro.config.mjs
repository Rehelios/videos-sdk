import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://videos-sdk.com',
  integrations: [
    starlight({
      title: 'Videos SDK',
      description:
        'Agnostic, type-safe video SDK. One API across rehelios, Mux, Bunny Stream, and Cloudflare Stream.',
      logo: { src: './src/assets/logo.svg' },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/rehelios/videos-sdk' },
      ],
      customCss: ['./src/styles/theme.css'],
      sidebar: [
        { label: 'Getting Started', slug: 'getting-started' },
        { label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
        { label: 'Adapters', items: [{ autogenerate: { directory: 'adapters' } }] },
      ],
    }),
  ],
});
