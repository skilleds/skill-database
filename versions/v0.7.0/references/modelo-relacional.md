# Modelo relacional — do domínio à tabela, e o tipo certo por coluna

> O **desenho** do schema começa no domínio, não na tela nem na query. Este reference cobre a
> tradução **entidade→tabela / atributo→coluna / relação→FK ou tabela de junção**, a
> **cardinalidade/obrigatoriedade** de cada relação, e a escolha do **tipo correto** por coluna —
> a primeira e mais barata constraint do sistema.

Casa com a base (`schematize-engineering` §10): PostgreSQL como relacional padrão, **schema próprio
por serviço**, **sem join cross-service**, timestamps **UTC**, IDs **UUIDv7/ULID**.

## 1. Entidade → tabela

Uma **entidade** é um substantivo do domínio com identidade própria e ciclo de vida: `usuario`,
`pedido`, `produto`, `fatura`. Cada uma vira **uma tabela**.

- **Nome da tabela:** `snake_case`, **singular** (`usuario`, `pedido` — a linha É um usuário) ou
  plural consistente — **escolha uma convenção e mantenha** (a casa usa singular). Sem prefixo
  `tbl_`. Nome do domínio, na língua do domínio.
- **Uma entidade, uma tabela** — não fatie uma entidade em duas tabelas 1:1 "por organização" (isso
  é decisão de §relações, não de estética). Não junte duas entidades numa tabela "pra economizar
  join" (isso é desnormalizar — decisão registrada, `normalizacao-chaves-indices.md`).
- **Toda tabela nasce com:** `id` (PK surrogate), as colunas de atributo, `created_at`/`updated_at`
  (`timestamptz` UTC), e — se multi-tenant — `tenant_id` (`seguranca-pii.md`).

## 2. Atributo → coluna

Um **atributo** é um fato **atômico** sobre a entidade: nome, email, preço, status.

- **Atômico (1FN):** uma coluna guarda **um** valor, não uma lista nem uma estrutura. `telefones`
  numa string separada por vírgula é **violação de 1FN** — vira tabela filha `telefone(usuario_id,
  numero, tipo)`. `endereco` com rua+cidade+cep numa coluna vira colunas separadas (ou tabela
  `endereco`).
- **Nome da coluna:** `snake_case`, sem repetir o nome da tabela (`usuario.nome`, não
  `usuario.usuario_nome`). Boolean com prefixo claro (`is_ativo`, `tem_2fa`). FK termina em `_id`.
- **Derivado não se guarda por padrão:** `idade` (deriva de `data_nascimento`), `total` (soma dos
  itens) — calcule na leitura. Materializar um derivado é **desnormalização consciente**
  (`normalizacao-chaves-indices.md` §2): só com motivo e com o gatilho/rotina que o mantém correto.

## 3. Relações — cardinalidade e obrigatoriedade

Para cada par de entidades relacionadas, decida **duas** coisas: **cardinalidade** (1:1, 1:N, N:N)
e **obrigatoriedade** (a FK é `NOT NULL`?). A obrigatoriedade é tão importante quanto a
cardinalidade — é ela que vira `NOT NULL` na FK.

### 1:N (o caso comum)

Um pedido tem N itens; um item pertence a **um** pedido. A FK mora no lado **N** (o "muitos"):

> **Por que `uuid` e não `bytea` nos exemplos.** Os dois guardam 16 bytes, mas `uuid` é o tipo que o
> Postgres **entende**: você ganha `gen_random_uuid()` como default (sem gerar id na aplicação),
> comparação e ordenação corretas, e — o que mais importa no dia a dia — o valor **legível** em
> `psql`, em log e em mensagem de erro (`0190e2…` em vez de `\x0190e2…`). Com `bytea` você perde o
> default, escreve `encode(id,'hex')` em toda consulta manual e descobre o id errado no meio de um
> incidente. `bytea` como PK é escolha legítima só com motivo escrito (interop binária com um
> sistema que já usa aquele layout, por exemplo) — não como default.

```sql
create table item_pedido (
  id          uuid primary key default gen_random_uuid(),  -- UUIDv7/ULID (ver §chaves)
  pedido_id   uuid not null references pedido(id) on delete cascade,
  produto_id  uuid not null references produto(id) on delete restrict,
  quantidade  integer not null check (quantidade > 0),
  preco_unit  numeric(12,2) not null check (preco_unit >= 0)
);
create index on item_pedido (pedido_id);   -- FK quase sempre indexada
```

- A FK `pedido_id` é `NOT NULL` porque item **sem** pedido não existe (relação obrigatória).
- `on delete cascade` no pedido (apagar o pedido apaga os itens — decisão de domínio); `restrict`
  no produto (não deixa apagar produto que está em pedido). **`ON DELETE` é escolha consciente**,
  ver `normalizacao-chaves-indices.md` §constraints.

### 1:1

Um usuário tem um perfil; um perfil pertence a um usuário. Modele como 1:N com `UNIQUE` na FK — ou,
melhor, só separe em tabela 1:1 quando houver **motivo** (colunas opcionais volumosas, PII isolável,
acesso muito diferente). Sem motivo, é **coluna na mesma tabela**, não tabela nova.

```sql
create table perfil_usuario (
  usuario_id uuid primary key references usuario(id) on delete cascade,  -- PK = FK garante 1:1
  bio        text,
  avatar_url text
);
```

### N:N — SEMPRE tabela de junção (não há atalho)

