#!/usr/bin/env bash
# Vermelho primeiro do parser de DDL do `/database-review`.
#
# strict-ok: harness de teste — continua depois de um caso vermelho (`schematize-shell` -> `references/piso.md` secao 1)
set -u
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
G="$AQUI/check-schema.mjs"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT INT TERM
ok=0; fail=0
caso() {
  local nome="$1" esp="$2" agulha="$3"
  local d="$TMP/$nome"; mkdir -p "$d"; cat > "$d/schema.sql"
  local saida; saida="$(node "$G" "$d" 2>&1)"; local rc=$?
  if [ "$rc" != "$esp" ]; then echo "  ✖ $nome: exit $rc, esperado $esp"; sed 's/^/      /' <<<"$saida"; fail=$((fail+1)); return; fi
  if [ -n "$agulha" ] && ! grep -qF -- "$agulha" <<<"$saida"; then echo "  ✖ $nome: exit certo, saída sem \"$agulha\""; sed 's/^/      /' <<<"$saida"; fail=$((fail+1)); return; fi
  echo "  ✔ $nome"; ok=$((ok+1))
}

echo "== verde de partida =="
caso verde 0 "0 bloqueante" <<'FIX'
create table tenant (
  id uuid primary key,
  nome text not null,
  criado_at timestamptz not null default now()
);

create table usuario (
  id uuid primary key,
  tenant_id uuid not null references tenant(id) on delete cascade,
  email text not null,
  email_hash bytea not null unique,
  saldo numeric(12,2) not null default 0,
  criado_at timestamptz not null default now()
);
create index concurrently idx_usuario_tenant on usuario (tenant_id);
FIX

echo "== PII =="
caso unique-em-email 1 "unique-em-pii-clara" <<'FIX'
create table usuario (
  id uuid primary key,
  email text unique
);
FIX
caso indice-em-email 1 "indice-em-pii-clara" <<'FIX'
create table usuario (
  id uuid primary key,
  email text not null
);
create index concurrently idx_email on usuario (email);
FIX

echo "== tipos =="
caso dinheiro-float 1 "ACUMULA em soma" <<'FIX'
create table pedido (
  id uuid primary key,
  valor_total double precision not null
);
FIX
caso timestamp-sem-tz 1 "depender do fuso" <<'FIX'
create table evento (
  id uuid primary key,
  criado_at timestamp not null
);
FIX
caso id-sequencial 1 "convida enumeração" <<'FIX'
create table cliente (
  id bigserial primary key,
  nome text not null
);
FIX

echo "== migração =="
caso rename-column 1 "rename-column" <<'FIX'
alter table usuario rename column email to email_antigo;
FIX
caso not-null-sem-default 1 "trava a tabela" <<'FIX'
alter table usuario add column plano text not null;
FIX

echo "== relação =="
caso fk-sem-on-delete 1 "NO ACTION" <<'FIX'
create table item (
  id uuid primary key,
  pedido_id uuid not null references pedido(id)
);
create index concurrently idx_item_pedido on item (pedido_id);
FIX

echo "== saída machine-readable =="
d="$TMP/json"; mkdir -p "$d"
printf 'create table u (\n  id bigserial primary key,\n  email text unique\n);\n' > "$d/schema.sql"
saida="$(node "$G" "$d" --json 2>&1)"
if node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); process.exit(j.veredito==="reprovado" && j.achados.every(a=>a.arquivo&&a.linha&&a.regra&&typeof a.severidade==="number") ? 0 : 1)' <<<"$saida"; then
  echo "  ✔ --json com arquivo, linha, regra e severidade em todos os achados"; ok=$((ok+1))
else echo "  ✖ --json malformado"; sed 's/^/      /' <<<"$saida"; fail=$((fail+1)); fi

echo "== par up/down =="
par() { # par <nome> <exit> <agulha> <arquivos...> : cria dir com arquivos (conteúdo do stdin, igual em todos)
  local nome="$1" esp="$2" agulha="$3"; shift 3
  local d="$TMP/$nome"; mkdir -p "$d"; local c; c="$(cat)"
  for a in "$@"; do printf '%s\n' "$c" >"$d/$a"; done
  local saida; saida="$(node "$G" "$d" 2>&1)"; local rc=$?
  if [ "$rc" != "$esp" ] || { [ -n "$agulha" ] && ! grep -qF -- "$agulha" <<<"$saida"; }; then
    echo "  ✖ $nome: exit $rc, esperado $esp"; sed 's/^/      /' <<<"$saida"; fail=$((fail+1)); return; fi
  echo "  ✔ $nome"; ok=$((ok+1))
}
par up-sem-down 1 "migration-sem-down" 001_cria_tenant.up.sql <<'FIX'
create table tenant (id uuid primary key, nome text not null);
FIX
par up-com-down 0 "" 001_cria_tenant.up.sql 001_cria_tenant.down.sql <<'FIX'
create table tenant (id uuid primary key, nome text not null);
FIX
par up-adr 0 "" 002_purga.up.sql <<'FIX'
-- pg-irreversivel: ADR-0009 purga LGPD, restore e o unico caminho
create table purga (id uuid primary key, nome text not null);
FIX

echo "== nada para analisar =="
d="$TMP/vazio"; mkdir -p "$d"; echo "# prosa" > "$d/LEIA.md"
saida="$(node "$G" "$d" 2>&1)"; rc=$?
if [ "$rc" = 2 ] && grep -q "não é aprovação" <<<"$saida"; then echo "  ✔ repo sem .sql sai 2 (não 0)"; ok=$((ok+1))
else echo "  ✖ repo sem .sql: exit $rc"; fail=$((fail+1)); fi

echo; echo "check-schema: $ok ok, $fail falha(s)"; [ "$fail" = 0 ]
