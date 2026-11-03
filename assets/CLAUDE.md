# CLAUDE.md — Modelagem de Banco de Dados da Casa (sempre on)

> Copie para a **raiz do repositório**. Fica pinado no contexto de toda tarefa e garante o piso de
> **desenho de schema** mesmo quando a skill `schematize-database` não dispara sozinha. Em repo
> multi-skill, use **junto** com os `CLAUDE.md` das skills de engenharia/dados/linguagem (rode
> `/database-claude` que mescla, sem sobrescrever os outros blocos).

## Regra mestre

O **schema** é o contrato mais duradouro do sistema — o código muda toda semana, a tabela
sobrevive anos com o dado real. Por isso o desenho é **plan-first** e **conservador na
integridade**: modele o domínio **antes** de escrever `CREATE TABLE`, e deixe a **integridade no
banco** (constraint que o banco garante não depende de nenhum app se comportar). Esta skill rege o
**DESENHO do schema relacional em si** — não a query (skill de linguagem), não o pipeline
(`schematize-data`). Em conflito entre "ajusta o schema depois" e este piso, **o piso vence**:
ajustar schema com dado vivo é migration com risco; ajustá-lo no desenho é grátis. Consulte o
reference antes de agir — não trabalhe de memória.

## Pisos inegociáveis (VETADO — sem exceção)

1. **PK surrogate interna (ULID/UUIDv7); chave natural é `UNIQUE`, não PK; identidade≠email.**
   Toda tabela tem id interno opaco como PK; email/CPF/slug/código viram `UNIQUE`. **id sequencial
   exposto é VETADO** (enumeração/IDOR). A pessoa É o id interno; email é atributo mutável.
2. **3FN por padrão; desnormalizar é decisão REGISTRADA.** Cada fato uma vez, sem dependência
   transitiva. Duplicar coluna/materializar agregado só com motivo medido + registro (ADR) + dono
   da consistência. Desnormalização por hábito que gera anomalia de update é VETADA.
3. **O tipo é a primeira constraint — nada de "texto pra tudo".** Dinheiro em `numeric`/inteiro,
   **NUNCA `float`**; tempo em `timestamptz` **UTC**; conjunto fechado em enum/`CHECK`/tabela de
   domínio; `jsonb` só pra dado sem forma. Tipo mais restrito que serve.
4. **Integridade é do BANCO — constraints sempre.** `NOT NULL` como default mental; `UNIQUE` na
   chave natural; **`FOREIGN KEY` em toda relação** com `ON DELETE` **escolhido conscientemente**
   (`RESTRICT` default seguro; `CASCADE`/`SET NULL` só quando o domínio pede); `CHECK` no domínio
   do valor. "O app valida" não substitui a constraint.
5. **Índice é decisão de custo; PII nunca vira chave de índice/URL.** Índice pra acesso real (FK,
   filtro quente, `UNIQUE`); em composto, **igualdade antes de range**; parcial/cobertura só
   medido; sem redundância. PII em claro nunca é chave de índice pesquisável nem vai pra URL/chave
   exposta.
6. **Migration é expand-contract com `down` — nunca `DROP`/rename num passo.** expand (aditivo)
   → migrate (backfill idempotente + dual-write) → contract (corta o velho só quando ninguém lê),
   cada passo com `down` (expand: testado). Contract com `DROP` **não é reversível**: o `down` é restore de
   backup verificado ou ADR de passo irreversível; `DROP TABLE` como `down` do `CREATE` inicial só em dev/hml.
   Par `NNN_nome.up.sql`/`.down.sql`, cobrado pelo gate. Casa com a `schematize-data`.
7. **PII marcada, com base legal + retenção; deny-by-default + tenant no desenho.** Coluna pessoal
   é marcada (LGPD); PII fora de log/URL/índice em claro; segredo (senha/token) nunca em claro
   (hash/cofre). Multi-tenant nasce com `tenant_id` na tabela e no índice, unicidade por tenant,
   RLS quando couber.

