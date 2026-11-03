---
name: schematize-database
metadata:
  version: 0.7.0
description: >-
  Schema relacional: normalização, chaves, tipos, constraints, índices, migrations expand-contract, PII marcada. Use ao modelar tabela ou *.sql. Operar o banco: schematize-postgres.
---

# Modelagem de banco de dados da casa (schematize-database)

Disciplina normativa, **agnóstica de linguagem**, que responde a **uma** pergunta: **como o
domínio vira um schema relacional correto?** Não é "como escrever a query", nem "como rodar a
migration", nem "como montar o pipeline" — é o passo **anterior**: o **desenho** das tabelas,
colunas, tipos, chaves, constraints, relações e índices que formam a espinha do sistema. Um schema
mal desenhado é dívida que **todo** o resto herda: query lenta, dado inconsistente, migration
impossível, PII vazando. Esta skill é o **piso do desenho** — o modelo antes do código.

O schema é o **contrato mais duradouro** do sistema: o código muda toda semana, a tabela sobrevive
anos e carrega o dado real. Por isso o desenho é **plan-first** e **conservador na integridade** —
o banco é a **última linha de defesa** da consistência (constraint que o banco garante não depende
de nenhum app se comportar). "Depois a gente ajusta o schema" é caro: ajustar schema com dado vivo
é migration com risco; ajustá-lo **no desenho** é grátis.

**Versão:** skill `schematize-database` v0.7.0. Changelog em `CHANGELOG.md`.

## Comandos (Claude Code)

Digite `/database-help` pra ver todos. Em resumo:

| Comando | O que faz |
|---|---|
| `/database-help` | lista todos os comandos do schematize-database |
| `/database-design` | **projeta um schema a partir da descrição em linguagem natural do domínio**: entidades→tabelas/colunas/tipos/PK/FK/índices seguindo os padrões da casa, e **emite o SQL (`CREATE TABLE`) + a migration expand-contract reversível + um resumo do modelo** (entidades, relações, chaves, PII) — pronto pro "database builder" do app consumir |
| `/database-review` | **revisa um schema existente** (DDL/migration/`\d`): normalização (1FN–3FN, redundância), chaves (surrogate + natural), tipos, constraints/FK (`ON DELETE`), índices (faltando/redundante/PII), particionamento e PII/LGPD — aponta achados e emite as migrations de correção |
| `/database-load` | carrega à força TODO o corpo normativo (modelo relacional, normalização/chaves/índices, migrations, segurança/PII) e passa a aplicá-lo |
| `/database-claude` | cria ou mescla o `CLAUDE.md` sempre-on de modelagem na raiz do repo |
| `/database-cc` | context compact: gera handoff no archive e roda `/compact` |
| `/database-handoff` | gera o handoff (context.md + checklist.md) sem compactar |

Os comandos ficam em `assets/commands/` e são instalados em `.claude/commands/`.

## Como usar esta skill

1. **Modele o domínio primeiro** (`references/modelo-relacional.md`): antes de escrever `CREATE
   TABLE`, identifique **entidades** (viram tabelas), **atributos** (viram colunas), **relações**
   (1:1/1:N/N:N) e a **cardinalidade/obrigatoriedade** de cada uma. N:N **sempre** vira **tabela
   de junção** — não há atalho. Desenhar a query antes do modelo é montar tabela pela tela, não
   pelo domínio.
2. **Normalize, depois desnormalize com consciência** (`references/normalizacao-chaves-indices.md`):
   chegue a **3FN** por padrão (sem repetição, sem dependência transitiva). Desnormalizar é uma
   **decisão** — só com motivo medido (leitura quente comprovada) e **registrada** (ADR/comentário),
   nunca por preguiça. Aqui também moram **chaves** (surrogate ULID + natural `UNIQUE`) e
   **índices** (quando, compostos, ordem, cobertura, parciais).
3. **Escolha o tipo certo por coluna** (`references/modelo-relacional.md` §tipos): o tipo é a
   **primeira constraint**. Dinheiro **nunca** em `float`; tempo em `timestamptz` **UTC**;
   texto com forma vira `CHECK`/enum; nada de "`text` pra tudo".
