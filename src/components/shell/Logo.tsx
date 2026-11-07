export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 64 64" className="h-8 w-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="mimo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="#0a0c11" />
        <path d="M14 46V18l18 18 18-18v28" fill="none" stroke="url(#mimo-g)" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-wide">MIMO AGENT</p>
        <p className="text-[11px] text-muted">Your Digital Workforce</p>
      </div>
    </div>
  );
}
