export function RialeMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#2b1d14" />
      <rect x="1.5" y="1.5" width="37" height="37" rx="7.5" fill="none" stroke="#b07d4f" strokeWidth="1.2" />
      <path d="M13 29V11h7.2c3.9 0 6.3 2.1 6.3 5.4 0 2.6-1.5 4.4-4 5.1L27.4 29h-3.9l-4.4-7.1h-2.6V29H13Zm3.5-10.1h3.5c2 0 3-.9 3-2.5s-1-2.5-3-2.5h-3.5v5Z" fill="#cfa47a" />
    </svg>
  );
}

export function RialeLogo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <RialeMark />
      <div className="leading-tight">
        <p className={`font-serif text-lg font-semibold tracking-wide ${light ? "text-white" : "text-riale-900"}`}>RIALE</p>
        <p className={`text-[10px] uppercase tracking-[0.25em] ${light ? "text-gold-400" : "text-gold-600"}`}>Hotéis · RH</p>
      </div>
    </div>
  );
}
