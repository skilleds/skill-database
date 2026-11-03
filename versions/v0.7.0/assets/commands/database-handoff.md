---
description: Gera o handoff de contexto (context.md + checklist.md) no archive, SEM compactar
---

Gere o handoff da modelagem **sem** compactar — pra fim de sessão ou troca de tarefa:

1. `<projeto>_archive/context/<YYYY-MM-DD-HH-MM-SS>-context.md` — o **modelo decidido** (entidades,
   relações com cardinalidade, chaves surrogate + naturais, colunas PII), tabelas com `CREATE`/
   migration emitida vs pendentes, decisões de tipo/constraint/índice e desnormalizações
   registradas, onde parou.
2. `<projeto>_archive/context/<YYYY-MM-DD-HH-MM-SS>-checklist.md` — **FEITO vs EM ABERTO** (tabelas/
   relações/índices/migrations modeladas vs pendentes; achados de review por sanar).

Não rode `/compact` — só arquiva.
