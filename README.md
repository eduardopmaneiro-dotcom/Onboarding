# Rede Riale — Onboarding & Plano de Carreira (MVP)

Sistema interno de gestão de onboarding (90 dias), plano de carreira, PDI,
checklists, dashboards e trilha de auditoria para a Rede Riale (Brisa Barra,
Imperial e Vilamar). Stack: **Next.js (App Router) + TypeScript + Tailwind +
Prisma + PostgreSQL + NextAuth (Credentials)**.

Regras de negócio extraídas de RH-ONB-01, RH-ONB-02, RH-CAR-01, RH-PDL-01 e
RH-SOP-01 (pasta "onboarding").

## Escopo confirmado x inferido

**Confirmado nos documentos:**
- Onboarding de 90 dias em 8 etapas operacionais, dois macroperíodos
  (Período 1: D-7 a D45 — adaptação/padronização; Período 2: D46 a D90 —
  produtividade/autonomia).
- Pesos de avaliação D45/D90 (Metas 35%, Domínio técnico 25%, POPs 20%,
  Presença 15%, Integração 5%) e alerta para nota < 5,5.
- 7 níveis de carreira (N1–N7) e 7 fatores de promoção com pesos fixos
  (Performance 25%, Competência 20%, Comportamento 15%, Aderência cultural
  10%, Potencial de liderança 10%, PDI 10%, Conduta 10%); nota mínima 70/100;
  janelas em fevereiro/agosto; comitê obrigatório para N5+.
- Critérios de entrada no PDL (avaliação ≥ 8,0 em 2 ciclos, 18+ meses de
  casa, zero advertência em 12 meses, PDI ≥ 80%, indicação do gestor,
  aceite voluntário).
- Critérios de buddy (avaliação ≥ 8,0, 12+ meses, zero advertência em 6
  meses, aceite voluntário).

**Inferido/proposto** (marcado no schema com comentários):
- Nomes exatos de itens de checklist por etapa — o documento descreve o
  conteúdo da jornada, não uma estrutura de dados; foi modelado um
  `ChecklistItemTemplate` por marco citado no texto.
- Requisitos de avanço de carreira (`CareerStage.masteryCriteria`) ficaram
  como texto livre por nível, em vez de regras totalmente estruturadas,
  porque o nível de detalhe varia muito entre trilhas (algumas têm metas
  numéricas, outras são qualitativas).
- RBAC (perfis ADMIN/RH_CORPORATIVO/RH_UNIDADE/GESTOR/COLABORADOR/
  DIRETORIA_READONLY) — não está nos documentos, é requisito do prompt.

## O que está no MVP

- Autenticação (NextAuth Credentials + bcrypt) e RBAC por rota/escopo de dados.
- Estrutura organizacional: unidades, departamentos, cargos, trilhas de carreira.
- Onboarding: template oficial de 8 etapas + processo real por colaborador,
  com checklist gerado a partir do template.
- Checklist compartilhado (onboarding/carreira/PDI) com conclusão e validação.
- PDI com origem, gap, objetivo, executor/acompanhamento e % de conclusão.
- Plano de carreira: trilhas e níveis parametrizados no banco (não hardcoded).
- Dashboard com indicadores por escopo (unidade/gestor/colaborador).
- Trilha de auditoria imutável (`AuditLog`) com ator, papel, valores
  anterior/novo e colaborador impactado.
- Seed com 3 unidades, 1 onboarding real em andamento e 1 usuário por perfil.

## O que fica para a fase 2

- Programa de Desenvolvimento de Lideranças (PDL): schema já modelado
  (`PDLCandidacy`), faltam telas e fluxo de candidatura/comitê.
- `PromotionScore` (cálculo do score de promoção e ata de comitê): schema
  pronto, sem UI.
- Scripts de comunicação (RH-SOP-01) como guias contextuais dentro do app.
- Exportação de relatórios em PDF/Excel.
- Integração real com Sólides (hoje é apenas referenciada nos textos/regras).
- MFA, reset de senha self-service, notificações por e-mail/WhatsApp.
- Reabertura de etapa com fluxo de aprovação dedicado (hoje só o campo existe).

