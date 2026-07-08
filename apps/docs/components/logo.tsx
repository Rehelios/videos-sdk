export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" role="img">
        <rect width="24" height="24" rx="6" fill="var(--color-fd-primary)" />
        <path d="M9.4 8v8l6.2-4-6.2-4Z" fill="var(--color-fd-primary-foreground)" />
      </svg>
      <span className="font-semibold text-[15px] tracking-tight">Videos SDK</span>
    </span>
  );
}