Um produto está em N pedidos; um pedido tem N produtos. **Nunca** um array de ids nem colunas
repetidas — **sempre** uma tabela de junção (associativa):

```sql
create table produto_categoria (
  produto_id   uuid not null references produto(id)   on delete cascade,
  categoria_id uuid not null references categoria(id) on delete cascade,
  primary key (produto_id, categoria_id)               -- PK composta = par único
);
create index on produto_categoria (categoria_id);      -- o outro lado do join
```

- A **PK composta** `(produto_id, categoria_id)` garante que cada par aparece **uma vez**.
- Indexe também a **segunda** coluna (a PK composta já indexa a primeira; o join pelo outro lado
  precisa do índice em `categoria_id`).
- **Se a relação tem atributos próprios** (data de associação, papel, quantidade), a tabela de
  junção vira uma **entidade** com seu próprio `id` surrogate e seus atributos — é o caso de
  `item_pedido` acima (junção pedido×produto **com** quantidade e preço).

## 4. O tipo correto por coluna — a primeira constraint

O tipo **restringe antes de qualquer `CHECK`**. Escolha o **mais restrito que serve**. "`text` pra
tudo, resolve depois" é dívida: aceita lixo, ordena errado, ocupa espaço, esconde bug.

| Dado | Tipo (Postgres) | Regra |
|---|---|---|
| **Dinheiro / valor monetário** | `numeric(p,s)` **ou** inteiro na menor unidade (centavos) | **NUNCA `float`/`real`/`double`** — arredondamento corrompe dinheiro. Guarde a moeda junto se multi-moeda. |
| **Data+hora / instante** | `timestamptz` | **Sempre UTC.** Conversão de timezone só na borda (UI/API). `timestamp` sem tz é VETADO pra instante. |
| **Só data (aniversário, vencimento)** | `date` | Sem hora quando o domínio é só data. |
| **Booleano** | `boolean` | Nunca `char(1)`/`0/1`/`'S'/'N'`. |
| **Conjunto fechado (status, tipo)** | enum nativo **ou** `text` + `CHECK (x in (...))` **ou** tabela de domínio + FK | Estados válidos são **finitos e conhecidos** — restrinja. `CHECK`/FK é mais evolutivo que enum nativo (adicionar valor não trava). |
| **Identificador (PK/FK)** | **`uuid`** (UUIDv7; ULID convertido para `uuid`) | Ver §chaves em `normalizacao-chaves-indices.md`. Nunca `text` livre; `bytea` só com motivo escrito (abaixo). |
| **Texto curto com formato (email, slug, CEP)** | `text` + `CHECK` (formato) ou `citext` p/ case-insensitive | `varchar(n)` só quando o limite é **regra de domínio**, não chute. Postgres não ganha perf com `varchar(n)` vs `text`. |
| **Texto livre (descrição, comentário)** | `text` | Sem limite artificial. |
| **Quantidade inteira** | `integer`/`bigint` | `bigint` quando pode passar de ~2 bi. `smallint` p/ faixas pequenas. |
| **Percentual/medida fracionária** | `numeric` | `float`/`double` só p/ medida científica onde erro é tolerável — nunca p/ valor de negócio. |
| **Dado sem forma fixa (config, payload externo)** | `jsonb` | **Só** quando é genuinamente sem esquema. Com validação (`CHECK`/schema). **Não** é fuga de modelar: campo que você **consulta/filtra** é coluna, não chave de JSON. |
| **Binário (arquivo pequeno)** | `bytea` | Arquivo grande vai pra object storage; guarde a **referência/URL**, não o blob. |

### Regras de tipo (pisos)

- **`NOT NULL` é o default mental.** Decida a nulabilidade **coluna a coluna** — nullable exige
  razão ("ainda não preenchido" é razão; "não pensei" não é). `NULL` propaga em comparação e some em
  agregação — cada `NULL` é uma decisão, ver `normalizacao-chaves-indices.md` §constraints.
- **Default seguro e explícito** quando faz sentido (`created_at default now()`, `is_ativo default
  true`, `status default 'pendente'`). Default é parte do desenho, não um afterthought do app.
- **Dinheiro e tempo são os dois erros clássicos** — `float` pra dinheiro e `timestamp` naive pra
  instante corrompem em silêncio. Trave-os no desenho.
- **Enum: prefira `CHECK`/tabela de domínio a enum nativo** quando o conjunto pode crescer —
  adicionar valor a enum nativo do Postgres é migration; a um `CHECK`/tabela, não.

## 5. Do modelo ao DDL — a ordem de emitir

Quando o `/database-design` traduz o domínio, a saída sai **nesta ordem** (dependências primeiro):

1. **Tabelas independentes** (sem FK de saída): domínios, catálogos, `tenant`.
2. **Tabelas de entidade** que referenciam as de cima.
3. **Tabelas de junção** (N:N) por último (dependem de duas).
4. **Índices** depois das tabelas (FK, `UNIQUE` de chave natural, filtros quentes —
   `normalizacao-chaves-indices.md` §índices).
5. Tudo embrulhado como **migration expand-contract** (a criação é o primeiro `expand`;
   `migrations.md`).

O `/database-design` também emite o **resumo do modelo** — entidades, relações (com cardinalidade),
chaves, e **quais colunas são PII** (`seguranca-pii.md`) — pro "database builder" do app consumir
sem reinterpretar o SQL.
