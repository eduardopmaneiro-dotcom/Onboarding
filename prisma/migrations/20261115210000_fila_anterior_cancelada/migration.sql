-- Fase 3: mensagens que ficaram na fila antes da existência do envio real (links de senha
-- expirados, avisos avulsos de aprovação) NÃO devem ser disparadas quando o e-mail for
-- configurado. Ficam registradas como canceladas (histórico preservado, nada é apagado).
UPDATE "Notification"
SET "status" = 'CANCELADA',
    "error" = 'Mensagem anterior à configuração do envio de e-mails (Fase 3) — não enviada'
WHERE "status" = 'PENDENTE' AND "attempts" = 0 AND "digestId" IS NULL;
