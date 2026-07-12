---
name: painel
description: Regenera e abre o dashboard — funil de candidaturas e performance warehouse (taxas por fonte, trilha, modo de submissão, cobertura). Use quando o usuário pedir /painel, "como está o funil", "o que está convertendo".
---

# /painel

1. Rode `npx tsx src/cli/dashboard.ts --open`.
2. Além de abrir o HTML, leia os números e destaque em texto: onde está o gargalo do funil, qual segmento (fonte/trilha/modo) converte melhor, e uma recomendação acionável (ex.: "Gupy+ops converte 3× mais — priorize essas buscas").
3. Honestidade estatística: com n pequeno (< min_n_to_compare do config), apresente diferenças como "sinal direcional (n=X)", nunca como conclusão.
