# Arquitetura — Riale RH (Fase 1: Fundação)

## 1. Ponto de partida

O repositório já tinha um MVP de onboarding e plano de carreira em **Next.js + Prisma +
PostgreSQL** e uma cópia do mesmo MVP em **Django** (`python_app/`). A Fase 1 seguiu
estes critérios:

| Item existente | Decisão | Motivo |
|---|---|---|
| Stack Next.js + Prisma + PostgreSQL | **Mantida e evoluída** | Moderna, tipada de ponta a ponta, um único deploy para interface e API |
| Modelos de onboarding (8 etapas), PDI, avaliações D45/D90, PDL, score de promoção, trilhas | **Preservados no schema** | São a base dos módulos de Admissões e Carreira; o conteúdo dos documentos RH-ONB/RH-CAR foi mantido no seed |
| 6 perfis antigos (RH_CORPORATIVO, RH_UNIDADE, COLABORADOR, DIRETORIA…) | **Substituídos por ADMIN / RH / GESTOR** | Pedido da fase. "RH de unidade" virou RH com unidade definida (escopo), sem perfil próprio |
| Login por e-mail | **Substituído por CPF + senha** | Pedido da fase |
| Telas antigas de onboarding, PDI e checklist | **Removidas** | Não fazem parte do novo menu; voltam nos módulos de Admissões e Colaboradores sobre o mesmo schema |
| `python_app/` (Django) | **Congelado como legado** (ver `python_app/LEGADO.md`) | Duas implementações paralelas dobram o custo de manutenção e criam duas fontes de verdade. Recomendo remover após validação |

## 2. Visão geral

```
Navegador ──HTTPS──▶ Next.js (App Router, Node)
                       │
                       ├─ proxy.ts ............ barreira de sessão (redireciona/401)
                       ├─ app/(app)/* ......... páginas (Server Components) + server actions
                       ├─ app/api/v1/* ........ API interna JSON (mesmas regras)
                       │        ▼
                       ├─ modules/<módulo>/service.ts   ← ÚNICA porta de entrada das regras
                       │     validação (zod) · permissão · escopo · auditoria
                       │        ▼
                       ├─ lib/ (auth, sessão, cripto, CPF, auditoria, permissões)
                       │        ▼
                       └─ Prisma ──▶ PostgreSQL (FKs, CHECKs, triggers de imutabilidade)
                                    (documentos cifrados AES-256-GCM em DocumentBlob)
```

**Princípio central:** a interface e a API chamam a **mesma camada de serviço**. Validação,
checagem de permissão, escopo por unidade e auditoria ficam no serviço, não na tela. Uma
integração futura (aplicativo, BI, Sólides, folha) herda as mesmas proteções sem retrabalho.

### Módulos independentes

Cada módulo em `src/modules/` tem `service.ts` com o esquema de validação e as funções de
negócio. Ele depende só de `lib/` e de `modules/shared/`. Para criar o módulo de
Recrutamento basta:

1. criar `src/modules/recruitment/service.ts`;
2. substituir o `ComingSoon` das páginas `vagas/`, `candidatos/` e `entrevistas/`;
3. expor rotas em `src/app/api/v1/job-openings/…`;
4. marcar `ready: true` em `src/lib/navigation.ts`.

As tabelas (`JobOpening`, `Candidate`, `Application`, `Interview`) e as permissões já existem.

### Decisões técnicas

