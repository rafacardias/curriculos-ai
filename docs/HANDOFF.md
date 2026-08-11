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

## Resumo da sessão de 2026-08-11 (segunda rodada)

Quatro blocos, parada dura em cada, `main` verde e pushado a cada um. Suíte 444 → **479**.

1. **Doc sincronizada com a realidade** — Onda 3 (`inbox-watch`) reescrita pro estado medido;
   itens 4, 5 e 11 do `docs/roadmap.md` marcados como feitos com a evidência de aceite.
2. **`AdapterCapabilities` + filtro cliente único (item 4)** — `remote_only` deixou de ser
   configuração morta. Gupy filtra no servidor (`city=`, `workplaceType=remote`), LinkedIn declara
   que não sabe filtrar remoto, os 3 boards declaram `allRemote`. `limit` entrou no `SearchSpec` e
   é repassado; a divergência CLI×UI do `doSearch` fechou. O que nenhuma camada resolveu vai pra
   `search_runs.per_source.ignored` em vez de sumir. Modalidade ausente **passa** — descartá-la
   seria inventar fato a partir de ausência de dado, e a política é parâmetro nomeado, não um `if`.
3. **Duas variantes por termo PT (item 11)** — config de 13 → 20 entradas: BH qualquer modalidade,
   Brasil só remoto. Medido antes de commitar (critério ≥10 vagas de BH inéditas, medido 47).
   Corrida real: **236 vagas novas, 109 em BH/RMBH**, 132,4s contra 53,0s, zero timeout.
4. **Alerta de fonte morta (item 5)** — `⛔` no `/status` e na UI, janela por fonte.

Achados novos: `ACHADO-18` (capabilities medidas + o `city=` da Gupy que falha em silêncio),
`ACHADO-19` (o LinkedIn nunca paginou — rendia 1/5), `ACHADO-20` (a "última busca" lida é a última
ENTRADA de config, então o `⚠` nunca mostra erro de gupy/linkedin).

## Estado agora (atualizado em 2026-08-11)

- **`main`**: tudo acima mesclado e pushado. Suíte 479/479, typecheck limpo.
- **Busca**: 20 entradas, ~2m13s por corrida. Fila com 52 vagas.
- **`inbox-watch`**: schema + ingestão read-only prontos e testados no `main`
  (`npx tsx src/cli/inbox.ts ingest --commit`) — só a decisão de ir pro Estágio 3 está fechada.
- **`.env.local`** (gitignored) tem credenciais reais do operador: `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET` (OAuth client "Automacao Curriculos", projeto
  `automacao-curriculos-505219`, tipo Desktop) e `GMAIL_REFRESH_TOKEN`, escopo `gmail.readonly`.

## O que mudou (mais recente primeiro — sessões anteriores a esta no `git log`)

1. Sessão de hoje, 2ª rodada (acima): `AdapterCapabilities`, variantes de busca, fonte morta, doc.
2. Sessão de hoje, 1ª rodada: correção da tabela BUG-007, `UNIQUE` no `answer_bank` (migration
   `008`), `inbox-watch` Blocos B+C — schema `009_inbox.sql`, adapter Gmail `gmail.readonly`,
   medição 1/23 (`ACHADO-17`) e volta pro backlog com o Estágio 3 não construído.
3. Sessão de 2026-08-10 (2 rodadas): teto de "inserir tudo" (`ACHADO-11`), veredito
   mercado-vs-calibragem, fix de `feedback.ts` `ORDER BY`, `ACHADO-15`/`16`.
4. Madrugada autônoma (2026-08-09→10): 17 empresas GPTW/BH, `company-watch-registry.ts`,
   `watch run --commit` real. Antes disso: BUG-010, vigilância por empresa (Fase A).

## Próximos passos

1. **Rodar `scripts/measure-queue-composition.ts` daqui a ~1 semana**, com o acervo assentado
   depois das variantes novas. Ele existe e nunca foi executado de propósito — medir hoje mediria
   acervo meio-populado. Nunca lê `jobs.track_hint`; recalcula via `rescoreAll(commit: false)`.
2. `inbox-watch`: remedir em 3–4 semanas (`scripts/measure-inbox-match.ts` já existe). Achado
   estrutural do `ACHADO-17`: ATS notifica pelo domínio do ATS, não da empresa.
3. **BUG-007** (`docs/roadmap.md` #1, bloqueador): a captura na UI funciona; falta volume de
   decisão real de `ai-builder` — **16 hoje, sem mudança desde 2026-08-10**, desbalanço 11:1.
   Com 109 vagas de BH novas na fila, é a chance de gerar decisão de localização de verdade.
4. Fase B (Solides/Greenhouse) fechada até nova ordem.
5. Backlog restante: `docs/roadmap.md` itens 1, 2, 3, 6–10.

## Onde olhar para mais detalhe

| Pergunta | Arquivo |
|---|---|
| Que bugs/achados foram medidos, com evidência? | `KNOWN-BUGS.md` |
| Cadastro de empresas — quem foi verificado, qual ATS usa quem não é Gupy? | `docs/company-watch-candidates.md` |
| Backlog priorizado (dor ÷ risco)? | `docs/roadmap.md` |
| Custo/via de geração de kit (cli vs agentic)? | `docs/custo-geracao.md` |
| Como operar o sistema, comandos, convenções? | `CLAUDE.md` |
| Decisões arquiteturais com o porquê? | `git log`, mensagens de commit são a fonte primária |
