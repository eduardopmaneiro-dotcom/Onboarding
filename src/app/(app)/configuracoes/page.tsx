import Link from "next/link";
import { requirePermission } from "@/lib/session";
import type { PermissionCode } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Configurações" };

const SETTINGS_SECTIONS: Array<{ href: string; label: string; description: string; permission: PermissionCode }> = [
  { href: "/configuracoes/unidades", label: "Unidades", description: "Hotéis do grupo: Brisa Barra, Imperial, Vilamar e futuras aberturas.", permission: "org.manage" },
  { href: "/configuracoes/departamentos", label: "Departamentos", description: "Áreas de cada unidade (Recepção, Governança, A&B…).", permission: "org.manage" },
  { href: "/cargos", label: "Cargos", description: "Catálogo corporativo de cargos por nível e trilha.", permission: "carreira.view" },
  { href: "/configuracoes/gestores", label: "Gestores e superiores", description: "Gestores por departamento, com e-mail e superior direto.", permission: "managers.manage" },
  { href: "/configuracoes/usuarios", label: "Usuários", description: "Acessos ao sistema: Administrador, RH e Gestor.", permission: "users.view" },
  { href: "/configuracoes/permissoes", label: "Permissões", description: "Matriz de permissões por perfil.", permission: "permissions.manage" },
  { href: "/configuracoes/auditoria", label: "Auditoria", description: "Trilha imutável de ações, acessos e dados pessoais consultados.", permission: "audit.view" },
  { href: "/configuracoes/motivos", label: "Motivos de reprovação", description: "Lista padronizada usada no registro de resultados.", permission: "settings.manage" },
  { href: "/configuracoes/sistema", label: "Sistema e LGPD", description: "Parâmetros gerais, retenção de dados, notificações e backups.", permission: "settings.manage" },
];

export default async function SettingsIndex() {
  const user = await requirePermission("configuracoes.view");
  const sections = SETTINGS_SECTIONS.filter((s) => user.permissions.has(s.permission));
  return (
    <>
      <PageHeader title="Configurações" subtitle="Estrutura organizacional, acessos e segurança da plataforma." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.href} href={s.href} className="card p-5 transition hover:border-gold-400 hover:shadow-md">
            <p className="font-serif text-xl text-riale-900">{s.label}</p>
            <p className="mt-1 text-sm text-stone-500">{s.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
