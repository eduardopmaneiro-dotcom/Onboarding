import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions, breadcrumb }: { title: string; subtitle?: string; actions?: ReactNode; breadcrumb?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {breadcrumb && (
          <Link href={breadcrumb.href} className="text-xs font-medium text-gold-600 hover:underline">
            ← {breadcrumb.label}
          </Link>
        )}
        <h1 className="font-serif text-3xl font-semibold text-riale-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "", actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-riale-900">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  gray: "bg-stone-100 text-stone-600 ring-stone-200",
  gold: "bg-gold-100 text-gold-600 ring-gold-400/40",
  blue: "bg-riale-100 text-riale-700 ring-riale-600/20",
  red: "bg-red-50 text-red-700 ring-red-200",
} as const;

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function StatusBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? "green" : "gray"}>{active ? "Ativo" : "Inativo"}</Badge>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-stone-400">{children}</p>;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-5 -my-5 overflow-x-auto">{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-2 font-serif text-3xl font-semibold text-riale-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
    </div>
  );
}
