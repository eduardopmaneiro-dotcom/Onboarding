import type { ReactNode } from "react";
import { RialeLogo } from "@/components/brand";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-riale-900 via-riale-950 to-riale-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border border-gold-500/20" />
        <div className="absolute -right-16 -top-16 h-96 w-96 rounded-full border border-gold-500/10" />
        <RialeLogo light />
        <div className="relative max-w-md">
          <p className="font-serif text-4xl leading-tight text-white">Pessoas que fazem a hospitalidade acontecer.</p>
          <p className="mt-4 text-sm text-riale-100/70">Plataforma interna de Recursos Humanos · Brisa Barra · Imperial · Vilamar</p>
        </div>
        <p className="relative text-xs text-riale-100/40">Acesso restrito a colaboradores autorizados. Todas as ações são registradas.</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <RialeLogo />
          </div>
          <h1 className="font-serif text-3xl font-semibold text-riale-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
