# Changelog — schematize-database

Todas as mudanças relevantes deste pacote, no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
com versionamento [SemVer](https://semver.org/lang/pt-BR/).


## [Não lançado]

### Alterado
- `references/migrations.md`: contract com `DROP` NÃO é reversível; o `down` é restore de backup verificado (`-- pg-restore:`) ou ADR de passo irreversível; `DROP TABLE` como `down` do `CREATE` inicial só em dev/hml; convenção do par `NNN_nome.up.sql`/`.down.sql`. SKILL.md e assets/CLAUDE.md alinhados com `schematize-postgres`.
- Fronteira: aplicar a migration é operação do ops a partir de arquivo versionado no git (`ops migrate`); esta skill desenha o arquivo.
- Bloco herdado dos pisos 22–29 da engineering.

### Adicionado
- `check-schema.mjs`: regra `migration-sem-down` (bloqueante) para `NNN_*.sql` sem par `.down.sql`, salvo `-- pg-irreversivel: ADR-<n> <motivo>`; testes vermelho -> verde.

## [0.6.0] — 2026-10-14
Integração com as 8 skills novas (skill-dev, iam, api, payments, postgres, incident, analytics, git) e saneamento pelo gate novo.

### Alterado
- Blocos herdados `engineering/precedencia:dominio` e `engineering/orquestracao:curto` (SKILL.md e assets/CLAUDE.md), exigidos pelo gate da `schematize-skill-dev`.
- Description reduzida a ≤190 caracteres para caber no orçamento do catálogo (45 skills).
- `references/migrations.md` e fronteira do SKILL.md apontam `schematize-postgres → references/locks-e-migrations.md` para RODAR a migration (`lock_timeout`, `CONCURRENTLY`, fila de lock); o desenho expand-contract continua aqui.

## [0.5.1] — 2026-10-14
Reduz a description para o orçamento de listagem.

### Alterado
- Description reduzida (≤235 chars) para caber no orçamento de listagem de skills (soma ≤8300); mesmo território, fronteiras com as irmãs preservadas.

## [0.5.0] — 2026-10-14
Fronteira data x database decidida.

### Corrigido
- `references/seguranca-pii.md` §2, `SKILL.md` (itens 5-7 e fronteira): base legal, retenção e LGPD viraram ponteiro para `schematize-data → references/governanca.md`; ficou a marca da coluna e o mecanismo de expurgo no desenho.
- `references/migrations.md`: o expand-contract do schema é daqui; backfill e migração de dados são da data.
- `description` com 350 caracteres ou menos (era 1005).
- **Description** reduzida (~270 chars) para caber no orçamento de listagem (soma das 31 skills ≤ 8500; o Claude Code corta a listagem acima disso).

### Alterado
- `scripts/check-external-effects{,.test}.sh` viram arquivos herdados da engineering (cabeçalho "herdado de schematize-engineering — não edite aqui"); conteúdo inalterado.

## [0.4.0] — 2026-08-21
Segunda leva do saneamento: as contradições e a lacuna de ferramenta do inventário da vistoria.

### Adicionado
- **`scripts/check-schema.mjs` — o parser que o `/database-review` prometia** e não tinha: lê DDL e devolve **`arquivo:linha` · veredito · severidade · regra · conserto**, com `--json` e exit code (`0`/`1`/**`2` = nada para analisar**). Cobre `UNIQUE`/índice sobre **PII em claro**, dinheiro em ponto flutuante, `timestamp` sem timezone, id sequencial exposto, FK sem `ON DELETE`, **FK sem índice** (o Postgres não cria sozinho), `RENAME COLUMN`, `ADD COLUMN NOT NULL` sem default, `DROP COLUMN` direto e `CREATE INDEX` sem `CONCURRENTLY`. Com o alcance dito na cara: **é textual** — onde houver banco, `EXPLAIN` e `pg_stat_*` mandam.
- **`scripts/check-schema.test.sh`** — 11 casos, 9 vermelhos, mais um que valida o **formato JSON**.

### Corrigido
- **O caso do e-mail deixou de dar vereditos opostos.** A regra de desempate: **unicidade é restrição e continua valendo**, mas o `UNIQUE` fica na **coluna derivada** (normalizada ou **HMAC** — `sha256` puro é reversível por dicionário), com o e-mail **em claro sem índice**; busca usa a mesma coluna derivada. *O índice em claro é o que transforma um `SELECT` acidental num dump ordenado de PII.*
- **Ponteiros cross-skill explícitos**: `armazenamento.md` e `governanca.md` são da `schematize-data` — citá-los como locais quebrava o `/database-load`, que manda ler só o diretório da própria skill.
- **`uuid` no lugar de `bytea`** como PK nos exemplos (ver 0.3.0), e o `dual-write` da fase Migrate agora diz **"na mesma transação, no mesmo banco"**.

## [0.3.0] — 2026-08-21
Saneamento do catálogo conforme a vistoria de 2026-08-21.

### Corrigido
- **`uuid` no lugar de `bytea` como PK** nos exemplos executáveis de `references/modelo-relacional.md`. Os dois guardam 16 bytes, mas `uuid` é o tipo que o Postgres **entende**: `gen_random_uuid()` como default, ordenação correta e — o que mais importa num incidente — o valor **legível** em `psql`, log e erro (`0190e2…` em vez de `\x0190e2…`). `bytea` como PK ficou como escolha com **motivo escrito**.

### Mudado
- `scripts/check-external-effects.sh` (+ teste) na versão distribuída (md5 idêntico nas 17); `install.sh` regenerado do template; README com a contagem de pisos corrigida (7 → 8).

## [0.2.0] — 2026-08-20

Recorte de **modelagem** do piso "efeito externo NUNCA sai de não-produção"
(`schematize-engineering` → `references/efeitos-externos.md`): e-mail é a única PII **endereçável**
do schema — seed com caixa real é o estopim do disparo em massa que queima IP/domínio e derruba o
**OTP de login** de produção.

### Adicionado
- **SKILL.md** — piso inegociável **8** ("Seed/fixture com e-mail é dado ENDEREÇÁVEL — só o domínio
  de teste em rota nula"), ancorado nos pisos 1 (chave natural `UNIQUE`, nunca PK) e 7 (PII marcada).
- **references/seguranca-pii.md** §6 — "Dado de teste: e-mail de seed/fixture nunca é caixa real":
  vetados (incluindo o `INSERT` de admin dentro da migration), domínio em rota nula, exemplo de
  seed com **`<papel>+<run-id>-<n>@test.<domain>`** preservando o `UNIQUE` (a saída nunca é dropar
  a constraint) e a ressalva de **normalização que remove o `+tag`** (carimbe o run antes do `@`);
  a coluna segue **PII marcada** em qualquer ambiente. Novo item no checklist de design/review.
- **assets/CLAUDE.md** — piso sempre-on **8** com a forma canônica e os vetos.

### Mudado
- **references/seguranca-pii.md** — o checklist de privacidade/segurança passa de §6 para **§7**.

## [0.1.0] — 2026-08-18

Primeira versão da skill de **modelagem de banco de dados** da casa — 100% dedicada ao **DESENHO
do schema relacional em si** (schema design), o passo anterior à implementação. Desdobra o §10
(Banco de Dados) da `schematize-engineering` numa disciplina própria de desenho, com fronteira
nítida: a engenharia de **DADOS** (pipeline/ETL/CDC/contratos) é da `schematize-data`; a
**implementação** (queries parametrizadas, ORM, rodar migration) é das skills de linguagem.

### Adicionado
- **SKILL.md** com 7 pisos inegociáveis (PK surrogate ULID/UUIDv7 + natural `UNIQUE`,
  identidade≠email; normalizar até 3FN, desnormalizar registrado; tipo é a 1ª constraint, sem
  "texto pra tudo"; integridade é do banco com constraints; índice é decisão de custo, PII fora de
  índice/URL; migration expand-contract reversível, nunca `DROP`/rename num passo; PII marcada com
  base legal + retenção, deny-by-default + tenant no desenho) + mapa de references + a seção
  **"o que esta skill NÃO faz (fronteira)"** com data e linguagens + relação com as outras skills.
- **references/**:
  - `modelo-relacional.md` — domínio→schema: entidade→tabela, atributo→coluna atômica (1FN),
    relações 1:1/1:N/N:N com **tabela de junção**, cardinalidade/obrigatoriedade, o **tipo correto
    por coluna** (dinheiro sem `float`, tempo `timestamptz` UTC, enum/CHECK, jsonb com parcimônia)
    e a ordem de emitir o DDL.
  - `normalizacao-chaves-indices.md` — 1FN–3FN e anomalias, desnormalização medida+registrada,
    **chaves** (surrogate ULID + natural `UNIQUE`, identidade≠email, id sequencial VETADO),
    **constraints** (`NOT NULL`/`UNIQUE`/`CHECK`/`FK`+tabela de `ON DELETE`), **índices** (FK,
    compostos e ordem igualdade→range, parcial, cobertura, redundância, PII fora do índice) +
    checklist de desenho.
  - `migrations.md` — **expand→migrate→contract** reversível (`up`/`down` testado), os casos
    clássicos (rename/tipo/NOT NULL/FK em tabela grande sem travar via `CONCURRENTLY`/`NOT VALID`),
    pisos, **particionamento** básico (RANGE tempo/retenção, LIST/HASH tenant) e o que o design
    emite.
  - `seguranca-pii.md` — **PII marcada** + base legal + retenção (LGPD), PII fora de índice/URL/chave
    exposta, identidade≠email, segredo nunca em claro, minimização, **isolamento multi-tenant** no
    desenho (`tenant_id`, unicidade por tenant, RLS, FK que não cruza tenant) + checklist.
- **assets/commands/**: `/database-help`, `/database-design` (projeta schema da descrição do
  domínio → `CREATE TABLE` + migration expand-contract + resumo do modelo), `/database-review`
  (revisa schema existente), `/database-load`, `/database-claude`, `/database-cc`,
  `/database-handoff`.
- **assets/CLAUDE.md** — regra sempre-on de modelagem: chaves surrogate + natural, 3FN,
  constraints no banco, migration expand-contract, PII marcada; e a fronteira (dados→data,
  implementação→linguagem).
