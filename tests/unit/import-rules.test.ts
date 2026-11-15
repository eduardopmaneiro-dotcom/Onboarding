import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCandidateName, expandPositionText, extractSalaries, interpretOutcome, suggestField, suggestReason, tidyInterviewer } from "../../src/modules/import/rules";
import { parseDateText, parseTimeText } from "../../src/modules/import/parse";
import { nameSimilarity, normalizePhone, parseMoney, tidyName } from "../../src/lib/text";
import { localToDate, dateKey, startOfWeek, addDays } from "../../src/lib/datetime";

test("Cabeçalhos da planilha real são reconhecidos", () => {
  assert.equal(suggestField("Unidade"), "unidade");
  assert.equal(suggestField("Data entrevista"), "data");
  assert.equal(suggestField("Candidato"), "candidato");
  assert.equal(suggestField("Vaga"), "vaga");
  assert.equal(suggestField("Recrutador"), "recrutador");
  assert.equal(suggestField("Aprovado pelo RH?"), "resultado");
  assert.equal(suggestField("Motivo"), "motivo");
  assert.equal(suggestField("Coluna 12"), "ignorar");
});

// As 26 grafias distintas da coluna "Aprovado pelo RH?" encontradas na planilha do RH
const REAL: Array<[string, string, string?]> = [
  ["", "PENDENTE"], ["Não", "REPROVADO"], ["Sim", "APROVADO"], ["Sim/", "APROVADO"], ["Aprovado", "APROVADO"], ["Declinou", "DESISTIU"],
  ["Reprovado", "REPROVADO"], ["Sim/declinou", "APROVADO_CANDIDATO_DESISTIU"], ["Reprovado Aginco", "APROVADO_EXTERNA_REPROVADA"],
  ["Banco de Talentos", "BANCO_TALENTOS"], ["Buscar referencia ", "PENDENTE"], ["Sim RH /Não gestor ", "APROVADO_GESTOR_REPROVOU"],
  ["Sim/aguarda Aginco", "APROVADO_AGUARDA_EXTERNA"], ["Não aceitou salario", "DESISTIU_PROPOSTA"], ["Sim/reprovado aginco", "APROVADO_EXTERNA_REPROVADA"],
  ["Não/ Reprovado Aginco", "REPROVADO_EXTERNA_REPROVADA"], ["Não aceitou a proposta", "DESISTIU_PROPOSTA"], ["Sim  / Reprovado Aginco", "APROVADO_EXTERNA_REPROVADA"],
  ["Sim /Aguardando AGINCO", "APROVADO_AGUARDA_EXTERNA"], ["Sim/ aguarda sindicância", "APROVADO_AGUARDA_EXTERNA"], ["Aprovado Sara/ Duvida Tiago", "APROVADO_AGUARDA_GESTOR"],
  ["Aguarda entrevista com a Ana", "PENDENTE"], ["Aguardar entrevista com Roberta", "PENDENTE"], ["Sim/ Aguarda entrevista com a Ana", "APROVADO_AGUARDA_GESTOR"],
  ["SIM/Aguardar entrevista com Chefe", "APROVADO_AGUARDA_GESTOR"], ["Analisar com Eduardo (Pretensão Salarial)", "PENDENTE"],
  // ajustes pelo texto do motivo
  ["Sim", "APROVADO_EXTERNA_APROVADA", "Aprovado - AGINCO"], ["Sim", "APROVADO_EXTERNA_REPROVADA", "REPROVADO AGINGO"], ["Sim", "APROVADO_CANDIDATO_DESISTIU", "Aprovado - AGINCO - DECLINOU"],
];

test("Resultado: as 26 grafias reais + ajustes pelo motivo são interpretadas", () => {
  for (const [text, expected, motivo] of REAL) assert.equal(interpretOutcome(text, motivo).outcome, expected, `“${text}” / “${motivo ?? ""}”`);
  assert.equal(interpretOutcome("xyz qualquer").recognized, false);
});

