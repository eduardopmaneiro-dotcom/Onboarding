# Fase 5 — Admissão e ciclo inicial do colaborador

Telas: **Admissões** (`/admissoes`), **Colaboradores** (`/colaboradores`),
**Acompanhamento da experiência** (`/colaboradores/experiencia`) e **Relatórios › Permanência e
turnover** (`/relatorios/permanencia`). Configurações: `/admissoes/configuracoes`.

## Fluxo

1. **Candidatura aprovada em todas as etapas obrigatórias.** O RH aprovou, o gestor aprovou e a avaliação externa foi aprovada (quando existe). A candidatura aparece em *Prontos para admissão*, e a ficha do candidato mostra **Encaminhar para admissão**.
2. **Processo admissional (ADM-AAAA-NNNN).** Nasce pré-preenchido com os dados da vaga: cargo, departamento → unidade, gestor, escala, turno e jornada. O salário vem da oferta negociada; sem oferta, do salário previsto da vaga. Uma candidatura tem no máximo um processo aberto, e o banco garante isso.
3. **Checklist documental** com 5 situações: Pendente, Recebido, Em análise, Aprovado e Recusado. A recusa exige motivo. Ao anexar um arquivo, o item passa de Pendente para Recebido.
4. **Exame admissional:** clínica, data, horário, realização, recebimento do ASO e resultado (apto, apto com restrições, inapto). A situação é calculada a partir desses dados. Falta ou remarcação geram um novo registro; o anterior fica no histórico.
5. **Confirmar contratação.** O botão só é liberado quando a lista “o que falta” está vazia:
   - data de admissão, salário, escala, gestor e CPF preenchidos;
   - todos os documentos obrigatórios e aplicáveis aprovados;
   - exame realizado, com ASO recebido e apto;
   - exame realizado até a data de admissão (NR-7: o exame vem antes do início das atividades).
6. **Conversão em colaborador.** Na mesma transação, a confirmação:
   - cria o colaborador com matrícula automática;
   - liga o colaborador ao candidato, à candidatura e ao processo admissional;
   - grava a movimentação de **Admissão**;
   - gera os marcos da experiência;
   - marca a candidatura como *Contratado*, com a data de admissão (alimenta os indicadores da Fase 4);
   - fecha a vaga como *Preenchida* quando atinge a quantidade;
   - registra “Contratado(a)” no histórico do candidato.

   Nenhum registro do processo seletivo é apagado ou copiado: a ficha do colaborador lê o histórico original (entrevistas, decisões do gestor, eventos, documentos e exames). O histórico do candidato é somente inserção (trigger no banco).
7. **Cancelamento** sempre exige motivo. Desistência leva a candidatura para *Desistiu*. Os demais motivos (inapto, documentação, vaga cancelada, outro) levam para *Reprovado*. O motivo fica registrado no histórico.

## Checklist (configurável)

O padrão inclui identificação (RG/CNH, CPF, foto, título, reservista, certidão), dados cadastrais
(comprovante de residência, ficha cadastral, PIS), Carteira de Trabalho Digital, dados bancários,
escolaridade (**quando o cargo exige**), dependentes (**quando há dependentes**) e a opção pelo
vale-transporte. O RH pode criar, editar, desativar e reordenar itens. Itens novos entram nos
processos em andamento. Itens desativados não apagam o que já foi recebido.

## Anexos — acesso restrito

- Os arquivos são cifrados (AES-256-GCM) e guardados no banco, com integridade conferida por SHA-256 e classificação *Sensível*.
- Enviar e baixar exige a permissão `admissoes.documentos` (Admin e RH por padrão) e o escopo da unidade do processo: o RH de outra unidade recebe “não encontrado”.
- O gestor não acessa os anexos.
- Cada download e cada tentativa negada ficam na auditoria.

## Experiência — marcos de 30, 45 e 90 dias

- **Regra configurável** (Admissões › Configurações): marcos (padrão `30,45,90`; o último é o fim da experiência), se o dia da admissão conta como 1º dia (padrão: sim, regra da CLT para prazos do contrato), antecedência do aviso (padrão: 5 dias) e se o alerta também vai por e-mail.
- Exemplo com a regra padrão e admissão em 02/03: 30 dias em 31/03, 45 dias em 15/04 e 90 dias em 30/05.
- As datas são gravadas na admissão (são as do contrato). Mudanças na regra valem para as próximas admissões.
- Só contrato **CLT** tem período de experiência.
- **Alertas ao RH:** um aviso antecipado e um aviso no dia (ou em atraso), cada um enviado uma única vez por marco. Vão para o RH da unidade do colaborador e para o RH corporativo; sem RH cadastrado, para os administradores. Aparecem no dashboard (com “marcar como lido”) e chegam por e-mail consolidado pela fila real. Sem provedor de e-mail configurado, a mensagem aguarda na fila e nunca é dada como enviada. Os alertas rodam no ciclo automático (a cada minuto enquanto o RH usa a plataforma, e no cron diário).
- **Avaliação do marco:** “segue na experiência” ou “indicado desligamento” nos marcos intermediários; “efetivado” ou “indicado desligamento” no último. O desligamento exige justificativa.

