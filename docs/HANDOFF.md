# HANDOFF — contexto para outra IA

> Documento vivo, para colar no início de uma conversa com outra IA (ou outra sessão) e
> transferir o estado do projeto sem reler o repo inteiro. **Curto de propósito**: o histórico
> completo mora em `KNOWN-BUGS.md` (achados/bugs medidos), `docs/roadmap.md` (backlog priorizado)
> e no log do git — este arquivo só aponta pra lá, não repete.
>
> Mantido por quem trabalha no repo (humano ou IA) ao fim de toda sessão com mudança material.
> Ver a regra em `CLAUDE.md` → "Handoff entre sessões/IAs".

## O projeto, em 3 frases

Sistema local (não SaaS) que busca vagas, gera kits de candidatura ATS-otimizados e rastreia o
funil do Rafael. Regra inegociável: todo bullet gerado cita `[exp:fact_id]` de
`profile/master-profile.yaml` e `kit.ts finalize` falha o build em citação inexistente — nunca
inventa fato, só descobre keyword sem lastro. `src/core|adapters|submit` nunca importam de
`src/cli` — é o pacote portável para o futuro SaaS.

## Estado agora (atualizado em 2026-08-09)

- **`main`**: `f1e9d7b` — company-watch Fase A (vigilância de vagas por empresa via scrape Gupy)
  e queue-improvements (filtro dual-location, dropdown de trilha, confirmação de score baixo)
  mesclados e pushados.
- **Branch aberta, não mesclada**: `fix/track-hint-order-bug-010` — corrige BUG-010 (`ORDER BY`
  ausente em `scoreJob`), commit `ec23192`. Aguardando decisão de merge.
- **Suíte**: 393/393 testes verdes, typecheck limpo, nessa branch.
- **Perfil real**: ingerido (`profile/master-profile.yaml` existe, `/perfil` já rodou).

## O que mudou nas últimas sessões (mais recente primeiro)

1. **BUG-010 corrigido** — `scoreJob` (`src/core/scoring.ts`) desempatava trilha por ordem
   não-especificada do SQLite (medido: 9,8% das vagas do banco real mudavam de `track_hint` só
   invertendo `ORDER BY`). Fix: `ORDER BY id ASC` — reprodutível, não semanticamente correto
   (desempate por especificidade de keyword fica para depois). `ACHADO-13` (sobre-captura de
   `qa`) recontado sobre base determinística: **19% (11/57)**, não os 44% da primeira medição —
   número confirmado reproduzível.
2. **Vigilância por empresa (Fase A)** — `config/companies.yaml` + scrape do board Gupy
   (`__NEXT_DATA__`, não API JSON — Gupy não tem API por empresa) + dedup por
   `(source, source_job_id)`. `docs/custo-geracao.md` tem a medição completa (100% captura de
   modalidade, 0,3% de recall do filtro léxico pré-insert — decisão de "filtrar ou inserir tudo"
   ainda aberta, ver Próximos passos).
3. **queue-improvements** — filtro de localização dupla, dropdown de trilha salva na busca da
   fila, confirmação obrigatória para gerar kit de vaga com score abaixo do corte.
4. **Harness in-process de HTTP** (`createApp()` em `src/server/index.ts`) fechou um buraco de
   cobertura: nenhum teste antes booteava o dispatcher HTTP real.

## Próximos passos (ordem travada pelo operador)

1. ~~BUG-010~~ ✅ feito nesta sessão.
2. Desempate por especificidade de trilha (keyword exclusiva pesa mais que compartilhada) —
   resolve a *classe* do problema que o `ORDER BY` só tornou reprodutível.
3. ~~Recontar ACHADO-13~~ ✅ feito, 19%/57 confirmado.
4. Expandir `config/companies.yaml` (mais empresas GPTW/BH, ATS verificado um a um) e decidir
   filtrar-no-pré-insert vs. inserir-tudo-e-deixar-o-score-decidir — reaberta pelo BUG-010 (um
   classificador com desempate instável piora com mais volume, não melhora).
5. **Fase B (Greenhouse) bloqueada até 1–4 fecharem.**

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
