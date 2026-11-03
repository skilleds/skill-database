---
description: schematize-database — lista todos os comandos disponíveis e o que cada um faz
---

Liste os comandos do **schematize-database** instalados (`/database-*`), com 1 linha cada:

- `/database-help` — esta lista.
- `/database-design` — **projeta um schema a partir da descrição em linguagem natural do domínio**:
  entidades→tabelas/colunas/tipos/PK/FK/índices nos padrões da casa, e **emite o SQL (`CREATE
  TABLE`) + a migration expand-contract reversível + o resumo do modelo** (entidades, relações,
  chaves, colunas PII) — pronto pro "database builder" do app consumir.
- `/database-review` — **revisa um schema existente** (DDL/migration/`\d`): normalização (1FN–3FN),
  chaves (surrogate + natural), tipos, constraints/FK (`ON DELETE`), índices (faltando/redundante/
  PII), particionamento e PII/LGPD; aponta achados com prova e **emite as migrations de correção**.
- `/database-load` — carrega à força TODO o corpo normativo (modelo relacional, normalização/chaves/
  índices, migrations, segurança/PII) e passa a aplicá-lo.
- `/database-claude` — cria ou mescla o `CLAUDE.md` sempre-on de modelagem na raiz do repo.
- `/database-cc` — context compact: gera handoff no archive e roda `/compact`.
- `/database-handoff` — gera o handoff (context.md + checklist.md) sem compactar.

Depois da lista, lembre a **regra de ouro**: *o schema é o contrato mais duradouro do sistema —
desenhe o modelo antes do código e deixe a integridade no banco.* Padrões da casa: **PK surrogate
ULID/UUIDv7 + chave natural `UNIQUE`** (identidade≠email, sem id sequencial exposto), **3FN por
padrão** (desnormalizar é decisão registrada), **tipo é a 1ª constraint** (dinheiro sem `float`,
tempo `timestamptz` UTC), **constraints no banco** (FK/`CHECK`/`NOT NULL`/`UNIQUE`), **índice é
decisão de custo** (PII fora do índice/URL), **migration expand-contract reversível**, **PII
marcada** com base legal + retenção. **Fronteira:** a engenharia de **dados** (pipeline/ETL/CDC/
contrato) é da `schematize-data`; a **implementação** (query parametrizada, ORM, rodar migration) é
das skills de **linguagem** (go/rust/elixir/csharp/zig/ruby). Detalhe normativo em `references/` da
skill `schematize-database`.
