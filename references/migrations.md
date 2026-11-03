# Migrations expand-contract reversíveis e particionamento

> O schema **evolui** — e evoluir dado vivo sem parar o serviço nem perder dado é o piso mais
> perigoso do dia a dia. A resposta da casa é **expand → migrate → contract**, cada passo
> com **down** (e o contract destrutivo com restore verificado ou ADR). Este reference cobre a mecânica da migration, o versionamento do schema e o
> **particionamento** básico.

Fronteira com a **schematize-data**: aqui é o expand-contract do **schema** (DDL, constraints, índices); o backfill e a migração dos **dados** em si são de `schematize-data → references/armazenamento.md` §4. Base:
`schematize-engineering` §10 — migrations **versionadas, reversíveis (com `down`), automatizadas no
deploy**. A **aplicação** da migration é **operação do ops** (`ops migrate`, dry-run, a partir de arquivo
versionado no git; piso 24), nunca um comando solto da IA; o cliente/ferramenta de migration é da
**skill de linguagem** (`sqlx-cli`/`golang-migrate`/`flyway`/…); aqui desenhamos **o conteúdo** da migration.

## 1. Toda migration é versionada e reversível

- **Versionada e ordenada:** cada migration é um passo numerado/datado, aplicado **em ordem**,
  registrado (a ferramenta guarda o histórico). Nunca edite uma migration **já aplicada** em
  produção — crie a próxima.
- **Reversível — `up` E `down`:** todo passo tem o **`down` testado** (aplica **e** reverte). "Rodei
  o `up` em dev uma vez" **não** é teste de rollback. Migration só com `up` é **VETADA** — quando o
  deploy falha no meio, o `down` é a única saída sem restore. Convenção do par:
  `NNN_nome.up.sql` + `NNN_nome.down.sql` (o gate `check-schema.mjs` reprova o up sem par, salvo
  `-- pg-irreversivel: ADR-<n> <motivo>`).
- **Contract com `DROP` NÃO é reversível:** `DROP COLUMN`/`DROP TABLE` destrói o dado e nenhum `down`
  em DDL o devolve. O `down` de um contract destrutivo é o **restore de backup verificado**
  (`-- pg-restore: <backup/ensaio>` no `.down.sql`) ou um **ADR explícito de passo irreversível**.
  Só o expand (aditivo) tem `down` por inversão de DDL.
- **A criação inicial também é migration:** o `/database-design` emite o `CREATE TABLE` **como a
  primeira migration** (o primeiro `expand`), com o `down` sendo o `DROP` correspondente (**só em dev/hml**: em prd esse `DROP` apagaria dado, e ali o
  `down` é restore verificado ou ADR) — porque
  "criar as tabelas na mão" não é reproduzível nem versionado.

## 2. Expand-contract — os três passos

Mudar uma tabela **que está sendo lida e escrita** não pode assumir que todo o código já subiu (num
deploy rolling, código velho e novo coexistem por minutos/horas). Nunca `ALTER ... DROP
COLUMN`/`RENAME`/mudança de tipo **num passo só** sobre dado vivo — quebra o código que ainda não
migrou. Faça em **três deploys separados**:

1. **Expand (aditivo, compatível).** Adicione o novo (coluna/tabela/índice) **opcional, com
   default** — nada quebra, código velho ignora o novo, código novo já pode usar.
   - Coluna nova: `add column ... null` (ou com default). **Não** `NOT NULL` sem default numa tabela
     grande populada (trava/reescreve) — adicione nullable, backfill, **depois** aperte pra
     `NOT NULL` num passo posterior.
   - Índice novo em tabela grande: **`CREATE INDEX CONCURRENTLY`** (Postgres) pra não travar
     escrita — e fora de transação. O *como rodar* (fila de lock, `lock_timeout`, invalidar índice
     falho) é de `schematize-postgres → references/locks-e-migrations.md`.
2. **Migrate (backfill + dual-write **na mesma transação, no mesmo banco**).** Popule o novo a partir do velho — **backfill em janelas,
   idempotente** (rodar 2x não corrompe; `schematize-data` §pipelines). Durante a transição, o
   código **escreve nos dois** (velho e novo). Só avance quando o backfill **fechou** e todos os
   leitores enxergam o novo.