## Desligamento

O desligamento registra data, tipo e motivo:

- encerra os marcos pendentes;
- grava a movimentação de **Desligamento**;
- registra o evento no histórico do candidato.

Os tipos “término do contrato de experiência” e “rescisão antecipada” só valem dentro da experiência.
O banco permite **um vínculo ativo por CPF**. A readmissão cria um novo vínculo, e o anterior fica no histórico.

## Colaboradores já admitidos

**Cadastrar colaborador já admitido** serve para quem trabalhava antes da plataforma: completa a base
de tempo de casa e turnover. Marcos já vencidos não são criados (não geram alerta retroativo).

## Permanência e turnover (`/relatorios/permanencia`)

Tudo é calculado a partir das datas de admissão e desligamento. Nada é digitado.

| Indicador | Regra |
|---|---|
| Tempo de casa | Dias corridos, contando o dia da admissão; média e mediana dos ativos hoje |
| Retenção em N dias | Admitidos no período que já completaram N dias (ou saíram antes) e estavam ativos no N-ésimo dia ÷ essa coorte. Quem sai no próprio dia do marco não conta como retido. Quem ainda não completou N dias fica fora, e o painel mostra quantos são |
| Desligamentos na experiência | Desligados até o último dia da experiência ÷ desligamentos do período. Também mostra a iniciativa e a proporção sobre os admitidos (CLT) |
| Tempo médio de permanência | Dias entre a admissão e o desligamento de quem saiu no período (média e mediana) |
| Turnover | Desligamentos ÷ efetivo médio. Efetivo médio = (ativos no 1º dia + ativos ao fim do último dia) ÷ 2. Mostrado por unidade e por cargo |
| Rotatividade | ((Admissões + desligamentos) ÷ 2) ÷ efetivo médio |
| Voluntários | Pedido de demissão e rescisão antecipada pelo colaborador |

**Limitação declarada:** o efetivo só conta colaboradores cadastrados na plataforma. O painel mostra
a base (quantos vieram do recrutamento e quantos foram cadastrados diretamente). Enquanto o quadro
inteiro não estiver cadastrado, o turnover não representa a empresa.

## Permissões

| Permissão | Admin | RH | Gestor |
|---|:-:|:-:|:-:|
| `admissoes.view` / `admissoes.manage` | ✓ | ✓ | — |
| `admissoes.documentos` (anexos) | ✓ | ✓ | — |
| `admissoes.config` (checklist, clínicas, regras) | ✓ | ✓ | — |
| `colaboradores.view` | ✓ | ✓ (unidade) | ✓ (própria equipe) |
| `colaboradores.manage` (cadastro direto, avaliação, desligamento) | ✓ | ✓ | — |
| `colaboradores.salario` | ✓ | ✓ | — |

## Regras no banco

- Sequências para o código ADM e para a matrícula.
- Índices parciais: um vínculo ativo por CPF; um processo não cancelado por candidatura.
- Verificações (CHECK):
  - colaborador desligado tem data e tipo de desligamento;
  - o desligamento não é anterior à admissão;
  - salário maior que zero;
  - processo concluído tem colaborador e data;
  - marco realizado tem resultado;
  - ASO só existe com exame realizado.

## Testes

- `tests/unit/people-rules.test.ts`: datas dos marcos (inclusive virada de ano e ano bissexto), tempo de casa, retenção e turnover com registros conhecidos.
- `tests/integration/admission.test.ts`: 12 cenários contra o banco real:
  - encaminhamento, documentação pendente e recusada, anexos com acesso restrito;
  - exame (falta, remarcação, inapto e apto), NR-7, CPF duplicado;
  - conversão com histórico preservado e marcos 30/45/90;
  - alertas idempotentes por unidade e regras de avaliação;
  - desligamento na experiência e readmissão;
  - escopo do gestor e do RH de unidade;
  - permanência de 2025 conferida à mão.
- `tests/e2e/admission.mjs` (`npm run test:e2e:admissao`): o fluxo inteiro no navegador, com a ficha do candidato e a admissão, anexo, recusa, exame, ASO, conversão, avaliação do marco, desligamento, painel de permanência, configurações, escopo da gestora e celular.
