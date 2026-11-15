#!/usr/bin/env bash
# Backup da Plataforma de RH Riale: banco (pg_dump, formato custom). Os documentos ficam
# cifrados dentro do banco (DocumentBlob); a pasta legada storage/documents é incluída se existir.
# Neon: use a conexão DIRETA (DATABASE_URL_UNPOOLED), não a do pooler.
# Uso: npm run db:backup   (lê DATABASE_URL, BACKUP_DIR, BACKUP_RETENTION_DAYS, BACKUP_GPG_RECIPIENT do .env)
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi

: "${DATABASE_URL:?DATABASE_URL não definida}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
DOCS="${DOCUMENTS_DIR:-./storage/documents}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SRC_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}"
DB_URL="${SRC_URL%%\?schema=*}"   # pg_dump não aceita ?schema= (mantém sslmode do Neon)

umask 077
mkdir -p "$BACKUP_DIR"
DB_FILE="$BACKUP_DIR/riale_rh_db_$STAMP.dump"
pg_dump --format=custom --no-owner --no-privileges --compress=9 --file="$DB_FILE" "$DB_URL"

DOC_FILE=""
if [ -d "$DOCS" ]; then
  DOC_FILE="$BACKUP_DIR/riale_rh_docs_$STAMP.tar.gz"
  tar -czf "$DOC_FILE" -C "$(dirname "$DOCS")" "$(basename "$DOCS")"
fi

if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
  for f in "$DB_FILE" $DOC_FILE; do gpg --batch --yes --encrypt --recipient "$BACKUP_GPG_RECIPIENT" --output "$f.gpg" "$f" && rm -f "$f"; done
fi

( cd "$BACKUP_DIR" && sha256sum riale_rh_*"$STAMP"* > "riale_rh_$STAMP.sha256" )
find "$BACKUP_DIR" -name 'riale_rh_*' -type f -mtime +"$RETENTION" -delete
echo "Backup concluído em $BACKUP_DIR ($STAMP). Retenção: $RETENTION dias."
