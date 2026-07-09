'use client';

import { AlertTriangle, Loader2, TvMinimalPlay, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createVideos } from 'videos-sdk';
import { rehelios } from 'videos-sdk/rehelios';

type Phase = 'idle' | 'uploading' | 'processing' | 'ready' | 'errored';

interface StoredAsset {
  readonly id: string;
  readonly name: string;
  readonly expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const POLL_MS = 2500;
const STORAGE_KEY = 'videos-sdk:demo-asset';

const DEMO_API_URL = process.env.NEXT_PUBLIC_DEMO_API_URL;
const APP_URL = process.env.NEXT_PUBLIC_REHELIOS_APP_URL ?? 'https://app.rehelios.com';

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function readStored(): StoredAsset | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { id, name, expiresAt } = parsed as Partial<StoredAsset>;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof expiresAt !== 'number') {
      return null;
    }
    return { id, name, expiresAt };
  } catch {
    return null;
  }
}

function writeStored(asset: StoredAsset): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(asset));
}

function clearStored(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

function TryForFreeArrow() {
  return (
    <div className="pointer-events-none absolute -top-16 right-0 hidden select-none items-start gap-1 text-fd-primary sm:flex">
      <span className="-rotate-3 mt-3 font-serif-accent text-2xl italic">try it for free</span>
      <svg viewBox="0 0 80 60" aria-hidden="true" className="h-16 w-20 shrink-0">
        <title>Arrow pointing at the uploader</title>
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M72 6c2 14-4 22-14 20-6-1-7-8-1-9 7-1 10 8 6 17-3 7-11 12-21 14" />
          <path d="M42 48l11-1" />
          <path d="M42 48l8-8" />
        </g>
      </svg>
    </div>
  );
}

export function VideoDemo() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [assetId, setAssetId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(TTL_MS);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const videos = useMemo(
    () =>
      createVideos({
        adapter: rehelios({
          apiKey: 'public-demo',
          apiBaseUrl: DEMO_API_URL ?? '',
          appUrl: APP_URL,
        }),
      }),
    [],
  );

  const reset = useCallback(() => {
    clearStored();
    setPhase('idle');
    setProgress(0);
    setFileName('');
    setAssetId(null);
    setExpiresAt(null);
    setRemaining(TTL_MS);
    setError(null);
  }, []);

  useEffect(() => {
    const stored = readStored();
    if (!stored) return;
    if (stored.expiresAt <= Date.now()) {
      clearStored();
      return;
    }
    setAssetId(stored.id);
    setFileName(stored.name);
    setExpiresAt(stored.expiresAt);
    setPhase('processing');
  }, []);

  useEffect(() => {
    if (assetId === null || phase !== 'processing') return;

    let cancelled = false;

    const poll = async () => {
      try {
        const asset = await videos.get(assetId);
        if (cancelled) return;
        if (asset.status === 'ready') setPhase('ready');
        else if (asset.status === 'errored') setPhase('errored');
      } catch {
        if (!cancelled) reset();
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [assetId, phase, videos, reset]);

  useEffect(() => {
    if (expiresAt === null) return;
    const tick = () => {
      const left = expiresAt - Date.now();
      setRemaining(left);
      if (left <= 0) reset();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, reset]);

  async function handleFile(file: File | undefined) {
    if (!file || !file.type.startsWith('video/')) return;
    if (!DEMO_API_URL) {
      setError('The demo endpoint is not configured.');
      setPhase('errored');
      return;
    }

    setFileName(file.name);
    setPhase('uploading');
    setProgress(0);
    setError(null);

    try {
      const asset = await videos.upload(file.name, file, {
        contentType: file.type,
        onProgress: ({ bytesUploaded, bytesTotal }) =>
          setProgress(Math.round((bytesUploaded / bytesTotal) * 100)),
      });

      const createdAt = asset.createdAt?.getTime() ?? Date.now();
      const stored: StoredAsset = { id: asset.id, name: file.name, expiresAt: createdAt + TTL_MS };
      writeStored(stored);

      setAssetId(asset.id);
      setExpiresAt(stored.expiresAt);
      if (asset.status === 'errored') {
        setError('The upload failed to process.');
        setPhase('errored');
      } else {
        setPhase(asset.status === 'ready' ? 'ready' : 'processing');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The upload failed.');
      setPhase('errored');
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-xl">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {phase === 'idle' && (
        <>
          <TryForFreeArrow />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`flex w-full flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center transition-colors ${
              dragging
                ? 'border-fd-primary bg-fd-primary/5'
                : 'border-fd-border bg-fd-card hover:bg-fd-secondary/50'
            }`}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-fd-primary/10 text-fd-primary">
              <Upload className="size-5" />
            </span>
            <span className="font-medium text-sm">Drop a video, or click to upload</span>
            <span className="text-fd-muted-foreground text-xs">
              Uploaded with videos-sdk to Rehelios. Deleted automatically after 10 minutes.
            </span>
          </button>
        </>
      )}

      {(phase === 'uploading' || phase === 'processing') && (
        <div className="rounded-xl border border-fd-border bg-fd-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 truncate font-medium text-sm">
              <TvMinimalPlay className="size-4 shrink-0 text-fd-primary" />
              <span className="truncate">{fileName}</span>
            </span>
            {phase === 'uploading' ? (
              <span className="font-mono text-fd-muted-foreground text-xs">{progress}%</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-fd-primary/15 px-2 py-0.5 font-mono text-[11px] text-fd-primary">
                <Loader2 className="size-3 animate-spin" />
                processing
              </span>
            )}
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-fd-secondary">
            <div
              className="h-full rounded-full bg-fd-primary transition-[width] duration-200"
              style={{ width: `${phase === 'processing' ? 100 : progress}%` }}
            />
          </div>
          <p className="mt-3 font-mono text-[11px] text-fd-muted-foreground">
            {phase === 'uploading'
              ? 'await videos.upload(...) — status: "uploading"'
              : 'await videos.get(id) — status: "processing"'}
          </p>
        </div>
      )}

      {phase === 'ready' && assetId !== null && (
        <div className="overflow-hidden rounded-xl border border-fd-border bg-fd-card">
          <iframe
            src={`${APP_URL}/embed/${assetId}`}
            title={fileName}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="aspect-video w-full bg-black"
          />
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
              ready
            </span>
            <span className="truncate text-fd-muted-foreground text-xs">{fileName}</span>
            <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-fd-muted-foreground">
              auto-deletes in {formatTime(remaining)}
            </span>
            <button
              type="button"
              onClick={reset}
              aria-label="Remove"
              className="rounded-md p-1 text-fd-muted-foreground transition-colors hover:bg-fd-secondary hover:text-fd-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {phase === 'errored' && (
        <div className="flex items-center gap-3 rounded-xl border border-fd-border bg-fd-card p-5">
          <AlertTriangle className="size-4 shrink-0 text-red-500" />
          <span className="truncate text-sm">{error ?? 'The upload failed.'}</span>
          <button
            type="button"
            onClick={reset}
            className="ml-auto rounded-md border border-fd-border px-2.5 py-1 text-xs transition-colors hover:bg-fd-secondary"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
