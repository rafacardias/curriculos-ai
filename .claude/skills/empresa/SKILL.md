---
name: empresa
description: Company memory — histórico de aplicações, taxa de resposta, notas de tom e respostas reutilizáveis por empresa. Use quando o usuário pedir /empresa <nome> ou perguntar sobre histórico com uma empresa.
---

# /empresa <nome> | top | note

- **show**: `npx tsx src/cli/company.ts show "<nome>"` — histórico completo + respostas específicas da empresa.
- **top**: `npx tsx src/cli/company.ts top` — empresas com melhor taxa de resposta (o policy engine dá boost a elas na fila).
- **note**: `npx tsx src/cli/company.ts note "<nome>" "<nota>"` — registre insights reutilizáveis (tom de outreach que funcionou, nome de recrutador, feedback recebido).
