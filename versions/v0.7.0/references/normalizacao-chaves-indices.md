# Normalização, chaves, constraints e índices

> O coração do desenho: **normalizar** até 3FN (e desnormalizar com consciência), escolher as
> **chaves** no padrão da casa (surrogate ULID + natural `UNIQUE`, identidade≠email), blindar a
> integridade com **constraints** (`NOT NULL`/`UNIQUE`/`CHECK`/`FK`+`ON DELETE`) e criar **índices**
> como decisão de custo — nunca por hábito.

## 1. Normalização — 1FN → 2FN → 3FN

Normalizar é guardar **cada fato uma vez**. As três formas normais que importam no dia a dia:

- **1FN — atômico, sem repetição.** Cada coluna guarda **um** valor; nada de lista numa string,
  nada de grupos repetidos (`telefone1`, `telefone2`, `telefone3`). Valor multivalorado vira
  **tabela filha** (`modelo-relacional.md` §2).
- **2FN — 1FN + toda coluna depende da chave INTEIRA.** Só morde quando a PK é **composta**: se uma
  coluna depende só de **parte** da chave, ela está na tabela errada. Ex.: numa junção
  `pedido_produto(pedido_id, produto_id, nome_produto)`, `nome_produto` depende só de `produto_id`
  — pertence a `produto`, não à junção.
- **3FN — 2FN + nenhuma coluna depende de outra coluna NÃO-chave (dependência transitiva).** Ex.:
  `pedido(id, cliente_id, cliente_email, cliente_cidade)` — email/cidade dependem de `cliente_id`,
  não do pedido: são **dependência transitiva**, movem-se pra `cliente`. O pedido guarda só o
  `cliente_id`.

**Regra prática:** cada coluna não-chave descreve **a chave, a chave inteira, e nada além da
chave**. Chegue a 3FN por **padrão** — é o piso. As anomalias que a normalização evita:

- **Anomalia de update:** um fato duplicado (email do cliente em cada pedido) exige atualizar N
  linhas; esquecer uma corrompe.
- **Anomalia de inserção:** não consegue registrar um cliente sem um pedido (porque os dados dele só
  existem na tabela de pedido).
- **Anomalia de deleção:** apagar o último pedido apaga o cliente junto.

## 2. Desnormalização — decisão medida e REGISTRADA

Desnormalizar (duplicar coluna, materializar agregado, embutir array/JSON no lugar de tabela filha,
manter contador cacheado) é **legítimo** — mas é **decisão**, não default. Só com:

1. **Motivo medido** — leitura quente comprovada (query plan, latência), não "acho que vai ser
   rápido". A normalização é o ponto de partida; desnormaliza-se **contra evidência**.
2. **Registro** — ADR ou comentário na migration: o quê foi duplicado, por quê, e **como a cópia é
   mantida consistente** (trigger, rotina de recálculo, evento). Cópia sem dono vira dado que
   diverge em silêncio.
3. **Consciência da anomalia** — você está **trocando** integridade automática por velocidade de
   leitura, e assumindo o custo de manter a cópia correta.

