---
description: schematize-database — projeta um schema relacional a partir da descrição em linguagem natural do domínio (entidades→tabelas/colunas/tipos/PK/FK/índices nos padrões da casa) e emite o SQL (CREATE TABLE) + a migration expand-contract reversível + o resumo do modelo
argument-hint: "[descrição do domínio, ex: 'loja com clientes, pedidos e produtos']"
---

Projete um **schema relacional** para o domínio: **${ARGUMENTS:-<descreva o domínio>}**. Você está
desenhando **o schema em si** (não a query, não o pipeline). **Plan-first:** modele o domínio antes
de escrever `CREATE TABLE`. Leia os references da skill `schematize-database` — não trabalhe de
memória. Saída em três blocos: **SQL + migration expand-contract + resumo do modelo**.

## 1. Modele o domínio (`references/modelo-relacional.md`)
- **Entidades → tabelas** (`snake_case`, singular). **Atributos → colunas atômicas** (1FN — nada de
  lista em string; multivalorado vira tabela filha).
- **Relações:** para cada par, fixe **cardinalidade** (1:1/1:N/N:N) e **obrigatoriedade** (a FK é
  `NOT NULL`?). **1:N** → FK no lado "muitos". **1:1** → só separe com motivo. **N:N** → **SEMPRE
  tabela de junção** (PK composta; se tem atributos próprios, vira entidade com id surrogate).
- Se a descrição estiver ambígua num ponto que **muda o schema** (uma relação é 1:N ou N:N? um
  campo é obrigatório?), **assuma o default mais conservador e explicite a suposição** no resumo —
  não trave o desenho.

## 2. Chaves, tipos e constraints (`references/normalizacao-chaves-indices.md`, `modelo-relacional.md` §4)
- **PK surrogate ULID/UUIDv7** em toda tabela (`uuid`/`bytea`, não `text`). **Chave natural** do
  domínio → `UNIQUE` (nunca a PK). **Identidade≠email**; **nenhum id sequencial exposto**.
- **Tipo mais restrito que serve:** dinheiro em `numeric`/inteiro (**nunca `float`**); tempo em
  `timestamptz` **UTC**; boolean é `boolean`; conjunto fechado em enum/`CHECK`/tabela de domínio;
  `jsonb` só pra dado sem forma. `created_at`/`updated_at` em toda tabela.
- **Constraints:** `NOT NULL` decidido coluna a coluna; `UNIQUE` na chave natural; **`FK` em toda
  relação** com **`ON DELETE` escolhido conscientemente** (`RESTRICT` default seguro; `CASCADE` só
  quando o filho não existe sem o pai; `SET NULL` p/ relação opcional); `CHECK` no domínio do valor.
- **Normalize até 3FN.** Se propuser desnormalização, marque como decisão com motivo + como manter
  a cópia consistente (§2 do reference).

## 3. Índices (`references/normalizacao-chaves-indices.md` §5)
- Indexe **toda FK**; a `UNIQUE`/PK já vêm indexadas (não duplique). Índice de filtro/ordenação só
  pra **acesso quente real**.
- Composto com a **ordem certa** (igualdade antes de range/sort); `tenant_id` na frente quando
  multi-tenant. **Parcial**/**cobertura** só onde faz sentido. **Sem PII em claro** como chave de
  índice pesquisável.

## 4. PII e multi-tenant (`references/seguranca-pii.md`)
- **Marque cada coluna PII**; anote **base legal + retenção** (LGPD). PII fora de índice em
  claro/URL/chave exposta. Segredo (senha/token) nunca em claro — coluna é `*_hash`.
- Multi-tenant: `tenant_id` na tabela e nos índices; unicidade **por tenant**; FK que não cruza
  tenant; deny-by-default (RLS quando couber).

## 5. Emita (`references/migrations.md` §5, `modelo-relacional.md` §5)
1. **SQL — `CREATE TABLE`** na ordem de dependência (independentes → entidades → junções),
   constraints inline, índices depois.
2. **Migration expand-contract reversível** — a criação é o primeiro `expand`, com `up` **e**
   `down` (o `DROP` na ordem inversa); use `CREATE INDEX CONCURRENTLY`/`NOT VALID` onde couber. Se
   for **alteração** de schema existente, emita a **sequência** expand→migrate→contract em passos
   separados (nunca `DROP`/rename num passo só sobre dado vivo).
3. **Resumo do modelo** (pro "database builder" consumir): entidades, relações com cardinalidade,
   chaves (PK surrogate + naturais `UNIQUE`), **colunas PII**, e as suposições que você assumiu.

## Piso (VETADO)
PK surrogate + natural `UNIQUE` (identidade≠email, sem id sequencial exposto); 3FN por padrão
(desnormalizar é registrado); tipo é a 1ª constraint (dinheiro sem `float`, tempo UTC); integridade
no banco (FK/`CHECK`/`NOT NULL`/`UNIQUE`); índice é custo (PII fora do índice/URL); migration
expand-contract reversível (nunca `DROP`/rename num passo); PII marcada com base legal + retenção.
**A implementação** (query parametrizada, ORM, rodar a migration) é da **skill de linguagem**; o
**pipeline/CDC/contrato de dados** é da **schematize-data** — este comando desenha o schema.
Grave a saída em `<projeto>_archive/database/` (nunca no root).
