import { requirePermission } from "@/lib/session";
import { listSettings } from "@/modules/settings/service";
import { listNotifications } from "@/modules/notifications/service";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { saveSettingAction } from "../actions";

export const metadata = { title: "Sistema e LGPD" };

export default async function SystemPage() {
  await requirePermission("settings.manage");
  const [settings, notifications] = await Promise.all([listSettings(), listNotifications(15)]);
  return (
    <>
      <PageHeader title="Sistema e LGPD" subtitle="Parâmetros gerais, retenção de dados e fila de comunicações." breadcrumb={{ href: "/configuracoes", label: "Configurações" }} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Parâmetros">
          <div className="divide-y divide-slate-100">
            {settings.map((s) => (
              <ActionForm key={s.key} action={saveSettingAction} className="py-3 first:pt-0">
                <input type="hidden" name="key" value={s.key} />
                <label className="label" htmlFor={s.key}>{s.label}</label>
                <div className="flex gap-2">
                  <input id={s.key} name="value" defaultValue={String(s.value)} className="input" />
                  <Submit className="btn-ghost" pendingText="…">Salvar</Submit>
                </div>
                <p className="mt-1 font-mono text-[10px] text-slate-400">{s.key}{s.updatedBy && ` · alterado por ${s.updatedBy}`}</p>
              </ActionForm>
            ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="Backups">
            <ul className="space-y-2 text-sm text-slate-600">
              <li>• Backup lógico do PostgreSQL: <code className="rounded bg-slate-100 px-1 text-xs">npm run db:backup</code> (pg_dump comprimido, rotação automática, cifra GPG opcional).</li>
              <li>• Restauração: <code className="rounded bg-slate-100 px-1 text-xs">npm run db:restore -- &lt;arquivo&gt;</code>.</li>
              <li>• Documentos: gravados cifrados (AES-256-GCM) no próprio banco — entram no mesmo backup. Em produção (Neon), há também restauração para um ponto no tempo.</li>
              <li>• Recomendação para produção: agendar diariamente (cron) e copiar para armazenamento externo com retenção de 30 dias.</li>
            </ul>
          </Card>
          <Card title="Fila de notificações (últimas)">
            {notifications.length === 0 ? (
              <Empty>Nenhuma notificação.</Empty>
            ) : (
              <TableWrap>
                <table className="table">
                  <thead><tr><th>Quando</th><th>Modelo</th><th>Destinatário</th><th>Status</th></tr></thead>
                  <tbody>
                    {notifications.map((n) => (
                      <tr key={n.id}>
                        <td className="whitespace-nowrap text-xs">{n.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                        <td className="font-mono text-xs">{n.template}</td>
                        <td className="text-xs">{n.recipientEmail}</td>
                        <td><Badge tone={n.status === "ENVIADA" ? "green" : n.status === "FALHOU" ? "red" : "gold"}>{n.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            <p className="mt-6 text-xs text-slate-400">O envio por SMTP entra na fase de comunicações automáticas; até lá as mensagens ficam enfileiradas.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
