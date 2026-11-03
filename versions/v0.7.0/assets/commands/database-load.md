---
description: schematize-database — carrega à força TODO o corpo normativo (modelo relacional, normalização/chaves/índices, migrations, segurança/PII) e passa a aplicá-lo
---

Carregue **à força** e passe a aplicar **integralmente** a disciplina de **Modelagem de Banco de
Dados da Casa** (skill `schematize-database`) neste projeto. A partir de agora, nesta sessão, isto
**não é opcional**.

1. **Leia agora, na íntegra, TODOS os references** — não trabalhe de memória. Caminho:
   `.claude/skills/schematize-database/references/*.md` (projeto) ou
   `~/.claude/skills/schematize-database/references/*.md` (global):
   - `modelo-relacional.md` — domínio→schema: **entidade→tabela**, **atributo→coluna atômica**
     (1FN), relações **1:1/1:N/N:N com tabela de junção**, cardinalidade/obrigatoriedade, e o
     **tipo correto por coluna** (dinheiro sem `float`, tempo `timestamptz` UTC, enum/`CHECK`,
     `jsonb` com parcimônia).
   - `normalizacao-chaves-indices.md` — **1FN–3FN** e anomalias, desnormalização registrada,
     **chaves** (surrogate ULID/UUIDv7 + natural `UNIQUE`, identidade≠email, id sequencial VETADO),
     **constraints** (`NOT NULL`/`UNIQUE`/`CHECK`/`FK`+`ON DELETE`), **índices** (FK, compostos e
     ordem, parcial, cobertura, redundância, PII fora do índice).
   - `migrations.md` — **expand→migrate→contract** reversível (`up`/`down` testado), casos clássicos
     (rename/tipo/`NOT NULL`/FK em tabela grande sem travar), **particionamento** básico.
   - `seguranca-pii.md` — **PII marcada** + base legal + retenção (LGPD), PII fora de índice/URL/
     chave exposta, identidade≠email, segredo nunca em claro, **isolamento multi-tenant** no desenho.

2. **Confirme ao usuário** que leu (1 linha por arquivo).

3. Deste ponto, aplique como regra inegociável: **PK surrogate ULID/UUIDv7 + chave natural
   `UNIQUE`** (identidade≠email, sem id sequencial exposto); **3FN por padrão** (desnormalizar é
   decisão registrada); **tipo é a 1ª constraint** (dinheiro sem `float`, tempo UTC); **integridade
   no banco** (FK/`CHECK`/`NOT NULL`/`UNIQUE`, `ON DELETE` consciente); **índice é decisão de
   custo** (PII fora do índice/URL); **migration expand-contract reversível** (nunca `DROP`/rename
   num passo); **PII marcada** com base legal + retenção; **tenant no desenho**. Lembre a
   **fronteira**: dados (pipeline/CDC/contrato) → `schematize-data`; implementação (query
   parametrizada/ORM/rodar migration) → skill de linguagem.

4. **Atualize o `CLAUDE.md` da raiz** com `assets/CLAUDE.md` da skill (mescla se já houver de outra
   skill) — é o `/database-claude`.