test("Motivo: textos reais viram motivos padronizados (só em desfecho negativo)", () => {
  assert.equal(suggestReason("Não aderente a cultura da empresa", "REPROVADO"), "COMPORTAMENTAL");
  assert.equal(suggestReason("Candidato responde as expectativas da vaga mas a faixa salarial está acima R$ 5.000,00", "REPROVADO"), "PRETENSAO_SALARIAL");
  assert.equal(suggestReason("Dupla Jornada", "REPROVADO"), "DISPONIBILIDADE_HORARIO");
  assert.equal(suggestReason("Gestor responsavel informou que candidato não possui conhecimento generalista", "APROVADO_GESTOR_REPROVOU"), "TECNICA");
  assert.equal(suggestReason("Mora longe", "REPROVADO"), "OUTRO");
  assert.equal(suggestReason("", "REPROVADO"), "NAO_INFORMADO");
  assert.equal(suggestReason("", "DESISTIU_PROPOSTA"), "PRETENSAO_SALARIAL");
  assert.equal(suggestReason("Aprovado - AGINCO", "APROVADO"), null);
});

test("Salários são extraídos do texto livre", () => {
  assert.deepEqual(extractSalaries("Está ganhando no hotel atual, como garçom R$ 1600 + 4 pontos (média 500,00 por ponto)= 3.600,00"), { lastSalary: 3600 });
  assert.deepEqual(extractSalaries("Está ganhando atualmente R$ 2.600,00 no emprego atual"), { lastSalary: 2600 });
  assert.deepEqual(extractSalaries("faixa salarial está acima R$ 5.000,00"), { expectedSalary: 5000 });
  assert.deepEqual(extractSalaries("Mora longe"), {});
});

test("Nomes, etapas, recrutadores e cargos", () => {
  assert.deepEqual(cleanCandidateName("Pedro Henrique 2º etapa "), { name: "Pedro Henrique", stage: 2 });
  assert.deepEqual(cleanCandidateName("  Clara  Moraes "), { name: "Clara Moraes", stage: null });
  assert.deepEqual(tidyInterviewer("Sara/ Aline"), { display: "Sara / Aline", primary: "Sara" });
  assert.equal(expandPositionText("Ass. Governança"), "assistente governanca");
  assert.equal(expandPositionText("Aux de manutenção"), "auxiliar de manutencao");
  assert.equal(expandPositionText("ASG"), "auxiliar de servicos gerais");
  assert.equal(expandPositionText("RM"), "revenue manager");
  assert.equal(tidyName("ANA DA SILVA  souza"), "Ana da Silva Souza");
});

test("Datas, horários, telefones e valores", () => {
  assert.equal(parseDateText("2026-09-14"), "2026-09-14");
  assert.equal(parseDateText("14/09/2026"), "2026-09-14");
  assert.equal(parseDateText("14/9/26"), "2026-09-14");
  assert.equal(parseDateText("46279"), "2026-09-14");
  assert.equal(parseDateText("32/13/2026"), null);
  assert.equal(parseDateText("31/02/2026"), null);
  assert.equal(parseDateText("29/02/2028"), "2028-02-29");
  assert.equal(parseTimeText("14h30"), "14:30");
  assert.equal(parseTimeText("9:05"), "09:05");
  assert.equal(normalizePhone("+55 (21) 99999-8888"), "21999998888");
  assert.equal(normalizePhone("99999-8888"), "21999998888");
  assert.equal(normalizePhone("123"), null);
  assert.equal(parseMoney("R$ 2.150,00"), 2150);
  assert.equal(parseMoney("1980"), 1980);
  assert.ok(nameSimilarity("Ana Paula Ribeiro", "Ana Paula Ribeiro Santos") >= 0.67);
});

test("Fuso de São Paulo e semanas", () => {
  assert.equal(localToDate("2026-11-16", "09:00").toISOString(), "2026-11-16T12:00:00.000Z");
  assert.equal(dateKey(new Date("2026-11-16T02:30:00Z")), "2026-11-15");
  assert.equal(startOfWeek("2026-11-15"), "2026-11-09");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
