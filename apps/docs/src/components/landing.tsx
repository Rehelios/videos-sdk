import { Link } from '@tanstack/react-router';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

const PROVIDERS = [
  {
    id: 'rehelios',
    label: 'rehelios',
    factory: 'rehelios({ apiKey: process.env.REHELIOS_API_KEY! })',
  },
  { id: 'mux', label: 'Mux', factory: 'mux({ tokenId, tokenSecret })' },
  { id: 'bunny', label: 'Bunny Stream', factory: 'bunny({ libraryId, apiKey, pullZone })' },
  {
    id: 'cloudflare',
    label: 'Cloudflare Stream',
    factory: 'cloudflare({ accountId, apiToken, customerSubdomain })',
  },
] as const;

type Provider = (typeof PROVIDERS)[number];

function providerSnippet(provider: Provider): string {
  return `import { createVideos } from "videos-sdk";
import { ${provider.id} } from "videos-sdk/${provider.id}";

const videos = createVideos({
  adapter: ${provider.factory},
});

await videos.upload("intro.mp4", file);
const { hls } = await videos.playback(id);
const poster = videos.thumbnail(id, { time: 3 });`;
}

const CAPABILITIES = [
  { name: 'Resumable upload', rehelios: true, mux: true, bunny: true, cloudflare: true },
  { name: 'Ingest from URL', rehelios: true, mux: true, bunny: true, cloudflare: true },
  { name: 'HLS playback', rehelios: true, mux: true, bunny: true, cloudflare: true },
  { name: 'DASH playback', rehelios: true, mux: false, bunny: false, cloudflare: true },
  { name: 'Signed playback', rehelios: true, mux: true, bunny: true, cloudflare: true },
  { name: 'Thumbnail at time', rehelios: true, mux: true, bunny: false, cloudflare: true },
  { name: 'Captions', rehelios: true, mux: true, bunny: true, cloudflare: true },
  { name: 'Webhooks', rehelios: true, mux: true, bunny: true, cloudflare: true },
] as const;

function CodeBlock({ code, lang = 'ts' }: { code: string; lang?: string }) {
  return <DynamicCodeBlock lang={lang} code={code} />;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card px-4 py-2 font-mono text-sm text-fd-foreground transition-colors hover:bg-fd-secondary"
    >
      <span className="text-fd-muted-foreground">$</span>
      {text}
      {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5 text-fd-muted-foreground" />}
    </button>
  );
}

function Hero() {
  return (
    <section className="flex flex-col items-center px-4 pt-24 pb-16 text-center">
      <Link
        to="/docs/$"
        params={{ _splat: '' }}
        className="mb-8 inline-flex items-center gap-2 rounded-full border border-fd-border px-3 py-1 font-mono text-xs text-fd-muted-foreground"
      >
        <span className="size-1.5 rounded-full bg-green-500" />
        v0.0.0 — early preview →
      </Link>
      <h1 className="max-w-4xl text-balance font-semibold text-6xl leading-[0.95] tracking-tight sm:text-7xl">
        Upload once.
        <br />
        Stream anywhere.
      </h1>
      <p className="mt-6 max-w-2xl text-balance text-fd-muted-foreground text-lg">
        One type-safe API for video across rehelios, Mux, Bunny Stream, and Cloudflare Stream. Swap
        the adapter, keep every call site — and let the compiler catch what a provider can't do.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <CopyButton text="bun add videos-sdk" />
        <Link
          to="/docs/$"
          params={{ _splat: '' }}
          className="font-medium text-fd-foreground text-sm hover:underline"
        >
          Read the docs →
        </Link>
      </div>
    </section>
  );
}

function ProvidersShowcase() {
  const [active, setActive] = useState<Provider['id']>('rehelios');
  const provider = PROVIDERS.find((item) => item.id === active) ?? PROVIDERS[0];

  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <p className="mb-2 text-center font-mono text-fd-muted-foreground text-xs uppercase tracking-widest">
        Live snippet
      </p>
      <h2 className="text-balance text-center font-semibold text-3xl tracking-tight">
        The exact same code. Any provider.
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-balance text-center text-fd-muted-foreground">
        Switch the adapter, keep every call site. Here is the same upload, playback, and thumbnail
        sequence across four providers.
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        {PROVIDERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item.id)}
            className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${
              item.id === active
                ? 'border-fd-foreground bg-fd-foreground text-fd-background'
                : 'border-fd-border text-fd-muted-foreground hover:bg-fd-secondary'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <CodeBlock code={providerSnippet(provider)} />
      </div>
    </section>
  );
}

