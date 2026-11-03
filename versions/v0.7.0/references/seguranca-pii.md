# Segurança e privacidade no desenho do schema (PII, LGPD, tenant)

> O piso de **privacidade e segurança que se decide no DESENHO** — antes de qualquer query. Marcar
> PII, dar base legal + retenção, manter PII fora de índice/URL, não guardar segredo em claro, e
> desenhar o **isolamento multi-tenant** na tabela. O que se erra aqui vaza por anos.

Casa com a base (`schematize-engineering` §13-15/§32) e com a governança da **schematize-data**
(`schematize-data` -> `references/governanca.md`): **deny-by-default no acesso**, **nada de PII sem base legal E
retenção**, PII fora de log/URL. Aqui aplicamos esses pisos **na estrutura da tabela**.

## 1. Marque a PII no modelo

Toda coluna que guarda **dado pessoal** (identifica ou torna identificável uma pessoa — nome, email,
CPF, telefone, endereço, IP, geolocalização, foto, dado de saúde/financeiro) é **marcada no desenho**
— comentário na coluna, no resumo do modelo, e no catálogo. O `/database-design` **lista as colunas
PII** na saída; o `/database-review` **aponta PII não marcada** como achado.

Marcar não é enfeite — é o que habilita retenção, mascaramento, export/eliminação por titular (LGPD)
e o gate de "essa coluna pode ir pra índice/URL/log?".

## 2. Base legal + retenção — decididas na data, desenhadas aqui

Base legal, política de retenção e LGPD (titular, eliminação) são da `schematize-data → references/governanca.md`; sem elas a coluna **não existe**. O que é do schema: registrar as duas junto da coluna (comentário/catálogo/ADR) e **desenhar o mecanismo de expurgo** — `deleted_at`/`anonymized_at`, partição por tempo que se dropa, rotina de expurgo. "Guarda pra sempre por via das dúvidas" é **VETADO**.

## 3. PII fora de índice em claro, de URL e de chave natural exposta

- **PII em claro NÃO é chave de índice pesquisável.** Índice de email/CPF em claro é vazamento por
  desenho (dump do índice = dump da PII; buscas revelam presença). Se precisa **buscar** por email,
  indexe um **hash determinístico** (com pepper) ou trate o identificador de forma controlada
  (`citext` só quando o dado já é identificador público). Busca por CPF idem.
- **PII nunca na URL/query string** (`schematize-engineering` §16.1/§32) — e portanto **nunca** como
  a chave que a API expõe. A chave exposta é o **id surrogate** (`normalizacao-chaves-indices.md`
  §3); email/CPF/slug-com-nome ficam como atributo interno.
- **Identidade ≠ email.** A PK da pessoa é o id surrogate interno; o email é atributo `UNIQUE`
  mutável — nunca a PK, nunca o que aparece em rota. (Piso do IAM da casa.)
- **id sequencial exposto** revela volume e permite enumeração — VETADO, use ULID/UUIDv7
  (`normalizacao-chaves-indices.md` §3; a `schematize-pentest` ataca exatamente isso: IDOR/BOLA,
  enumeração).

## 4. Segredo nunca em claro — e o que NÃO guardar

O banco de **modelagem** não guarda credencial reutilizável em claro:

- **Senha:** só **hash** forte (argon2id) — nunca a senha, nunca hash reversível. (O fluxo de auth é
  do IAM; aqui, a **coluna** é `senha_hash`, não `senha`.)
- **Token/API key/secret:** hash ou referência a cofre — não o valor. Dado de cartão/PAN **não** se
  guarda (tokenização/gateway).
- **Minimização:** só as colunas que o domínio **precisa**. Coluna PII "que talvez sirva" é
  superfície de vazamento sem uso — não a crie. Menos PII guardada, menos a proteger.

## 5. Isolamento multi-tenant — no desenho, não no `WHERE`

Sistema multi-tenant nasce com o isolamento **na estrutura**, não confiado a um `WHERE` que alguém
pode esquecer (`schematize-engineering` §15, `schematize-data` §governança):

- **`tenant_id` na tabela** (toda tabela de dado de tenant) e **na frente dos índices quentes**
  (`normalizacao-chaves-indices.md` §5) — alinha isolamento e performance.
- **`tenant_id` nas chaves compostas** quando o fato é único **por tenant** (`unique (tenant_id,
  codigo)`, não `unique (codigo)` global).
