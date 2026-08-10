# HANDOFF — contexto para outra IA

> Documento vivo, para colar no início de uma conversa com outra IA (ou outra sessão) e
> transferir o estado do projeto sem reler o repo inteiro. **Curto de propósito**: o histórico
> completo mora em `KNOWN-BUGS.md` (achados/bugs medidos), `docs/roadmap.md` (backlog priorizado)
> e no log do git — este arquivo só aponta pra lá, não repete.
>
> Mantido por quem trabalha no repo (humano ou IA) ao fim de toda sessão com mudança material.
> Ver a regra em `CLAUDE.md` → "Handoff entre sessões/IAs".
>
> **Teto: ~100 linhas.** Isto é um resumo, não um changelog — se crescer, corte primeiro "O que
> mudou nas últimas sessões" para as 2-3 mais recentes (o resto já está no `git log` e em
> `KNOWN-BUGS.md`) antes de encurtar qualquer outra seção. Pointer para outro arquivo, nunca
> conteúdo copiado dele.

## O projeto, em 3 frases

Sistema local (não SaaS) que busca vagas, gera kits de candidatura ATS-otimizados e rastreia o
funil do Rafael. Regra inegociável: todo bullet gerado cita `[exp:fact_id]` de
`profile/master-profile.yaml` e `kit.ts finalize` falha o build em citação inexistente — nunca
inventa fato, só descobre keyword sem lastro. `src/core|adapters|submit` nunca importam de
`src/cli` — é o pacote portável para o futuro SaaS.

## Estado agora (atualizado em 2026-08-09)

- **`main`**: BUG-010 completo (`ORDER BY` determinístico + desempate por especificidade, duas
  branches/commits separados de propósito), junto com company-watch Fase A e queue-improvements
  de sessões anteriores.
- **Suíte**: 397/397 testes verdes, typecheck limpo.
- **Perfil real**: ingerido (`profile/master-profile.yaml` existe, `/perfil` já rodou).

## O que mudou nas últimas sessões (mais recente primeiro)

1. **BUG-010 completo** — `scoreJob` desempatava trilha por ordem não-garantida do SQLite (9,8%
   das vagas reais mudavam de `track_hint` invertendo `ORDER BY`). Fix em duas etapas: `ORDER BY
   id ASC` (reprodutível) + desempate por especificidade (keyword exclusiva e mais longa pesa
   mais — resolve `SCRUM MASTER` → `product` sem depender de alfabeto). `ACHADO-13`: 44%→19%→
   **18% (11/60)**; das 7 vagas que mudaram, 4 correções genuínas, 2 ambíguas, 1 falso-positivo
   novo (`ACHADO-14`: termo longo mas genérico de boilerplate vence por comprimento, não por
   sinal). Detalhe: `KNOWN-BUGS.md` → BUG-010 / ACHADO-14.
2. **Vigilância por empresa (Fase A)** — `config/companies.yaml` + scrape do board Gupy
   (`__NEXT_DATA__`, não API JSON) + dedup por `(source, source_job_id)`. Filtro léxico
   pré-insert mede 0,3% de recall — decisão de "filtrar ou inserir tudo" ainda aberta.
3. **queue-improvements** — filtro de localização dupla, dropdown de trilha salva, confirmação
   obrigatória para gerar kit de vaga com score abaixo do corte.
4. **Harness in-process de HTTP** fechou um buraco de cobertura (nenhum teste antes booteava o
   dispatcher HTTP real).

## Próximos passos

1. ~~BUG-010 (ordem + especificidade)~~ ✅ feito.
2. **`answers.ts:45`** — candidato mais forte a próximo bug: sem `ORDER BY` **e** sem `UNIQUE` na
   tupla de dedup do answer bank. `feedback.ts:39` é a mesma classe, mas dormente (componente
   `preference` desarmado) — prioridade menor. Detalhe: `KNOWN-BUGS.md` → BUG-010 → "Varredura".
3. Expandir `config/companies.yaml` (mais empresas GPTW/BH) e decidir
   filtrar-no-pré-insert vs. inserir-tudo — reaberto pelo BUG-010.
4. **Fase B (Greenhouse) bloqueada até 2–3 fecharem.**

Backlog mais antigo, não reordenado por isto: `docs/roadmap.md` (BUG-007 é o maior bloqueador de
lá — componente de preferência desarmado, 98 chaves aprendidas preservadas para reprocessamento).

## Onde olhar para mais detalhe

| Pergunta | Arquivo |
|---|---|
| Que bugs/achados foram medidos, com evidência? | `KNOWN-BUGS.md` |
| Backlog priorizado (dor ÷ risco)? | `docs/roadmap.md` |
| Custo/via de geração de kit (cli vs agentic)? | `docs/custo-geracao.md` |
| Como operar o sistema, comandos, convenções? | `CLAUDE.md` |
| Decisões arquiteturais com o porquê? | `git log`, mensagens de commit são a fonte primária |
