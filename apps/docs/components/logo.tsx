import { TvMinimalPlay } from 'lucide-react';

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <TvMinimalPlay className="size-[22px] text-fd-foreground" />
      <span className="font-semibold text-[15px] tracking-tight">Videos SDK</span>
    </span>
  );
}
