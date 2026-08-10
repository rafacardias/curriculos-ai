# HANDOFF — contexto para outra IA

> Documento vivo, para colar no início de uma conversa com outra IA (ou outra sessão) e
> transferir o estado do projeto sem reler o repo inteiro. **Curto de propósito**: o histórico
> completo mora em `KNOWN-BUGS.md` (achados/bugs medidos), `docs/roadmap.md` (backlog priorizado),
> `docs/company-watch-candidates.md` (log de verificação de empresas) e no log do git — este
> arquivo só aponta pra lá, não repete.
>
> Mantido por quem trabalha no repo (humano ou IA) ao fim de toda sessão com mudança material.
> Ver a regra em `CLAUDE.md` → "Handoff entre sessões/IAs".
>
> **Teto de ~100 linhas, regra dura.** Se crescer, corte primeiro "O que mudou" pras 2-3 sessões
> mais recentes antes de encurtar qualquer outra seção. Pointer, nunca conteúdo copiado.

## Resumo da sessão de 2026-08-10

Duas rodadas no mesmo dia, parada dura em cada item, `main` verde e pushado a cada um.

**Rodada 1** — arquitetura da vigilância vs. busca:
1. **Teto de "inserir tudo" medido**: das 1602 vagas que o filtro léxico da vigilância descarta,
   **zero** cruzariam `queue_threshold=40` (melhor 27,5). **Não implementar.**
2. **Mercado vs. calibragem, resolvido por contraste de `score_detail`**: mesmo `scoreJob`, mesmo
   threshold — vaga da busca geral com overlap real pontua 80–93; vigilância GPTW/BH nunca passa
   de 31,8. Veredito: **mercado**. Busca geral = canal primário; vigilância = secundária/saturada;
   **Fase B (Solides/Greenhouse) fechada até nova ordem**. `KNOWN-BUGS.md` → `ACHADO-11`.
3. **`feedback.ts:39` corrigido** — mesma classe `ORDER BY` do BUG-010/`answers.ts` + filtro
   `enabled` ausente. Fecha a classe inteira.
4. **Busca geral instrumentada** (65 rodadas históricas): 789 pontuadas, 7,1% cruzam o corte.

**Rodada 2** — explicar/corrigir, sem tocar peso/threshold/léxico:
5. **`ACHADO-16` corrige o `ACHADO-15`**: o "2,8%→21,5%, instável" da rodada 1 era artefato —
   coluna `status` contaminada por `rescore --commit` (rodou em 3 datas) + corte de rodada caindo
   em cima de uma troca de config no mesmo dia. Recalculado via `scoreJob()` puro (ignora `status`
   armazenado): taxa real ≈ 11%→12%, praticamente plana.
6. **`docs/roadmap.md` #1 (BUG-007) atualizado — e autocorrigido no mesmo dia.** Primeiro achei
   (errado) que a UI trata `reason_class` como opcional; era legado pré-fix (commit `f9378e6`,
   2026-08-07). Desde o fix, captura é 100%. Bloqueador real: volume/tempo de decisão (16 de
   `ai-builder` pós-fix, desbalanceado 11 positivas : 1 negativa), não captura.
7. **Custo de fechar BUG-007, medido (plano, não execução)**: 3 dos 4 itens do escopo original já
   estão implementados — a tabela de status do BUG-007 em `KNOWN-BUGS.md` (linha ~124) está
   desatualizada nesse ponto, não corrigida ainda. Falta é tempo, não código.

Suíte 411/411. Regras respeitadas: nenhum adapter novo, léxico/`ACHADO-13-14` intocados, nenhum
kit gerado, nenhuma migration, nenhum peso/threshold/query mudado.

## Estado agora (atualizado em 2026-08-10)

- **`main`**: tudo acima mesclado e pushado. Suíte 411/411, typecheck limpo.
- **`config/companies.yaml`**: 17 empresas (fechado — ver item 2 acima, Fase B parada).
- **Perfil real**: ingerido (`profile/master-profile.yaml` existe, `/perfil` já rodou).

## O que mudou (mais recente primeiro — sessões anteriores a esta no `git log`)

1. Sessão de hoje (acima, 2 rodadas): teto de "inserir tudo", veredito mercado-vs-calibragem, fix
   de `feedback.ts`, instrumentação e correção da busca geral (`ACHADO-15`/`16`), diagnóstico e
   custo de fechar BUG-007.
2. Madrugada autônoma (2026-08-09→10): cadastro de 17 empresas GPTW/BH, `company-watch-
   registry.ts` (checker doc↔YAML), `answers.ts` `ORDER BY`, `watch run --commit` real.
3. **BUG-010 completo** — `scoreJob` desempatava trilha por ordem não-garantida do SQLite. Fix:
   `ORDER BY id ASC` + desempate por especificidade. `ACHADO-13`/`ACHADO-14`: sobre-captura e
   falso-positivo de termo longo genérico, medidos, stakes baixos, não perseguidos.
4. Vigilância por empresa (Fase A) — scrape `__NEXT_DATA__` da Gupy; queue-improvements; harness
   HTTP in-process.

## Próximos passos

1. **BUG-007** (`docs/roadmap.md` #1, bloqueador): captura de motivo na UI já funciona (100% desde
   08-07); falta é volume de decisão real de `ai-builder` com `reason_class`, hoje 16 (desbalanço
   11:1 positivo/negativo, alvo é ~25 mais balanceado). Reativar `preference` é decisão do
   operador — inclui escolher o peso e de onde tirá-lo (`keyword_overlap` está em 0,65 hoje).
2. `KNOWN-BUGS.md` BUG-007, tabela de status (linha ~124): diz `source:*` "não feito", mas o
   código já exclui (escrita e leitura) — desatualizada, não corrigida (achado do item 3, plano).
3. `UNIQUE` na tupla de dedup do `answer_bank` — decisão de schema registrada em `KNOWN-BUGS.md` →
   `answers.ts:45`, não executada (precisa de índices parciais, padrão da migration 007).
4. Fase B (Solides/Greenhouse) fechada até nova ordem — reabrir exige critério de busca novo, não
   adapter novo do mesmo tipo de empresa.
5. Backlog mais antigo, não reordenado por isto: `docs/roadmap.md` itens 2–10.

## Onde olhar para mais detalhe

| Pergunta | Arquivo |
|---|---|
| Que bugs/achados foram medidos, com evidência? | `KNOWN-BUGS.md` |
| Cadastro de empresas — quem foi verificado, qual ATS usa quem não é Gupy? | `docs/company-watch-candidates.md` |
| Backlog priorizado (dor ÷ risco)? | `docs/roadmap.md` |
| Custo/via de geração de kit (cli vs agentic)? | `docs/custo-geracao.md` |
| Como operar o sistema, comandos, convenções? | `CLAUDE.md` |
| Decisões arquiteturais com o porquê? | `git log`, mensagens de commit são a fonte primária |
