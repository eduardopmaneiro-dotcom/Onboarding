# Carga de dados da empresa

Tela: **Configurações › Importar dados da empresa** (`/configuracoes/importar-dados`), somente para
o **Administrador** (permissão `dados.importar`).

## Fluxo

1. **Enviar** a planilha padronizada (.xlsx). Ela é guardada cifrada, com classificação *Sensível*, e só administradores podem baixá-la.
2. **Prévia**: mostra o que será criado, atualizado e ignorado, linha a linha. **Nada é gravado** nesta etapa.
3. **Aplicar**: grava tudo e registra a carga (arquivo, hash, competência e resumo) na auditoria.

Reimportar a mesma competência **não duplica**:

- colaboradores casam por CPF ou matrícula;
- os lançamentos importados da competência são substituídos;
- pisos e adesões só são criados se ainda não existirem;
- descritivos só mudam se o texto mudar.

## Planilha padronizada (abas)

| Aba | Colunas |
|---|---|
| Parâmetros | Competência (AAAA-MM) · Data do relatório de cargos (AAAA-MM-DD) · Fonte cargos · Fonte folha |
| Cargos | Cargo · Perfil · Colaboradores · Descrição · Atividades · Piso salarial · CBO (formato do “Relatório de Cargos” da Sólides) |
| Colaboradores | Unidade (BRISA, IMPERIAL, VILAMAR) · Matrícula · Nome · CPF · Admissão · Situação · Vínculo · Horas mês · Cargo · CBO · Centro de custo · Departamento folha · Salário · Desligamento · Origem da data de desligamento |
| Rubricas | Unidade · Matrícula · Código · Rubrica · Referência · Valor · Tipo (P = provento, D = desconto) |
| Encargos | Unidade · Base INSS · INSS empresa · RAT · Terceiros · Base FGTS · Valor FGTS · Base FGTS aprendiz · Valor FGTS aprendiz (totais do resumo da folha) |
| Clínica | Nome · Endereço · Telefone · CNPJ · Observação |

A primeira carga (competência 10/2026) foi gerada a partir dos documentos da empresa:

- Relatório de Cargos (Sólides) de 15/11/2026;
- Folhas de Pagamento 10/2026 da Brisa, do Imperial e do Vilamar (sistema contábil);
- Contrato da CRED MHS.

A conversão foi feita por um script fora do repositório: os arquivos com dados pessoais **não** ficam no código.

## Regras

**Cargos**

- O título do relatório é separado em cargo e variação: “Garçom Brisa” vira o cargo *Garçom* com piso da unidade Brisa; “Gerente Geral Brisa PJ” vira *Gerente Geral* com piso da Brisa marcado como PJ.
- As grafias originais entram como apelidos do cargo.
- Cargos novos entram com **nível a definir**: o relatório não informa o nível N1–N7.
- O CBO fica em campo próprio, e vários cargos podem ter o mesmo CBO.

**Descritivo**

- Objetivo = Descrição; responsabilidades = Atividades (uma por item); perfil comportamental = Perfil.
- Publicado como vigente, com a origem registrada. Quando há várias variações do mesmo cargo, vale a com mais colaboradores.
- **Descritivos cadastrados manualmente são preservados.**
- O relatório não traz requisitos mínimos nem escolaridade. Esses campos ficam “não informados” até o RH completar; nada é inventado.

**Piso salarial**

- Gravado como mínimo e referência da faixa, com vigência na data do relatório. O máximo fica em aberto até a política salarial definir.

**Colaboradores**

- Importa celetistas e aprendizes. **Diretores com pró-labore (sócios) não são importados**, porque não são empregados.
- A matrícula fica como `UNIDADE-número`, porque cada CNPJ tem a sua numeração.
- Situação: *Trabalhando* e *Férias* viram ativo; *Doença* vira afastado; *Demitido* vira desligado, com a data informada na planilha.
- Na primeira carga, a data de desligamento foi derivada do “saldo de salário (dias)” da folha, com tipo **a confirmar**.

**Departamento**

| Centro de custo da folha | Departamento |
|---|---|
| Restaurante, Banquetes, Bar da Piscina, Bar do Lobby | A&B — Salão |
| Portaria | Recepção |
| RH/DP | Recursos Humanos |
| Almoxarifado | Compras e Almoxarifado |
| Gerência Geral | Diretoria |

Os demais têm o mesmo nome dos dois lados. Um centro de custo desconhecido vira um departamento com o nome dele.

**Salário**: o salário contratual da folha entra no histórico de salário-base, só quando muda.

**Rubricas de proventos → remuneração da competência**

| Rubrica | Vira |
|---|---|
| Dias normais, férias, afastamento pago, saldo de salário | Salário pago |
| Adicional noturno e reflexo DSR | Adicional noturno / DSR |
| Horas extras, insalubridade, periculosidade, cargo de confiança, feriado, salário substituição | Adicionais |
| Gorjeta | Taxa de serviço (variável) |
| Elogio Premiado | Elogio Premiado **pago** (não é recalculado pela regra, para não contar duas vezes) |
| Premiação por desempenho | Prêmio |
| 1/3 de férias, 13º, rescisão, aviso, estouros, devoluções | **não importados**: não são remuneração mensal recorrente (aparecem na prévia) |

**Descontos que indicam benefício**

| Desconto | Adesão |
|---|---|
| VT 6% | Vale-transporte |
| Desconto refeição | Alimentação |
| Assistência médica Intermédica | Plano de saúde |
| OdontoPrev | Plano odontológico |
| Farmácia | Benefício farmacêutico |

- A adesão é criada com o valor descontado do colaborador registrado na observação. O **custo para a empresa não consta da folha** e continua pendente.
- Fatos da folha gravados só quando o campo está vazio: VT com desconto de 6%; fornecedores Intermédica e OdontoPrev; farmácia disponível só nas unidades em que aparece (Brisa).

**Encargos**

- As alíquotas são apuradas dos totais da folha: INSS empresa, RAT×FAP, Terceiros e FGTS.
- O valor mais frequente entre as unidades vira o geral; os diferentes viram alíquota da unidade. Em 10/2026, o RAT×FAP é 2,067% na Brisa e 1% em Imperial e Vilamar.
- O FGTS de aprendiz (2%) é gravado à parte.
- As provisões de 13º e férias **não** são preenchidas: são decisão da contabilidade.

**Clínica**: a clínica ocupacional do contrato é cadastrada para o exame admissional.

## Testes

- `tests/integration/dataimport.test.ts`: planilha **sintética** com unidade/PJ, aprendiz, desligado, afastado, CPF inválido, diretor, rubricas, descontos de benefício, encargos e clínica. Cobre a prévia sem gravação, o acesso só de administrador e a reimportação idempotente.
- `tests/e2e/dataimport.mjs` (`npm run test:e2e:carga`): envio, prévia e aplicação no navegador; RH bloqueado.
- A carga real (10/2026) foi conferida no ambiente local, que depois foi apagado. O salário pago e a gorjeta importados batem centavo a centavo com a folha das três unidades.
