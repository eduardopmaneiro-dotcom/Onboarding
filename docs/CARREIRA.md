# Fase 7 — Estrutura organizacional e desenvolvimento de carreira

Telas:

- **Cargos e carreira** (`/cargos`, `/cargos/[id]`): catálogo, descritivos, família, nível e faixa.
- **Trilhas de carreira** (`/carreira`): trilhas, rascunhos e política de carreira.
- **Carreira do colaborador** (`/carreira/colaborador/[id]`): elegibilidade, avaliação de promoção, movimentações e PDI.
- **Prévia do portal do colaborador** (`/carreira/portal/[id]`).
- **Indicadores de carreira** (`/carreira/indicadores`).
- **Banco de talentos** (`/banco-de-talentos`).
- **Faixas salariais**: Remuneração › Tabela por cargo.

## Fontes institucionais — nada foi inventado

| Conteúdo | Origem | Situação em produção |
|---|---|---|
| Famílias ocupacionais (Recepção e Portaria, Governança e Hospedagem, A&B, Reservas/Comercial/Eventos, Manutenção, RH/Controladoria/Marketing) | RH-CAR-01 | já cadastradas (Fase 1) |
| Níveis N1–N7 dos cargos | catálogo corporativo (Fase 2; níveis de cargos novos marcados como proposta a revisar) | já cadastrados |
| Critérios de domínio por nível (Recepção e Governança, N1–N2) | RH-CAR-01 | exibidos na página do cargo |
| Pesos da avaliação de promoção (Performance 25%, Competência 20%, Comportamento 15%, Aderência cultural 10%, Potencial de liderança 10%, PDI 10%, Conduta 10%) e nota mínima 70 | RH-CAR-01 | aplicados no cálculo |
| Critérios de entrada no PDL | RH-PDL-01 | preservados no modelo |
| **Descritivos de cargos** | não fornecidos | **vazios**: o RH cadastra a partir do documento; publicar exige o documento de origem |
| **Trilhas cargo → cargo e requisitos de progressão** | não fornecidos | **vazias**: o RH cadastra; publicar exige o documento de origem |
| Faixas salariais (mínimo, referência e máximo) | não fornecidas | vazias (Remuneração › Tabela por cargo) |

O botão **“Rascunho a partir do catálogo”** ordena os cargos de uma família pelo nível. O resultado é
apenas um **rascunho**: não aparece para colaboradores nem nos indicadores até o RH validar com o
documento e publicar. A trilha “Recepção (demonstração)” e os descritivos de demonstração existem
**somente** com `SEED_DEMO=true` e estão marcados como fictícios.

## 1. Descritivos de cargos

Cada versão do descritivo registra:

- objetivo do cargo e responsabilidades;
- **requisitos mínimos (obrigatórios)**: requisitos, escolaridade, experiência mínima e conhecimentos técnicos exigidos;
- **desenvolvíveis pelo PDI**: competências fundamentais e conhecimentos técnicos a desenvolver;
- superior direto.

Os **subordinados** são calculados: são os cargos cujo descritivo vigente aponta este cargo como superior.

Regras:

- O mesmo item não pode estar ao mesmo tempo como requisito mínimo e como item do PDI.
- O descritivo é versionado: rascunho → vigente. A vigente anterior vai para o histórico, e o banco garante uma única vigente por cargo.
- Documentos podem ser anexados (cifrados, com auditoria).

## 2. Plano de cargos e salários

| Elemento | Onde |
|---|---|
| Família ocupacional | cadastro do cargo (RH-CAR-01) |
| Nível hierárquico | N1–N7 no cargo, com os critérios do nível na família |
| Faixa salarial: mínimo, referência e máximo | Remuneração › Tabela por cargo (com vigência, geral ou por unidade; o banco garante mínimo ≤ referência ≤ máximo) |
| Requisitos de progressão | em cada passo da trilha: tempo mínimo no cargo anterior, nota mínima, requisitos mínimos e competências do PDI |

As faixas usam a **mesma tabela** do custo de pessoal (Fase 6): há uma única fonte de salário de
referência.

## 3. Trilhas de carreira

- Representação visual: cada cargo aparece em um cartão com nível, ocupantes e (para quem tem acesso) a referência salarial, ligado ao próximo por seta. Abaixo de cada cargo aparecem os requisitos para chegar a ele.
- Trilhas são configuráveis: criar, adicionar, reordenar e remover cargos, e passar por rascunho, vigente e arquivada.
- Trilhas diferentes podem compartilhar cargos, o que forma ramificações.
- **Promoção não é automática.** O aviso aparece na trilha, no cargo, na carreira do colaborador e no portal.