| Decisão | Alternativa descartada | Justificativa |
|---|---|---|
| Monólito modular (Next.js) | Microsserviços / backend separado | Equipe pequena e escala de ~225 pessoas + candidatos: um deploy e um banco reduzem custo e risco. A separação por módulos permite extrair serviços no futuro, se a escala exigir |
| PostgreSQL | MySQL / NoSQL | Relacional (pedido), com CHECK, triggers e JSONB para auditoria; suporte gerenciado em todas as nuvens |
| Prisma ORM | SQL manual | Tipagem gerada do schema e migrações versionadas. Regras que o Prisma não expressa (triggers, CHECKs) ficam em migração SQL própria |
| Server Components + server actions | SPA + REST para tudo | Menos JavaScript no cliente e menos superfície de ataque; a API REST existe para integrações |
| Sessão JWT (NextAuth v5), revalidada no banco a cada requisição | Sessão só no JWT | Desativar um usuário ou trocar a senha **corta o acesso imediatamente**, sem esperar o token expirar |
| Permissões no banco (matriz editável) | Permissões fixas no código | O ADMIN ajusta sem deploy. Regras estruturais (anti-escalonamento, escopo) ficam no código e não são editáveis |
| Catálogo **corporativo** de cargos (sem vínculo com unidade) | Cargo por departamento/unidade | "Recepcionista" é o mesmo cargo nas três unidades. Isso é pré-requisito para faixas salariais, pesquisa salarial e plano de carreira comparáveis, e para abrir novos hotéis sem duplicar cadastro |

## 3. Modelo de dados

### Estrutura organizacional (sem duplicação)

```
Unit 1─* Department 1─* Manager *─1 Position (catálogo corporativo)
                    │        └─ directSuperiorId → Manager   (hierarquia)
                    │        └─ userId → User (login opcional, perfil GESTOR)
                    └─* Employee *─1 Position
                              └─ managerId → Manager
User *─1 Unit   (RH de unidade; nulo = corporativo)
```

- **A unidade nunca é gravada no gestor nem no colaborador**: ela vem do departamento.
  Mudar um departamento de unidade não deixa dados inconsistentes.
- **Mais de um gestor por departamento**: `Manager.departmentId` não é único.
- **Gestor ≠ usuário**: todo gestor tem cadastro (nome, CPF ou matrícula, cargo,
  departamento, unidade derivada, e-mail), mas só recebe login se precisar. O e-mail do
  gestor é o destinatário das comunicações automáticas futuras.
- **Superior direto**: auto-relacionamento em `Manager`. O serviço impede ciclos
  (A→B→A) e o banco impede que alguém seja superior de si mesmo.

### Tabelas por área

| Área | Tabelas |
|---|---|
| Acesso | `User`, `Permission`, `RolePermission`, `PasswordResetToken` |
| Estrutura | `Unit`, `Department`, `Position`, `CareerTrack`, `CareerStage`, `StageRequirement`, `Manager` |
| Pessoas | `Employee`, `MovementHistory` (somente inserção) |
| Recrutamento (pronto para a Fase 2) | `JobOpening`, `Candidate`, `Application`, `Interview` |
| Plataforma | `Notification` (fila/outbox), `Setting`, `Document`, `AuditLog` (somente inserção) |
| Onboarding/carreira (preservados) | `OnboardingTemplate`, `OnboardingStageTemplate`, `ChecklistItemTemplate`, `OnboardingProcess`, `OnboardingStage`, `ChecklistItem`, `Evaluation`, `WellbeingCheck`, `PDI`, `PDLCandidacy`, `PromotionScore`, `BuddyEligibility` |

Todas as tabelas usam chave primária `cuid` e chaves estrangeiras reais (mais de 40). Os
testes verificam que não há órfãos e que a exclusão de registros referenciados é recusada.

### Travas no banco (`migrations/*_protecoes_banco`)

| Trava | Efeito |
|---|---|
| Trigger `audit_log_immutable` | `UPDATE`/`DELETE` em `AuditLog` são recusados, mesmo por acesso direto ao banco |
| Trigger `movement_history_immutable` | Idem para o histórico de movimentações |
| `manager_identification_chk` | Gestor precisa de CPF **ou** matrícula |
| `manager_not_self_superior_chk` | Gestor não pode ser o próprio superior |
| `*_cpf_pair_chk` | CPF cifrado e hash sempre juntos |
| `unit_code_format_chk`, `job_opening_headcount_chk` | Integridade de valores |

