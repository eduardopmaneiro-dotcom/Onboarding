# Fase 4 — Painel gerencial e indicadores de RH

Tela: **Relatórios** (`/relatorios`). Metas de SLA: `/relatorios/metas`. Exportação:
`/api/v1/reports/xlsx` e `/api/v1/reports/pdf` com os mesmos filtros da tela.

Todos os números saem do banco no momento da consulta. Nenhum indicador usa dado de
demonstração ou valor estimado. Quando não há observação, o painel mostra **“—”**, nunca 0 %.

## Filtros

- **Período:** semana (segunda a domingo), mês, trimestre ou ano, no fuso de Brasília. As setas ‹ › navegam entre períodos.
- **Dimensões:** unidade, departamento, cargo, recrutadora e gestor. As opções vêm da própria base, então só aparece o que existe no escopo de quem consulta.
- **Escopo:** Admin e RH corporativo veem tudo. O RH de unidade vê a própria unidade. O gestor vê as próprias vagas.

## 1. Recrutamento (contagens)

| Indicador | Regra |
|---|---|
| Vagas abertas | Situação **agora**, mais as abertas no período (data de abertura) |
| Vagas encerradas | Preenchidas, canceladas ou encerradas no período (data de encerramento) |
| Candidatos cadastrados | Data do cadastro. Para o histórico importado, a data da 1ª entrevista (o cadastro foi o dia da importação) |
| Entrevistas agendadas | Data da entrevista no período, **exceto canceladas** |
| Realizadas / faltas / desistências | Pela situação e pelo resultado da entrevista |
| Aprovações e reprovações do RH | Por entrevista, pelo resultado registrado |
| Aprovações e reprovações do gestor | Pela **data da decisão**. Pedido de nova entrevista é contado à parte, não como decisão |
| Contratações | Pela data de admissão registrada |

## 2. Conversão (taxas com denominador explícito)

Cada taxa mostra o numerador, o denominador (n) e o que ficou fora do cálculo, com o motivo.

| Taxa | Numerador ÷ denominador | Fora do cálculo |
|---|---|---|
| Comparecimento | compareceu (aprovado ou reprovado pelo RH) ÷ (compareceu + faltou) | desistências (presença incerta), sem resultado |
| Aprovação do RH | aprovadas ÷ (aprovadas + reprovadas), por candidatura com 1ª entrevista no período | faltas, desistências, sem decisão |
| Aprovação dos gestores | aprovações ÷ (aprovações + reprovações) decididas no período | pedidos de nova entrevista, pendentes |
| Conversão em contratação | contratadas ÷ candidaturas que compareceram (coorte da 1ª entrevista) | candidaturas ainda em processo |
| Desistência | desistências ÷ (compareceram + desistiram), mesma coorte | faltas |

As taxas de RH, contratação e desistência usam **coorte**: as candidaturas cuja 1ª entrevista
caiu no período. Assim, o numerador e o denominador falam das mesmas pessoas. Enquanto houver
candidaturas da coorte em processo, o painel avisa que a taxa ainda pode subir.

## 3. Produtividade

- **Entrevistas** por recrutadora, departamento, unidade e cargo: agendadas, com realizadas, faltas e aprovadas pelo RH.
- **Contratações por recrutadora:** cada contratação vai para a recrutadora da entrevista que aprovou o candidato.
- **Recrutadora:** o usuário que conduziu a entrevista. No histórico importado, o primeiro nome registrado na planilha.
- **Tempo de avaliação dos gestores:** do encaminhamento pelo RH até a decisão do gestor, com média, mediana, número de decisões, pendentes agora e o pedido pendente mais antigo. Decisões registradas pelo RH em nome do gestor são sinalizadas.

## 4. SLA

| Etapa | Início → fim | Responsável |
|---|---|---|
| Abertura → 1ª entrevista | abertura da vaga → 1ª entrevista agendada | RH |
| 1ª entrevista → aprovação do RH | 1ª entrevista da candidatura → registro da aprovação | RH |
| Aprovação do RH → avaliação do gestor | encaminhamento ao gestor → decisão | Gestor |
| Aprovação final → admissão | aprovação final → data de admissão | Admissão |
| Abertura → contratação | abertura da vaga → admissão | Ponta a ponta (resultado) |

- **Esperas não se misturam:** cada etapa tem início, fim e responsável próprios. O tempo de espera do gestor nunca entra numa etapa do RH, e vice-versa. A etapa ponta a ponta é só um resultado e não é atribuída a ninguém.
- Dias corridos. Uma medição entra no período pela data de **conclusão** da etapa. Etapas ainda abertas aparecem à parte (“em aberto agora”, e quantas já passaram da meta).
- O **histórico importado fica fora dos SLAs**, porque a planilha não tem horários reais de abertura e de decisão. Ele continua nas contagens e nas taxas.
- **Metas** por etapa, configuráveis pelo Admin ou pelo RH, em dias corridos (0,5 a 365). Vale a meta mais específica: cargo + departamento › cargo › departamento › padrão da etapa. Etapa sem meta mostra “meta não definida”. O sistema não cria metas sozinho.

## Admissão

A plataforma ainda não tem módulo de admissão. Por isso, a ficha do candidato com aprovação
final ganhou o botão **Registrar admissão** (data). Ele grava `hiredAt`, muda a candidatura
para *Contratado* e marca a vaga como *Preenchida* quando a quantidade de vagas é atingida.
A data não pode ser anterior à aprovação. A data de aprovação final (`approvedAt`) é gravada
automaticamente na aprovação. Para registros antigos, a migração recuperou essa data da
decisão do gestor.

## Exportação

- **Excel:** abas Resumo, Conversão (taxa por fórmula `B/C`), Produtividade (totais por `SUM`), SLA (% na meta por fórmula), Base_Entrevistas (linha a linha), **Validação** (confere o resumo contra a base por fórmula) e **Metodologia**. Cabeçalho na cor marrom da marca.
- **PDF:** relatório A4 com os mesmos blocos e as regras no rodapé.
- Toda exportação fica registrada na auditoria (quem, quando, filtros).

## Conferência dos cálculos

`tests/integration/analytics.test.ts` monta uma unidade isolada com 2 vagas, 9 candidaturas e
horários exatos. Depois compara cada indicador com o valor calculado à mão (anotado no código):
contagens, taxas com n e exclusões, produtividade, tempo do gestor, SLA por etapa com a
precedência das metas, filtros, semana, mês, trimestre, período vazio, Excel, PDF e registro
de admissão. `tests/e2e/dashboard.mjs` confere no navegador que a tela e o Excel exportado
mostram os mesmos números. Também testa metas, o escopo da gestora e o painel no celular.
