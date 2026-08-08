# Curriculos — AI-Powered Interview Maximizer

> Sistema local-first de automação de candidaturas: busca vagas em múltiplas fontes, pontua o match contra um perfil de fatos verificáveis, gera currículos ATS-otimizados por vaga **sem nunca inventar experiência**, e submete com autonomia configurável. Construído inteiramente com **AI-assisted development (Claude Code)** — do plano aprovado ao sistema funcional em 12 milestones e 1 dia.
>
> *Local-first job application automation: multi-source job search, fact-grounded ATS resume generation with a mechanical truthfulness guardrail, and browser-automated submission. Built end-to-end via AI-assisted development in a single day.*

**Status:** funcional, em uso real pelo autor como beta tester nº 1. · **Licença: All Rights Reserved** (código visível para fins de portfólio; uso, cópia ou distribuição não autorizados).

---

## Por que este projeto existe

Candidatar-se bem é um problema de **volume × personalização × rastreamento** — e os SaaS que resolvem isso (LazyApply, JobCopilot, Sonara, FastApply...) cobram assinatura e guardam seus dados. Este projeto reimplementa o melhor de cada um, local, com uma diferença de princípio:

**Restrição de veracidade como arquitetura, não como promessa.** Cada bullet de currículo gerado precisa citar `[exp:fact_id]` um fato real do perfil mestre; o build **falha mecanicamente** se a citação não existir. Keyword da vaga sem fato que a sustente aparece como "não coberta" — nunca é inventada.

## Arquitetura

```
busca (6 adapters) → dedup fingerprint → scoring (léxico por trilha + preferências aprendidas)
    → policy engine (score mínimo, caps semanais, cooldown por empresa)
    → kit de aplicação (currículo ATS + cover letter + respostas de triagem + outreach)
    → truthcheck mecânico + coverage report → PDF com camada de texto real
    → submissão Playwright (review_first | approve_batch | full_auto com pausa em pergunta desconhecida)
    → tracker SQLite + performance warehouse + dashboard
```

- **Núcleo desacoplado**: `src/core`, `src/adapters` e `src/submit` não conhecem a CLI — portáveis para um SaaS (Next.js/Supabase) sem reescrita.
- **Zero dependências nativas**: SQLite embutido do Node (`node:sqlite`), PDFs via Chrome do sistema (`puppeteer-core`), automação via `playwright-core`.
- **Inteligência**: o julgamento (extração de perfil, tailoring, redação) é feito por Claude Code via skills versionadas no repo (`.claude/skills/`); os scripts fazem só o determinístico. O prompt de tailoring com o guardrail de veracidade está em `.claude/skills/gerar/SKILL.md`.

## Destaques de engenharia

| Peça | O que faz |
|---|---|
| **Truthcheck** (`src/core/truthcheck.ts`) | Valida citações `[exp:id]` contra o perfil mestre; citação inexistente = exit 2, PDF não sai |
| **Policy engine** (`src/core/policy.ts`) | Regras declaráveis em YAML: quando gerar, quando submeter, em que modo — toda decisão logada e auditável |
| **Form filler genérico** (`src/submit/form-filler.ts`) | Descobre labels (for/aria/ancestor), resolve valores em cascata (fatos canônicos → answer bank → pausa); **nunca chuta** resposta obrigatória |
| **Adapters com isolamento de falha** | Fonte quebrada (APIs não documentadas mudam!) reporta erro em `search_runs` sem derrubar a busca |
| **Coverage report honesto** | "ATS score" é rotulado estimativa heurística; o artefato real é a lista de keywords cobertas/não cobertas |
| **Experiment engine** | Variantes de currículo round-robin por segmento, medidas como "sinal direcional (n=X)" — sem teatro estatístico |
| **Gates que reprovam** (`src/core/gates.ts`) | Exit codes distintos por causa: 2 truthcheck · 3 marcador `[CONFIRMAR:` sobrevivente ou entregável vazio · 4 HTML hostil a ATS, PDF sem camada de texto, ordem de leitura quebrada · 5 modalidade não confirmada, **antes** de gastar a geração |
| **Perfis de harness** (`src/local/harness.ts`) | Um único construtor de argv para toda invocação de LLM; um teste varre `src/` e reprova se qualquer outro arquivo montar a linha de comando |