## 4. Potencial de candidatos e banco de talentos

- **Perfil do candidato**: experiências ligadas ao catálogo (função, empresa, meses), escolaridade e competências.
- **Compatibilidade por evidências, sem nota inventada**:
  - experiência no próprio cargo;
  - experiência no cargo anterior da trilha;
  - experiência na mesma família;
  - aprovação anterior do RH em entrevista para o cargo;
  - escolaridade em relação à exigida;
  - competências em comum com o descritivo.
- *Compatível* = experiência suficiente (ou aprovado pelo RH para o cargo) e escolaridade atendida. *Parcial* = alguma evidência.
- **Banco de talentos** por cargo: ativo, contatado ou arquivado. A inclusão fica no histórico do candidato.
- **Integração com o recrutamento**:
  - a ficha do candidato mostra as posições compatíveis;
  - a vaga aberta mostra os candidatos compatíveis do banco;
  - colaboradores ativos não entram como candidatos.

## 5. Portal do colaborador (arquitetura preparada)

`portalView(employeeId)` monta exatamente o que o colaborador verá:

- cargo atual e descritivo;
- trilha e próximos níveis;
- **requisitos mínimos separados do que desenvolver pelo PDI**;
- situação dos critérios objetivos;
- faixa salarial **conforme a política** (`portal.faixa_salarial`: não exibir · só referência · faixa completa; padrão: não exibir);
- PDI e histórico profissional.

Nenhum salário individual aparece. Já existe o campo `Employee.portalUserId` para o login futuro. O
RH vê a prévia em “Prévia do portal do colaborador”.

## 6. Indicadores (`/carreira/indicadores`)

| Indicador | Regra |
|---|---|
| Elegibilidade para progressão | Situação **hoje**, pelo melhor passo seguinte nas trilhas vigentes: atende tempo e nota (pode ser indicado ao comitê) · falta avaliação · nota abaixo do mínimo · tempo não cumprido · sem trilha vigente |
| Movimentações internas | Promoções, mudanças de cargo, transferências, trocas de gestor e alterações salariais no período |
| Promoções | Quantidade e taxa (promoções ÷ efetivo médio) |
| Distribuição salarial | Por cargo: mínimo, mediana e máximo pagos, faixa, quantos estão abaixo, dentro e acima, compa-ratio médio. Cada colaborador é comparado à faixa da própria unidade. Só para quem tem acesso à remuneração |
| Potenciais sucessores | Para cargos de liderança nas trilhas: ocupantes do passo anterior, separados entre “atendem os critérios” e “em desenvolvimento” (com o que falta) |
| Vagas preenchidas internamente | Vagas preenchidas por movimentação interna ÷ vagas preenchidas no período |

**Movimentação interna** (promoção, mudança de cargo, transferência, troca de gestor):

- registra o “de → para” no histórico e atualiza o cargo, o departamento e o gestor;
- pode gravar o novo salário (com justificativa obrigatória se ficar fora da faixa);
- pode preencher a vaga, que fecha ao atingir a quantidade;
- só aceita como **promoção** um cargo de nível superior ou o próximo passo de uma trilha vigente;
- com data futura, passa a valer quando a data chega (rotina automática).

## Permissões

| Permissão | Admin | RH corporativo | RH de unidade | Gestor |
|---|:-:|:-:|:-:|:-:|
| `carreira.view` (cargos, descritivos, trilhas — sem salários) | ✓ | ✓ | ✓ | ✓ (própria equipe) |
| `carreira.manage` (descritivos, trilhas, política) | ✓ | ✓ | — (corporativo) | — |
| `carreira.movimentar` (promoção, transferência, avaliação, PDI) | ✓ | ✓ | ✓ só a unidade | — |
| Faixas e salários nas telas de carreira | com `remuneracao.view` | | | — |

## Testes

- `tests/unit/career.test.ts`: pesos do RH-CAR-01, tempo no cargo, elegibilidade, escolaridade, posição na faixa e compatibilidade de candidatos.
- `tests/integration/career.test.ts`: 7 cenários com família, cargos e colaboradores isolados:
  - descritivo e versões;
  - trilha (rascunho, validações, publicação);
  - elegibilidade com nota 78,5;
  - promoção validada com faixa e vaga interna;
  - movimentação agendada;
  - portal com política de faixa;
  - banco de talentos;
  - indicadores conferidos.
- `tests/e2e/career.mjs` (`npm run test:e2e:carreira`): 9 cenários no navegador.
