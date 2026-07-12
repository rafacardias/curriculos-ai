---
name: fila
description: Mostra a fila ranqueada de vagas com breakdown de score e ação recomendada pelo policy engine, e conduz triagem interativa (aprovar/rejeitar/pular). Use quando o usuário pedir /fila, "o que chegou", "triagem".
---

# /fila [n]

1. Rode `npx tsx src/cli/queue.ts --limit <n|20>`.
2. Apresente cada vaga: score (com breakdown), empresa, trilha sugerida, plataforma ATS e a **ação recomendada pelo policy engine** (ex.: "gerar + review_first", "ignorar: score < 60").
3. Conduza a triagem interativa, vaga a vaga (ou em lote se o usuário preferir):
   - **aprovar** → `npx tsx src/cli/feedback.ts <job_id> aprovar` e ofereça gerar o kit na sequência (`/gerar <job_id>`)
   - **rejeitar** → pergunte o motivo (curto) e rode `npx tsx src/cli/feedback.ts <job_id> rejeitar "<motivo>"`
   - **pular** → nada
4. Ao final, resuma: N aprovadas (kits a gerar), N rejeitadas, N puladas.
