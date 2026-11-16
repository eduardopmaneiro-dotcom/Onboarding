import type { BenefitCategory, BenefitCostType, DiscountType, MarketSource, PayCategory } from "@prisma/client";

export const PAY_CATEGORY_LABEL: Record<PayCategory, string> = { BASE_PAGO: "Salário-base pago", ADICIONAL: "Adicionais", VARIAVEL: "Variáveis", PREMIACAO: "Premiações" };
export const BENEFIT_CATEGORY_LABEL: Record<BenefitCategory, string> = {
  VALE_TRANSPORTE: "Vale-transporte", ALIMENTACAO: "Alimentação", PLANO_SAUDE: "Plano de saúde", PLANO_ODONTO: "Plano odontológico",
  TOTALPASS: "TotalPass", EDUCACAO: "Educação", FARMACIA: "Farmácia", OUTRO: "Outro",
};
export const COST_TYPE_LABEL: Record<BenefitCostType, string> = { MENSAL: "Valor mensal por beneficiário", POR_DIA: "Valor por dia × dias no mês", SEM_CUSTO: "Sem custo para a empresa (convênio)" };
export const DISCOUNT_LABEL: Record<DiscountType, string> = { NENHUM: "Sem desconto", FIXO: "Desconto fixo (R$/mês)", PERCENTUAL_SALARIO: "Desconto em % do salário-base (limitado ao custo)" };
export const MARKET_SOURCE_LABEL: Record<MarketSource, string> = { CONCORRENTE: "Contato com concorrente", ANUNCIO_VAGA: "Anúncio de vaga", PESQUISA_SETORIAL: "Pesquisa setorial", SINDICATO: "Sindicato / convenção coletiva", CANDIDATO: "Informado por candidato", OUTRO: "Outro" };
export const HOTEL_CATEGORIES = ["Econômico", "Midscale", "Upscale", "Luxo"];

/** Catálogo institucional pedido pela empresa — SEM valores (vêm da empresa, com a origem registrada). */
export const DEFAULT_BENEFITS: Array<{ code: string; name: string; category: BenefitCategory; costType: BenefitCostType; discountType?: DiscountType; allUnits?: boolean; description: string }> = [
  { code: "VT", name: "Vale-transporte", category: "VALE_TRANSPORTE", costType: "POR_DIA", discountType: "PERCENTUAL_SALARIO", description: "Valor diário por colaborador (trajeto) × dias no mês. Desconto legal de até 6% do salário-base (Lei 7.418/85) — informe o percentual praticado." },
  { code: "ALIMENTACAO", name: "Alimentação", category: "ALIMENTACAO", costType: "MENSAL", description: "Refeição no local e/ou vale — informe o custo mensal e o desconto, se houver." },
  { code: "PLANO_SAUDE", name: "Plano de saúde", category: "PLANO_SAUDE", costType: "MENSAL", description: "Custo do titular e, se houver, por dependente, conforme tabela da operadora." },
  { code: "PLANO_ODONTO", name: "Plano odontológico", category: "PLANO_ODONTO", costType: "MENSAL", description: "Custo do titular e, se houver, por dependente." },
  { code: "TOTALPASS", name: "TotalPass", category: "TOTALPASS", costType: "MENSAL", description: "Informe o custo para a empresa e a coparticipação do colaborador, se houver." },
  { code: "EDU_UVA", name: "Benefício educacional — UVA", category: "EDUCACAO", costType: "MENSAL", description: "Confirme se é convênio de desconto (sem custo para a empresa) ou subsídio, e o valor." },
  { code: "EDU_ESTACIO", name: "Benefício educacional — Estácio", category: "EDUCACAO", costType: "MENSAL", description: "Confirme se é convênio de desconto (sem custo para a empresa) ou subsídio, e o valor." },
  { code: "FARMACIA", name: "Benefício farmacêutico", category: "FARMACIA", costType: "MENSAL", allUnits: false, description: "Oferecido conforme a unidade — marque as unidades e os valores." },
];

/** Encargos usuais sobre a folha — SEM alíquotas (dependem do regime tributário, CNAE/FAP e FPAS da empresa). */
export const DEFAULT_CHARGES: Array<{ code: string; label: string; legalRef: string }> = [
  { code: "INSS_PATRONAL", label: "INSS patronal (CPP)", legalRef: "Lei 8.212/91, art. 22, I — depende do regime tributário" },
  { code: "RAT_FAP", label: "RAT/SAT ajustado pelo FAP", legalRef: "Lei 8.212/91, art. 22, II — depende do CNAE e do FAP" },
  { code: "TERCEIROS", label: "Terceiros (Sistema S, salário-educação, INCRA)", legalRef: "Depende do código FPAS" },
  { code: "FGTS", label: "FGTS", legalRef: "Lei 8.036/90, art. 15" },
  { code: "PROV_13", label: "Provisão de 13º salário", legalRef: "Lei 4.090/62" },
  { code: "PROV_FERIAS", label: "Provisão de férias + 1/3", legalRef: "CF art. 7º, XVII; CLT art. 129" },
  { code: "ENC_PROVISOES", label: "Encargos sobre provisões", legalRef: "Incidência dos encargos sobre 13º e férias" },
];

export const DEFAULT_PAY_TYPES: Array<{ code: string; label: string; category: PayCategory; chargeable: boolean; system?: boolean }> = [
  { code: "SALARIO_PAGO", label: "Salário-base pago", category: "BASE_PAGO", chargeable: true },
  { code: "ADIC_NOTURNO", label: "Adicional noturno", category: "ADICIONAL", chargeable: true },
  { code: "HORA_EXTRA", label: "Horas extras", category: "ADICIONAL", chargeable: true },
  { code: "INSALUBRIDADE", label: "Adicional de insalubridade", category: "ADICIONAL", chargeable: true },
  { code: "PERICULOSIDADE", label: "Adicional de periculosidade", category: "ADICIONAL", chargeable: true },
  { code: "GRATIFICACAO", label: "Gratificação de função", category: "ADICIONAL", chargeable: true },
  { code: "DSR", label: "DSR sobre variáveis", category: "ADICIONAL", chargeable: true },
  { code: "TAXA_SERVICO", label: "Taxa de serviço (gorjeta)", category: "VARIAVEL", chargeable: true },
  { code: "COMISSAO", label: "Comissão", category: "VARIAVEL", chargeable: true },
  { code: "PREMIO", label: "Prêmio / bonificação", category: "PREMIACAO", chargeable: false },
  { code: "ELOGIO_PREMIADO", label: "Elogio Premiado", category: "PREMIACAO", chargeable: false, system: true },
  { code: "PPR", label: "PPR (Participação nos Resultados)", category: "PREMIACAO", chargeable: false, system: true },
];