function TypeSafety() {
  const code = `const mux = createVideos({ adapter: mux(cfg) });
(await mux.playback(id)).dash;
//                       ^^^^  ❌ Property 'dash' does not exist
//                             Mux has no DASH — caught at compile time

const cf = createVideos({ adapter: cloudflare(cfg) });
(await cf.playback(id)).dash; // ✅ string — Cloudflare supports DASH

bunny.thumbnail(id, { time: 5 });
//                  ^^^^^^^^^^^  ❌ Bunny thumbnails have no time offset`;

  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <p className="mb-2 text-center font-mono text-fd-muted-foreground text-xs uppercase tracking-widest">
        Capability-safe
      </p>
      <h2 className="text-balance text-center font-semibold text-3xl tracking-tight">
        Unsupported is a compile error.
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-balance text-center text-fd-muted-foreground">
        Each adapter declares its capabilities as literal types. The API narrows to match — so a
        provider that can't do something never lets you call it.
      </p>
      <div className="mt-8">
        <CodeBlock code={code} />
      </div>
    </section>
  );
}

function CapabilitiesMatrix() {
  const columns = [
    { id: 'rehelios', label: 'rehelios' },
    { id: 'mux', label: 'Mux' },
    { id: 'bunny', label: 'Bunny' },
    { id: 'cloudflare', label: 'Cloudflare' },
  ] as const;

  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <h2 className="text-balance text-center font-semibold text-3xl tracking-tight">
        One interface, honest about the differences.
      </h2>
      <div className="mt-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-fd-border border-b">
              <th className="py-3 pr-4 text-left font-medium text-fd-muted-foreground">Capability</th>
              {columns.map((column) => (
                <th key={column.id} className="px-4 py-3 text-center font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((row) => (
              <tr key={row.name} className="border-fd-border/60 border-b">
                <td className="py-3 pr-4 text-fd-muted-foreground">{row.name}</td>
                {columns.map((column) => (
                  <td key={column.id} className="px-4 py-3 text-center">
                    {row[column.id] ? (
                      <Check className="mx-auto size-4 text-green-500" />
                    ) : (
                      <span className="text-fd-muted-foreground">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GettingStarted() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <p className="mb-2 text-center font-mono text-fd-muted-foreground text-xs uppercase tracking-widest">
        Two steps
      </p>
      <h2 className="text-balance text-center font-semibold text-3xl tracking-tight">
        Your first upload in under a minute.
      </h2>
      <div className="mt-10 grid gap-6">
        <div>
          <p className="mb-3 font-medium text-sm">1. Install</p>
          <CodeBlock code="bun add videos-sdk" lang="bash" />
        </div>
        <div>
          <p className="mb-3 font-medium text-sm">2. Make your first call</p>
          <CodeBlock
            code={`import { createVideos } from "videos-sdk";
import { rehelios } from "videos-sdk/rehelios";

const videos = createVideos({
  adapter: rehelios({ apiKey: process.env.REHELIOS_API_KEY! }),
});

const asset = await videos.upload("intro.mp4", file);`}
          />
        </div>
      </div>
    </section>
  );
}

function FooterCTA() {
  return (
    <section className="flex flex-col items-center border-fd-border border-t px-4 py-24 text-center">
      <h2 className="text-balance font-semibold text-4xl tracking-tight">
        Ship the video layer once.
      </h2>
      <p className="mt-4 max-w-lg text-balance text-fd-muted-foreground">
        Open source, MIT licensed, built around web standards. Drop in an adapter and forget the
        difference.
      </p>
      <div className="mt-8">
        <CopyButton text="bun add videos-sdk" />
      </div>
    </section>
  );
}

export function Landing() {
  return (
    <main className="flex-1">
      <Hero />
      <ProvidersShowcase />
      <TypeSafety />
      <CapabilitiesMatrix />
      <GettingStarted />
      <FooterCTA />
    </main>
  );
}
