---
description: Context Compact — gera handoff (context.md + checklist.md) no <projeto>_archive e compacta
---

Antes de compactar, **arquive o handoff** (não perca o estado da modelagem):

1. `<projeto>_archive/context/<YYYY-MM-DD-HH-MM-SS>-context.md` — estado: o **modelo decidido**
   (entidades, relações com cardinalidade, chaves surrogate + naturais, colunas PII), quais tabelas
   já têm `CREATE`/migration emitida vs pendentes, decisões de tipo/constraint/índice e
   desnormalizações registradas, onde parou.
2. `<projeto>_archive/context/<YYYY-MM-DD-HH-MM-SS>-checklist.md` — **FEITO vs EM ABERTO** (as
   tabelas/relações/índices/migrations modeladas vs pendentes; os achados de review por sanar).
3. Só então rode `/compact` (foco na tarefa corrente).