Desnormalização "por hábito" (guardar `total` sem quem o recalcule, `cliente_nome` no pedido "pra
não dar join") que gera anomalia de update é **VETADA**. Alternativas antes de desnormalizar: índice
melhor, view, cache na aplicação (skill de linguagem), tabela de leitura derivada por CDC
(`schematize-data`).

## 3. Chaves — o padrão da casa

### PK: surrogate interna ULID/UUIDv7

Toda tabela tem uma **chave primária surrogate**: um id **interno, opaco, estável**, sem significado
de negócio.

- **ULID ou UUIDv7** (base §10) — **ordenáveis no tempo** (bom pra índice/inserção, evita o
  fragmentação do UUIDv4 aleatório) e **não revelam volume nem sequência** (ao contrário do
  `serial`/`bigint` autoincrement). Guardados como `uuid` nativo ou `bytea` (16 bytes) — não como
  `text` (ocupa o dobro, compara mais devagar).
- **IDs sequenciais expostos são VETADOS** — `GET /pedido/1002` grita "existe o 1001, 1003" e o
  volume total (enumeração, IDOR — `seguranca-pii.md`, e a `schematize-pentest`). Se o domínio
  **exige** ordenação natural sequencial (nº de nota fiscal legal), essa sequência é uma **coluna
  de atributo** (`numero_nf bigint unique`), **não** a PK, e nasce com ADR (base §10).

### Chave natural: `UNIQUE`, nunca a PK

A **chave natural** é o identificador do domínio: email, CPF, slug, código de produto, `(tenant_id,
codigo)`. Ela vira **constraint `UNIQUE`** sobre a(s) coluna(s) — **não** a PK. Porque a chave
natural:

- **muda** (a pessoa troca de email; o produto é recodificado) — e uma PK que muda quebra toda FK
  que aponta pra ela;
- **vaza** (email/CPF em URL, log, índice é PII exposta — `seguranca-pii.md`);
- **pode ser composta e larga** (ineficiente como alvo de FK).

O surrogate é o **alvo estável** das FKs; a chave natural garante **unicidade do fato** via `UNIQUE`.

### Identidade ≠ email (piso do IAM da casa)

A pessoa **é** o `id` surrogate interno. O email é um **atributo `UNIQUE` mutável**, não a
identidade. Modelar `usuario` com email como PK é o anti-padrão que a casa **veta**: quebra ao trocar
de email, vaza PII como chave, e impede múltiplos identificadores (email + telefone + passkey). Casa
com o IAM (`schematize-engineering` iam).

## 4. Constraints — integridade é do banco

O banco é a **última linha** da consistência: a constraint vale mesmo quando o app tem bug, quando
duas versões do código rodam juntas, quando alguém edita à mão.

- **`NOT NULL` — o default mental.** Decida a nulabilidade coluna a coluna; nullable **exige razão**
  de domínio. `NULL` significa "desconhecido/não-aplicável" — não use como "vazio"/"zero"/"falso"
  (isso tem valor próprio). Cada `NULL` propaga em comparação (`x = NULL` é sempre desconhecido) e
  some em `COUNT(col)`.
- **`UNIQUE` — em toda chave natural.** Email, slug, `(tenant_id, codigo)`. Unicidade composta
  quando o fato único é a **combinação** (um código único **por tenant**, não global). `UNIQUE`
  cria índice automaticamente — conte isso no §índices.
- **`CHECK` — o domínio do valor.** Faixa (`quantidade > 0`, `preco >= 0`), formato (email/CEP via
  regex — leve), estado válido (`status in ('pendente','pago','cancelado')`), coerência entre
  colunas (`data_fim >= data_inicio`, `check (desconto <= preco)`). O `CHECK` põe a **regra de
  domínio no schema**, onde nenhum app a fura.
- **`FOREIGN KEY` — em TODA relação, com `ON DELETE` consciente.** A FK garante que a referência
  **existe** (sem órfão). O `ON DELETE`/`ON UPDATE` é **decisão de domínio explícita**:

  | `ON DELETE` | Quando | Efeito |
  |---|---|---|
  | `RESTRICT` / `NO ACTION` | **default seguro** | impede apagar o pai enquanto houver filho — força o app a decidir |
  | `CASCADE` | filho **não existe** sem o pai (item↔pedido, perfil↔usuário) | apagar o pai apaga os filhos — poderoso e perigoso, use com intenção |
  | `SET NULL` | relação **opcional** (a FK é nullable) | apagar o pai zera a referência no filho |

  **Nunca deixe o `ON DELETE` no default por acidente** — escolha `CASCADE` vs `RESTRICT` pensando
  "o que deve acontecer com os filhos quando o pai morre?". `CASCADE` silencioso apaga dado que
  ninguém queria perder; `RESTRICT` esquecido trava exclusões legítimas.

- **`EXCLUSION` constraint** (Postgres) pra regras que `UNIQUE` não cobre — ex.: sem sobreposição de
  intervalos de reserva (`&&` em `tstzrange`).

## 5. Índices — decisão de custo, não enfeite

Um índice **acelera leitura** e **desacelera escrita** (todo `INSERT`/`UPDATE`/`DELETE` mantém o
índice) e **ocupa espaço**. Cria-se índice pra um **acesso real e quente** — não "por garantia".

### O que quase sempre indexar

- **Toda FK** — o join e o `ON DELETE CASCADE` varrem por ela; FK sem índice é scan a cada
  operação no pai. (Postgres **não** cria índice de FK automaticamente — a PK e o `UNIQUE` sim.)
- **Colunas de `UNIQUE`/PK** — já vêm indexadas pela constraint (não duplique).
- **Coluna de filtro/ordenação quente** comprovada (`WHERE status = ...`, `ORDER BY created_at`).

### Índice composto — a ORDEM das colunas importa

Num índice `(a, b, c)`, ele serve consultas por `a`, por `a,b`, por `a,b,c` — **da esquerda pra
direita** (leftmost prefix). **Não** serve uma consulta só por `b`.

- **Regra de ordem:** colunas de **igualdade primeiro**, **range/ordenação por último**. Pra
  `WHERE tenant_id = ? AND status = ? ORDER BY created_at`, o índice é `(tenant_id, status,
  created_at)` — os dois `=` na frente, o range/sort atrás.
- **Multi-tenant:** `tenant_id` costuma ser a **primeira** coluna dos índices quentes
  (`seguranca-pii.md`) — alinha o índice ao isolamento.

### Índice parcial e de cobertura

- **Parcial** — indexa só o **subconjunto quente**: `create index on pedido (created_at) where
  status = 'aberto'`. Menor, mais rápido, ideal quando as queries sempre filtram aquele subconjunto
  (ex.: "pedidos abertos", soft-delete `where deleted_at is null`).
- **Cobertura (`INCLUDE`)** — quando a query lê poucas colunas e você quer evitar o heap-fetch:
  `create index on x (a) include (b)`. **Só** quando medido — cobertura infla o índice.

### O que NÃO fazer

- **Índice redundante:** ter `(a)` **e** `(a, b)` — o composto já cobre o prefixo `(a)`. Um sobra.
- **Índice nunca usado:** cada índice não-usado é escrita mais lenta + espaço morto. Revise
  periodicamente (base §10 SHOULD: `pg_stat_user_indexes`, revisão de índice, query plan em
  endpoint crítico).
- **Indexar tudo "por via das dúvidas":** índice é aposta num padrão de acesso — sem o padrão, é
  só custo.
- **PII em claro como chave de índice pesquisável** — VETADO (`seguranca-pii.md`): índice de email
  em claro é vazamento por desenho; se precisar buscar por email, indexe o **hash** determinístico
  ou use `citext` com o dado já tratado como identificador controlado.

> **O caso do e-mail: os dois pisos não se anulam — eles se combinam, e a regra é uma só.**
> "Chave natural vira `UNIQUE`" e "PII não vira chave de índice pesquisável" pareciam dar vereditos
> opostos para `usuario.email`, e davam mesmo — porque faltava dizer **para que serve cada índice**:
>
> - **Unicidade** (impedir dois cadastros com o mesmo e-mail) é **restrição**, e ela **continua
>   valendo**: `UNIQUE` sobre uma **coluna derivada** — `email_normalizado` (`lower(trim(...))`) ou,
>   onde o requisito de proteção é maior, `email_hash` (HMAC com chave da aplicação, determinístico).
>   O e-mail **em claro** fica numa coluna comum, **sem índice**.
> - **Busca por e-mail** (login, suporte) usa **a mesma coluna derivada** — a aplicação normaliza/
>   hasheia a entrada e procura por ela. Você não perde nada: nenhum caso de uso real precisa de
>   *prefix search* em e-mail.
> - **O que continua VETADO** é o índice **em claro** e pesquisável sobre a coluna de PII, porque ele
>   é o que transforma um `SELECT` acidental (ou um dump de índice) em lista de e-mails ordenada.
> - **HMAC, não hash puro**, quando a proteção importa: `sha256(email)` sozinho é **reversível por
>   dicionário** — o espaço de e-mails prováveis é pequeno. Com chave, não é.
>
> **Portanto:** `/database-design` gera `email` (texto, sem índice) + `email_normalizado`/`email_hash`
> **com `UNIQUE`**; `/database-review` reprova `UNIQUE`/índice **diretamente** sobre a coluna em
> claro. Os dois passam a dizer a mesma coisa. E a identidade continua sendo o **ULID/UUIDv7**, nunca
> o e-mail (`identidade≠email`).

## 6. Checklist de desenho (o que o design/review verifica)

- [ ] Cada entidade é uma tabela; cada atributo é atômico (1FN); N:N tem tabela de junção.
- [ ] 3FN por padrão; toda desnormalização tem motivo medido + registro + dono da consistência.
- [ ] PK surrogate ULID/UUIDv7; chave natural é `UNIQUE` — e, quando ela é **PII** (e-mail), o
      `UNIQUE` fica na **coluna derivada** (normalizada/HMAC), com a coluna em claro **sem índice**;
      **nenhum id sequencial exposto**; identidade≠email.
- [ ] `NOT NULL` decidido coluna a coluna; `UNIQUE` na chave natural; `CHECK` no domínio do valor.
- [ ] **FK em toda relação** com `ON DELETE` **escolhido** (não default por acidente).
- [ ] Toda FK indexada; índices compostos com a **ordem certa** (igualdade→range); parcial/cobertura
      só onde medido; sem índice redundante/inútil; sem PII em claro como chave de índice.
- [ ] Tipos corretos (`modelo-relacional.md` §4): dinheiro sem `float`, tempo em `timestamptz` UTC.