8. **Seed/fixture nunca tem e-mail de caixa real.** Dado de teste (inclusive `INSERT` dentro de
   migration) só usa o **domínio em ROTA NULA** `test.<domain>` (null MX + SPF `-all` + DMARC
   `p=reject`) ou TLD reservado, na forma **`<papel>+<run-id>-<n>@test.<domain>`** — o `+tag` por
   run evita colisão sem **dropar o `UNIQUE`** do e-mail. **VETADO** `@gmail.com` e afins, domínio
   de cliente/terceiro, e-mail de pessoa real (inclusive o seu) e o domínio de produção. A coluna
   de e-mail é **PII marcada** em todo ambiente. Normativa: `schematize-engineering` →
   `references/efeitos-externos.md`; detalhe em `references/seguranca-pii.md` §6.

## Como se faz aqui

- **Schema novo (`/database-design`):** descreva o domínio → a skill traduz entidades→tabelas/
  colunas/tipos/PK/FK/índices nos padrões da casa e emite **`CREATE TABLE` + a migration
  expand-contract reversível + o resumo do modelo** (entidades, relações, chaves, colunas PII) —
  pronto pro "database builder" do app consumir.
- **Schema existente (`/database-review`):** revisa normalização (1FN–3FN, redundância), chaves
  (surrogate+natural), tipos, constraints/FK (`ON DELETE`), índices (faltando/redundante/PII),
  particionamento e PII/LGPD; emite as **migrations de correção**.

## Fronteira (o que NÃO é desta skill)

- **Engenharia de DADOS → `schematize-data`:** dado como contrato versionado, pipeline/ETL/ELT,
  CDC/event sourcing, qualidade/quarentena, lineage, warehouse. (Desenhar a **tabela OLTP** é
  aqui; **mover/versionar/validar o dado** é lá. O expand-contract é piso compartilhado.)
- **IMPLEMENTAÇÃO → skill de linguagem** (go/rust/elixir/csharp/zig/ruby): query **parametrizada**
  (SQL concatenado é VETADO lá), ORM/repositório, cache, pool. **Aplicar** a migration é operação do ops a partir de arquivo versionado (`ops migrate`).

## Gestão de contexto (sessões longas)

Ao se aproximar do teto de contexto: **PARE e** gere o handoff em `<projeto>_archive/context/`
(modelo decidido: entidades/relações/chaves/PII FEITO vs EM ABERTO) **antes** de compactar
(`/database-cc`).

## Orquestração

<!-- herdado:engineering/pisos-22-29:bloco -->**Herda os pisos 22–29 da `schematize-engineering`** (texto completo em `assets/CLAUDE.md` dela): 22 tudo no git — sem remote, push falho ou HEAD≠origin a demanda NÃO se conclui; 23 deploy só do git (VETADO scp/rsync/tar|ssh/docker save|load/git bundle); 24 o ops é o gate da IA — a IA nunca muda a VPS direto nem escreve SQL, só operação nomeada (`ssh vps "ops <op>"`); 25 sem agents inúteis (entregou, morreu); 26 relatório a cada 30 min e handoff a cada 6 h; 27 CI remoto só antes do hml, a pedido ou em tag (`workflow_dispatch` + `hml-*`/`v*`; VETADO `pull_request`, `push` em branch, `workflow_run`, cron sem justificativa); 28 microserviço autônomo (fila durável + 7 testes de resiliência); 29 build/teste na máquina dev/hml quando existe (ponte só no workspace de build, nunca prd) + higiene (`scripts/higiene.sh`).<!-- /herdado -->

<!-- herdado:engineering/orquestracao:curto -->**Orquestrador não desenvolve; subagent barato executa.** O agent principal só planeja, despacha e revisa; ação onerosa vira micro-tasks para o executor mais barato que resolve: `haiku` (mecânico) / `sonnet` (código; falhou → mesmo subagent corrige, até 2 rodadas) → Codex `gpt-5.6-terra` → Cursor → subagent `opus` (motivo) → `park`; **visual vai direto ao Codex**; **imagem nunca pelo Claude: detectar Codex/Gemini e perguntar ao usuário qual usar (Codex é a sugestão), nunca API de imagem paga**; papéis em `agentes.toml`. No overdev, cada item do checklist vai a um subagent e o principal revisa antes do `- [x]`. **Sem frota ociosa:** idle com pendência volta ao trabalho; dependente de outro agent → mata e enfileira com gatilho; terminou → mata (§9.6). Detalhe: `schematize-engineering` → `references/orquestracao.md` §9.<!-- /herdado -->
