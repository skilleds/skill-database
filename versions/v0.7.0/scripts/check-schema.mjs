#!/usr/bin/env node
// schematize-database — o parser do `/database-review`. Lê DDL (arquivo `.sql`) e devolve achados
// com `arquivo:linha`, veredito e severidade — que é o que o comando promete e não tinha.
//
// ALCANCE, dito na cara: isto é um analisador de DDL por TEXTO, não um servidor de banco. Ele acha
// o que está escrito no schema (tipo, chave, índice, FK, PII); ele NÃO sabe o volume da tabela,
// o plano de execução nem se aquele índice é usado. Onde houver banco, `EXPLAIN` e `pg_stat_*`
// mandam — e o comando diz isso.
//
// uso: check-schema.mjs <arquivo.sql|dir> [--json]
//      0 = sem achado bloqueante · 1 = achado de severidade 0/1 · 2 = nada para analisar
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const argv = process.argv.slice(2)
const alvo = argv.find(a => !a.startsWith('--')) || '.'
const comoJson = argv.includes('--json')

function coletar(p, out = []) {
  let st
  try { st = statSync(p) } catch { return out }
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) {
      if (['node_modules', '.git', 'versions', 'build'].includes(e)) continue
      coletar(join(p, e), out)
    }
  } else if (/\.sql$/i.test(p)) out.push(p)
  return out
}

const arquivos = coletar(alvo)
if (!arquivos.length) {
  console.error(`✖ nenhum .sql em ${alvo} — nada para analisar (ausência de material não é aprovação).`)
  process.exit(2)
}

// PII por nome de coluna: heurística explícita, e o gate diz que é heurística.
const PII = /\b(email|e_mail|cpf|cnpj|telefone|phone|celular|rg|passaporte|passport|endereco|address|cep|zipcode|nascimento|birth|cartao|card_number|iban)\b/i
const achados = []
const add = (arq, linha, sev, veredito, regra, msg, conserto) =>
  achados.push({ arquivo: arq, linha, severidade: sev, veredito, regra, msg, conserto })