3. **Contract (corta o velho — só quando ninguém lê).** Quando **todo** leitor migrou (confirme
   quem lê — lineage/catálogo, `schematize-data`) e o backfill terminou, remova o antigo. **Só
   aqui** o `DROP` acontece — em passo **separado**, deployado **depois**. O `DROP` **não é reversível**: o `down` é restore de backup verificado ou ADR.

   > *Este dual-write **não é o dual-write vetado**.* O que a `schematize-data` veta (piso 2) é
   > escrever em **dois sistemas** (banco + broker) sem transação que cubra os dois. Aqui as duas
   > escritas vivem **no mesmo banco e na mesma transação**: ou as duas acontecem, ou nenhuma. É o
   > oposto do problema — e é por isso que o expand/contract funciona.

### Os casos clássicos (todos são expand-contract)

- **Rename de coluna** = adiciona a nova + backfill + dual-write + corta a velha. **Nunca** `RENAME`
  direto em dado vivo com consumidor — é quebra de contrato disfarçada.
- **Mudar tipo de coluna** = nova coluna com o tipo certo + backfill convertido + dual-write + corta
  a velha. `ALTER TYPE` in-place trava e pode perder dado.
- **Split/merge de tabela** = cria destino + backfill + redireciona escrita + corta origem.
- **`NOT NULL` novo em tabela populada** = adiciona nullable + backfill + `CHECK (col is not null)
  NOT VALID` → `VALIDATE CONSTRAINT` (não trava) → então `SET NOT NULL`.
- **FK nova em tabela grande** = `ADD CONSTRAINT ... NOT VALID` (não trava, valida só novos) →
  `VALIDATE CONSTRAINT` (valida os antigos sem lock pesado).

## 3. Regras da migration (pisos)

- **Cada passo com `down` e pequeno** (no contract destrutivo, `down` = restore verificado ou ADR). Um passo faz **uma** coisa; grandes migrations monolíticas
  são difíceis de reverter e de raciocinar.
- **Timestamps UTC; IDs ULID/UUIDv7** — no `CREATE` e em qualquer coluna nova (base §10).
- **`DROP`/rename destrutivo num passo sobre dado vivo é VETADO** — sempre a sequência
  expand→migrate→contract, com o `DROP` isolado no fim.
- **Backfill sem plano de rollback é VETADO** — o `down` do backfill (como desfazer/reprocessar) é
  parte do desenho.
- **Migration destrutiva sem backup confirmado** não roda — o `contract` só depois de garantir que
  o dado velho não é mais necessário (ou está arquivado).
- **Concorrência:** índice/constraint em tabela grande usa as formas que **não travam**
  (`CONCURRENTLY`, `NOT VALID`+`VALIDATE`) — travar escrita em produção é incidente. O desenho (o que a migration contém) é daqui; a **execução** em banco vivo — `lock_timeout`/`statement_timeout`,
  fila de lock, receitas por operação, backfill em lotes, runner — é de `schematize-postgres → references/locks-e-migrations.md`.

## 4. Particionamento básico

Particionar quebra uma tabela logicamente única em várias físicas (base §10 SHOULD: "tabelas com
crescimento previsível alto"). É decisão de **escala**, tomada no desenho quando o volume o justifica
— não prematuramente.

- **Por tempo (o caso comum):** `RANGE` por mês/dia pra dado que cresce no tempo e se consulta/expira
  por janela (eventos, logs, pedidos). A partição vira a **unidade de retenção** — expira-se uma
  partição inteira (`DROP`) barato, sem `DELETE` linha a linha (casa com retenção de PII,
  `seguranca-pii.md`).
- **Por chave (`LIST`/`HASH`):** por tenant/região quando o isolamento/volume pede. Alinhe ao
  `tenant_id` do isolamento multi-tenant.
- **A chave de partição entra na PK** (Postgres exige que a PK contenha a coluna de partição) —
  planeje isso no desenho da chave, não depois.
- **Não particione cedo demais:** partição errada é cara de desfazer. Só quando o crescimento é
  **alto, previsível e com padrão de acesso/retenção por partição** claro. Na dúvida, índice bom
  primeiro; particione quando os números pedirem.

## 5. O que o `/database-design` emite

Pra um schema novo, a saída de migration é:

1. **A migration de criação** (primeiro `expand`): `CREATE TABLE` na ordem de dependência
   (`modelo-relacional.md` §5), constraints, índices (`CONCURRENTLY` quando fizer sentido), com o
   `down` (`DROP` na ordem inversa).
2. **O esqueleto de evolução** quando a descrição já sinaliza mudança futura — comentando onde o
   expand-contract entraria.

Pra uma **alteração** de schema existente, o `/database-design`/`/database-review` emite a
**sequência** expand→migrate→contract já quebrada nos passos/deploys corretos, cada um com `up`/`down`.