4. **Blinde a integridade com constraints** (`references/normalizacao-chaves-indices.md` §constraints):
   `NOT NULL` é o default mental (nullable exige razão), `UNIQUE` na chave natural, `CHECK` no
   domínio do valor, **`FK` com `ON DELETE` consciente** (`RESTRICT`/`CASCADE`/`SET NULL` é decisão
   de domínio, nunca default silencioso).
5. **Planeje a evolução expand-contract** (`references/migrations.md`): toda mudança de schema em
   dado vivo é **expand → migrate → contract**, cada passo com `down` (expand: testado; contract com `DROP`: restore verificado ou ADR). O
   `/database-design` já emite a **primeira migration** (a criação) nesse formato. Esta skill é dona do expand-contract do **schema**; backfill e migração de **dados** são da `schematize-data → references/armazenamento.md`.
6. **Marque e proteja PII** (`references/seguranca-pii.md`): coluna pessoal é **marcada** (base
   legal, retenção e mascaramento são decididos em `schematize-data → references/governanca.md`), **nunca** entra em índice/URL/chave natural exposta, e a identidade **não é
   o email** (surrogate interna). Deny-by-default e `tenant_id` no desenho multi-tenant.
7. **Não trabalhe de memória** — as regras, os tipos, a ordem de índice e o que conta como
   "normalizado" estão nos references. Aplique os pisos abaixo independentemente do reference
   carregado.

Mapa de references — leia o que casa com a tarefa:

| Tarefa | Reference |
|---|---|
| Traduzir o **domínio em modelo relacional**: entidades→tabelas, atributos→colunas, relações 1:1/1:N/N:N + **tabela de junção**, cardinalidade/obrigatoriedade, e o **tipo correto por coluna** (dinheiro, tempo, texto, enum, JSON quando cabe) | `references/modelo-relacional.md` |
| **Normalização** (1FN–3FN) e desnormalização consciente; **chaves** (surrogate ULID/UUIDv7 + natural `UNIQUE`, identidade≠email); **constraints** (`NOT NULL`/default, `UNIQUE`, `CHECK`, `FK`+`ON DELETE`); **índices** (quando criar, compostos e ordem, cobertura, parciais, redundância) | `references/normalizacao-chaves-indices.md` |
| **Migrations expand-contract reversíveis** (expand→migrate→contract, `down` testado, nunca `DROP`/rename num passo), **particionamento** básico, versionamento do schema | `references/migrations.md` |
| **Segurança/privacidade no desenho**: coluna **PII marcada** (base legal + retenção, LGPD), PII fora de índice/URL, identidade≠email, deny-by-default + `tenant_id`, o que **não** guardar (segredo em claro) | `references/seguranca-pii.md` |

## Pisos inegociáveis (vetam o atalho)

Independente do reference, estes limites nunca são cruzados:

1. **PK é surrogate interna (ULID/UUIDv7); a chave natural é `UNIQUE`, não a PK.** Toda tabela tem
   um id **interno, estável e opaco** como chave primária (ULID/UUIDv7 — ordenável no tempo, sem
   revelar volume nem sequência). A chave natural do domínio (email, CPF, slug, código) vira
   **`UNIQUE`**, nunca a PK — porque chave natural **muda** e **vaza**. **Identidade≠email** (piso
   do IAM da casa): a pessoa é o id interno, o email é só um atributo `UNIQUE` mutável. IDs
   sequenciais expostos são **VETADOS** (enumeração/IDOR).
2. **Normalize até 3FN por padrão; desnormalizar é decisão REGISTRADA.** O default é **sem
   repetição** e **sem dependência transitiva** — o banco guarda cada fato **uma vez**.
   Desnormalizar (duplicar coluna, campo calculado materializado, array/JSON no lugar de tabela
   filha) só com **motivo medido** e **registro** (ADR/comentário + como a cópia é mantida
   consistente). Desnormalização "por hábito" que gera anomalia de update é **VETADA**.
3. **O tipo é a primeira constraint — nada de "texto pra tudo".** Cada coluna tem o **tipo mais
   restrito** que serve: **dinheiro em inteiro de menor unidade ou `numeric`, NUNCA `float`**;
   tempo em **`timestamptz` sempre UTC** (conversão só na borda); booleano é `boolean`; conjunto
   fechado é enum/domínio com `CHECK`; identificador é o tipo do id, não `text`. `JSON` só pra
   dado **realmente** sem forma (e mesmo assim com validação) — não como fuga de modelar.