- **Deny-by-default + RLS quando couber:** Row-Level Security (Postgres) força o filtro de tenant no
  **banco**, derivado do contexto server-side — não do cliente. O `tenant_id` **nunca** vem confiado
  do cliente; vem do token validado server-side (a **query parametrizada** que aplica isso é da skill
  de linguagem — SQL concatenado é VETADO lá).
- **FK respeita o tenant:** uma FK não deve permitir apontar pra linha de **outro** tenant — modele
  a chave/constraint pra que cross-tenant seja impossível por estrutura (ex.: FK composta incluindo
  `tenant_id`).

## 6. Dado de teste: e-mail de seed/fixture nunca é caixa real

Coluna de e-mail é **PII marcada** (§1) — e tem um risco extra que as outras não têm: ela é
**endereçável**. Um seed de migration ou de ambiente de teste com endereço de caixa real vira
**disparo real** no primeiro laço que roda em cima dele. Foi assim que um laço de teste mandou
**>5.000 e-mails** pra endereços sintéticos e **queimou a reputação de IP e domínio** — derrubando
o transacional de **produção**, inclusive o **OTP de login**. Normativa completa:
`schematize-engineering` → `references/efeitos-externos.md`; a reescrita na cópia prd→hml é a
`schematize-data` → `references/governanca.md` §5.1 (*"Endereço de contato: a cópia prd -> hml/dev REESCREVE o e-mail"*); o DNS é a `schematize-infra`.

- **Nenhum seed, fixture, factory ou migration de dado de teste contém e-mail de caixa real.**
  **VETADO** `@gmail.com`/`@hotmail.com`/`@outlook.com` e afins, domínio de cliente/terceiro,
  **e-mail de pessoa real (inclusive o seu)** e o **domínio de produção** da casa. Inclui o
  `INSERT` "só pra ter um usuário admin de teste" dentro da migration.
- **O dado de teste vem do domínio em ROTA NULA:** `test.<domain>` (null MX RFC 7505 + SPF
  `v=spf1 -all` + DMARC `p=reject`) ou TLD reservado (`.test`/`.invalid`/`.example`).
- **`UNIQUE` no e-mail + `+tag` por run.** A chave natural do e-mail é `UNIQUE` (§piso 1 — nunca
  PK), normalizada (`citext`/`lower(email)`). É **o mesmo índice que protege produção** que faz o
  seed **colidir** na segunda execução — e a saída **não** é dropar a constraint nem inventar
  endereço "quase real": é carimbar o **run** no endereço:

  ```sql
  -- forma canonica: <papel>+<run-id>-<n>@test.<domain>
  insert into usuario (id, email) values
    (gen_ulid(), 'user+' || :run_id || '-1@test.exemplo.com'),
    (gen_ulid(), 'user+' || :run_id || '-2@test.exemplo.com');
  ```

  O `+tag` mantém **unicidade por execução** (linhas distintas para o `UNIQUE`) e deixa o **rastro**
  de qual run gerou a linha. **Cuidado:** se a aplicação normaliza e-mail **removendo** o `+tag`
  pra deduplicar, o carimbo tem que ir **antes** do `@` sem o `+` (`user-<run-id>-<n>@test.<domain>`)
  — senão as linhas voltam a colidir na normalização.
- **A coluna continua PII** em qualquer ambiente: e-mail sintético é dado de teste, mas a **marca**
  (§1) e a constraint viajam iguais — o schema de hml/dev é o **mesmo** de prd.

## 7. Checklist de privacidade/segurança (design/review)

- [ ] Toda coluna PII **marcada** (comentário + resumo + catálogo).
- [ ] Cada PII tem **base legal** e **política de retenção** (com o mecanismo de expurgo desenhado).
- [ ] **Nenhuma PII em claro** como chave de índice pesquisável, em URL, ou como chave natural
      exposta.
- [ ] Chave exposta é o **id surrogate** ULID/UUIDv7; **identidade≠email**; sem id sequencial
      exposto.
- [ ] Segredo (senha/token/cartão) **nunca em claro** — hash/cofre/tokenização; coluna é
      `*_hash`/referência.
- [ ] **Minimização** — só as colunas que o domínio precisa.
- [ ] Multi-tenant: `tenant_id` na tabela e nos índices; unicidade **por tenant**; deny-by-default
      (RLS quando couber); FK não cruza tenant.
- [ ] **Seed/fixture/migration de teste sem e-mail de caixa real** — só o domínio em **rota nula**
      (`test.<domain>`), na forma `<papel>+<run-id>-<n>@test.<domain>`, com o `UNIQUE` do e-mail
      intacto (nunca dropado pra "não colidir entre runs").
