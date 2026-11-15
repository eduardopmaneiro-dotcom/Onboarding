import type { CandidateEventType, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Registra uma etapa no histórico do candidato (somente inserção). */
export function recordEvent(
  tx: Tx,
  e: {
    candidateId: string;
    applicationId?: string | null;
    interviewId?: string | null;
    type: CandidateEventType;
    summary: string;
    details?: Record<string, unknown>;
    actorUserId?: string | null;
    actorName?: string | null;
    occurredAt?: Date;
  }
) {
  return tx.candidateEvent.create({
    data: {
      candidateId: e.candidateId,
      applicationId: e.applicationId ?? null,
      interviewId: e.interviewId ?? null,
      type: e.type,
      summary: e.summary.slice(0, 500),
      details: e.details ? (JSON.parse(JSON.stringify(e.details)) as Prisma.InputJsonValue) : undefined,
      actorUserId: e.actorUserId ?? null,
      actorName: e.actorName ?? null,
      occurredAt: e.occurredAt ?? new Date(),
    },
  });
}
