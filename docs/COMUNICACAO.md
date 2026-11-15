# Fase 3 — Comunicação automática com gestores

O RH agenda e registra os resultados; o gestor recebe **um e-mail consolidado por data**:
- o **aviso de agenda**, quando as entrevistas são marcadas (e uma atualização se algo mudar);
- o **resultado do dia**, no fechamento às 18h30 ou quando o RH encerrar o dia antes disso.

Os e-mails dos gestores vêm da estrutura organizacional (Configurações › Gestores). O RH não
digita endereço nenhum.

## 1. Como funciona

### Aviso de agenda (consolidado)

1. O RH agenda uma ou várias entrevistas. O sistema identifica o **gestor responsável por cada
   vaga** e agrupa por **gestor + data**.
2. O aviso aguarda uma **janela de consolidação** (padrão: 3 minutos, configurável). Tudo o que
   o RH agendar nesse intervalo para o mesmo gestor e a mesma data sai em **uma única
   mensagem**.
3. Se depois houver inclusão, troca de horário, cancelamento ou mudança de data, sai uma
   **atualização** (versão 2, 3…) com a agenda completa e as mudanças marcadas: *(novo)*,
   *(horário alterado; antes 09:00)* e a lista de canceladas.
4. Se nada mudou desde o último aviso, **nada é enviado**. Fica registrado como "não enviado —
   sem alterações".
5. O envio é automático. Se o RH quiser revisar, marca *"Quero revisar o e-mail ao gestor antes
   do envio"* no agendamento. O aviso então fica em **Comunicação com gestores**, onde o texto
   pode ser editado antes de enviar.
6. Datas passadas não geram aviso.

### Resultado do dia (fechamento)

- **Automático** no horário configurado (padrão **18h30, Brasília**). Também pode ser
  **manual**: o RH clica em *"Encerrar agenda de hoje e enviar resultados"*, inclusive antes
  do horário.
- Um e-mail por gestor, só com as vagas dele, com: candidatos, cargo, aprovados, reprovados
  (com o motivo), não comparecimentos, desistências e **pendências**.
- Entrevista sem resultado registrado aparece como **"Pendente — resultado ainda não
  registrado pelo RH"**. O sistema nunca deduz um resultado. Antes do fechamento, a tela mostra
  quais entrevistas ainda estão sem resultado, com link para registrar.
- As aprovações seguem o fluxo formal: o gestor decide em **Aprovação do gestor**. O e-mail é
  informativo e aponta o link.
- Cada dia é encerrado **uma única vez**. Se algo mudar depois (resultado registrado ou
  corrigido, entrevista incluída), a tela mostra **"Alterações após o fechamento"** e o RH pode
  **emitir uma retificação**, com o assunto "Retificação — …" e a referência ao envio
  anterior.

> **Mudança em relação à Fase 2:** o e-mail avulso enviado ao gestor a cada aprovação foi
> retirado. A aprovação aparece no fechamento do dia, o que evita excesso de mensagens. O
> gestor continua vendo tudo em tempo real na plataforma.

### Controle contra duplicidade

| Mecanismo | Efeito |
|---|---|
| Uma comunicação por (tipo, gestor, data, **versão**), com chave única no banco | Não existem duas versões iguais |
| Hash do conteúdo comparado com o último envio | Conteúdo idêntico não é reenviado |
| Trava atômica ao enviar cada mensagem | Dois processos simultâneos nunca enviam a mesma mensagem |
| Fechamento registrado por data | O relatório do dia não sai duas vezes; o que vem depois é retificação |

## 2. Exemplos (dados fictícios)

**Aviso de agenda**
```
Assunto: Entrevistas agendadas — quarta-feira, 18/11/2026

Boa tarde, prezado(a) Marina Souza.

Informamos que foram agendadas as seguintes entrevistas para quarta-feira, 18/11/2026:

Assistente de Governança — Brisa Barra (VAG-2026-0031)
  09:00 — Ana Paula Ribeiro
  09:30 — Bruno Cardoso Lima
  10:00 — Carla Nunes Teixeira

Atenciosamente,
Recursos Humanos — Riale Hotéis.
```

