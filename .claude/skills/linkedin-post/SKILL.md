---
name: linkedin-post
description: Gera um rascunho de post do LinkedIn (posicionamento vibecoding/IA) fundamentado só em fatos reais, e opcionalmente o salva como rascunho/agenda no LinkedIn via claude-in-chrome. Use quando o usuário pedir /linkedin-post, "escreve um post pro LinkedIn", "publica isso no LinkedIn".
---

# /linkedin-post [tema|trilha]

Duas ações independentes: **gerar** (sempre) e **publicar** (só quando pedido explicitamente).

## Gerar

1. Leia `profile/master-profile.yaml` e `profile/tracks.yaml`. Trilha padrão quando não
   especificada: `ai-builder` (posicionamento vibecoding/IA — é a trilha das vagas que o Rafael
   está aplicando agora).
2. Redija o post em PT-BR, curto (150–300 palavras), fundamentado nos fatos da trilha. Ideias
   de tema, quando não vier um: kits gerados recentemente em `output/*/bundle.json` (que vaga,
   que problema técnico resolveu), ou a própria construção deste sistema de automação de busca
   de vagas — conteúdo autêntico sobre o processo.
3. **Regra nº 1 (veracidade) vale aqui**: toda afirmação de fato termina com `[exp:<fact_id>]`
   citando um fato real do perfil mestre (mesma sintaxe do currículo — ver `/gerar`). Post é
   prosa, não bullet — não precisa citar TODA frase, só as que alegam um fato/conquista.
4. Salve em `profile/linkedin-posts/<YYYY-MM-DD>-<slug>.md` com frontmatter:
   ```
   ---
   status: draft
   track: ai-builder
   created_at: <ISO-8601>
   ---
   ```
5. Rode `npx tsx src/cli/linkedin-post.ts validate <arquivo>` — falha (exit 2) se alguma
   citação não existir no perfil mestre. Corrija a citação e rode de novo; NUNCA remova a
   citação só para passar.
6. Apresente o rascunho ao usuário e pergunte se quer publicar agora ou deixar para depois.

## Publicar (`/linkedin-post publicar <arquivo>`)

**Pré-requisito**: extensão `claude-in-chrome` conectada e o Chrome do usuário já logado no
LinkedIn (sessão real dele — nunca um browser/perfil separado).

1. Rode `validate` de novo antes de publicar (o arquivo pode ter sido editado à mão).
2. Via `claude-in-chrome`, navegue até `linkedin.com`, abra o compositor de post ("Começar
   publicação"), cole o texto do arquivo (sem as tags `[exp:...]` — remova-as antes de colar,
   elas são metadado interno, não fazem parte do post).
3. Clique em **Salvar rascunho** (padrão) ou **Agendar** (só se o usuário pediu uma data/hora
   específica nesta conversa).
4. **REGRA DURA — nunca violável**: você NUNCA clica em "Publicar" ou qualquer botão que torne o
   post público imediatamente. Se não encontrar o botão "Salvar rascunho"/"Agendar" na UI, pare e
   avise o usuário — não improvise clicando em outro botão.
5. Depois de confirmar visualmente (via `read_page`/screenshot) que o rascunho/agendamento foi
   salvo, atualize o frontmatter do arquivo: `status: saved_as_draft_on_linkedin` ou
   `status: scheduled` (+ `scheduled_for: <quando>` se agendado).
6. Avise o usuário onde encontrar o rascunho no LinkedIn (`linkedin.com/post-drafts` ou
   equivalente) para revisão e publicação final por ele.

## Fora de escopo desta skill

Sem varredura de feed, sem múltiplos posts em sequência sem pedido explícito por post, sem
scheduling recorrente/automático. Cada `/linkedin-post publicar` é uma ação única e visível.
