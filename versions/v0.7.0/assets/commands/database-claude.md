---
description: schematize-database — cria ou mescla o CLAUDE.md sempre-on de modelagem de banco na raiz do repo (não sobrescreve blocos de outras skills)
---

Instale/atualize a regra **sempre-on** de modelagem de banco de dados na raiz do repositório.

1. Pegue `assets/CLAUDE.md` da skill `schematize-database` (projeto ou `~/.claude/skills/...`).
2. Se **não existe** `CLAUDE.md` na raiz: crie com esse conteúdo.
3. Se **já existe** (de outra skill — engineering/data/go/rust/web/...): **mescle** — adicione a
   seção de Modelagem de Banco **sem sobrescrever** os blocos das outras skills. Em repo
   multi-skill, cada CLAUDE convive; o piso de modelagem é aditivo (e complementa o de `data` e o
   da linguagem, sem colidir).
4. Se houver customização local, salve `./CLAUDE.md.bak` e reaplique por cima.
5. Confirme a versão aplicada e destaque o **piso**: PK surrogate + natural `UNIQUE`
   (identidade≠email); 3FN por padrão; tipo é a 1ª constraint (dinheiro sem `float`, tempo UTC);
   integridade no banco (FK/`CHECK`/`NOT NULL`/`UNIQUE`); índice é custo (PII fora do índice/URL);
   migration expand-contract reversível; PII marcada com base legal + retenção. Fronteira: dados →
   `schematize-data`; implementação → skill de linguagem.