4. **Integridade é do BANCO, não do app — constraints sempre.** `NOT NULL` é o **default mental**
   (coluna nullable exige justificativa); `UNIQUE` em toda chave natural; **`FOREIGN KEY` em toda
   relação** com `ON DELETE` **escolhido conscientemente** (`RESTRICT`/`NO ACTION` default seguro,
   `CASCADE`/`SET NULL` só quando o domínio pede); `CHECK` pro domínio do valor (faixa, formato,
   estado válido). "O app valida" **não** substitui a constraint — o app tem bug, o banco é a
   última linha.
5. **Índice é decisão de custo, não enfeite — e PII nunca vira chave de índice/URL.** Cria-se
   índice pra um **acesso real** (FK, filtro/junção quente, `UNIQUE`); índice sem uso é **escrita
   mais lenta + espaço** à toa. Em composto, **a ordem das colunas segue o predicado** (igualdade
   antes de range); use **parcial** pra subconjunto quente e **cobertura** pra evitar heap-fetch
   quando medido. **Coluna PII em claro nunca é chave de índice pesquisável nem vai pra URL/chave
   natural exposta** (`references/seguranca-pii.md`).
6. **Migration de schema é expand-contract com `down` — nunca `DROP`/rename num passo.** Mudar
   dado vivo é **expand (aditivo, compatível) → migrate (backfill idempotente + dual-write) →
   contract (corta o velho só quando ninguém lê)**, cada passo com **`down`** (expand: testado, aplica **e**
   reverte). `RENAME`/`DROP COLUMN`/mudança de tipo in-place num passo só sobre dado vivo é
   **VETADO** — é quebra de contrato disfarçada. Casa 1:1 com o piso de migrations da
   **schematize-data**.
7. **PII marcada, com base legal e retenção; deny-by-default e tenant no desenho.** Coluna com
   dado pessoal é **identificada** no modelo (a base legal e a retenção vêm de `schematize-data → references/governanca.md`; aqui entra a marca e o mecanismo de expurgo); PII
   **nunca** em log/URL/índice pesquisável em claro; segredo (senha/token) **nunca** em claro
   (hash/cofre — o banco de modelagem **não** guarda credencial reutilizável). Multi-tenant nasce
   com **`tenant_id`** na tabela e no índice, deny-by-default no acesso (RLS quando couber) — o
   **isolamento** é do desenho, não de um `WHERE` que alguém pode esquecer.

8. **Seed/fixture com e-mail é dado ENDEREÇÁVEL — só o domínio de teste em rota nula.** Nenhum
   seed de migration, fixture ou dado de ambiente de teste carrega **e-mail de caixa real**:
   **VETADO** `@gmail.com` e afins, domínio de cliente/terceiro, e-mail de **pessoa real (inclusive
   o seu)** e o **domínio de produção** — inclusive no `INSERT` "só pra ter um admin de teste"
   dentro da migration. O endereço sintético vem de **`test.<domain>` em rota nula** (null MX +
   SPF `-all` + DMARC `p=reject`) ou de TLD reservado, na forma `<papel>+<run-id>-<n>@test.<domain>`:
   o **`UNIQUE`** do e-mail (piso 1 — chave natural, nunca PK) fica **intacto** e o `+tag` por run
   evita colisão entre execuções — a saída **nunca** é dropar a constraint. A coluna de e-mail é
   **PII marcada** (piso 7) em **todo** ambiente. **Por quê:** um seed com endereço real é o
   estopim do disparo em massa que **queima a reputação de IP/domínio** e derruba o **OTP de login**
   de produção (`schematize-engineering` → `references/efeitos-externos.md`). Detalhe:
   `references/seguranca-pii.md` §6.

   **O gate de máquina:** `scripts/check-external-effects.sh` (distribuído idêntico nesta skill — não é ponteiro para outro repo). Rode-o no CI: ele reprova endereço de caixa real em seed/fixture/persona, chave de provedor não-sandbox em `.env` de não-prd (fail-closed quando o ambiente não está declarado) e domínio de teste sem null MX. O vermelho dele está provado em `scripts/check-external-effects.test.sh`.

## O que esta skill NÃO faz (fronteira)

Esta skill desenha **o schema relacional em si**. O que fica de fora:

- **Engenharia de DADOS → `schematize-data`.** Dado como **contrato versionado** (compat
  back/forward/full, schema registry), **pipeline** ETL/ELT/streaming, **CDC/event sourcing**
  (Outbox, replay), **qualidade** (validação na borda, quarentena/DLQ), **lineage & catálogo**,
  warehouse/lakehouse (bronze/silver/gold). Regra prática: **desenhar a TABELA OLTP** é aqui;
  **mover/versionar/validar o DADO entre sistemas** é `schematize-data`. O
  **expand-contract do schema** é daqui; migração/backfill de **dados** é de `schematize-data`.
- **OPERAR o PostgreSQL → `schematize-postgres`.** **Aplicar a migration é operação do ops, a partir de arquivo versionado no git (`ops migrate`, dry-run, humano confirma o destrutivo); esta skill desenha o arquivo, não o aplica.** Rodar a migration em banco vivo (`lock_timeout`, fila de
  lock, `CREATE INDEX CONCURRENTLY`, `NOT VALID`+`VALIDATE`, backfill em lotes), EXPLAIN, vacuum, pooling,
  backup/PITR, RLS (`schematize-postgres → references/locks-e-migrations.md`). O **desenho** da migration
  (expand-contract, o que cada passo contém) continua aqui.
- **IMPLEMENTAÇÃO backend → skills de linguagem** (`go`/`rust`/`elixir`/`csharp`/`zig`/`ruby`). A
  **query parametrizada** (SQL concatenado é VETADO — lá), o **ORM/repositório**, **rodar** a
  migration no deploy, o **cache**, o pool de conexão, o mapeamento objeto-relacional. Esta skill
  diz *qual* é a tabela/coluna/índice; a skill de linguagem diz *como* o código a lê e escreve.
- **IAM/auth → `schematize-engineering` (iam) + skill de linguagem.** Esta skill dá o **piso do
  desenho** (identidade≠email, id surrogate, tenant, PII) que o auth usa; o **fluxo** de auth
  (OIDC, fatores, sessão) é do IAM.
- **Frontend/consumo → `schematize-web`.** Como o dado chega à tela; segredo nunca no bundle.

<!-- herdado:engineering/pisos-22-29:bloco -->**Herda os pisos 22–29 da `schematize-engineering`** (texto completo em `assets/CLAUDE.md` dela): 22 tudo no git — sem remote, push falho ou HEAD≠origin a demanda NÃO se conclui; 23 deploy só do git (VETADO scp/rsync/tar|ssh/docker save|load/git bundle); 24 o ops é o gate da IA — a IA nunca muda a VPS direto nem escreve SQL, só operação nomeada (`ssh vps "ops <op>"`); 25 sem agents inúteis (entregou, morreu); 26 relatório a cada 30 min e handoff a cada 6 h; 27 CI remoto só antes do hml, a pedido ou em tag (`workflow_dispatch` + `hml-*`/`v*`; VETADO `pull_request`, `push` em branch, `workflow_run`, cron sem justificativa); 28 microserviço autônomo (fila durável + 7 testes de resiliência); 29 build/teste na máquina dev/hml quando existe (ponte só no workspace de build, nunca prd) + higiene (`scripts/higiene.sh`).<!-- /herdado -->

## Precedência e herança (leia antes de divergir)

<!-- herdado:engineering/precedencia:dominio intro="Esta skill é o recorte **Modelagem de schema relacional** da `schematize-engineering`: **disciplina de domínio**, não linguagem de backend." cmd="database" -->Esta skill é o recorte **Modelagem de schema relacional** da `schematize-engineering`: **disciplina de domínio**, não linguagem de backend.

1. **Onde esta skill divergir da base, a BASE MANDA.** Aqui mora a especialização do domínio ou da
   ferramenta — o como, o padrão, o gate. Divergência de *piso* é defeito desta skill, não variante local.
