---
name: linkedin
description: LinkedIn pack — otimiza headline, about e skills do perfil por trilha-alvo e gera sequências de outreach para recrutadores. Use quando o usuário pedir /linkedin, "otimizar meu perfil", "mensagem pra recrutador".
---

# /linkedin [trilha]

1. Leia `profile/master-profile.yaml` e `profile/tracks.yaml`. Se vazios, pare e sugira `/perfil ingest`.
2. Gere `profile/linkedin-pack.md` com, **por trilha** (ou só a pedida):
   - **Headline** (≤220 chars): cargo-alvo + 2-3 keywords do léxico da trilha + prova (métrica real de um fato).
   - **About** (≤2000 chars): narrativa em 1ª pessoa costurando os fatos mais fortes da trilha, com as keywords que recrutadores buscam. PT e EN.
   - **Skills a fixar** (top 5 por trilha, grafadas como o mercado busca).
   - **Sequência de outreach**: conexão sem nota vs. com nota (≤300 chars), DM pós-aceite (≤80 palavras), follow-up d+7. Placeholders `{empresa}` `{vaga}` `{gancho}`.
3. Regra de veracidade vale aqui também: só fatos do perfil mestre; métricas apenas as reais.
4. Apresente um resumo e as diferenças de posicionamento entre trilhas — o usuário escolhe qual aplicar no perfil (a atualização no LinkedIn é manual, copy-paste; não automatizamos edição de perfil logado).