**Atualização**
```
Assunto: Atualização da agenda de entrevistas — quarta-feira, 18/11/2026

Boa tarde, prezado(a) Marina Souza.

Informamos que a agenda de entrevistas de quarta-feira, 18/11/2026 foi atualizada. Segue a agenda completa:

Assistente de Governança — Brisa Barra (VAG-2026-0031)
  10:00 — Carla Nunes Teixeira
  10:30 — Diego Martins Souza (novo)
  11:00 — Ana Paula Ribeiro (horário alterado; antes 09:00)

Entrevistas canceladas ou retiradas desta data:
  09:30 — Bruno Cardoso Lima (Assistente de Governança)

Atenciosamente,
Recursos Humanos — Riale Hotéis.
```

**Resultado do dia**
```
Assunto: Resultado das entrevistas — quarta-feira, 18/11/2026

Boa noite, prezado(a) Marina Souza.

Segue o resultado das entrevistas de quarta-feira, 18/11/2026:

Assistente de Governança — Brisa Barra (VAG-2026-0031)
  09:00 — Ana Paula Ribeiro: Aprovado(a) pelo RH — aguarda sua avaliação na plataforma
  10:00 — Carla Nunes Teixeira: Reprovado(a) — Motivo: Incompatibilidade com a escala
  10:30 — Diego Martins Souza: Não compareceu
  11:30 — Elisa Gomes Prado: Pendente — resultado ainda não registrado pelo RH

Resumo: 4 agendada(s) · 2 entrevistado(s) · 1 aprovado(s) · 1 reprovado(s) · 1 não compareceu(ram) · 0 desistência(s) · 1 pendente(s).

Os candidatos aprovados pelo RH aguardam sua avaliação formal em: https://riale-rh.vercel.app/aprovacoes
Este e-mail é informativo e não substitui a avaliação na plataforma.

Atenciosamente,
Recursos Humanos — Riale Hotéis.
```

