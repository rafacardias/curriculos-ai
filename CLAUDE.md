# Curriculos — Maximizador de Entrevistas com Restrição de Veracidade

Sistema local que busca vagas, gera kits de aplicação ATS-otimizados e rastreia o funil de candidaturas do Rafael. Plano completo: `/Users/rafa/Desktop/.claude/plans/sistema-local-automatizado-para-wiggly-pnueli.md`.

## Regra nº 1 — Veracidade (inegociável)

Todo conteúdo gerado (currículo, cover letter, respostas) espelha o vocabulário do job description **mas só usa fatos reais** de `profile/master-profile.yaml`. Cada bullet de currículo cita `[exp:<fact_id>]`; `kit.ts finalize` valida mecanicamente e **falha o build** se houver citação inexistente. Keyword do JD sem fato que a sustente fica listada como "descoberta" — nunca inventada.

## Arquitetura (regra dura)

`src/core/`, `src/adapters/` e `src/submit/` **nunca** importam de `src/cli/` nem conhecem o Claude Code — são o pacote portável para o futuro SaaS (Next.js/Supabase). Scripts fazem o determinístico (fetch, dedup, score, render, DB); Claude faz o julgamento (extração de perfil, tailoring, redação).

## Comandos do operador (skills em `.claude/skills/`)

| Comando | Função |
|---|---|
| `/perfil` | Ingestão do perfil mestre (PDFs em `profile/sources/`) + candidate_facts |
| `/buscar [query]` | Busca em todas as fontes → dedup → score → fila |
| `/fila [n]` | Fila ranqueada + ação recomendada pelo policy engine; triagem |
| `/vaga <url>` | Adiciona vaga manualmente por URL (fallback universal) |
| `/gerar <job_id>` | Gera kit: currículo + cover letter + respostas + outreach |
| `/submeter [id\|lote]` | Submissão via Playwright no modo configurado |
| `/aplicar <id> [status]` | Marca/atualiza status no funil |
| `/respostas` | Answer bank (perguntas de triagem) |
| `/empresa <nome>` | Company memory |
| `/feedback <id> aprovar\|rejeitar` | Ajusta preference_weights |
| `/painel` | Dashboard + performance warehouse |
| `/agendar on\|off\|status` | Busca automática diária (launchd) |
| `/linkedin` | Otimização de perfil + outreach |
| `/status` | Digest geral |

## Operação

- `npm run db:migrate` — aplica migrations (idempotente; roda automático em qualquer acesso ao DB)
- UI (localhost:4780) roda como serviço launchd: `npx tsx src/cli/ui-service.ts on|off|status`. **Nunca** subir `npm run ui` de shell sandboxado (ex.: de dentro do Claude Code): o pipeline de aprovação dispara `claude -p`, que precisa do Keychain — em sandbox trava com o pop-up "Chaves Não Encontradas"
- Scripts CLI: `npx tsx src/cli/<nome>.ts` — todos aceitam `--help`
- Config do operador: `config/config.yaml` (auto_search, policy, modos de submissão)
- DB: `db/curriculos.db` (gitignored) · Kits gerados: `output/<job_slug>/` (gitignored)
- PDFs pessoais ficam em `profile/sources/` (gitignored — nunca commitar dados pessoais)

## Convenções

- Prosa/UI em PT-BR; código, nomes e commits em inglês (conventional commits)
- Datas ISO-8601 UTC; ids ulid; JSON em colunas TEXT
- "ATS score" é heurística — rotular sempre como estimativa; o artefato honesto é o coverage report
- Submissão default `review_first`; `full_auto` só via policy engine + opt-in por plataforma
