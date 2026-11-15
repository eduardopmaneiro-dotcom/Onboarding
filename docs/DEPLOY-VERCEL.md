# Deploy na Vercel + Neon — passo a passo

Tempo estimado: **15 a 20 minutos**, só com cliques e copiar/colar. Não exige programação.

O resultado é a plataforma no ar numa URL `https://<projeto>.vercel.app` (ou num domínio
próprio, como `rh.rialehoteis.com.br`), com servidor e banco **no Brasil** (São Paulo).
Ao abrir, ela pede o **primeiro acesso**, que cria o administrador principal com o CPF
autorizado.

---

## O que já está pronto no código

| Item | Como foi resolvido |
|---|---|
| Build na Vercel | `vercel.json` executa `npm run vercel-build`: aplica as migrações no Neon, carrega a estrutura (unidades, departamentos, cargos, trilhas, permissões) e compila. Pode rodar a cada deploy, sem duplicar nem apagar nada |
| Região | `gru1` (São Paulo), perto do banco Neon em `aws-sa-east-1`: menor latência e dados no Brasil (LGPD) |
| Conexão Neon | Usa o *pooler* para a aplicação e a conexão direta para as migrações (`DATABASE_URL` / `DATABASE_URL_UNPOOLED`, preenchidas pela integração) |
| Documentos | Ficam cifrados **dentro do banco** (o disco da Vercel é temporário) e entram nos backups do Neon |
| Usuários de teste | **Não são criados em produção.** O banco começa sem nenhum usuário |
| Primeiro acesso | Tela `/primeiro-acesso`: exige o CPF autorizado **e** um código secreto; fecha para sempre após o primeiro cadastro |
| E-mails | Opcionais via Resend. Sem eles, o sistema funciona, mas a recuperação de senha fica a cargo do administrador |

---

## Passo 1 — Conta e plano na Vercel

1. Crie uma conta em **vercel.com** usando *Continue with GitHub*, com a conta dona do
   repositório `Onboarding`.
2. **Plano:** o plano gratuito (*Hobby*) é restrito a uso pessoal e não comercial. Uma
   ferramenta interna da empresa é uso comercial, então use o plano **Pro**. Confirme os
   valores atuais na página de preços da Vercel.

## Passo 2 — Banco de dados Neon (pela própria Vercel)

1. No painel da Vercel: **Storage → Create Database → Neon (Serverless Postgres)**.
2. **Region:** escolha **São Paulo (aws-sa-east-1)**.
3. Nome sugerido: `riale-rh`. Conclua a criação.

> Plano do Neon: para dados de RH, prefira um plano com **histórico de restauração**
> (*point-in-time restore*) de ao menos 7 dias. Confira o período de cada plano no site do Neon.

## Passo 3 — Importar o projeto

1. **Add New → Project → Import** o repositório `eduardopmaneiro-dotcom/Onboarding`.
2. Framework: **Next.js** (detectado automaticamente). Não altere o *Build Command*, pois o
   `vercel.json` já define.
3. **Antes de clicar em Deploy**, abra *Environment Variables* e preencha o Passo 4.

> **Branch:** o código desta fase está no branch `claude/loving-rubin-ezvucp`. A Vercel
> publica em produção o branch principal (`main`). Escolha uma das opções:
> **(a)** fazer o *merge* do branch no `main` (recomendado), ou
> **(b)** em *Settings → Git → Production Branch*, informar `claude/loving-rubin-ezvucp`.

## Passo 4 — Variáveis de ambiente

Marque as variáveis apenas para **Production**.

| Nome | Valor | Observação |
|---|---|---|
| `AUTH_SECRET` | segredo aleatório (ver abaixo) | Assina as sessões |
| `CPF_HASH_PEPPER` | segredo aleatório | ⚠️ **Nunca altere depois do 1º uso** |
| `DATA_ENCRYPTION_KEY` | segredo aleatório (32 bytes, base64) | ⚠️ **Nunca altere. Se perder, CPFs e documentos ficam ilegíveis** |
| `BOOTSTRAP_ADMIN_CPF` | o CPF do administrador principal (com ou sem pontuação) | Único CPF autorizado a fazer o primeiro acesso. Não versione este valor |
| `BOOTSTRAP_TOKEN` | código secreto, mín. 16 caracteres | Será pedido na tela de primeiro acesso |
| `AUTH_TRUST_HOST` | `true` | |
| `APP_URL` | opcional | Só se usar domínio próprio, ex.: `https://rh.rialehoteis.com.br` |
| `RESEND_API_KEY` / `EMAIL_FROM` | opcional | E-mails de recuperação de senha (Passo 7) |

`DATABASE_URL` e `DATABASE_URL_UNPOOLED` **não precisam ser digitadas**: ao conectar o banco
(próximo passo), a integração as cria.

**Como gerar os segredos.** Use um comando por variável; cada execução gera um valor novo.

No Mac (Terminal):

```bash
openssl rand -base64 32
```

No Windows (PowerShell 7):

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Use o mesmo comando para o `BOOTSTRAP_TOKEN`.

> **Guarde `CPF_HASH_PEPPER` e `DATA_ENCRYPTION_KEY` num gerenciador de senhas** (1Password,
> Bitwarden) fora da Vercel. Elas são a única forma de ler os dados cifrados se for preciso
> migrar de provedor ou restaurar um backup.

## Passo 5 — Conectar o banco e publicar

