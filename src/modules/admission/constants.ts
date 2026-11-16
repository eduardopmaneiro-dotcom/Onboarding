import type { AdmissionCancelReason, AdmissionDocStatus, AdmissionStatus, DocumentCondition, ExamResult, ExamStatus, MilestoneOutcome, MilestoneStatus, TerminationType } from "@prisma/client";

type Tone = "gray" | "green" | "red" | "gold" | "blue";

export const ADMISSION_STATUS_LABEL: Record<AdmissionStatus, string> = { EM_ANDAMENTO: "Em andamento", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
export const ADMISSION_STATUS_TONE: Record<AdmissionStatus, Tone> = { EM_ANDAMENTO: "gold", CONCLUIDA: "green", CANCELADA: "gray" };

export const CANCEL_REASON_LABEL: Record<AdmissionCancelReason, string> = {
  DESISTENCIA_CANDIDATO: "Desistência do candidato", INAPTO_EXAME: "Inapto no exame admissional", DOCUMENTACAO: "Documentação insuficiente ou irregular",
  VAGA_CANCELADA: "Vaga cancelada", OUTRO: "Outro",
};

export const DOC_STATUS_LABEL: Record<AdmissionDocStatus, string> = { PENDENTE: "Pendente", RECEBIDO: "Recebido", EM_ANALISE: "Em análise", APROVADO: "Aprovado", RECUSADO: "Recusado" };
export const DOC_STATUS_TONE: Record<AdmissionDocStatus, Tone> = { PENDENTE: "gray", RECEBIDO: "blue", EM_ANALISE: "gold", APROVADO: "green", RECUSADO: "red" };

export const DOC_CATEGORIES: Record<string, string> = {
  IDENTIFICACAO: "Identificação", CADASTRAIS: "Dados cadastrais", CTPS: "Carteira de Trabalho Digital", BANCARIO: "Dados bancários",
  ESCOLARIDADE: "Escolaridade", DEPENDENTES: "Dependentes", OUTROS: "Outros",
};
export const CONDITION_LABEL: Record<DocumentCondition, string> = { SEMPRE: "Sempre", ESCOLARIDADE_EXIGIDA: "Quando o cargo exige escolaridade", COM_DEPENDENTES: "Quando há dependentes" };

export const EXAM_STATUS_LABEL: Record<ExamStatus, string> = { AGENDADO: "Agendado", REALIZADO: "Realizado", NAO_COMPARECEU: "Não compareceu", CANCELADO: "Cancelado" };
export const EXAM_RESULT_LABEL: Record<ExamResult, string> = { PENDENTE: "Aguardando resultado", APTO: "Apto", APTO_COM_RESTRICOES: "Apto com restrições", INAPTO: "Inapto" };

export const TERMINATION_LABEL: Record<TerminationType, string> = {
  PEDIDO_DEMISSAO: "Pedido de demissão", DISPENSA_SEM_JUSTA_CAUSA: "Dispensa sem justa causa", DISPENSA_JUSTA_CAUSA: "Dispensa por justa causa",
  TERMINO_EXPERIENCIA: "Término do contrato de experiência", RESCISAO_ANTECIPADA_EMPRESA: "Rescisão antecipada da experiência (empresa)",
  RESCISAO_ANTECIPADA_COLABORADOR: "Rescisão antecipada da experiência (colaborador)", ACORDO: "Acordo entre as partes", FALECIMENTO: "Falecimento", OUTRO: "Outro",
};
/** Iniciativa do desligamento — base do turnover voluntário × involuntário. */
export const TERMINATION_INITIATIVE: Record<TerminationType, "Empresa" | "Colaborador" | "Acordo" | "Outro"> = {
  PEDIDO_DEMISSAO: "Colaborador", DISPENSA_SEM_JUSTA_CAUSA: "Empresa", DISPENSA_JUSTA_CAUSA: "Empresa", TERMINO_EXPERIENCIA: "Empresa",
  RESCISAO_ANTECIPADA_EMPRESA: "Empresa", RESCISAO_ANTECIPADA_COLABORADOR: "Colaborador", ACORDO: "Acordo", FALECIMENTO: "Outro", OUTRO: "Outro",
};

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = { PENDENTE: "Pendente", REALIZADO: "Realizado", ENCERRADO_DESLIGAMENTO: "Encerrado (desligamento)" };
export const OUTCOME_LABEL: Record<MilestoneOutcome, string> = { SEGUE: "Aprovado — segue na experiência", EFETIVADO: "Efetivado (aprovado ao fim da experiência)", DESLIGAMENTO: "Indicado desligamento" };

/** Situação do exame em uma frase (o que falta). */
export function examSituation(e: { status: ExamStatus; result: ExamResult; asoReceivedAt: Date | null }): { label: string; tone: Tone } {
  if (e.status === "CANCELADO") return { label: "Cancelado", tone: "gray" };
  if (e.status === "NAO_COMPARECEU") return { label: "Não compareceu", tone: "red" };
  if (e.status === "AGENDADO") return { label: "Agendado", tone: "blue" };
  if (!e.asoReceivedAt) return { label: "Realizado — aguardando ASO", tone: "gold" };
  if (e.result === "INAPTO") return { label: "ASO recebido — inapto", tone: "red" };
  if (e.result === "PENDENTE") return { label: "ASO recebido — registrar resultado", tone: "gold" };
  return { label: `ASO recebido — ${EXAM_RESULT_LABEL[e.result].toLowerCase()}`, tone: "green" };
}

/** Checklist padrão (estrutura genérica — sem dados pessoais). Ajustável em Admissões › Configurações. */
export const DEFAULT_DOC_TYPES: Array<{ code: string; label: string; category: string; required?: boolean; condition?: DocumentCondition; description?: string }> = [
  { code: "RG_CNH", label: "Documento de identidade com foto (RG ou CNH)", category: "IDENTIFICACAO" },
  { code: "CPF", label: "CPF (ou documento com o número)", category: "IDENTIFICACAO" },
  { code: "FOTO", label: "Foto 3x4 recente", category: "IDENTIFICACAO" },
  { code: "TITULO_ELEITOR", label: "Título de eleitor", category: "IDENTIFICACAO", required: false },
  { code: "RESERVISTA", label: "Certificado de reservista (homens de 18 a 45 anos)", category: "IDENTIFICACAO", required: false },
  { code: "CERTIDAO_CIVIL", label: "Certidão de nascimento ou de casamento", category: "IDENTIFICACAO" },
  { code: "COMPROVANTE_RESIDENCIA", label: "Comprovante de residência (últimos 3 meses)", category: "CADASTRAIS" },
  { code: "FICHA_CADASTRAL", label: "Ficha cadastral preenchida e assinada", category: "CADASTRAIS" },
  { code: "PIS", label: "PIS/NIS (quando houver)", category: "CADASTRAIS", required: false },
  { code: "CTPS_DIGITAL", label: "Carteira de Trabalho Digital (PDF ou print com qualificação civil)", category: "CTPS" },
  { code: "DADOS_BANCARIOS", label: "Comprovante de conta bancária (titular, banco, agência e conta)", category: "BANCARIO" },
  { code: "ESCOLARIDADE", label: "Comprovante de escolaridade", category: "ESCOLARIDADE", condition: "ESCOLARIDADE_EXIGIDA" },
  { code: "DEP_CERTIDAO", label: "Certidão de nascimento dos dependentes", category: "DEPENDENTES", condition: "COM_DEPENDENTES" },
  { code: "DEP_CPF", label: "CPF dos dependentes", category: "DEPENDENTES", condition: "COM_DEPENDENTES" },
  { code: "DEP_VACINA", label: "Caderneta de vacinação de filhos menores de 7 anos (salário-família)", category: "DEPENDENTES", condition: "COM_DEPENDENTES", required: false },
  { code: "VALE_TRANSPORTE", label: "Declaração de opção pelo vale-transporte", category: "OUTROS" },
];