## LGPD — decisões práticas do MVP

- **Minimização**: não há campos de CPF, dados de saúde, dados bancários ou
  biométricos no modelo — apenas o necessário para onboarding/carreira.
- **Escopo por perfil**: toda query de colaboradores passa por
  `employeeScopeWhere()` (`src/lib/scope.ts`), nunca lista além do papel.
- **Auditoria**: qualquer mutação relevante grava em `AuditLog` antes de
  responder ao usuário — base para investigação e para o direito de
  explicação do colaborador.
- **Separação de dados**: dados cadastrais (`Employee`, `Position`) ficam
  separados de dados de desenvolvimento (`PDI`, `Evaluation`, `PDLCandidacy`),
  permitindo políticas de acesso e retenção diferentes no futuro.
- **Lacunas que dependem de governança interna da empresa** (não resolvidas
  só com código):
  - Política de retenção/descarte (ex.: por quanto tempo manter avaliações
    de colaboradores desligados) — recomenda-se definir prazo e automatizar
    expurgo/anonimização.
  - Processo formal de atendimento a titulares (acesso, correção, exclusão).
  - Quem pode exportar relatórios e para onde (hoje a permissão existe no
    RBAC, mas não há DLP/marca d'água nos exports).
  - Acordo de tratamento de dados com a Sólides (terceiro mencionado nos
    documentos como sistema de registro oficial).

## Setup local (Next.js)

```bash
cp .env.example .env   # ajuste DATABASE_URL e gere AUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:migrate     # cria o schema no Postgres
npm run db:seed        # popula unidades, cargos, trilhas, 1 onboarding real e usuários
npm run dev
```

## Versão Python (Django) — `python_app/`

Existe uma segunda implementação do mesmo MVP em **Python/Django + PostgreSQL**,
na pasta `python_app/`. Ela cobre os mesmos módulos centrais (autenticação,
RBAC, escopo por papel, onboarding com checklist, PDI, plano de carreira,
dashboard e auditoria imutável), usando templates server-side (Django
templates) em vez de Next.js/React — não é necessário Node.js para rodá-la.

```bash
cd python_app
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env            # ajuste DJANGO_SECRET_KEY e dados do Postgres
# crie o banco antes (ex.: createdb riale_django ou psql -c "CREATE DATABASE riale_django;")

python manage.py migrate
python manage.py seed_data      # popula unidades, cargos, trilhas, 1 onboarding real e usuários
python manage.py runserver
```

Acesse `http://localhost:8000`. Os usuários de teste são os mesmos da tabela
abaixo (senha `Riale@2026`).

Diferenças relevantes em relação à versão Next.js:
- Frontend renderizado pelo próprio Django (sem build de JS/CSS além do Tailwind via CDN).
- `python_app/core/rbac.py` e `python_app/core/scope.py` equivalem a
  `src/lib/rbac.ts`/`src/lib/scope.ts`.
- `python_app/core/audit.py` (`record_audit()`) equivale a `src/lib/audit.ts`.
- Cobre o mesmo recorte de MVP da seção "O que está no MVP" abaixo; os itens
  da "fase 2" (PDL, PromotionScore, exportação, etc.) também não foram
  portados nesta versão.

Usuários de teste (senha `Riale@2026` para todos, em ambas as versões):

| Papel | E-mail |
|---|---|
| ADMIN | admin@rialehoteis.com.br |
| RH_CORPORATIVO | rh.corporativo@rialehoteis.com.br |
| RH_UNIDADE | rh.brisabarra@rialehoteis.com.br |
| GESTOR | marina.souza@rialehoteis.com.br |
| COLABORADOR | julia.ramos@rialehoteis.com.br |
| DIRETORIA_READONLY | diretoria@rialehoteis.com.br |

## Próximos passos de deploy

- Banco gerenciado (RDS/Cloud SQL/Neon) com backups automáticos.
- `AUTH_SECRET` único por ambiente, nunca commitado.
- Rodar `prisma migrate deploy` no pipeline de deploy (não `migrate dev`).
- Colocar a aplicação detrás de HTTPS com cabeçalhos de segurança padrão do Next.
