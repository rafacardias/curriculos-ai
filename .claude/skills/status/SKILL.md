---
name: status
description: Digest de um comando — fila, kits prontos, submissões pausadas, follow-ups pendentes e saúde da última busca. Use quando o usuário pedir /status, "como estamos", "resumo".
---

# /status

1. Rode `npx tsx src/cli/queue.ts --digest`.
2. Apresente o digest e destaque o que exige ação:
   - submissões pausadas (`awaiting_user`) → resolver via `/respostas`
   - follow-ups > 7 dias sem resposta → sugerir mensagem de follow-up (o outreach.md do kit tem o rascunho d+7)
   - última busca > 26h com auto_search on → launchd pode ter morrido, checar `/agendar status`
   - fontes com erro → adapter possivelmente quebrado
