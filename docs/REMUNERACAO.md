# Fase 6 — Remuneração, benefícios e inteligência de mercado

Telas: **Remuneração** (`/remuneracao`, com as abas Tabela por cargo, Benefícios, Elogio Premiado,
PPR e Encargos e rubricas), **Remuneração do colaborador** (`/remuneracao/colaborador/[id]`) e
**Pesquisa salarial** (`/pesquisa-salarial`).

## Princípio: nada é inventado

- O catálogo de benefícios pedido pela empresa vem **sem valores**: vale-transporte, alimentação, plano de saúde, plano odontológico, TotalPass, educação UVA, educação Estácio e farmácia por unidade.
- Para gravar qualquer valor de benefício é obrigatório informar a **origem** (contrato, tabela da operadora, documento).
- Os encargos vêm listados com a referência legal e **sem alíquota**, porque dependem do regime tributário, do CNAE/FAP e do FPAS.
- Elogio Premiado e PPR não têm regra nem montante pré-definidos.
- Valor ausente nunca vira zero. O colaborador fica com a pendência listada, e o painel mostra “custo parcial” com a contagem.
- Os valores de demonstração (`SEED_DEMO=true`) são marcados como **“DEMONSTRAÇÃO — valor fictício”** e nunca existem em produção.

## 1. Base de remuneração

- **Tabela por cargo:** salário-base com vigência, geral ou por unidade. A da unidade prevalece.
- **Colaborador:** histórico de salário-base com vigência e motivo (promoção, dissídio, mérito). O histórico é somente inserção (trigger no banco). Cada alteração grava também uma movimentação “alteração salarial”. Sem histórico, vale o salário de admissão.
- **Valores efetivamente pagos** por competência (AAAA-MM), em rubricas configuráveis:
  - *salário-base pago*: quando difere do contratual (faltas, admissão no meio do mês);
  - *adicionais*: noturno, horas extras, insalubridade, periculosidade, gratificação, DSR;
  - *variáveis*: taxa de serviço, comissão;
  - *premiações*: prêmio/bonificação.

  Cada rubrica indica se **incide encargos**. Só são aceitos lançamentos dentro do vínculo e de competências já ocorridas.

## 2. Benefícios

| Campo | Uso |
|---|---|
| Forma de custo | mensal por beneficiário, por dia × dias no mês (ex.: VT) ou sem custo para a empresa (convênio de desconto) |
| Custo por dependente | somado conforme os dependentes da adesão |
| Desconto do colaborador | fixo em R$ ou % do salário-base, **limitado ao custo** (ex.: VT até 6%) |
| Unidades | todas, ou só as marcadas (ex.: farmácia), com valor específico por unidade |
| Origem dos valores | obrigatória quando há valor |

**Adesão do colaborador:** tem data de início e de fim, valor individual opcional (ex.: tarifa diária
do VT do colaborador), dias por mês e número de dependentes. A prioridade do valor é: individual ›
unidade › benefício. O benefício conta o mês inteiro quando está ativo em qualquer dia da competência.

## 3. Remuneração total — sempre por parcelas

| Linha | Composição |
|---|---|
| Salário-base | contratual vigente (ou o pago, quando lançado) |
| Adicionais · Variáveis · Premiações | lançamentos da competência |
| Elogio Premiado | calculado pela regra vigente (abaixo) |
| PPR | provisão mensal da cota do colaborador |
| **Remuneração em dinheiro** | soma das linhas acima |
| Benefícios | custo líquido da empresa (bruto − desconto do colaborador) |
| **Remuneração total** | em dinheiro + benefícios |
| Encargos estimados | Σ alíquotas cadastradas × (salário + rubricas com incidência). Prêmios, Elogio Premiado e PPR **não** têm incidência. Sem alíquota cadastrada: “sem parâmetros” |
| **Custo total estimado** | remuneração total + encargos |

Contratos PJ não têm encargos de folha nem participam do PPR. O salário-base aparece sempre na
própria linha e nunca é apresentado como remuneração total.

### Elogio Premiado

- **Regra com vigência:** valor por elogio aprovado, máximo de elogios premiados por mês, teto mensal em R$ e origens válidas (vazio = todas).
- **Fluxo do elogio:** registrar (data, origem, referência) → aprovar, ou recusar com motivo.
- Duplicidades são bloqueadas (mesma origem e referência). O elogio precisa estar dentro do vínculo do colaborador.
- O prêmio é **calculado, não lançado**. A rubrica “Elogio Premiado” é de sistema e não aceita lançamento manual, o que evita contar o prêmio duas vezes.
- Elogios aprovados sem regra cadastrada viram pendência (não são estimados).

