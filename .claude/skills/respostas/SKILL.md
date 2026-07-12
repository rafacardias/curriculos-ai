---
name: respostas
description: Gerencia o answer bank — respostas reutilizáveis de perguntas de triagem, e pendências de submissões pausadas. Use quando o usuário pedir /respostas, ou houver submissões awaiting_user.
---

# /respostas [list|pending|add]

- **list**: `npx tsx src/cli/answers.ts list` — mostra o banco atual.
- **pending**: `npx tsx src/cli/answers.ts pending` — submissões pausadas em pergunta desconhecida. Para cada uma: proponha um rascunho de resposta (baseado no perfil mestre e candidate_facts — nunca invente dados factuais), confirme com o usuário, salve com `answers add` e avise que a submissão pode ser retomada via /submeter.
- **add**: `npx tsx src/cli/answers.ts add "<pergunta>" "<resposta>" [--lang pt|en] [--track id] [--company "nome"]`.

Regra: respostas factuais (salário, disponibilidade, autorização de trabalho) só entram com confirmação explícita do usuário; são candidate_facts, não texto livre — sugira atualizar `profile/candidate-facts.yaml` + `ingest-profile.ts sync` quando for o caso.
