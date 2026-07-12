---
name: buscar
description: Busca vagas em todas as fontes configuradas (Remotive, RemoteOK, WWR, Gupy), deduplica, pontua e enfileira. Use quando o usuário pedir /buscar, "procure vagas", "rode a busca".
---

# /buscar [query]

1. Com argumento: `npx tsx src/cli/search.ts --query "<query>"`. Sem argumento: `npx tsx src/cli/search.ts` (usa as buscas do `config/config.yaml`; se nenhuma estiver configurada, pergunte ao usuário quais queries quer e grave em `searches[]`).
2. Apresente o resumo: vagas novas por fonte, quantas entraram na fila, top 10 por score com a ação recomendada pelo policy engine.
3. **Saúde das fontes**: se alguma fonte reportou erro (⚠), destaque — adapter quebrado é sinal de mudança na API externa, não falha do usuário.
4. Se o perfil ainda não foi ingerido (trilhas vazias), avise que os scores estão em modo degradado e sugira `/perfil ingest`.
5. Sugira o próximo passo: `/fila` para triagem.
