"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { RialeLogo } from "@/components/brand";

export type NavItem = { href: string; label: string; icon: string; ready: boolean; group: string; groupLabel: string; badge?: number };

const ICONS: Record<string, string> = {
  dashboard: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  briefcase: "M10 3h4a2 2 0 0 1 2 2v2h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1h4V5a2 2 0 0 1 2-2Zm0 4h4V5h-4v2Z",
  users: "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 1c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4ZM8 14c-.3 0-.7 0-1.1.1A4.7 4.7 0 0 1 9 17v3H1v-3c0-2 4-3 7-3Z",
  calendar: "M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm-2 8h14v10H5V10Z",
  check: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm-1.2 14.6-4.3-4.3 1.4-1.4 2.9 2.9 5.9-5.9 1.4 1.4-7.3 7.3Z",
  upload: "M5 20h14v-2H5v2Zm7-16-6 6h4v6h4v-6h4l-6-6Z",
  clipboard: "M9 2h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1Zm1 2v2h4V4h-4Zm-2 8 3 3 5-6-1.4-1.2L11 12.2 9.4 10.6 8 12Z",
  id: "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm5 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm-4 9h8c0-2-2-3-4-3s-4 1-4 3Zm10-8v2h6V9h-6Zm0 4v2h4v-2h-4Z",
  money: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15.9V19h-2v-1.1a3.6 3.6 0 0 1-3-3.3h2c.1.9.8 1.5 2 1.5 1.3 0 1.8-.6 1.8-1.2 0-.8-.6-1.2-2.2-1.6-1.9-.5-3.3-1.2-3.3-3 0-1.5 1.2-2.5 2.7-2.8V6.4h2v1.1a3.2 3.2 0 0 1 2.6 3.1h-2c-.1-.9-.6-1.4-1.6-1.4s-1.6.5-1.6 1.1.5 1 2 1.4c1.6.4 3.5 1 3.5 3.2 0 1.6-1.2 2.6-2.9 3Z",
  chart: "M3 3h2v16h16v2H3V3Zm4 10h3v5H7v-5Zm5-6h3v11h-3V7Zm5 3h3v8h-3v-8Z",
  ladder: "M6 2h2v3h8V2h2v20h-2v-3H8v3H6V2Zm2 5v3h8V7H8Zm0 5v3h8v-3H8Z",
  report: "M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V8h4.5L14 3.5ZM8 12v6h2v-6H8Zm3 2v4h2v-4h-2Zm3-3v7h2v-7h-2Z",
  gear: "M19.4 13a7.8 7.8 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.8 7.8 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.4-2.7a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13ZM13 15.5A3.5 3.5 0 1 1 16.5 12 3.5 3.5 0 0 1 13 15.5Z",
};

function Icon({ name, active }: { name: string; active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-[18px] w-[18px] shrink-0 ${active ? "fill-gold-400" : "fill-riale-100/55 group-hover:fill-gold-400"}`} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Sidebar({
  items, user, logout, quickActions,
}: {
  items: NavItem[];
  user: { name: string; roleLabel: string; scope: string };
  logout: () => Promise<void>;
  quickActions: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showFuture, setShowFuture] = useState(false);
  const ready = items.filter((i) => i.ready);
  const future = items.filter((i) => !i.ready);
  const groups = [...new Set(ready.map((i) => i.group))];

  const link = (item: NavItem) => {
    const active = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition ${
          active ? "bg-white/10 font-medium text-white shadow-[inset_3px_0_0_var(--color-gold-500)]" : item.ready ? "text-riale-100/85 hover:bg-white/5 hover:text-white" : "text-riale-100/45 hover:text-riale-100/70"
        }`}
      >
        <Icon name={item.icon} active={active} />
        <span className="flex-1">{item.label}</span>
        {!!item.badge && <span className="rounded-full bg-gold-500 px-2 py-0.5 text-[11px] font-semibold text-white">{item.badge}</span>}
      </Link>
    );
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-riale-900 px-4 py-3 lg:hidden">
        <RialeLogo light />
        <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2 text-white hover:bg-white/10" aria-label="Abrir menu">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current"><path d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z" /></svg>
        </button>
      </header>
      {open && <div className="fixed inset-0 z-40 bg-riale-950/60 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-gradient-to-b from-riale-900 to-riale-950 transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <RialeLogo light />
          <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-white/70 hover:text-white lg:hidden" aria-label="Fechar menu">✕</button>
        </div>

        {quickActions.length > 0 && (
          <div className="grid grid-cols-2 gap-2 px-4 pb-3">
            {quickActions.map((a) => (
              <Link key={a.href} href={a.href} onClick={() => setOpen(false)} className="rounded-lg bg-gold-500 px-2 py-2 text-center text-xs font-semibold text-white shadow-sm hover:bg-gold-600">
                {a.label}
              </Link>
            ))}
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Menu principal">
          {groups.map((g) => {
            const list = ready.filter((i) => i.group === g);
            return (
              <div key={g} className="mt-3 first:mt-1">
                {list[0].groupLabel && <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gold-400/80">{list[0].groupLabel}</p>}
                <div className="space-y-0.5">{list.map(link)}</div>
              </div>
            );
          })}
          {future.length > 0 && (
            <div className="mt-5 border-t border-white/10 pt-3">
              <button type="button" onClick={() => setShowFuture((v) => !v)} className="flex w-full items-center justify-between px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-riale-100/40 hover:text-riale-100/70">
                Próximas fases ({future.length}) <span>{showFuture ? "−" : "+"}</span>
              </button>
              {showFuture && <div className="space-y-0.5">{future.map(link)}</div>}
            </div>
          )}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-gold-400">{user.roleLabel} · {user.scope}</p>
          <div className="mt-3 flex gap-4 text-xs">
            <Link href="/trocar-senha" className="text-riale-100/70 hover:text-white">Alterar senha</Link>
            <form action={logout}><button type="submit" className="text-riale-100/70 hover:text-white">Sair</button></form>
          </div>
        </div>
      </aside>
    </>
  );
}
