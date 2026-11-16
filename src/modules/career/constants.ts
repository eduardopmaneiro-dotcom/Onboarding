import type { EducationLevel } from "@prisma/client";
export const EDUCATION_LABEL: Record<EducationLevel, string> = {
  NAO_EXIGIDA: "Não exigida", FUNDAMENTAL_INCOMPLETO: "Fundamental incompleto", FUNDAMENTAL: "Fundamental completo", MEDIO_INCOMPLETO: "Médio incompleto",
  MEDIO: "Médio completo", TECNICO: "Técnico", SUPERIOR_INCOMPLETO: "Superior incompleto", SUPERIOR: "Superior completo", POS_GRADUACAO: "Pós-graduação",
};
export const NOT_AUTOMATIC = "Trilhas indicam possibilidades de crescimento. Promoção não é automática: depende de vaga, dos requisitos mínimos, da avaliação e da aprovação da empresa.";
