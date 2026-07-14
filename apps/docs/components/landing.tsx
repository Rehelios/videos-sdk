'use client';

import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import { Check, Copy, Lock, Play } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';

const PROVIDERS = [
  { id: 'rehelios', label: 'Rehelios', factory: 'rehelios({ apiKey: process.env.REHELIOS_API_KEY! })' },
  { id: 'mux', label: 'Mux', factory: 'mux({ tokenId, tokenSecret })' },
  { id: 'bunny', label: 'Bunny Stream', factory: 'bunny({ libraryId, apiKey, pullZone })' },
  { id: 'cloudflare', label: 'Cloudflare Stream', factory: 'cloudflare({ accountId, apiToken, customerSubdomain })' },
] as const;

type Provider = (typeof PROVIDERS)[number];

function providerSnippet(p: Provider): string {
  return `import { createVideos } from "videos-sdk";
import { ${p.id} } from "videos-sdk/${p.id}";

const videos = createVideos({
  adapter: ${p.factory},
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
  { name: 'Thumbnail at time', rehelios: false, mux: true, bunny: false, cloudflare: true },
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
      {copied ? <Check className="size-3.5 text-fd-primary" /> : <Copy className="size-3.5 text-fd-muted-foreground" />}
    </button>
  );
}

const INSTALL_TABS = [
  {
    id: 'humans',
    label: 'For humans',
    command: 'bun add videos-sdk',
    hint: 'Adds the SDK to your project.',
  },
  {
    id: 'agents',
    label: 'For agents',
    command: 'npx skills add Rehelios/videos-sdk',
    hint: 'Installs the videos-sdk skill into Claude Code, Cursor, Codex and 70+ agents.',
  },
] as const;

function InstallTabs() {
  const [active, setActive] = useState<(typeof INSTALL_TABS)[number]['id']>('humans');
  const tab = INSTALL_TABS.find((item) => item.id === active) ?? INSTALL_TABS[0];
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="inline-flex rounded-full border border-fd-border p-1">
        {INSTALL_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item.id)}
            className={`rounded-full px-3 py-1 font-mono text-xs transition-colors ${item.id === active ? 'bg-fd-foreground text-fd-background' : 'text-fd-muted-foreground hover:text-fd-foreground'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <CopyButton text={tab.command} />
      <p className="max-w-sm text-balance text-center text-fd-muted-foreground text-xs">{tab.hint}</p>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  ready: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  processing: 'bg-fd-primary/15 text-fd-primary',
  waiting_upload: 'bg-fd-secondary text-fd-muted-foreground',
};

function StatusPill({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${STATUS_STYLES[status] ?? ''}`}>{status}</span>;
}

function SectionHeading({ label, title, description }: { label: string; title: ReactNode; description: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="mb-3 font-mono text-fd-muted-foreground text-xs uppercase tracking-widest">{label}</p>
      <h2 className="text-balance font-semibold text-3xl tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 text-balance text-fd-muted-foreground">{description}</p>
    </div>
  );
}

function FeatureBlock({ title, description, href, code, demo }: { title: string; description: string; href: string; code: string; demo: ReactNode }) {
  return (
    <div className="py-10">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-semibold text-xl tracking-tight">{title}</h3>
        <Link href={href} className="shrink-0 text-fd-muted-foreground text-sm transition-colors hover:text-fd-foreground">
          Read the docs →
        </Link>
      </div>
      <p className="mt-3 max-w-lg text-fd-muted-foreground text-sm">{description}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 md:items-stretch">
        <CodeBlock code={code} />
        <div className="flex items-center rounded-xl border border-fd-border bg-fd-card p-5">{demo}</div>
      </div>
    </div>
  );
}

function AssetRowsDemo() {
  const rows = [
    { name: 'intro.mp4', size: '48 MB', status: 'ready' },
    { name: 'webinar.mp4', size: '1.2 GB', status: 'processing' },
    { name: 'promo.mov', size: '210 MB', status: 'ready' },
    { name: 'raw-take.mkv', size: '3.4 GB', status: 'waiting_upload' },
  ];
  return (
    <div className="flex w-full flex-col gap-2">
      {rows.map((row) => (
        <div key={row.name} className="flex items-center justify-between rounded-lg border border-fd-border bg-fd-background px-3 py-2 text-sm">
          <span className="truncate font-medium">{row.name}</span>
          <span className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-fd-muted-foreground">{row.size}</span>
            <StatusPill status={row.status} />
          </span>
        </div>
      ))}
    </div>
  );
}

function TypeErrorDemo() {
  return (
    <div className="flex w-full flex-col gap-3 font-mono text-[13px]">
      <div>
        <span className="text-fd-muted-foreground">await</span> mux.playback(id).
        <span className="underline decoration-red-500 decoration-wavy underline-offset-4">dash</span>
      </div>
      <div className="w-fit rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-600 dark:text-red-400">
        Property 'dash' does not exist on type 'Playback'.
      </div>
      <div>
        <span className="text-fd-muted-foreground">await</span> cf.playback(id).dash
        <span className="ml-2 text-emerald-600 dark:text-emerald-400">✓ string</span>
      </div>
    </div>
  );
}

function LifecycleDemo() {
  const steps = ['waiting_upload', 'processing', 'ready'];
  return (
    <div className="flex w-full flex-col gap-3">
      {steps.map((status, index) => (
        <div key={status} className="flex items-center gap-3">
          <span className={`flex size-6 items-center justify-center rounded-full font-mono text-[11px] ${status === 'ready' ? 'bg-fd-primary text-fd-primary-foreground' : 'bg-fd-secondary text-fd-muted-foreground'}`}>
            {index + 1}
          </span>
          <StatusPill status={status} />
        </div>
      ))}
    </div>
  );
}

function PlayerDemo() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-fd-border">
      <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-fd-primary/30 to-fd-accent">
        <span className="flex size-12 items-center justify-center rounded-full bg-fd-background/80 backdrop-blur">
          <Play className="size-5 translate-x-0.5 fill-fd-foreground text-fd-foreground" />
        </span>
        <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-fd-background/80 px-2 py-0.5 font-mono text-[10px] backdrop-blur">
          <Lock className="size-2.5" />
          signed
        </span>
      </div>
      <div className="flex items-center gap-2 bg-fd-background px-3 py-2">
        <span className="rounded-md bg-fd-secondary px-2 py-0.5 font-mono text-[10px]">HLS</span>
        <span className="rounded-md bg-fd-secondary px-2 py-0.5 font-mono text-[10px]">DASH</span>
        <span className="ml-auto font-mono text-[10px] text-fd-muted-foreground">2:14</span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="flex flex-col items-center px-4 pt-24 pb-16 text-center">
      <Link href="/docs" className="mb-8 inline-flex items-center gap-2 rounded-full border border-fd-border px-3 py-1 font-mono text-fd-muted-foreground text-xs">
        <span className="size-1.5 rounded-full bg-fd-primary" />
        v0.1.1 — early preview →
      </Link>
      <h1 className="max-w-4xl text-balance font-semibold text-6xl leading-[0.95] tracking-tight sm:text-7xl">
        Upload once.
        <br />
        Stream <span className="font-serif-accent text-fd-primary">anywhere.</span>
      </h1>
      <p className="mt-6 max-w-2xl text-balance text-fd-muted-foreground text-lg">
        One type-safe API for video across Rehelios, Mux, Bunny Stream, and Cloudflare Stream. Swap the adapter, keep every call site — and let the compiler catch what a provider can't do.
      </p>
      <div className="mt-10 flex flex-col items-center gap-6">
        <InstallTabs />
        <Link href="/docs" className="font-medium text-fd-foreground text-sm hover:underline">
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
      <SectionHeading
        label="Live snippet"
        title={<>The exact same code. <span className="font-serif-accent text-fd-primary">Any provider.</span></>}
        description="Switch the adapter, keep every call site. Here is the same upload, playback, and thumbnail sequence across four providers."
      />
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {PROVIDERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item.id)}
            className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${item.id === active ? 'border-fd-foreground bg-fd-foreground text-fd-background' : 'border-fd-border text-fd-muted-foreground hover:bg-fd-secondary'}`}
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

function Features() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <SectionHeading
        label="Capabilities"
        title={<>Everything you need for <span className="font-serif-accent text-fd-primary">video.</span></>}
        description="A complete set of operations behind one interface, capability-safe by types, with a normalized asset lifecycle and playback that works the same on every provider."
      />
      <div className="mt-10 divide-y divide-fd-border">
        <FeatureBlock
          title="Every operation, one interface"
          href="/docs/getting-started"
          description="create, upload, get, list, delete — the same calls on every adapter, returning one normalized Asset. No provider types leak into your code."
          code={`await videos.upload("intro.mp4", file);
const asset = await videos.get(id);
const page = await videos.list({ limit: 20 });
await videos.delete(id);`}
          demo={<AssetRowsDemo />}
        />
        <FeatureBlock
          title="Unsupported is a compile error"
          href="/docs/guides/capability-safety"
          description="Each adapter declares its capabilities as literal types. The API narrows to match, so a provider that can't do something never lets you call it."
          code={`const mux = createVideos({ adapter: mux(cfg) });
(await mux.playback(id)).dash;
//                       ❌ Mux has no DASH

const cf = createVideos({ adapter: cloudflare(cfg) });
(await cf.playback(id)).dash; // ✅ string`}
          demo={<TypeErrorDemo />}
        />
        <FeatureBlock
          title="One normalized lifecycle"
          href="/docs/guides/lifecycle"
          description="Every provider's status codes collapse to five canonical states, so your app reads the same asset lifecycle no matter what's behind the adapter."
          code={`const { status } = await videos.get(id);
// "waiting_upload" | "uploading"
// "processing" | "ready" | "errored"`}
          demo={<LifecycleDemo />}
        />
        <FeatureBlock
          title="Playback & signed URLs"
          href="/docs/adapters/rehelios"
          description="HLS and DASH manifests, poster thumbnails at any timestamp, and short-lived signed playback URLs — one shape across every backend."
          code={`const { hls, dash } = await videos.playback(id);
const poster = videos.thumbnail(id, { time: 3 });
const url = await videos.signedPlayback(id, {
  expiresInSeconds: 3600,
});`}
          demo={<PlayerDemo />}
        />
      </div>
    </section>
  );
}