## 4. Autenticação e perfis

- **Login: CPF + senha.** A senha é obrigatória para todos. Não existe caminho de login só
  com CPF, e o teste E2E confirma isso diretamente no endpoint de autenticação.
- **O CPF não protege nada sozinho**: é um dado semipúblico. A segurança vem da senha,
  por isso:
  - política de senha: 10+ caracteres com maiúscula, minúscula e número; **ADMIN: 12+ e
    símbolo**;
  - bcrypt com custo 12;
  - **bloqueio de 15 minutos após 5 erros**;
  - tempo de resposta constante para CPF inexistente (impede descobrir quem tem conta);
  - mensagem genérica ("CPF ou senha inválidos");
  - **troca obrigatória no primeiro acesso** quando a senha foi definida por outra pessoa.
- **Recuperação:** exige CPF **e** e-mail cadastrado e dá sempre a mesma resposta. O token
  tem 256 bits, vale 30 minutos e é de uso único; no banco fica só o SHA-256 dele.
  Há limite de 3 pedidos por hora, e um novo pedido invalida os anteriores.
- **Sessão:** 8 horas. Ela é revalidada no banco a cada requisição: um usuário desativado
  ou que trocou de senha perde o acesso na hora.

| Perfil | Pode | Não pode |
|---|---|---|
| **Administrador** | Tudo, incluindo a matriz de permissões, as configurações do sistema e criar outros admins | Desativar a si mesmo; remover o último admin; perder permissões críticas |
| **RH** | Estrutura, gestores, usuários **Gestor**, auditoria, revelar CPF (auditado), documentos | Criar usuários RH/ADMIN; alterar permissões ou configurações. O **RH de unidade** só vê e altera a própria unidade; o catálogo de cargos e as unidades são exclusivos do RH corporativo |
| **Gestor** | Dashboard, cargos e carreira, módulos operacionais futuros (vagas, entrevistas, colaboradores, relatórios) | Configurações, remuneração, pesquisa salarial, candidatos, admissões, dados pessoais |

## 5. Segurança e LGPD

| Requisito | Implementação |
|---|---|
| **Minimização e proteção do CPF** (LGPD art. 6º, III; art. 46) | O CPF nunca fica em texto puro: `cpfHash` (HMAC-SHA256 com pepper) serve para login e unicidade, e `cpfEnc` (AES-256-GCM) só é aberto sob demanda. Telas e API mostram `***.982.247-**` |
| **Acesso restrito ao CPF** | Revelar o CPF exige a permissão `pii.reveal` e gera um evento `PII_ACCESS` na auditoria (quem, quando, IP) |
| **Controle de acesso** | Matriz de permissões + escopo por unidade + regras anti-escalonamento, aplicados no serviço (vale para tela e API). Tentativas negadas são auditadas (`ACCESS_DENIED`) |
| **Auditoria** | Toda criação, alteração, login (com sucesso ou não), logout, troca ou redefinição de senha, mudança de permissão, upload, download e acesso a dado pessoal é registrada com valor anterior e novo, autor, perfil, IP e user-agent. Senhas, hashes e CPF são mascarados automaticamente. O banco impede alterar ou excluir registros. O RH não vê ações de administradores (segregação de funções) |
| **Documentos** | Cifrados (AES-256-GCM) e gravados no banco (`DocumentBlob`), pois o disco de ambientes serverless é temporário; com isso entram no backup do banco. O tipo é conferido pela assinatura binária, não pela extensão; formatos fechados (PDF/JPG/PNG/DOCX) e tamanho máximo configurável. Download só pela API, com permissão, conferência de integridade (SHA-256), auditoria e `Cache-Control: no-store` |
| **Validação de dados** | Esquemas zod em todos os serviços, CPF com dígito verificador, e-mail, formatos e tamanhos. Erros por campo na interface e `422` na API. Unicidade e chaves estrangeiras garantidas no banco |
| **Backups** | Dump diário + documentos + checksums + retenção + GPG opcional. Restauração testada |
| **Transporte e navegador** | HSTS, CSP restritiva, `frame-ancestors 'none'`, `nosniff`, sem o cabeçalho `X-Powered-By`, `robots: noindex` |
| **Candidatos** | `consentAt`/`consentVersion` (aceite do aviso de privacidade) e `retainUntil`/`anonymizedAt` (retenção e anonimização) já existem no schema para a Fase 2 |
| **Parâmetros LGPD** | E-mail do DPO, retenção de candidatos (12 meses) e de auditoria (5 anos) configuráveis em *Configurações › Sistema e LGPD* |

