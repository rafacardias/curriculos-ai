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

## Resumo da sessão de 2026-08-13

Dois fixes de bug pontuais, sem feature nova. Suíte 479 → **497**, `main` ainda não pushado (branch
`docs/session-close-registers`).

1. **`/vaga` reenviado com a mesma URL duplicava a linha** em vez de corrigir cargo/empresa mal
   extraídos (`ACHADO-22`) — `insertJob` dedupa por fingerprint de texto, que muda quando o texto é
   corrigido. `addJobByUrl` agora checa a URL primeiro e atualiza a linha existente em vez de
   duplicar.
2. **Citação `[exp:...]` vazava até o `resume.md` e o `cover-letter.pdf` entregues** (`ACHADO-21`)
   — `stripCitations` nunca era chamada nesses dois pontos de `kit.ts finalize`. Corrigido num só
   lugar, para os 4 entregáveis. Novo gate mecânico `car_frase_fraca` (exit 3) bloqueia aberturas
   tipo "responsável por"/"ajudei em" — a metodologia CAR da skill `/gerar` só existia como texto
   de prompt até aqui.

## Estado agora (atualizado em 2026-08-13)

- Suíte 497/497, typecheck limpo. Dois fixes acima ainda **não commitados** — só working tree.
- **Busca**: 20 entradas, ~2m13s por corrida. Fila com 52+ vagas (não remedida nesta sessão).
- **`inbox-watch`**: schema + ingestão read-only prontos no `main` — decisão de ir pro Estágio 3
  segue fechada (negativa), ver `ACHADO-17`.
- **`.env.local`** (gitignored) tem credenciais reais do operador: `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET` (OAuth client "Automacao Curriculos", projeto
  `automacao-curriculos-505219`, tipo Desktop) e `GMAIL_REFRESH_TOKEN`, escopo `gmail.readonly`.

## O que mudou (mais recente primeiro — sessões anteriores a esta no `git log`)

1. Sessão de hoje (acima): dedup por URL do `/vaga`, citação vazando + gate CAR.
2. Sessão de 2026-08-11, 2ª rodada: `AdapterCapabilities`, variantes de busca por geografia
   (BH×Brasil), alerta de fonte morta, doc sincronizada (`ACHADO-18/19/20`).
3. Sessão de 2026-08-11, 1ª rodada: fix BUG-007, `inbox-watch` Blocos B+C, medição 1/23
   (`ACHADO-17`), volta pro backlog.
4. Sessão de 2026-08-10 (2 rodadas): teto de "inserir tudo" (`ACHADO-11`), fix `feedback.ts`
   `ORDER BY`, `ACHADO-15`/`16`.
5. Madrugada autônoma (2026-08-09→10): 17 empresas GPTW/BH, vigilância por empresa (Fase A).

## Próximos passos

0. **Commitar e regenerar os kits afetados.** O fix de citação (`ACHADO-21`) está só na working
   tree — nenhum kit novo sai limpo até commitar. Pelo menos 2 kits gerados nesta sessão (antes do
   fix) têm `[exp:...]` visível no `resume.md`/`cover-letter.pdf`; rodar `kit.ts finalize` de novo
   neles resolve, não precisa regenerar o texto.
1. **Varrer os 4 adapters restantes pelo padrão do `ACHADO-19`** (`docs/roadmap.md` #12). Parâmetro
   aceito e ignorado é a mesma classe do `remote_only` morto: não falha, só rende menos. A
   assinatura já está no banco (`found` colado num teto redondo em toda entrada) — medição barata,
   sem feature. Suspeito a conferir primeiro: `remotive`, exatamente 20 em 6 de 6 entradas EN.
2. **Rodar `scripts/measure-queue-composition.ts` daqui a ~1 semana**, com o acervo assentado
   depois das variantes novas. Ele existe e nunca foi executado de propósito — medir hoje mediria
   acervo meio-populado. Nunca lê `jobs.track_hint`; recalcula via `rescoreAll(commit: false)`.
3. **`scripts/measure-search-variant.ts` — dívida nomeada** (`docs/roadmap.md` #13). O item 11 foi
   decidido com sondagem descartável; a ferramenta repetível não existe. O confundidor de amostragem
   que ela pegaria só apareceu por acaso de ordem desta vez.
4. `inbox-watch`: remedir em 3–4 semanas (`scripts/measure-inbox-match.ts` já existe). Achado
   estrutural do `ACHADO-17`: ATS notifica pelo domínio do ATS, não da empresa.
5. **BUG-007** (`docs/roadmap.md` #1, bloqueador): a captura na UI funciona; falta volume de
   decisão real de `ai-builder` — **16 hoje, sem mudança desde 2026-08-10**, desbalanço 11:1.
   Com 109 vagas de BH novas na fila, é a chance de gerar decisão de localização de verdade.
6. Fase B (Solides/Greenhouse) fechada até nova ordem.
7. Backlog restante: `docs/roadmap.md` itens 1, 2, 3, 6–10.

## Onde olhar para mais detalhe

| Pergunta | Arquivo |
|---|---|
| Que bugs/achados foram medidos, com evidência? | `KNOWN-BUGS.md` |
| Cadastro de empresas — quem foi verificado, qual ATS usa quem não é Gupy? | `docs/company-watch-candidates.md` |
| Backlog priorizado (dor ÷ risco)? | `docs/roadmap.md` |
| Custo/via de geração de kit (cli vs agentic)? | `docs/custo-geracao.md` |
| Como operar o sistema, comandos, convenções? | `CLAUDE.md` |
| Decisões arquiteturais com o porquê? | `git log`, mensagens de commit são a fonte primária |
