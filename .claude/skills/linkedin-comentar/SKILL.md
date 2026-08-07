---
name: linkedin-comentar
description: Redige e pré-preenche um comentário fundamentado em fatos reais para um post específico do LinkedIn (via URL) — nunca envia sozinho. Use quando o usuário pedir /linkedin-comentar <url>, "comenta nesse post".
---

# /linkedin-comentar <post_url>

Sempre um post por vez, sempre por URL explícita fornecida pelo usuário nesta conversa. **Nunca**
navegue o feed procurando posts para comentar sozinho — essa skill não faz descoberta.

**Pré-requisito**: extensão `claude-in-chrome` conectada e o Chrome do usuário já logado no
LinkedIn (sessão real dele).

1. Via `claude-in-chrome`, navegue até `<post_url>` e leia o conteúdo do post
   (`read_page`/`get_page_text`).
2. Leia `profile/master-profile.yaml` para ter os fatos reais à mão.
3. Redija um comentário curto (2–4 frases), específico ao conteúdo do post — nada genérico tipo
   "Ótimo post!". Se o comentário alegar um fato/experiência própria, funde-o num fato real do
   perfil mestre (mesma Regra nº 1 do resto do sistema); não precisa citação `[exp:id]` visível no
   comentário publicado (não é um artefato do sistema, é texto solto), mas o fato por trás tem
   que existir de verdade — confira mentalmente contra o perfil antes de escrever.
4. Via `claude-in-chrome`, pré-preencha a caixa de comentário do post com o texto redigido.
5. **REGRA DURA — nunca violável**: pare aqui. Não clique em "Comentar"/"Enviar"/"Post". LinkedIn
   não tem "salvar rascunho" de comentário — a única ação segura é deixar o texto pronto na caixa
   e esperar o usuário revisar e clicar ele mesmo.
6. Avise o usuário que o comentário está pré-preenchido e pronto para revisão/envio manual.
