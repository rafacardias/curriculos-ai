---
name: agendar
description: Liga/desliga a busca automática diária de vagas (launchd) e mostra o status do agendamento. Use quando o usuário pedir /agendar, "busca automática", "rodar sozinho todo dia".
---

# /agendar on|off|status

1. Rode `npx tsx src/cli/schedule.ts <on|off|status>`.
2. **on**: instala o LaunchAgent (diário, hora do `auto_search_hour` no config) e liga o flag. Lembre o usuário: o Mac precisa estar ligado no horário; o modo automático roda só os scripts (busca+score+fila+painel) — a geração de kits continua sendo pelo `/gerar`.
3. **off**: remove o agent e desliga o flag (dupla segurança).
4. **status**: mostre flag, plist, estado no launchd e idade da última busca; > 26h com flag on = investigar `logs/autosearch.err.log`.
5. Para mudar o horário: editar `auto_search_hour` no config e rodar `on` de novo.
