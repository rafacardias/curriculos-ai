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

## Resumo da sessão de 2026-08-10 (manhã)

Decisão em aberto da madrugada anterior — "filtrar vs. inserir tudo" — **respondida por
medição real**: `skipLexicalFilter` novo em `runCompanyWatch` (dry-run, sem risco) +
`scripts/measure-watch-ceiling.ts` rodado contra o cadastro completo de 17 empresas. Resultado:
das 1602 vagas que o filtro léxico descarta e nunca tinham sido pontuadas, **zero** cruzariam o
`queue_threshold` (40) — maior pontuação 27,5. Ver `KNOWN-BUGS.md` → `ACHADO-11`, addendum
2026-08-10. **Conclusão prática: não implementar "inserir tudo"** — o gargalo é adequação de
mercado (BH não tem volume de vaga de tecnologia/produto nessas 17 empresas), não o filtro nem a
captura. A decisão de Fase B (Solides vs. Greenhouse) segue em aberto, é sobre tipo de empresa
vigiada, não quantidade processada. Suíte 409/409 (era 407), typecheck limpo.

## Resumo da madrugada autônoma (2026-08-09→10)

Plano de 4 itens, ordem travada, parada dura em cada um. Todos fechados, `main` verde e pushado.

1. **Cadastro de empresas mesclado** — 17 empresas GPTW/BH verificadas (57%→43%→0%→...→33% no
   acumulado por grupo, ver `company-watch-candidates.md`). Ranking de ATS: Solides lidera 6×,
   Greenhouse 1× — **não implementado**, decisão de Fase B é do operador.
2. **`company-watch-registry.ts` + teste** — detecta divergência entre o log de verificação e
   `companies.yaml` (o bug real do lote 1: 5 empresas "verificadas" nunca chegaram ao YAML).
3. **`answers.ts:45`**: `ORDER BY updated_at DESC` corrigido e testado (mesma classe do BUG-010).
   `UNIQUE` na tupla de dedup **parado e registrado** — exige migration e decisão de schema (NULL
   não colide em índice único simples), não executado.
4. **`watch run --commit` real, cadastro completo**: 1828 vagas, 9 passaram o filtro (0,49% —
   confere com o 0,3% da Fase A), 6 novas, **0 cruzaram `queue_threshold`** (melhor pontuação
   31,8). Dado novo pra decisão filtrar-vs-inserir-tudo, ainda não tomada.

Regras respeitadas: nenhum adapter novo (nem Solides, líder do ranking), léxico/`ACHADO-13-14`
intocados, nenhum kit gerado. Suíte 407/407 em cada merge.

## Estado agora (atualizado em 2026-08-10, manhã)

- **`main`**: tudo dos dois resumos acima mesclado e pushado. Suíte 409/409, typecheck limpo.
- **`config/companies.yaml`**: 17 empresas (era 2 no início da sessão da madrugada).
- **Perfil real**: ingerido (`profile/master-profile.yaml` existe, `/perfil` já rodou).
- **filtrar-vs-inserir-tudo**: decidido por dado, não implementar (ver resumo desta manhã).

## O que mudou (mais recente primeiro — sessões anteriores a esta no `git log`)

1. Madrugada autônoma (acima): cadastro de 17 empresas, checker doc↔YAML, `answers.ts` ORDER BY,
   `watch run` real.
2. **BUG-010 completo** — `scoreJob` desempatava trilha por ordem não-garantida do SQLite. Fix:
   `ORDER BY id ASC` + desempate por especificidade (keyword exclusiva e mais longa pesa mais).
   `ACHADO-13`: 44%→19%→18%. `ACHADO-14`: termo longo mas genérico (boilerplate) também engana o
   peso por comprimento — classe registrada, não perseguida.
3. Vigilância por empresa (Fase A) — scrape `__NEXT_DATA__` da Gupy, dedup por
   `(source, source_job_id)`; queue-improvements (filtro dual-location, dropdown de trilha,
   confirmação de score baixo); harness HTTP in-process.

## Próximos passos

1. **Fase B, decisão do operador**: filtrar-vs-inserir-tudo está resolvida (não implementar —
   ver resumo desta manhã). Em aberto: se/quando abrir Fase B com empresa de outro ATS — Solides
   (6 ocorrências no ranking, scrape) ou Greenhouse (1, mas API estável de verdade). Nenhum dos
   dois implementado.
2. `UNIQUE` na tupla de dedup do `answer_bank` — decisão de schema registrada em `KNOWN-BUGS.md` →
   `answers.ts:45`, não executada (NULL em `track_id`/`company_id` não colide em índice único
   simples; precisa de índices parciais, padrão da migration 007).
3. `feedback.ts:39` — mesma classe de `ORDER BY` ausente que `answers.ts` tinha, mas dormente
   (componente `preference` desarmado). Prioridade menor.
4. Backlog mais antigo, não reordenado por isto: `docs/roadmap.md` (BUG-007 é o maior bloqueador —
   componente de preferência desarmado, 98 chaves aprendidas preservadas).

## Onde olhar para mais detalhe

| Pergunta | Arquivo |
|---|---|
| Que bugs/achados foram medidos, com evidência? | `KNOWN-BUGS.md` |
| Cadastro de empresas — quem foi verificado, qual ATS usa quem não é Gupy? | `docs/company-watch-candidates.md` |
| Backlog priorizado (dor ÷ risco)? | `docs/roadmap.md` |
| Custo/via de geração de kit (cli vs agentic)? | `docs/custo-geracao.md` |
| Como operar o sistema, comandos, convenções? | `CLAUDE.md` |
| Decisões arquiteturais com o porquê? | `git log`, mensagens de commit são a fonte primária |
