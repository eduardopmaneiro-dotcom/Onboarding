-- Proteções no nível do banco (defesa em profundidade: valem mesmo fora da aplicação)

-- 1) Trilha de auditoria e histórico de movimentações são somente-inserção.
CREATE OR REPLACE FUNCTION riale_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Tabela % é somente inserção (auditoria/LGPD)', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION riale_block_mutation();

CREATE TRIGGER movement_history_immutable
  BEFORE UPDATE OR DELETE ON "MovementHistory"
  FOR EACH ROW EXECUTE FUNCTION riale_block_mutation();

-- 2) Gestor precisa de CPF ou matrícula interna.
ALTER TABLE "Manager" ADD CONSTRAINT manager_identification_chk
  CHECK ("cpfHash" IS NOT NULL OR "internalId" IS NOT NULL);

-- 3) Gestor não pode ser superior de si mesmo.
ALTER TABLE "Manager" ADD CONSTRAINT manager_not_self_superior_chk
  CHECK ("directSuperiorId" IS NULL OR "directSuperiorId" <> "id");

-- 4) CPF cifrado sempre acompanha o hash (e vice-versa).
ALTER TABLE "Manager"   ADD CONSTRAINT manager_cpf_pair_chk   CHECK (("cpfHash" IS NULL) = ("cpfEnc" IS NULL));
ALTER TABLE "Employee"  ADD CONSTRAINT employee_cpf_pair_chk  CHECK (("cpfHash" IS NULL) = ("cpfEnc" IS NULL));
ALTER TABLE "Candidate" ADD CONSTRAINT candidate_cpf_pair_chk CHECK (("cpfHash" IS NULL) = ("cpfEnc" IS NULL));

-- 5) Integridade de valores.
ALTER TABLE "JobOpening" ADD CONSTRAINT job_opening_headcount_chk CHECK ("headcount" > 0);
ALTER TABLE "Unit" ADD CONSTRAINT unit_code_format_chk CHECK ("code" ~ '^[A-Z0-9_]{2,20}$');
