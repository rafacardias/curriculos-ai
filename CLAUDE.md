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
| `/linkedin-post [tema\|publicar <arquivo>]` | Gera post (vibecoding/IA) e opcionalmente salva rascunho/agenda no LinkedIn (assistido, via `claude-in-chrome`) |
| `/linkedin-comentar <url>` | Redige e pré-preenche comentário em post específico — nunca envia sozinho |
| `/linkedin-auditoria` | Compara perfil LinkedIn ao vivo com o perfil mestre; aponta lacunas e alegações não lastreadas |
| `/status` | Digest geral |

## Geração de kit — vias, perfis e custo

`kit generate <job_id> --via cli|agentic|external` (**`--via` é obrigatória, sem default**).
`agentic` é o caminho validado; `cli` é o disparo único (~6× mais barato) e **ainda não passou
na não-regressão** — ver `docs/custo-geracao.md`.

- Todo argv de `claude` sai de `src/local/harness.ts`; só `src/local/generate-runner.ts` dispara
  o binário. Um teste varre `src/` e reprova quem montar linha de comando por fora.
- Os perfis vivem em `config.yaml → harness.profiles`. **`model`, `tools` e `max_budget_usd` não
  têm default** — ausência de configuração já foi lida como default seguro e rodou Opus por
  acidente. `tools` diz o que existe; `allowed_tools` diz o que é permitido, e as duas são
  necessárias.
- `npx tsx src/cli/salary.ts <job_id>` pesquisa a faixa salarial num passo separado (perfil
  `salario`, só WebSearch). Sem ele o kit sai com `[CONFIRMAR: pretensão]` e o finalize sai 3 —
  degradação correta, nunca número inventado.
- `scripts/measure-kit.ts` pontua um kit com os mesmos gates do `finalize` **sem tocar no banco** —
  é como se comparam vias sem contaminar o funil.

**Antes de trocar qualquer default:** não-regressão em amostra, critério de aceite em código, na
forma "não pode piorar muito". Cobertura e ATS são heurísticas deste sistema — servem de alarme
para regressão grande, não de placar para melhoria fina.

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

## Dado pessoal nunca entra no repositório — nem como fixture

O repo é **público**. `profile/`, `output/` e `db/` guardam nome, e-mail, telefone, currículos
reais e histórico de candidatura, e **nada dali pode ser commitado em hipótese nenhuma** —
inclusive, e principalmente, "só como fixture de teste". `tests/` é público igual ao resto: é
por isso que a sandbox usa a **Ana Teste** sintética (`tests/fixtures/sandbox-root/`) em vez do
perfil real.

Quando um artefato real for útil como prova (ex.: o kit que expôs o BUG-008), a regra é:
**o real prova no `KNOWN-BUGS.md`, uma fixture sintética equivalente protege no teste.** Descreva
o defeito com arquivo e linha; recrie o caso com dado inventado.
