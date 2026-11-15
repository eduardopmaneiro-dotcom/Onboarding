#!/usr/bin/env bash
# Restauração: npm run db:restore -- backups/riale_rh_db_<STAMP>.dump[.gpg]
# ATENÇÃO: substitui os dados do banco apontado por DATABASE_URL.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
FILE="${1:?Informe o arquivo .dump}"
DB_URL="${DATABASE_URL%%\?*}"
if [[ "$FILE" == *.gpg ]]; then gpg --batch --decrypt --output "${FILE%.gpg}" "$FILE"; FILE="${FILE%.gpg}"; fi
read -r -p "Restaurar $FILE sobre $(echo "$DB_URL" | sed 's#//[^@]*@#//***@#')? Digite RESTAURAR: " ok
[ "$ok" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DB_URL" "$FILE"
echo "Restauração concluída. Lembre-se de restaurar também storage/documents e usar a mesma DATA_ENCRYPTION_KEY."
