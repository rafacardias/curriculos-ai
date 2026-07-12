---
name: aplicar
description: Marca uma vaga como aplicada ou atualiza o status no funil (screening, interview, offer, rejected). Use quando o usuário pedir /aplicar, "apliquei nessa", "me chamaram pra entrevista", "fui rejeitado".
---

# /aplicar <job_id> [status] ["nota"]

1. Sem status explícito, assuma `applied`. Rode `npx tsx src/cli/track-status.ts <job_id> <status> ["nota"]`.
2. `applied` abre a URL da vaga no browser (para o usuário submeter/conferir) e atualiza a company memory; `screening`/`interview` também contam como resposta da empresa.
3. Se o usuário mencionar contexto (nome do recrutador, feedback recebido), registre como nota e sugira `/empresa note` quando for insight reutilizável sobre a empresa.
4. Status terminais (offer/rejected): pergunte se quer registrar aprendizado no feedback (`/feedback`).