2. **O que não está repetido aqui é HERDADO, não dispensado.** Esta skill herda os pisos da base e
   os comandos dela cobrem o **domínio**, não o piso geral. Valem integralmente, sem cópia local:
   - **§28 Archive** — `<projeto>/<projeto>_archive/` é **repositório git próprio, PRIVADO e
     obrigatório**, criticidade 0 (`schematize-archive`).
   - **§35 Definition of Done** e a lista de anti-padrões (citada por **título**, nunca por número).
   - **§39 Índice/MAPA** — enumeração exaustiva (uma entrada por unidade chamável, `M == N`) e grafo
     com arestas em ASCII (`A -> B`), nunca a seta unicode.
   - **IAM** (`schematize-engineering` → `references/iam.md`): identidade ≠ email, ≥2 fatores, ReBAC
     multi-tenant, argon2id-only para senha nova, sessão longa e logout irreversível.
   - **Efeito externo** nunca sai de não-produção (`schematize-engineering` →
     `references/efeitos-externos.md`).
   - **Orquestração** (`schematize-engineering` → `references/orquestracao.md` §9): o principal não
     desenvolve (é Claude Opus); executor mais barato que resolve — `haiku`/`sonnet` → Codex Terra → Cursor → `opus` só após falha; visual direto ao Codex; imagem nunca pelo Claude: detecta Codex/Gemini e pergunta ao usuário qual usar (Codex é a sugestão, não automática), nunca API paga.
3. **QA, ops, IAM e índice não têm comando próprio aqui:** vêm da base `/eng-*`. Para trabalho
   contínuo use `/eng-overdev`; para planejar `/eng-plan`; para varrer a base `/eng-scan`; para
   revisão geral `/eng-review` (e `/eng-ops`, `/eng-iam`, `/eng-index`). Os comandos
   `/database-*` cobrem o domínio desta skill; o piso geral é o da base.<!-- /herdado -->

## Orquestração

<!-- herdado:engineering/orquestracao:curto -->**Orquestrador não desenvolve; subagent barato executa.** O agent principal só planeja, despacha e revisa; ação onerosa vira micro-tasks para o executor mais barato que resolve: `haiku` (mecânico) / `sonnet` (código; falhou → mesmo subagent corrige, até 2 rodadas) → Codex `gpt-5.6-terra` → Cursor → subagent `opus` (motivo) → `park`; **visual vai direto ao Codex**; **imagem nunca pelo Claude: detectar Codex/Gemini e perguntar ao usuário qual usar (Codex é a sugestão), nunca API de imagem paga**; papéis em `agentes.toml`. No overdev, cada item do checklist vai a um subagent e o principal revisa antes do `- [x]`. **Sem frota ociosa:** idle com pendência volta ao trabalho; dependente de outro agent → mata e enfileira com gatilho; terminou → mata (§9.6). Detalhe: `schematize-engineering` → `references/orquestracao.md` §9.<!-- /herdado -->

## Relação com as outras skills

- **schematize-engineering** — a **BASE**. Esta skill desdobra o **§10 (Banco de Dados)** e casa
  com os pisos de **dados/eventos** (§9-12), **segurança/multi-tenancy/LGPD** (§13-15/§32),
  **archive** (§28) e **DoD** (§35). O que lá é linha ("IDs UUIDv7/ULID; timestamps UTC; migrations
  reversíveis; query parametrizada"), aqui vira **a disciplina de desenhar o schema** que os honra.
- **schematize-data** — a **irmã de dados**, com **fronteira nítida**: aqui é o **desenho do schema
  relacional (OLTP)**; lá é o **dado como contrato** em movimento (pipeline/CDC/streaming/qualidade/
  lineage/warehouse). O **expand-contract do schema** e a coluna PII marcada são daqui; base legal, retenção, LGPD e backfill de dados são de lá. Ao
  desenhar uma tabela que vira fonte de CDC ou de warehouse, o schema é daqui; o contrato de
  propagação é de lá.
- **schematize-go / rust / elixir / csharp / zig / ruby** — a **implementação**. Esta skill é
  agnóstica: define tabela/coluna/tipo/chave/constraint/índice/migration; **o código** (query
  parametrizada, ORM, executar migration, testes de repositório) roda no gate daquela linguagem
  (`/<slug>-review`). O schema é o mesmo em qualquer stack.
- **schematize-scaffold** — quando um **projeto novo** nasce, o schema de cada bounded context
  (schema próprio por serviço, sem join cross-service) é desenhado com esta skill.
- **schematize-pentest** — o **oráculo ofensivo**: id sequencial exposto (enumeração/IDOR),
  cross-tenant por falta de `tenant_id`/RLS, PII vazando em índice/coluna. O desenho fecha; a
  pentest tenta furar.