- **Saudação:** varia com o horário do envio (Bom dia / Boa tarde / Boa noite).
- **Dia da semana:** calculado a partir da data, no fuso America/Sao_Paulo.
- **Tratamento:** "prezado(a)", como no modelo; o sistema não deduz gênero pelo nome.
- **Versão HTML:** cada e-mail sai também em HTML, com o mesmo texto e a paleta dos documentos
  de RH (marrom #5C3D1E, dourado #8B6340, bege #F5EFE6).

## 3. Configuração (o que falta para enviar de verdade)

Sem configuração, **nada é dado como enviado**: as mensagens ficam na fila, e a tela de
Comunicação mostra exatamente quais variáveis faltam. Assim que a configuração entra, a fila é
entregue.

Cadastre na Vercel (riale-rh › Settings › Environment Variables, ambiente **Production**) e
faça um *Redeploy*:

| Variável | Google Workspace | Microsoft 365 |
|---|---|---|
| `EMAIL_PROVIDER` | `smtp` | `smtp` |
| `EMAIL_FROM` | `Recursos Humanos — Riale Hotéis <rh@rialehoteis.com.br>` | idem |
| `EMAIL_REPLY_TO` (opcional) | `rh@rialehoteis.com.br` | idem |
| `SMTP_HOST` | `smtp.gmail.com` | `smtp.office365.com` |
| `SMTP_PORT` | `465` | `587` |
| `SMTP_SECURE` | `true` | `false` |
| `SMTP_USER` | a conta que envia (ex.: `rh@rialehoteis.com.br`) | idem |
| `SMTP_PASSWORD` | **senha de app** da conta (exige verificação em 2 etapas) | senha da conta, com **SMTP AUTH habilitado** para a caixa (no Microsoft 365, admin › usuário › E-mail › Gerenciar aplicativos de e-mail) |
| `CRON_SECRET` | valor aleatório (`openssl rand -base64 32`) | idem |

- **Conta remetente:** recomendo uma caixa dedicada, como `rh@` ou `recrutamento@`, em vez da
  conta pessoal de alguém do RH. Assim as respostas dos gestores ficam centralizadas e o envio
  não depende de uma pessoa.
- **Alternativa ao e-mail corporativo:** usar o Resend (API), com `EMAIL_PROVIDER=resend`,
  `RESEND_API_KEY` e `EMAIL_FROM`. Nesse caso o domínio `rialehoteis.com.br` precisa ser
  verificado (DNS).
- **Conferir a configuração:** depois de configurar, use **"Enviar e-mail de teste para mim"**
  na tela de Comunicação.

### Parâmetros administrativos (Configurações › Sistema)

| Parâmetro | Padrão |
|---|---|
| Horário do fechamento diário | `18:30` (Brasília) |
| Fechamento automático | sim |
| Espera para consolidar o aviso de agenda | 3 minutos (0 = imediato) |
| Cópia (CC) dos e-mails aos gestores | vazio (ex.: o e-mail do RH) |

### Pontualidade do fechamento automático: limitação do plano gratuito da Vercel

O processamento da fila, dos avisos e do fechamento roda:
- **a cada minuto enquanto alguém do RH estiver com a plataforma aberta**;
- pela **tarefa agendada da Vercel** (`/api/cron/tick`).

No plano **Hobby**, a Vercel permite essa tarefa **uma vez por dia**, sem horário exato. Ela
está programada para 22h UTC (cerca de 19h em Brasília) e garante que o fechamento aconteça
mesmo se ninguém do RH estiver conectado às 18h30, mas pode atrasar até cerca de 1 hora.

Para um fechamento pontual às 18h30 sem depender de alguém conectado, escolha uma opção:

1. **Vercel Pro** (recomendado, e também necessário por uso comercial): altere em `vercel.json`
   a agenda para `*/5 * * * *` (a cada 5 minutos).
2. **Agendador externo gratuito** (ex.: cron-job.org): chamar a cada 5 minutos
   `GET https://riale-rh.vercel.app/api/cron/tick` com o cabeçalho
   `Authorization: Bearer <CRON_SECRET>`.

A rota recusa chamadas sem o segredo (resposta 401).

## 4. Fila e novas tentativas

- Toda mensagem passa pela fila, com histórico de tentativas, último erro e data do envio.
- **Falha do provedor:** novas tentativas em 1, 5, 15, 60 e 240 minutos. Na 6ª falha, a
  mensagem fica como **Falhou**, visível com o botão **Reenviar**.
- **Envio interrompido:** uma mensagem que ficou "enviando" por mais de 10 minutos volta para a
  fila automaticamente.
- **Mensagens antigas:** as que já estavam na fila antes desta fase (links de senha expirados,
  avisos avulsos) foram marcadas como canceladas na migração. Elas não serão disparadas quando
  o e-mail for configurado.

## 5. Testes

Os e-mails dos testes trafegam por **SMTP real até um servidor local**, e o conteúdo recebido
é conferido. Não há simulação no código da aplicação.

| Teste exigido | Resultado |
|---|---|
| Cinco entrevistas para o mesmo gestor | ✓ 1 e-mail, 5 candidatos com horários, modelo e dia da semana corretos |
| Entrevistas para gestores diferentes | ✓ cada gestor recebe só as próprias vagas |
| Alteração de horário | ✓ atualização (v2) com "horário alterado; antes 09:00" e a agenda completa |
| Cancelamento | ✓ atualização lista a entrevista cancelada |
| Inclusão de novo candidato | ✓ atualização marca "(novo)" |
| Falta | ✓ "Não compareceu" no fechamento |
| Reprovação com motivo | ✓ "Reprovado(a) — Motivo: Falta de experiência" |
| Aprovação | ✓ no fechamento + avaliação formal criada na plataforma; sem e-mail avulso |
| Entrevista sem resultado | ✓ "Pendente — resultado ainda não registrado pelo RH" |
| Falha no serviço de e-mail | ✓ nova tentativa programada; entrega quando o servidor volta; "Falhou" após esgotar |
| Extras | ✓ agendamentos em sequência consolidados; sem reenvio quando nada muda; fechamento manual e automático sem duplicar; retificação; fila aguardando configuração |

Comandos: `npm run test:integration` (inclui `tests/integration/email.test.ts`) e
`npm run test:e2e:comunicacao` (navegador: revisão e edição do texto, fechamento manual,
painel de configuração, proteção da rota do cron).
