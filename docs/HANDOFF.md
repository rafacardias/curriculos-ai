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

5 itens sequenciais, parada dura em cada um, todos fechados, `main` verde e pushado:

1. **Teto de "inserir tudo" medido**: `skipLexicalFilter` em `runCompanyWatch` +
   `scripts/measure-watch-ceiling.ts` — das 1602 vagas que o filtro léxico descarta, **zero**
   cruzariam `queue_threshold=40` (melhor 27,5). **Não implementar** "inserir tudo".
2. **Mercado vs. calibragem, resolvido por contraste de `score_detail`**: mesmo `scoreJob`, mesmo
   threshold — vaga da busca geral com `keyword_overlap` real pontua 80–93; vigilância GPTW/BH
   nunca passa de 31,8 porque `keyword_overlap=0` no corpus inteiro. Veredito: **mercado**.
   **Prioridade reordenada**: busca geral é canal primário, vigilância secundária/saturada,
   **Fase B (Solides/Greenhouse) fechada até nova ordem**. Ver `KNOWN-BUGS.md` → `ACHADO-11`.
3. **`feedback.ts:39` corrigido** — mesma classe `ORDER BY` do BUG-010/`answers.ts`, mais filtro
   `enabled` ausente. Fecha a classe inteira (`scoring.ts`, `answers.ts`, `feedback.ts`).
4. **Canal de busca geral instrumentado** (`scripts/measure-search-channel.ts`, leitura de 65
   rodadas históricas): 789 vagas pontuadas, 7,1% cruzam o corte — mas a taxa NÃO é estável entre
   rodadas (2,8%→21,5%, ao contrário do filtro léxico). Causa não investigada, registrada como
   pergunta aberta. Ver `ACHADO-15`.
5. **Análise, sem implementar**: BUG-007 não muda de prioridade formal, mas o diagnóstico muda —
   população `ai-builder` cresceu de 1 pra 36 decisões (`queued`+`rejected`), mas só 5/45 eventos
   de feedback carregam `reason_class`; o servidor (`server/index.ts` → `doFeedback`) trata
   `reasonClass` como opcional, só o CLI exige. O bottleneck real não é mais volume, é captura na
   UI. Reativar `preference` continua sendo decisão do operador.

Suíte 411/411 (era 407 no início da madrugada). Regras respeitadas: nenhum adapter novo, léxico/
`ACHADO-13-14` intocados, nenhum kit gerado, nenhuma migration.

## Estado agora (atualizado em 2026-08-10)

- **`main`**: tudo acima mesclado e pushado. Suíte 411/411, typecheck limpo.
- **`config/companies.yaml`**: 17 empresas (fechado — ver item 2 acima, Fase B parada).
- **Perfil real**: ingerido (`profile/master-profile.yaml` existe, `/perfil` já rodou).

## O que mudou (mais recente primeiro — sessões anteriores a esta no `git log`)

1. Sessão de hoje (acima): teto de "inserir tudo", veredito mercado-vs-calibragem, fix de
   `feedback.ts`, instrumentação da busca geral, diagnóstico de BUG-007.
2. Madrugada autônoma (2026-08-09→10): cadastro de 17 empresas GPTW/BH, `company-watch-
   registry.ts` (checker doc↔YAML), `answers.ts` `ORDER BY`, `watch run --commit` real.
3. **BUG-010 completo** — `scoreJob` desempatava trilha por ordem não-garantida do SQLite. Fix:
   `ORDER BY id ASC` + desempate por especificidade. `ACHADO-13`/`ACHADO-14`: sobre-captura e
   falso-positivo de termo longo genérico, medidos, stakes baixos, não perseguidos.
4. Vigilância por empresa (Fase A) — scrape `__NEXT_DATA__` da Gupy; queue-improvements; harness
   HTTP in-process.

## Próximos passos

1. **BUG-007** (`docs/roadmap.md` #1, bloqueador): diagnóstico atualizado nesta sessão — a
   captura de `reason_class` na UI (`server/index.ts`) é opcional e é aí que a maioria do
   feedback real acontece, não no CLI que já exige. Decisão do operador se/quando fechar isso.
2. `UNIQUE` na tupla de dedup do `answer_bank` — decisão de schema registrada em `KNOWN-BUGS.md` →
   `answers.ts:45`, não executada (precisa de índices parciais, padrão da migration 007).
3. Fase B (Solides/Greenhouse) fechada até nova ordem (item 2 do resumo) — reabrir exige critério
   de busca novo, não adapter novo do mesmo tipo de empresa.
4. Backlog mais antigo, não reordenado por isto: `docs/roadmap.md` itens 2–10 (barreira de
   entrada, configuração de busca `ai-builder`, `AdapterCapabilities`, etc.).

## Onde olhar para mais detalhe

| Pergunta | Arquivo |
|---|---|
| Que bugs/achados foram medidos, com evidência? | `KNOWN-BUGS.md` |
| Cadastro de empresas — quem foi verificado, qual ATS usa quem não é Gupy? | `docs/company-watch-candidates.md` |
| Backlog priorizado (dor ÷ risco)? | `docs/roadmap.md` |
| Custo/via de geração de kit (cli vs agentic)? | `docs/custo-geracao.md` |
| Como operar o sistema, comandos, convenções? | `CLAUDE.md` |
| Decisões arquiteturais com o porquê? | `git log`, mensagens de commit são a fonte primária |
