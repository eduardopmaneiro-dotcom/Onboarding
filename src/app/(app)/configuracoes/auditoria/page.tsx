import Link from "next/link";
import { AuditAction } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { listAudit } from "@/modules/audit/service";
import { Badge, Card, Empty, PageHeader, TableWrap } from "@/components/ui";

export const metadata = { title: "Auditoria" };

const SENSITIVE = new Set<string>(["PII_ACCESS", "DOCUMENT_DOWNLOAD", "PERMISSION_CHANGE", "ACCESS_DENIED", "LOGIN_FAILED", "PASSWORD_RESET"]);

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ acao?: string; entidade?: string; p?: string }> }) {
  const user = await requirePermission("audit.view");
  const sp = await searchParams;
  const { rows, total, page, pages } = await listAudit(user, { action: sp.acao, entityType: sp.entidade, page: Number(sp.p) || 1 });
  const qs = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ acao: sp.acao, entidade: sp.entidade, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `?${q}`;
  };

  return (
    <>
      <PageHeader title="Trilha de auditoria" subtitle={`${total} registro(s). Somente inserção — o banco bloqueia alteração e exclusão.`} breadcrumb={{ href: "/configuracoes", label: "Configurações" }} />
      <Card
        actions={
          <form className="flex gap-2">
            <select name="acao" defaultValue={sp.acao ?? ""} className="input py-1 text-xs">
              <option value="">Todas as ações</option>
              {Object.values(AuditAction).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button className="btn-ghost btn-sm">Filtrar</button>
          </form>
        }
        title="Eventos"
      >
        {rows.length === 0 ? (
          <Empty>Nenhum evento.</Empty>
        ) : (
          <TableWrap>
            <table className="table">
              <thead><tr><th>Data/hora</th><th>Ação</th><th>Entidade</th><th>Autor</th><th>Origem</th><th>Detalhes</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-xs">{r.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                    <td><Badge tone={SENSITIVE.has(r.action) ? "red" : "blue"}>{r.action}</Badge></td>
                    <td className="text-xs"><Link href={qs({ entidade: r.entityType, p: undefined })} className="hover:underline">{r.entityType}</Link><p className="font-mono text-[10px] text-stone-400">{r.entityId}</p></td>
                    <td className="text-xs">{r.actor?.name ?? "—"}{r.actorRole && <p className="text-[10px] text-stone-400">{r.actorRole}</p>}</td>
                    <td className="font-mono text-[10px] text-stone-500">{r.ip ?? "—"}</td>
                    <td className="max-w-xs">
                      {(r.newValue || r.previousValue || r.justification) && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-gold-600">ver</summary>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2 text-[10px]">{JSON.stringify({ antes: r.previousValue, depois: r.newValue, justificativa: r.justification }, null, 1)}</pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <div className="mt-8 flex items-center justify-between text-xs text-stone-500">
          <span>Página {page} de {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="btn-ghost btn-sm" href={qs({ p: String(page - 1) })}>Anterior</Link>}
            {page < pages && <Link className="btn-ghost btn-sm" href={qs({ p: String(page + 1) })}>Próxima</Link>}
          </div>
        </div>
      </Card>
    </>
  );
}
