import Link from "next/link";

const TABS = [
  { href: "/remuneracao", label: "Remuneração e custo" },
  { href: "/remuneracao/cargos", label: "Tabela por cargo" },
  { href: "/remuneracao/beneficios", label: "Benefícios" },
  { href: "/remuneracao/elogios", label: "Elogio Premiado" },
  { href: "/remuneracao/ppr", label: "PPR" },
  { href: "/remuneracao/parametros", label: "Encargos e rubricas" },
];

export function RemTabs({ active }: { active: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 text-sm" aria-label="Seções da remuneração">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`rounded-lg px-3 py-1.5 ${active === t.href ? "bg-riale-800 text-white" : "text-stone-600 hover:bg-riale-50"}`}>{t.label}</Link>
      ))}
    </nav>
  );
}

export const brl = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const moneyInput = (v: unknown) => (v === null || v === undefined || v === "" ? "" : Number(v).toFixed(2).replace(".", ","));
