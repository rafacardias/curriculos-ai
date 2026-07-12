---
name: submeter
description: Submete kits prontos via automação de browser (Greenhouse/Lever) no modo de autonomia configurado — review_first preenche e para antes do enviar; approve_batch/full_auto submetem com pausa em pergunta desconhecida. Use quando o usuário pedir /submeter ou quiser aplicar nos kits gerados.
---

# /submeter [job_id | lote]

1. **Um job**: `npx tsx src/cli/submit.ts <job_id>` (modo vem do policy engine/config; `--mode review_first|approve_batch|full_auto` para override).
2. **Lote**: confirme com o usuário a lista de kits `kit_ready` que serão submetidos, então `npx tsx src/cli/submit.ts --batch`.
3. **Pausadas**: `npx tsx src/cli/submit.ts --pending` — para cada pergunta desconhecida, resolva via /respostas e rode a submissão de novo.

## Comportamento por modo

- **review_first** (default): abre o Chrome visível, preenche tudo que conhece (identidade → candidate_facts → answer_bank → cover letter → upload do resume.pdf) e PARA — o usuário revisa e clica enviar. Campos desconhecidos ficam em branco listados no terminal.
- **approve_batch / full_auto**: clica enviar e salva screenshot de confirmação em `output/<slug>/receipt/`. Pergunta obrigatória sem resposta conhecida → pausa (`awaiting_user`), NUNCA chuta.

## Regras

- A submissão marca `applied` e atualiza a company memory automaticamente (modos com submit).
- Vaga sem adapter (ats_platform ≠ greenhouse/lever por enquanto): oriente aplicar manualmente — o `/aplicar <job_id>` abre a URL e registra.
- Se o preenchimento falhar em um site (formulário mudou), registre a falha e sugira aplicar manualmente — falha de adapter é esperada ocasionalmente, não é bug do usuário.
