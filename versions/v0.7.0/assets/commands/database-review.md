---
description: schematize-database — revisa um schema relacional EXISTENTE (DDL/migration/\d) contra os padrões da casa (normalização, chaves, tipos, constraints/FK, índices, particionamento, PII/LGPD) e emite as migrations de correção
argument-hint: "[caminho do schema/migration/DDL, ex: db/schema.sql]"
---

Revise o **schema existente** em `${ARGUMENTS:-<caminho do DDL/migration/schema>}` contra os
padrões de desenho da casa. Leia os references da skill `schematize-database` — não trabalhe de
memória. É **read-mostly**: **aponta** os achados e **emite as migrations de correção** (não
altera dado). Cada achado com **prova** (a linha/coluna) e o conserto.

## 1. Levante o schema
Leia o DDL/migrations (ou peça o `\d`/dump). Reconstrua o modelo: tabelas, colunas+tipos, PKs, FKs,
`UNIQUE`/`CHECK`/`NOT NULL`, índices, particionamento. Identifique **entidades e relações**.

## 2. Rode o parser

```bash
node .claude/skills/schematize-database/scripts/check-schema.mjs .          # ou um .sql
node .claude/skills/schematize-database/scripts/check-schema.mjs . --json   # para o CI
```

`0` sem achado bloqueante · `1` achado **P0/P1** · `2` **nada para analisar** (que não é aprovação).

Ele devolve **`arquivo:linha` · veredito · severidade · regra · conserto** para: `UNIQUE`/índice
**sobre PII em claro**, dinheiro em ponto flutuante, `timestamp` sem timezone, id sequencial
exposto, FK sem `ON DELETE`, FK sem índice, `RENAME COLUMN`, `ADD COLUMN NOT NULL` sem default,
`DROP COLUMN` direto e `CREATE INDEX` sem `CONCURRENTLY`.

**O alcance, dito na cara:** é análise **textual do DDL**. Ele não sabe o volume da tabela, o plano
de execução nem se um índice é usado — onde houver banco, **`EXPLAIN` e `pg_stat_*` mandam**. E o
que ele não vê (modelagem, cardinalidade, decisão de desnormalização) é o item 2 desta lista, que é
humano.

## 3. Revise peça por peça — cada achado com prova (o que o parser NÃO vê)
- **Normalização (`references/normalizacao-chaves-indices.md` §1-2):** viola 1FN (lista em string,
  colunas repetidas `tel1/tel2`)? 2FN/3FN (dependência transitiva — `pedido.cliente_email`)?
  Desnormalização **sem** registro/dono da consistência? Redundância que gera anomalia de update?
- **Chaves (§3):** PK é surrogate ULID/UUIDv7? Ou é **email/natural/sequencial exposto** (VETADO —
  enumeração/IDOR)? Chave natural tem `UNIQUE`? **Identidade≠email**?
- **Tipos (`modelo-relacional.md` §4):** dinheiro em `float` (achado grave)? tempo em `timestamp`
  naive em vez de `timestamptz` UTC? "`text` pra tudo" onde cabia enum/`CHECK`/tipo restrito?
- **Constraints (§4):** relação **sem FK** (órfão possível)? `ON DELETE` no default por acidente
  (`CASCADE` perigoso ou `RESTRICT` esquecido)? falta `NOT NULL`/`UNIQUE`/`CHECK` onde o domínio
  pede?
- **Índices (§5):** **FK sem índice**? índice **redundante** (`(a)` + `(a,b)`)? composto com
  **ordem errada** (range antes de igualdade)? índice **nunca usado**? **PII em claro** como chave
  de índice?
- **Migrations (`references/migrations.md`):** há migration só com `up` (sem `down`)? `DROP`/rename
  destrutivo num passo sobre dado vivo?
- **Particionamento (§4):** tabela de crescimento alto/previsível que pediria partição por tempo?
- **PII/LGPD (`references/seguranca-pii.md`):** coluna PII **não marcada**? sem base legal/retenção?
  PII em índice em claro/URL/chave exposta? segredo em claro (`senha` em vez de `senha_hash`)?
  multi-tenant **sem `tenant_id`**/unicidade global em vez de por tenant/FK que cruza tenant?

## 4. Classifique e emita o conserto

- Cada achado: **veredito** (viola/parcial/ok), **origem** (`arquivo:linha`/`tabela.coluna`),
  **severidade** (PII/segurança e integridade = prioridade 0; performance de índice depois) e a
  **migration de correção** — em formato **expand-contract reversível** quando toca dado vivo
  (nunca `DROP`/rename num passo).
- Gere um **checklist de saneamento** (candidato a `/eng-overdev`) com os itens abertos.

## Piso e fronteira
Prioridade 0 = **PII/segurança + integridade** (id exposto, PII em claro, dinheiro em `float`, FK
faltando, tenant sem isolamento). A **implementação** (query parametrizada, ORM) é revisada pela
skill de linguagem (`/<slug>-review`); o **contrato/pipeline de dados** pela `schematize-data`.
Aqui revisamos **o desenho do schema**. Grave o relatório em `<projeto>_archive/database/<data>.md`
(nunca no root).