## Engenharia de custo — medida, não estimada

Gerar um kit custava **$2,63 e 4.851.953 tokens de entrada** em 38 turnos. A anatomia dos logs mostrou que **83% do custo era lado-input**: o laço agêntico relia 80.824 tokens de inventário de ferramentas a cada turno, enquanto os 4 arquivos entregues custavam 9,6% do total.

| | antes | depois | delta |
|---|---:|---:|---:|
| turnos | 38 | 2 | **−95%** |
| tokens de entrada | 4.851.953 | 18.010 | **−99,6%** |
| custo por kit | $2,63 | $0,40 | **−85%** |
| prefixo de harness por invocação | 80.824 | 192 | **−99,8%** |
| cobertura de keywords (mesma vaga) | 40% | 47% | +7 pp |

Como: `--tools ""` + `--system-prompt` substituído + `--strict-mcp-config` + `--disable-slash-commands`, e a redação convertida de laço agêntico em disparo único com uma revisão de limite rígido. Método e ressalvas em [`docs/custo-geracao.md`](docs/custo-geracao.md); a fronteira de dados (o que sai da máquina e o que nunca sai) em [`docs/fronteira-de-dados.md`](docs/fronteira-de-dados.md).

**A disciplina importa mais que o número.** Toda troca de padrão passa por não-regressão em amostra com critério de aceite em código — e a primeira reprovou, então o caminho barato ficou atrás de flag. O critério é sempre da forma *"não pode piorar muito"*, nunca *"tem de melhorar tanto"*: cobertura e ATS são heurísticas do próprio sistema, e a ressalva vive junto do código que as calcula.

## Skills de operação (Claude Code como interface)

`/perfil` `/buscar` `/fila` `/vaga` `/gerar` `/submeter` `/aplicar` `/respostas` `/empresa` `/feedback` `/painel` `/agendar` `/status`
`/linkedin` `/linkedin-post` `/linkedin-comentar` `/linkedin-auditoria`

## Stack

TypeScript · Node 22+ (`node:sqlite`, sem build) · Playwright · Puppeteer-core · Zod · launchd (busca diária) · HTML/CSS puro no dashboard

## O que NÃO está no repo

Perfil pessoal (`profile/*.yaml` reais), banco de dados, kits gerados e snapshots são gitignored — este repo é o motor, não os meus dados. Os arquivos `profile/*.example.yaml` mostram o formato.

---

### English summary

A local-first "interview maximizer" built entirely through AI-assisted development (Claude Code) in one day: 6 job-source adapters with failure isolation, declarative policy engine, fact-grounded resume generation where every bullet must cite a verifiable fact id (mechanically enforced — the build fails on fabrication), honest keyword-coverage reporting, Playwright submission layer with three autonomy modes that pauses on unknown screening questions instead of guessing, SQLite tracking with a performance warehouse, and resume-variant experiments reported as directional signals. Personal data never enters the repo.

**Cost engineering, measured:** profiling the generation logs showed 83% of the spend was input-side — an agentic loop re-reading 80,824 tokens of tool inventory on every one of 38 turns, while the four delivered files accounted for 9.6% of it. Rebuilt as a single shot plus one bounded revision: **38 → 2 turns, 4.85M → 18k input tokens (−99.6%), $2.63 → $0.40 per kit (−85%)**, with keyword coverage going *up* 7 points on the same job. Every default switch is gated on a sampled non-regression run with the acceptance criterion written as code — the first one failed, so the cheap path stayed behind a flag.

*Author: Jonas Rafael Cardias ([LinkedIn](https://www.linkedin.com/in/rafael-cardias-pm-qa/)) — AI Builder & vibe coder transitioning into QA/PM. This repo doubles as a portfolio piece: it is the system I use to run my own job search.*