### Pontos de LGPD que dependem de decisão da empresa (código não resolve)

1. **Nomear o encarregado (DPO)** e publicar o canal do titular. O campo já existe.
2. **Política de retenção formal:** por quanto tempo guardar dados de candidatos
   reprovados e de ex-colaboradores. O padrão proposto é 12 meses para candidatos e 5 anos
   para a auditoria; o expurgo automático entra com o módulo de Candidatos.
3. **Base legal por finalidade:** contrato e obrigação legal (CLT/eSocial) para
   colaboradores, consentimento ou legítimo interesse para o banco de talentos.
4. **Contratos de operador** com os fornecedores que vão receber dados (Sólides, folha,
   provedor de e-mail, nuvem).
5. **Gestão das chaves:** quem guarda `DATA_ENCRYPTION_KEY`, onde e com qual plano de
   rotação.

## 6. API interna `/api/v1`

Ela é autenticada pela sessão, exige a permissão `api.access` mais a permissão do recurso,
e responde em JSON (`{ data }` ou `{ error, fieldErrors }`).

| Método e rota | Permissão | Descrição |
|---|---|---|
| `GET /api/v1/health` | pública | Saúde da aplicação e do banco |
| `GET /api/v1/me` | — | Usuário atual e permissões |
| `GET/POST /api/v1/units` | POST: `org.manage` | Unidades |
| `GET/POST /api/v1/departments?unitId=` | POST: `org.manage` | Departamentos |
| `GET/POST /api/v1/positions` | `carreira.view` / `org.manage` | Catálogo de cargos |
| `GET/POST /api/v1/managers?departmentId=` | POST: `managers.manage` | Gestores (CPF sempre mascarado) |
| `GET/POST /api/v1/users` | `users.view` / `users.manage` | Usuários |
| `POST /api/v1/documents` | `documents.write` | Upload multipart (cifrado) |
| `GET /api/v1/documents/:id` | `documents.read` | Download auditado |

**Próximo passo para integrações externas** (folha, Sólides, BI): criar tokens de serviço
com escopo e prazo, ligados a um "usuário técnico". A camada de serviço não muda.

## 7. Produção e primeiro acesso

- **Hospedagem:** Vercel (região `gru1`, São Paulo) + Neon PostgreSQL (`aws-sa-east-1`).
  Os dados ficam no Brasil. Guia em `docs/DEPLOY-VERCEL.md`.
- **Sem usuários pré-criados em produção.** O primeiro administrador é criado em
  `/primeiro-acesso`, que exige **duas provas**: o CPF autorizado (`BOOTSTRAP_ADMIN_CPF`) e
  um código secreto (`BOOTSTRAP_TOKEN`, mín. 16 caracteres). O CPF sozinho não basta, porque
  é um dado semipúblico. A criação usa *advisory lock* (impede duas criações simultâneas) e
  a tela fecha permanentemente assim que existe um usuário. Tentativas inválidas são auditadas.
- **Formulários:** após erro de validação, os valores digitados são mantidos. Antes de a
  página carregar por completo, o envio também é feito por POST, nunca com dados na URL.

## 8. Limitações conhecidas desta fase

