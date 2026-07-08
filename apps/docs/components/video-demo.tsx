'use client';

import { Loader2, TvMinimalPlay, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'uploading' | 'processing' | 'ready';

const TTL_SECONDS = 600; // auto-delete after 10 minutes

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoDemo() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [remaining, setRemaining] = useState(TTL_SECONDS);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timers = useRef<number[]>([]);

  function clearTimers() {
    for (const t of timers.current) {
      window.clearInterval(t);
      window.clearTimeout(t);
    }
    timers.current = [];
  }

  function revoke() {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }

  function reset() {
    clearTimers();
    revoke();
    setPhase('idle');
    setProgress(0);
    setFileName('');
    setRemaining(TTL_SECONDS);
  }

  function startCountdown() {
    setRemaining(TTL_SECONDS);
    const tick = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          reset();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    timers.current.push(tick);
  }

  function handleFile(file: File | undefined) {
    if (!file || !file.type.startsWith('video/')) return;
    clearTimers();
    revoke();

    urlRef.current = URL.createObjectURL(file);
    setFileName(file.name);
    setPhase('uploading');
    setProgress(0);

    const up = window.setInterval(() => {
      setProgress((p) => {
        const next = Math.min(100, p + Math.random() * 16 + 7);
        if (next >= 100) {
          window.clearInterval(up);
          setPhase('processing');
          const proc = window.setTimeout(() => {
            setPhase('ready');
            startCountdown();
          }, 1300);
          timers.current.push(proc);
        }
        return next;
      });
    }, 190);
    timers.current.push(up);
  }

  useEffect(() => {
    if (phase === 'ready' && videoRef.current && urlRef.current) {
      videoRef.current.src = urlRef.current;
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      clearTimers();
      revoke();
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-xl">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {phase === 'idle' && (
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
            handleFile(e.dataTransfer.files?.[0]);
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
            Runs entirely in your browser — nothing is uploaded. Auto-clears after 10 min.
          </span>
        </button>
      )}

      {(phase === 'uploading' || phase === 'processing') && (
        <div className="rounded-xl border border-fd-border bg-fd-card p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 truncate font-medium text-sm">
              <TvMinimalPlay className="size-4 shrink-0 text-fd-primary" />
              <span className="truncate">{fileName}</span>
            </span>
            {phase === 'uploading' ? (
              <span className="font-mono text-fd-muted-foreground text-xs">
                {Math.round(progress)}%
              </span>
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

      {phase === 'ready' && (
        <div className="overflow-hidden rounded-xl border border-fd-border bg-fd-card">
          {/** biome-ignore lint/a11y/useMediaCaption: user-provided demo clip */}
          <video ref={videoRef} controls playsInline className="aspect-video w-full bg-black">
            <track kind="captions" />
          </video>
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
    </div>
  );
}
