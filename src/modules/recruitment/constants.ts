import type {
  ApplicationStatus, CandidateSource, ExternalCheckStatus, InterviewResult, JobOpeningStatus, ManagerDecision, WorkSchedule, WorkShift,
} from "@prisma/client";

export const JOB_STATUS_LABEL: Record<JobOpeningStatus, string> = {
  RASCUNHO: "Rascunho", AGUARDANDO_APROVACAO: "Aguardando aprovação", ABERTA: "Aberta", PAUSADA: "Pausada",
  PREENCHIDA: "Preenchida", CANCELADA: "Cancelada", ENCERRADA: "Encerrada",
};
export const JOB_STATUS_EDITABLE: JobOpeningStatus[] = ["ABERTA", "PAUSADA", "PREENCHIDA", "CANCELADA", "ENCERRADA"];

export const SCHEDULE_LABEL: Record<WorkSchedule, string> = {
  SEIS_POR_UM: "6x1", CINCO_POR_DOIS: "5x2", DOZE_POR_TRINTA_E_SEIS: "12x36", OUTRA: "Outra",
};
export const SHIFT_LABEL: Record<WorkShift, string> = {
  DIURNO: "Diurno", NOTURNO: "Noturno", MISTO: "Misto", ADMINISTRATIVO: "Administrativo",
};

export const SOURCE_LABEL: Record<CandidateSource, string> = {
  INDICACAO: "Indicação", SITE: "Site", LINKEDIN: "LinkedIn", INDEED: "Indeed", AGENCIA: "Agência", BANCO_TALENTOS: "Banco de talentos",
  INSTAGRAM: "Instagram", WHATSAPP: "WhatsApp", SINE: "SINE", PRESENCIAL: "Presencial / currículo entregue", EX_COLABORADOR: "Ex-colaborador", OUTRO: "Outro",
};

export const RESULT_LABEL: Record<InterviewResult, string> = {
  PENDENTE: "Pendente", APROVADO: "Aprovado", REPROVADO: "Reprovado", NAO_COMPARECEU: "Não compareceu", DESISTIU: "Desistiu",
};
export const RESULT_TONE: Record<InterviewResult, "gray" | "green" | "red" | "gold" | "blue"> = {
  PENDENTE: "gold", APROVADO: "green", REPROVADO: "red", NAO_COMPARECEU: "gray", DESISTIU: "gray",
};

export const APP_STATUS_LABEL: Record<ApplicationStatus, string> = {
  TRIAGEM: "Triagem", ENTREVISTA: "Em entrevista", AVALIACAO: "Avaliação externa", AGUARDANDO_GESTOR: "Aguardando gestor",
  PROPOSTA: "Proposta", APROVADO: "Aprovado", REPROVADO: "Reprovado", DESISTENTE: "Desistiu", NAO_COMPARECEU: "Não compareceu",
  BANCO_TALENTOS: "Banco de talentos", CONTRATADO: "Contratado",
};
export const APP_STATUS_TONE: Record<ApplicationStatus, "gray" | "green" | "red" | "gold" | "blue"> = {
  TRIAGEM: "gray", ENTREVISTA: "blue", AVALIACAO: "gold", AGUARDANDO_GESTOR: "gold", PROPOSTA: "blue", APROVADO: "green",
  REPROVADO: "red", DESISTENTE: "gray", NAO_COMPARECEU: "gray", BANCO_TALENTOS: "blue", CONTRATADO: "green",
};

export const DECISION_LABEL: Record<ManagerDecision, string> = {
  PENDENTE: "Aguardando gestor", APROVADO: "Aprovado pelo gestor", REPROVADO: "Reprovado pelo gestor", NOVA_ENTREVISTA: "Nova entrevista solicitada",
};

export const EXTERNAL_LABEL: Record<ExternalCheckStatus, string> = {
  NAO_APLICA: "Não se aplica", AGUARDANDO: "Aguardando", APROVADO: "Aprovado", REPROVADO: "Reprovado",
};

/** Motivos padronizados (lista oficial da Fase 2). NAO_INFORMADO só para histórico importado. */
export const DEFAULT_REASONS: Array<{ code: string; label: string; requiresNote?: boolean; active?: boolean }> = [
  { code: "EXPERIENCIA", label: "Falta de experiência" },
  { code: "TECNICA", label: "Incompatibilidade técnica" },
  { code: "COMPORTAMENTAL", label: "Incompatibilidade comportamental com os requisitos" },
  { code: "ESCOLARIDADE", label: "Escolaridade insuficiente" },
  { code: "PRETENSAO_SALARIAL", label: "Pretensão salarial" },
  { code: "DISPONIBILIDADE_HORARIO", label: "Disponibilidade de horário" },
  { code: "ESCALA", label: "Incompatibilidade com a escala" },
  { code: "OUTRO", label: "Outro", requiresNote: true },
  { code: "NAO_INFORMADO", label: "Não informado (registro histórico)", active: false },
];

export const BENEFITS = [
  "Vale-transporte", "Vale-refeição / alimentação no local", "Vale-alimentação", "Plano de saúde", "Plano odontológico",
  "Gorjeta / taxa de serviço", "Folga fixa no fim de semana", "Horário fixo", "Proximidade de casa", "Estabilidade CLT",
];
