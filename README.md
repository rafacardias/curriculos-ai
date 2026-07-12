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

## Skills de operação (Claude Code como interface)

`/perfil` `/buscar` `/fila` `/vaga` `/gerar` `/submeter` `/aplicar` `/respostas` `/empresa` `/feedback` `/linkedin` `/painel` `/agendar` `/status`

## Stack

TypeScript · Node 22+ (`node:sqlite`, sem build) · Playwright · Puppeteer-core · Zod · launchd (busca diária) · HTML/CSS puro no dashboard

## O que NÃO está no repo

Perfil pessoal (`profile/*.yaml` reais), banco de dados, kits gerados e snapshots são gitignored — este repo é o motor, não os meus dados. Os arquivos `profile/*.example.yaml` mostram o formato.

---

### English summary

A local-first "interview maximizer" built entirely through AI-assisted development (Claude Code) in one day: 6 job-source adapters with failure isolation, declarative policy engine, fact-grounded resume generation where every bullet must cite a verifiable fact id (mechanically enforced — the build fails on fabrication), honest keyword-coverage reporting, Playwright submission layer with three autonomy modes that pauses on unknown screening questions instead of guessing, SQLite tracking with a performance warehouse, and resume-variant experiments reported as directional signals. Personal data never enters the repo.

*Author: Jonas Rafael Cardias ([LinkedIn](https://www.linkedin.com/in/rafael-cardias-pm-qa/)) — AI Builder & vibe coder transitioning into QA/PM. This repo doubles as a portfolio piece: it is the system I use to run my own job search.*
