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

## Resumo da sessão de 2026-08-11

Três itens, parada dura em cada, `main` verde e pushado a cada um.

1. **`KNOWN-BUGS.md` BUG-007 corrigido**: a tabela dizia `source:*` "não feito"; o código já
   exclui (escrita `preferenceKeysFor` e leitura `isLearnedKey`) desde 2026-08-07. 3 dos 4 itens
   do escopo original estão feitos.
2. **`UNIQUE` no `answer_bank`**: migration `008_answer_bank_dedup.sql`, 4 índices únicos parciais
   (NULL não colide em índice único simples do SQLite — mesmo padrão da migration 007). Banco real
   tinha 0 linhas em `answer_bank`, sem duplicata a reconciliar.
3. **`inbox-watch` (Blocos B+C, `docs/roadmap.md` → Onda 3)**: schema `009_inbox.sql`, adapter
   Gmail REST puro (`gmail.readonly`), comandos `inbox auth`/`inbox ingest [--commit]`. Achado no
   meio do caminho: `companies.domain` nunca tinha sido escrito (0/518) — backfill manual via
   WebSearch só das 23 empresas com candidatura real, antes de medir (senão o Estágio 2 mediria
   zero por falta de dado). **Medição real: 1434 e-mails, 1/23 candidaturas casadas (4,3%) —
   abaixo do critério de ~60%.** `KNOWN-BUGS.md` → `ACHADO-17`. Causa provável: 22/23 candidaturas
   têm 1–5 dias, prazo de resposta de RH ainda não passou pra maioria — não é falha comprovada da
   cascata, mas o critério é objetivo. **Feature volta pro backlog, Estágio 3 não construído.**

Suíte 444/444.

## Estado agora (atualizado em 2026-08-11)

- **`main`**: tudo acima mesclado e pushado. Suíte 444/444, typecheck limpo.
- **`inbox-watch`**: schema + ingestão read-only ficam prontos e testados no `main`
  (`npx tsx src/cli/inbox.ts ingest --commit`) — só a decisão de ir pro Estágio 3 está fechada.
- **`.env.local`** (gitignored) tem credenciais reais do operador: `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET` (OAuth client "Automacao Curriculos", projeto
  `automacao-curriculos-505219`, tipo Desktop) e `GMAIL_REFRESH_TOKEN`, escopo `gmail.readonly`.

## O que mudou (mais recente primeiro — sessões anteriores a esta no `git log`)

1. Sessão de hoje (acima): correção da tabela BUG-007, `UNIQUE` no `answer_bank`, `inbox-watch`
   Bloco B (ingestão) + Bloco C (medição, `ACHADO-17`, feature volta pro backlog).
2. Sessão de 2026-08-10 (2 rodadas): teto de "inserir tudo" (vigilância vs. busca geral,
   `ACHADO-11`), veredito mercado-vs-calibragem, fix de `feedback.ts` `ORDER BY`, diagnóstico e
   autocorreção do BUG-007 no mesmo dia, `ACHADO-15`/`16` (taxa da busca geral).
3. Madrugada autônoma (2026-08-09→10): cadastro de 17 empresas GPTW/BH, `company-watch-
   registry.ts`, `answers.ts` `ORDER BY`, `watch run --commit` real.
4. **BUG-010 completo** — `scoreJob` desempatava trilha por ordem não-garantida do SQLite.
5. Vigilância por empresa (Fase A) — scrape `__NEXT_DATA__` da Gupy; queue-improvements; harness
   HTTP in-process.

## Próximos passos

1. `inbox-watch`: remedir daqui a 3–4 semanas, quando as candidaturas de agosto tiverem tido tempo
   real de resposta (`scripts/measure-inbox-match.ts` já existe, não precisa reescrever). Achado
   estrutural do `ACHADO-17` pra quem reabrir: ATS (Gupy/LinkedIn) notifica pelo domínio do ATS,
   não da empresa — Estágio 2 é cego a isso, oposto do falso-positivo que o plano original temia.
2. **BUG-007** (`docs/roadmap.md` #1, bloqueador): captura de motivo na UI já funciona (100% desde
   08-07); falta é volume de decisão real de `ai-builder` com `reason_class`, hoje 16 (desbalanço
   11:1 positivo/negativo, alvo é ~25 mais balanceado). Reativar `preference` é decisão do
   operador — inclui escolher o peso e de onde tirá-lo (`keyword_overlap` está em 0,65 hoje).
3. Fase B (Solides/Greenhouse) fechada até nova ordem — reabrir exige critério de busca novo, não
   adapter novo do mesmo tipo de empresa.
4. Backlog mais antigo, não reordenado por isto: `docs/roadmap.md` itens 2–10.

## Onde olhar para mais detalhe

| Pergunta | Arquivo |
|---|---|
| Que bugs/achados foram medidos, com evidência? | `KNOWN-BUGS.md` |
| Cadastro de empresas — quem foi verificado, qual ATS usa quem não é Gupy? | `docs/company-watch-candidates.md` |
| Backlog priorizado (dor ÷ risco)? | `docs/roadmap.md` |
| Custo/via de geração de kit (cli vs agentic)? | `docs/custo-geracao.md` |
| Como operar o sistema, comandos, convenções? | `CLAUDE.md` |
| Decisões arquiteturais com o porquê? | `git log`, mensagens de commit são a fonte primária |