for (const f of arquivos) {
  const rel = relative(alvo, f) || f
  const linhas = readFileSync(f, 'utf8').split('\n')
  // estado por tabela: colunas vistas, para o cruzamento de índice x PII
  let tabela = null
  const colunas = new Map()          // nome -> {linha, tipo, pii}
  const indices = []                 // {linha, tabela, cols, unique}

  linhas.forEach((bruta, i) => {
    const n = i + 1
    const l = bruta.replace(/--.*$/, '')
    const mTab = /create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([\w.]+)["`]?/i.exec(l)
    if (mTab) tabela = mTab[1]

    // ---- coluna
    const mCol = /^\s*["`]?(\w+)["`]?\s+(serial|bigserial|smallserial|uuid|text|varchar\([^)]*\)|char\([^)]*\)|citext|int|integer|bigint|smallint|numeric\([^)]*\)|decimal\([^)]*\)|real|double\s+precision|float\d*|money|bool(?:ean)?|date|time(?:stamp)?(?:tz)?(?:\s+with(?:out)?\s+time\s+zone)?|jsonb?|bytea)\b/i.exec(l)
    if (mCol && tabela) {
      const [, nome, tipo] = mCol
      const ehPII = PII.test(nome)
      colunas.set(nome.toLowerCase(), { linha: n, tipo: tipo.toLowerCase(), pii: ehPII })

      // dinheiro em ponto flutuante
      if (/(valor|preco|price|total|amount|saldo|custo|salario)/i.test(nome) && /(real|double|float)/i.test(tipo)) {
        add(rel, n, 0, 'viola', 'dinheiro-em-float',
          `\`${tabela}.${nome}\` é dinheiro em ponto flutuante (\`${tipo}\`) — 0,1 + 0,2 não dá 0,3 em binário, e o erro ACUMULA em soma`,
          'use `numeric(12,2)` (ou inteiro de centavos)')
      }
      // timestamp sem timezone
      if (/^timestamp(\s+without\s+time\s+zone)?$/i.test(tipo.trim())) {
        add(rel, n, 1, 'viola', 'timestamp-sem-tz',
          `\`${tabela}.${nome}\` é \`timestamp\` sem timezone — o valor passa a depender do fuso de quem escreveu`,
          'use `timestamptz` e guarde em UTC')
      }
      // id sequencial exposto
      if (/^(serial|bigserial|smallserial)$/i.test(tipo) && /(^id$|_id$)/i.test(nome)) {
        add(rel, n, 1, 'viola', 'id-sequencial',
          `\`${tabela}.${nome}\` é sequencial — id previsível exposto conta quantos clientes você tem e convida enumeração`,
          'PK surrogate ULID/UUIDv7')
      }
      // PII com UNIQUE direto na coluna em claro
      if (ehPII && /\bunique\b/i.test(l) && !/hash|normaliz/i.test(nome)) {
        add(rel, n, 0, 'viola', 'unique-em-pii-clara',
          `\`${tabela}.${nome}\` é PII com \`UNIQUE\` **na coluna em claro** — o índice é o que transforma um dump em lista ordenada de PII`,
          'mantenha a coluna em claro SEM índice e ponha o `UNIQUE` numa coluna derivada (normalizada ou HMAC)')
      }
      // nullable sem razão em coluna que parece obrigatória
      if (/(^id$|_id$|created_at|updated_at)/i.test(nome) && !/not\s+null/i.test(l) && !/primary\s+key/i.test(l)) {
        add(rel, n, 2, 'parcial', 'nullable-suspeito',
          `\`${tabela}.${nome}\` sem \`NOT NULL\` — em coluna de identidade/tempo, nulo quase nunca é um estado real`,
          'decida coluna a coluna; `NOT NULL` é o default mental')
      }
    }

    // ---- FK sem ON DELETE
    if (/references\s+[\w."]+/i.test(l) && !/on\s+delete/i.test(l)) {
      add(rel, n, 1, 'parcial', 'fk-sem-on-delete',
        'FK sem `ON DELETE` explícito — o default (`NO ACTION`) vira erro em produção quando alguém apaga o pai',
        'escolha `CASCADE`/`RESTRICT`/`SET NULL` de propósito')
    }

    // ---- índice
    const mIdx = /create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?["`]?[\w.]*["`]?\s+on\s+["`]?([\w.]+)["`]?\s*\(([^)]*)\)/i.exec(l)
    if (mIdx) {
      const cols = mIdx[3].split(',').map(c => c.trim().replace(/["`]/g, '').split(/\s+/)[0].toLowerCase())
      indices.push({ linha: n, tabela: mIdx[2], cols, unique: !!mIdx[1] })
      for (const c of cols) {
        const info = colunas.get(c)
        if (info?.pii && !/hash|normaliz/i.test(c)) {
          add(rel, n, 0, 'viola', 'indice-em-pii-clara',
            `índice sobre \`${mIdx[2]}.${c}\`, que é PII em claro — índice de PII é vazamento por desenho (um dump do índice já é a lista)`,
            'indexe a coluna derivada (HMAC/normalizada); o e-mail em claro fica sem índice')
        }
      }
    }

    // ---- migração destrutiva sem expand/contract
    if (/alter\s+table\s+[\w."]+\s+drop\s+column/i.test(l)) {
      add(rel, n, 1, 'parcial', 'drop-column-direto',
        '`DROP COLUMN` direto — sem expand→migrate→contract, o deploy antigo em execução quebra no meio',
        'expand (nova coluna) → migrate (backfill + dual-write na MESMA transação) → contract')
    }
    if (/alter\s+table\s+[\w."]+\s+rename\s+column/i.test(l)) {
      add(rel, n, 0, 'viola', 'rename-column',
        '`RENAME COLUMN` — quebra TODO código que ainda usa o nome antigo, e não há como coexistir',
        'adicione a nova + backfill + dual-write + corte a velha depois')
    }
    if (/alter\s+table\s+[\w."]+\s+add\s+column\s+[\w"]+\s+[\w()]+\s+not\s+null(?!\s+default)/i.test(l)) {
      add(rel, n, 0, 'viola', 'not-null-sem-default',
        '`ADD COLUMN ... NOT NULL` sem `DEFAULT` — falha se a tabela tem linha, e trava a tabela enquanto reescreve',
        'adicione nullable → backfill em janelas → `SET NOT NULL` depois')
    }
    if (/create\s+index(?!\s+concurrently)/i.test(l) && !/create\s+index\s+concurrently/i.test(l)) {
      add(rel, n, 2, 'parcial', 'index-sem-concurrently',
        '`CREATE INDEX` sem `CONCURRENTLY` — em tabela grande isto **trava escrita** durante a criação',
        'use `CONCURRENTLY` (fora de transação) quando a tabela já tem volume')
    }
  })

  // FK sem índice: heurística — coluna `_id` referenciada e nenhum índice começando por ela
  for (const [nome, info] of colunas) {
    if (!/_id$/.test(nome)) continue
    const temIdx = indices.some(ix => ix.cols[0] === nome)
    if (!temIdx) {
      add(rel, info.linha, 2, 'parcial', 'fk-sem-indice',
        `\`${nome}\` parece FK e não tem índice próprio — o \`JOIN\` e o \`ON DELETE\` varrem a tabela inteira`,
        'crie índice na coluna de FK (o Postgres NÃO cria sozinho)')
    }
  }
}

// ---- par up/down (piso 8): migration NNN_nome[.up].sql exige NNN_nome.down.sql
// (ou `-- pg-irreversivel: ADR-<n> <motivo>` no up: passo irreversível com ADR explícito).
const ehDown = b => /(\.down\.sql|_down\.sql|\.rollback\.sql|_rollback\.sql)$/i.test(b)
const todos = new Set(arquivos)
for (const f of arquivos) {
  const b = f.split(/[\\/]/).pop()
  if (ehDown(b) || !/^\d+_.+\.sql$/.test(b)) continue
  const dir = f.slice(0, f.length - b.length)
  const base = b.replace(/\.sql$/i, '').replace(/\.up$/i, '')
  const pares = [`${dir}${base}.down.sql`, `${dir}${base}_down.sql`, `${dir}${base}.rollback.sql`, `${dir}down/${b}`, `${dir}down/${base}.sql`]
  if (pares.some(p => todos.has(p))) continue
  const txt = readFileSync(f, 'utf8')
  if (/^\s*--\s*pg-irreversivel:\s*ADR-?[\w-]+\s+\S/im.test(txt)) continue
  add(relative(alvo, f) || f, 1, 1, 'viola', 'migration-sem-down',
    `\`${b}\` não tem par \`${base}.down.sql\` — migration só com up é vetada; o contract destrutivo tem como down o restore de backup testado, ou ADR de passo irreversível`,
    `crie \`${base}.down.sql\` (contract com DROP: \`-- pg-restore: <backup verificado>\`) ou \`-- pg-irreversivel: ADR-<n> <motivo>\``)
}

achados.sort((a, b) => a.severidade - b.severidade || a.arquivo.localeCompare(b.arquivo) || a.linha - b.linha)
const bloqueantes = achados.filter(a => a.severidade <= 1)

if (comoJson) {
  console.log(JSON.stringify({ veredito: bloqueantes.length ? 'reprovado' : 'aprovado', arquivos: arquivos.length, achados }, null, 2))
} else {
  const rotulo = { 0: 'P0 (PII/segurança/integridade)', 1: 'P1 (correção/migração)', 2: 'P2 (performance/estilo)' }
  for (const a of achados) {
    console.log(`${a.arquivo}:${a.linha} — [${rotulo[a.severidade]}] ${a.veredito.toUpperCase()} · ${a.regra}`)
    console.log(`    ${a.msg}`)
    console.log(`    → ${a.conserto}`)
  }
  console.log(`\n${bloqueantes.length ? '✖' : '✔'} ${arquivos.length} arquivo(s) .sql · ${achados.length} achado(s), ${bloqueantes.length} bloqueante(s).`)
  console.log('  (análise TEXTUAL do DDL: onde houver banco, `EXPLAIN` e `pg_stat_*` mandam.)')
}
process.exit(bloqueantes.length ? 1 : 0)