### PPR (parametrizável)

- **Parâmetros:** período, montante com 100% das metas, unidade (ou todas), teto de atingimento por meta, gatilho (atingimento mínimo), forma de distribuição (igual ou proporcional ao salário-base), meses mínimos no período e proporcionalidade aos meses trabalhados.
- **Metas:** peso e atingimento apurado. Os pesos precisam somar 100% para apurar.
- **Atingimento ponderado** = Σ peso × min(atingimento, teto). Abaixo do gatilho, nada é pago.
- **Elegíveis:** CLT, da unidade do programa, com os meses mínimos. Conta como mês trabalhado o mês com 15 dias ou mais de vínculo.
- **Provisão mensal** = cota do colaborador ÷ meses que ele trabalhou no período, lançada em cada um desses meses.
- Enquanto as metas não forem apuradas, o painel mostra a **projeção a 100%**, sinalizada como projeção.
- O rateio considera a empresa inteira. O RH de unidade vê só as cotas da própria unidade.

## 4. Pesquisa salarial

Fonte: as próprias entrevistas. O período é definido pela data da 1ª entrevista da candidatura.

- Pretensão, oferta e último salário: média, mediana e n.
- **Diferença pretensão − oferta**: usa só candidaturas com os dois valores (pares).
- **Motivos de recusa pelo candidato**: desistências na entrevista e na admissão. Ficam separados das **reprovações** (RH e gestor).
- **Benefícios mais valorizados**: com o número de candidaturas que informaram.
- **Salário praticado por cargo**: salário-base vigente dos ativos (mediana, mínimo, máximo, n), ao lado da tabela do cargo.
- **Mercado**: registros de concorrentes e outros hotéis do Rio, com cargo do catálogo, categoria do hotel, bairro, fonte e referência obrigatória.
  - **Salário-base e remuneração total ficam em colunas separadas.** O sistema recusa total menor que a base.
- **Cargos com maior dificuldade de contratação**, lado a lado:
  - vagas abertas e idade da vaga mais antiga;
  - mediana de dias até contratar;
  - entrevistados por contratação;
  - taxa de desistência;
  - % de pretensões acima da oferta.

  A ordenação é pelo maior entre “dias até contratar” e “idade da vaga mais antiga”. Não há índice com pesos arbitrários.

## Acesso restrito

| Permissão | Admin | RH corporativo | RH de unidade | Gestor |
|---|:-:|:-:|:-:|:-:|
| `remuneracao.view` (salários, custo) | ✓ | ✓ | ✓ só a unidade | — |
| `remuneracao.manage` (salário, lançamentos, adesões, elogios) | ✓ | ✓ | ✓ só a unidade | — |
| `remuneracao.config` (tabela, benefícios, encargos, Elogio Premiado, PPR) | ✓ | ✓ | — (política corporativa) | — |
| `pesquisa_salarial.view` / `.manage` | ✓ | ✓ | ✓ | — |

Toda gravação fica na auditoria. O gestor não vê salário em nenhuma tela: o menu esconde os itens,
as URLs levam a “acesso negado” e os serviços recusam a chamada.

## Testes

- `tests/unit/compensation.test.ts`: competência e vigências, benefício por dia com desconto de 6% limitado ao custo, dependentes, valor ausente, Elogio Premiado (limites e origens), encargos só com alíquota, PPR (teto, gatilho, meses ≥ 15 dias, distribuição igual e proporcional), remuneração total com parcelas e incidência, PJ.
- `tests/integration/compensation.test.ts`: unidade isolada com 3 colaboradores e todos os totais conferidos à mão, validações, imutabilidade do histórico, filtros, pesquisa salarial com valores conhecidos e restrições de acesso (gestor, RH de outra unidade, política só corporativa).
- `tests/e2e/compensation.mjs` (`npm run test:e2e:remuneracao`): soma das parcelas na tela, lançamento refletido no custo com encargos, origem obrigatória do valor, Elogio Premiado, PPR, registro de mercado, gestora sem acesso, RH de unidade só com a própria unidade, celular.
