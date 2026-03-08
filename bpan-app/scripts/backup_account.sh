#!/usr/bin/env bash
set -euo pipefail

# Back up:
# 1) Full project database dump (safest rollback artifact)
# 2) Account-scoped row exports (easy inspection/restore-by-table)
#
# Required env:
#   DATABASE_URL     Postgres connection string for the target Supabase project
#   TARGET_USER_ID   UUID of the account to export
#
# Optional env:
#   BACKUP_ROOT      Output root dir (default: ./backups)

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd pg_dump
require_cmd psql

: "${DATABASE_URL:?Set DATABASE_URL first}"
: "${TARGET_USER_ID:?Set TARGET_USER_ID first}"

BACKUP_ROOT="${BACKUP_ROOT:-$(pwd)/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${BACKUP_ROOT}/account_${TARGET_USER_ID}_${STAMP}"
DB_DIR="${OUT_DIR}/db"
ROWS_DIR="${OUT_DIR}/account_rows"
META_DIR="${OUT_DIR}/meta"

mkdir -p "${DB_DIR}" "${ROWS_DIR}" "${META_DIR}"

echo "Backup output: ${OUT_DIR}"

cat > "${META_DIR}/README.txt" <<EOF
Backup created at (UTC): ${STAMP}
Target user: ${TARGET_USER_ID}

Artifacts:
- db/full_project.dump : pg_dump custom format (full DB backup)
- db/schema.sql        : schema-only SQL
- account_rows/*.ndjson: account-scoped row exports by table
- meta/export_summary.tsv: table row counts

Restore examples:
1) Full restore (to a clean DB):
   pg_restore --clean --if-exists --no-owner --no-privileges -d <DATABASE_URL> db/full_project.dump

2) Inspect account rows:
   head -n 20 account_rows/<table>.ndjson

Notes:
- This captures database contents only.
- File binaries in storage buckets are not included by pg_dump.
EOF

echo "Creating full database dump..."
pg_dump "${DATABASE_URL}" -Fc -f "${DB_DIR}/full_project.dump"

echo "Creating schema-only SQL..."
pg_dump "${DATABASE_URL}" --schema-only -f "${DB_DIR}/schema.sql"

USER_SQL_ESCAPED="${TARGET_USER_ID//\'/\'\'}"

echo "Discovering lab IDs related to target user..."
LAB_IDS_RAW="$(psql "${DATABASE_URL}" -X -A -t -c \
  "select id::text from public.labs where created_by = '${USER_SQL_ESCAPED}'
   union
   select lab_id::text from public.lab_members where user_id = '${USER_SQL_ESCAPED}' and coalesce(is_active, true) = true;" || true)"

LAB_IN_CLAUSE=""
if [[ -n "${LAB_IDS_RAW}" ]]; then
  while IFS= read -r lab; do
    [[ -z "${lab}" ]] && continue
    esc="${lab//\'/\'\'}"
    if [[ -z "${LAB_IN_CLAUSE}" ]]; then
      LAB_IN_CLAUSE="'${esc}'"
    else
      LAB_IN_CLAUSE="${LAB_IN_CLAUSE},'${esc}'"
    fi
  done <<< "${LAB_IDS_RAW}"
fi

echo "Finding candidate tables in public schema..."
TABLE_COLS="$(psql "${DATABASE_URL}" -X -A -F $'\t' -t -c \
  "select table_name, column_name
   from information_schema.columns
   where table_schema='public'
     and column_name in ('user_id','owner_user_id','created_by','booked_by','author_user_id','lab_id')
   order by table_name, ordinal_position;")"

declare -A TABLE_TO_COLS=()
while IFS=$'\t' read -r table col; do
  [[ -z "${table:-}" || -z "${col:-}" ]] && continue
  if [[ -n "${TABLE_TO_COLS[$table]:-}" ]]; then
    TABLE_TO_COLS["$table"]="${TABLE_TO_COLS[$table]},$col"
  else
    TABLE_TO_COLS["$table"]="$col"
  fi
done <<< "${TABLE_COLS}"

SUMMARY_FILE="${META_DIR}/export_summary.tsv"
printf "table\trows\n" > "${SUMMARY_FILE}"

export_table_ndjson() {
  local table="$1"
  local where_sql="$2"
  local out_file="${ROWS_DIR}/${table}.ndjson"

  psql "${DATABASE_URL}" -X -A -t -c \
    "copy (
       select row_to_json(t)::text
       from (select * from public.\"${table}\" where ${where_sql}) t
     ) to stdout;" > "${out_file}"

  local count
  count="$(wc -l < "${out_file}" | tr -d ' ')"
  printf "%s\t%s\n" "${table}" "${count}" >> "${SUMMARY_FILE}"
}

echo "Exporting account-scoped rows..."

# Always export profile row explicitly by id.
export_table_ndjson "profiles" "id = '${USER_SQL_ESCAPED}'"

for table in "${!TABLE_TO_COLS[@]}"; do
  cols_csv="${TABLE_TO_COLS[$table]}"
  IFS=',' read -r -a cols <<< "${cols_csv}"

  where_parts=()
  for col in "${cols[@]}"; do
    if [[ "${col}" == "lab_id" ]]; then
      if [[ -n "${LAB_IN_CLAUSE}" ]]; then
        where_parts+=("\"lab_id\" in (${LAB_IN_CLAUSE})")
      fi
    else
      where_parts+=("\"${col}\" = '${USER_SQL_ESCAPED}'")
    fi
  done

  if [[ "${#where_parts[@]}" -eq 0 ]]; then
    continue
  fi

  where_sql=""
  for i in "${!where_parts[@]}"; do
    if [[ "$i" -eq 0 ]]; then
      where_sql="${where_parts[$i]}"
    else
      where_sql="${where_sql} or ${where_parts[$i]}"
    fi
  done

  export_table_ndjson "${table}" "${where_sql}"
done

echo "Backup complete."
echo "Summary: ${SUMMARY_FILE}"
