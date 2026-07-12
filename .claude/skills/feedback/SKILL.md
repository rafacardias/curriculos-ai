---
name: feedback
description: Registra aprovação/rejeição de uma vaga para calibrar o score das próximas buscas (preference learning). Use quando o usuário pedir /feedback, "essa vaga não me interessa", "mais vagas como essa".
---

# /feedback <job_id> aprovar|rejeitar [motivo]

1. Rode `npx tsx src/cli/feedback.ts <job_id> <aprovar|rejeitar> ["motivo"]`.
2. Explique o efeito: quais chaves de preferência foram ajustadas (keywords, empresa, fonte, senioridade) — rejeições rebaixam vagas similares nas próximas buscas, aprovações as impulsionam.
3. Os pesos têm cap (±10) e decaem a cada busca — feedback antigo perde força sozinho.