| Limitação | Impacto | Quando resolver |
|---|---|---|
| E-mails só são enviados com `RESEND_API_KEY` configurada | Sem ela, a recuperação de senha depende do administrador | Antes de liberar para os usuários (Passo 7 do guia de deploy) |
| Bloqueio de login por conta, sem limite por IP | Um ataque distribuído contra muitos CPFs não é contido | Ao publicar na internet: WAF/rate limit no proxy (Cloudflare, ALB) |
| Sem MFA | Contas ADMIN e RH dependem só da senha | Recomendo TOTP para ADMIN e RH na fase de Remuneração, quando houver salários na base |
| Upload de documentos só pela API | Ainda não há tela de anexos | Entra em Admissões e Candidatos |
| Gestor sem visão "minha equipe" | O perfil Gestor tem pouco uso real nesta fase | Entra com Colaboradores e Vagas |

## 9. Fase 2 — Recrutamento (resumo)

Módulo em `src/modules/recruitment/` (vagas, candidatos, fluxo RH → gestor, histórico) e
`src/modules/import/` (leitura da planilha, regras de interpretação e importação em etapas).
As tabelas novas e alteradas são:
- `JobOpening`: código por sequência no banco, salário previsto, escala, turno e jornada;
- `Candidate`: nome e telefone normalizados para checar duplicidade;
- `Application`: pretensão salarial e avaliação externa;
- `Interview`: resultado do RH e motivo;
- `ManagerReview`: decisão do gestor, separada da do RH;
- `RejectionReason`: motivos editáveis;
- `CandidateEvent`: histórico somente-inserção;
- `ImportBatch` e `ImportRow`: importação revisável.

Também foram acrescentadas travas no banco: reprovação sem motivo e reprovação do gestor sem
justificativa são recusadas, e o histórico não aceita alteração. Detalhes, regras e a análise
da planilha real estão em `docs/RECRUTAMENTO.md`.

Interface: a paleta passou a ser em tons de marrom, o menu foi agrupado por processo com
contadores de pendências e atalhos "+ Candidato" e "+ Entrevista", e os módulos futuros ficam
recolhidos em "Próximas fases".

## 10. Fase 3 — Comunicação com gestores (resumo)

`src/modules/email/`:
- `config` e `transport`: SMTP corporativo via nodemailer, ou Resend;
- `outbox`: fila com trava atômica, novas tentativas e histórico;
- `digests`: consolidação por gestor e data com versão e hash, fechamento diário, retificação e
  rotina periódica;
- `service`: regras de permissão da tela.

Tabelas: `ManagerDigest`, `DailyClosing` e `SystemLock`; `Notification` ganhou tentativas,
HTML, CC e vínculo com a comunicação. A rotina roda pelo cron (`/api/cron/tick`, protegido por
`CRON_SECRET`) e, enquanto o RH usa a plataforma, a cada minuto. Detalhes em
`docs/COMUNICACAO.md`.

## 11. Roadmap sugerido

| Fase | Módulos | Depende de |
|---|---|---|
| 2 ✅ | Vagas, Candidatos, Entrevistas, Aprovação do gestor, Importação | Concluída. Pendência: envio real de e-mails (Resend) |
| 3 ✅ | Comunicação automática com gestores | Concluída. Pendência: credenciais do e-mail corporativo |
| 4 ✅ | Relatórios e indicadores (`src/modules/analytics`, ver `docs/INDICADORES.md`) | Dados das fases 2–3 |
| 5 ✅ | Admissões, Colaboradores, experiência, permanência e turnover (`src/modules/admission`, `src/modules/people`, ver `docs/ADMISSAO.md`) | Pendências: cadastro do quadro atual; integração com folha/eSocial |
| 6 ✅ | Remuneração, benefícios, Elogio Premiado, PPR, pesquisa salarial (`src/modules/compensation`, ver `docs/REMUNERACAO.md`) | Pendências: valores reais da empresa; alíquotas da contabilidade; MFA para dados salariais |
