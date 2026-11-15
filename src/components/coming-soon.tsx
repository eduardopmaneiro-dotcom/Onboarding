import { notFound } from "next/navigation";
import { NAVIGATION } from "@/lib/navigation";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/ui";

/** Página de módulo planejado: protegida pela mesma permissão que o módulo terá. */
export async function ComingSoon({ href, prepared }: { href: string; prepared: string[] }) {
  const item = NAVIGATION.find((n) => n.href === href);
  if (!item) notFound();
  await requirePermission(item.permission);
  return (
    <>
      <PageHeader title={item.label} subtitle={item.description} />
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-6 p-8 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gold-100 text-2xl text-gold-600">⌛</div>
          <div>
            <span className="inline-flex rounded-full bg-riale-100 px-2.5 py-0.5 text-xs font-medium text-riale-700">{item.phase}</span>
            <h2 className="mt-2 font-serif text-2xl text-riale-900">Módulo em desenvolvimento</h2>
            <p className="mt-1 max-w-2xl text-sm text-stone-500">
              A estrutura de dados, as permissões e a rota já estão prontas; as telas e regras de negócio entram na próxima etapa do projeto.
            </p>
          </div>
        </div>
        <div className="border-t border-stone-100 bg-stone-50/60 px-8 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Já preparado na fundação</p>
          <ul className="mt-2 grid gap-1 text-sm text-stone-600 sm:grid-cols-2">
            {prepared.map((p) => (
              <li key={p} className="flex gap-2">
                <span className="text-gold-500">✓</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