function CapabilitiesMatrix() {
  const columns = [
    { id: 'rehelios', label: 'Rehelios' },
    { id: 'mux', label: 'Mux' },
    { id: 'bunny', label: 'Bunny' },
    { id: 'cloudflare', label: 'Cloudflare' },
  ] as const;
  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <SectionHeading
        label="Honest by design"
        title={<>One interface, <span className="font-serif-accent text-fd-primary">honest</span> about the differences.</>}
        description="Where a provider can't do something, the SDK says so — in the types and in this table."
      />
      <div className="mt-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-fd-border border-b">
              <th className="py-3 pr-4 text-left font-medium text-fd-muted-foreground">Capability</th>
              {columns.map((column) => (
                <th key={column.id} className="px-4 py-3 text-center font-medium">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((row) => (
              <tr key={row.name} className="border-fd-border/60 border-b">
                <td className="py-3 pr-4 text-fd-muted-foreground">{row.name}</td>
                {columns.map((column) => (
                  <td key={column.id} className="px-4 py-3 text-center">
                    {row[column.id] ? <Check className="mx-auto size-4 text-fd-primary" /> : <span className="text-fd-muted-foreground">—</span>}
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

function FooterCTA() {
  return (
    <section className="flex flex-col items-center border-fd-border border-t px-4 py-24 text-center">
      <h2 className="text-balance font-semibold text-4xl tracking-tight">
        Ship the video layer <span className="font-serif-accent text-fd-primary">once.</span>
      </h2>
      <p className="mt-4 max-w-lg text-balance text-fd-muted-foreground">
        Open source, MIT licensed, built around web standards. Drop in an adapter and forget the difference.
      </p>
      <div className="mt-8">
        <InstallTabs />
      </div>
    </section>
  );
}

export function Landing() {
  return (
    <main className="flex-1">
      <Hero />
      <ProvidersShowcase />
      <Features />
      <CapabilitiesMatrix />
      <FooterCTA />
    </main>
  );
}
