---
name: linkedin-auditoria
description: Aciona o subagente linkedin-profile-auditor para comparar o perfil LinkedIn ao vivo do Rafael com profile/master-profile.yaml e as tracks-alvo, e apontar lacunas ou alegações não lastreadas. Use quando o usuário pedir /linkedin-auditoria, "audita meu perfil do LinkedIn", "meu perfil tá bom?".
---

# /linkedin-auditoria

1. **Pré-requisito**: extensão `claude-in-chrome` conectada e o Chrome do usuário logado no
   LinkedIn (o subagente só lê a página renderizada; não há adapter de scraping de perfil
   próprio no sistema — só `linkedin-guest.ts`, que é busca de vagas).
2. Acione o subagente `linkedin-profile-auditor` (via Agent tool) sem parâmetros adicionais — ele
   já sabe ler `profile/master-profile.yaml` e `profile/tracks.yaml` sozinho.
3. Quando o relatório em `profile/linkedin-audit-<data>.md` estiver pronto, apresente ao usuário
   um resumo: lacunas de keyword, headline/about fracos, e — com destaque — qualquer alegação já
   publicada no LinkedIn que não bata com os fatos reais do perfil mestre.
4. Se houver recomendações de headline/about, ofereça rodar `/linkedin` para gerar a versão
   atualizada do `linkedin-pack.md` incorporando os achados desta auditoria.
5. Lembre o usuário: a auditoria só lê e relata — qualquer mudança no LinkedIn continua sendo
   cópia manual dele.