1. No projeto: **Storage → Connect Database →** selecione `riale-rh` e o ambiente **Production**.
2. Volte em **Deployments → Redeploy**, ou clique em *Deploy* se ainda não fez.
3. No log do build devem aparecer `✓ Variáveis de ambiente verificadas`, `All migrations have been successfully applied`,
   `Seed concluído (estrutura)` e `Compiled successfully`.

## Passo 6 — Primeiro acesso

1. Abra a URL do projeto. O login mostra **"Plataforma ainda sem usuários. Fazer o primeiro
   acesso →"**.
2. Informe:
   - o CPF definido em `BOOTSTRAP_ADMIN_CPF`;
   - nome, e-mail e o **código de configuração** (o `BOOTSTRAP_TOKEN`);
   - uma senha com **12+ caracteres, maiúscula, minúscula, número e símbolo**.
3. Entre com CPF e senha. A partir daí, cadastre o restante em **Configurações**:

| Ordem | Onde | O quê |
|---|---|---|
| 1 | Configurações › Unidades / Departamentos | Revisar a estrutura (já vem com as 3 unidades e 9 departamentos cada) |
| 2 | Cargos e carreira | Ajustar o catálogo de cargos |
| 3 | Configurações › Gestores e superiores | Cadastrar os gestores (nome, CPF ou matrícula, cargo, departamento, e-mail, superior) |
| 4 | Configurações › Usuários | Criar os acessos do RH (perfil RH, com ou sem unidade) e dos gestores (perfil Gestor, vinculado ao cadastro de gestor) |
| 5 | Configurações › Sistema e LGPD | E-mail do encarregado (DPO), prazos de retenção, remetente dos e-mails |

Cada usuário criado recebe uma **senha temporária** definida por você e é obrigado a trocá-la
no primeiro login. Passe essa senha por um canal seguro (pessoalmente ou por telefone), não
pelo mesmo e-mail de login.

4. **Depois do primeiro acesso:** apague `BOOTSTRAP_TOKEN` e `BOOTSTRAP_ADMIN_CPF` da Vercel.
   A tela já fica fechada de qualquer forma; remover as variáveis é uma camada extra.

## Passo 7 — E-mails (necessário para a comunicação com gestores)

> A partir da Fase 3, use preferencialmente o **e-mail corporativo (SMTP)**. O passo a passo completo, com Google Workspace e Microsoft 365, está em `docs/COMUNICACAO.md`, seção 3. O roteiro abaixo (Resend) continua válido como alternativa.

Sem esta etapa, "Esqueci minha senha" não envia e-mail: a mensagem fica na fila, visível em
*Configurações › Sistema*, e o administrador redefine a senha manualmente.

1. Crie uma conta em **resend.com** e verifique o domínio `rialehoteis.com.br`. O Resend
   mostra os registros DNS (SPF e DKIM) para o responsável pelo domínio cadastrar.
2. Gere uma API key e adicione na Vercel:
   - `RESEND_API_KEY`;
   - `EMAIL_FROM` = `Riale RH <rh@rialehoteis.com.br>`.
3. Faça um *Redeploy*.

## Passo 8 — Domínio próprio (opcional)

*Settings → Domains → Add* `rh.rialehoteis.com.br` e crie o registro CNAME indicado no DNS.
Depois defina `APP_URL=https://rh.rialehoteis.com.br`, para que os links dos e-mails usem esse
endereço.

---

## Cuidados de operação

| Tema | Recomendação |
|---|---|
| **Deploys de preview** | Por padrão a Vercel cria uma URL de teste a cada push. Como as variáveis estão só em *Production*, esses builds falham, o que é intencional: evita copiar dados reais de RH para ambientes de teste. Para usar previews, crie um banco ou branch Neon separado, **sem dados reais**, e outras chaves |
| **Backups** | O Neon guarda o histórico para restauração (*point-in-time*). Para uma cópia fora do Neon, rode `npm run db:backup` apontando `DATABASE_URL` para a conexão direta do Neon, ou peça a automação via GitHub Actions |
| **Migrações** | Rodam automaticamente a cada deploy (`prisma migrate deploy`). São aditivas e versionadas em `prisma/migrations/` |
| **Saúde** | `https://<sua-url>/api/v1/health` responde `{"status":"ok"}`. Pode ser usado em monitoramento (UptimeRobot, Better Stack) |
| **Chaves** | Nunca troque `CPF_HASH_PEPPER` nem `DATA_ENCRYPTION_KEY` em produção. Rotação exige rotina de re-cifragem (sob demanda) |

## Se algo der errado

| Sintoma | Causa provável | Solução |
|---|---|---|
| Build falha em `prisma migrate deploy` com erro de conexão | Banco não conectado ao ambiente Production | Passo 5.1 e Redeploy |
| Build falha com `✗ Variáveis de ambiente inválidas` | Variável ausente ou fora do formato (a mensagem diz qual) | Corrigir conforme o Passo 4 e fazer Redeploy |
| Login não mostra o aviso de primeiro acesso | `BOOTSTRAP_TOKEN` ausente ou com menos de 16 caracteres, ou já existe usuário | Conferir as variáveis e fazer Redeploy |
| "CPF ou código de configuração inválidos" | Código digitado diferente do `BOOTSTRAP_TOKEN` | Copiar e colar o valor exato da Vercel |
| Erro `UntrustedHost` | Falta `AUTH_TRUST_HOST=true` | Adicionar e fazer Redeploy |
