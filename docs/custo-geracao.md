# Custo de geração de kit — o objetivo é **kits por janela**, não centavos

Medido em 2026-08-07. Substitui o enquadramento anterior ("reduzir o custo em dólar"),
que estava otimizando o recurso errado.

## Por que o objetivo mudou

`apiKeySource: none` no `system/init` de todos os logs: a geração roda em **assinatura**,
não em API key. Os `$2,63` que os logs reportam em `total_cost_usd` são **equivalente-API
notional**, não saída de caixa. O recurso que se esgota de verdade é a **janela de 5 horas**
— `rate_limit_event: {five_hour, overageStatus: rejected, overageDisabledReason:
org_level_disabled}`. Já houve HTTP 429 por esse limite (log `01KXCEP2PC3ZT`).

Consequência prática, e ela reordena prioridade:

> **A métrica é `turnos × prefixo` — tokens de entrada processados por kit.**
> `--max-budget-usd` é **proxy**, não métrica: ele mede dólar-equivalente, e dólar-equivalente
> pondera output (que é caro em $) acima de input (que é o que consome a janela).

As duas métricas discordam por quase 30×, e a discordância não é acadêmica:

| | agêntico (hoje) | disparo único + 1 revisão | razão |
|---|---:|---:|---:|
| **tokens de entrada** (cache_read + cache_creation) | **4.851.953** | **32.003** | **152×** |
| dólar-equivalente | $2,63 | $0,47 | 5,6× |

Otimizando dólar, o ganho parece 5,6×. Otimizando a janela, é **152×**. É a janela que decide
quantos kits cabem numa madrugada.

## Anatomia do custo de hoje (Techne, `01KZENB3DRDG6S2QX5JM9KVMM9`)

38 turnos reais, 379 s, `$2,6264`.

| componente | tokens | $ | % |
|---|---:|---:|---:|
| cache_read | 4.726.166 | 1,4178 | 54,0% |
| cache_creation (100% TTL 1h, $6/MTok) | 125.787 | 0,7547 | 28,7% |
| output | 28.594 | 0,4289 | 16,3% |
| input fresco | 76 | 0,0002 | 0,0% |
| haiku-4-5 (executor do WebSearch) | 12.123 / 515 | 0,0247 | 0,9% |

**83% é lado-input.** Dos 28.594 tokens de saída, **17.622 (62%) foram raciocínio**, não
entregável. A curva de cache é estritamente monotônica (zero revalidação, 100% de reuso nos
37 turnos seguintes) — **não há nada a consertar no cache**; a razão
`125.787 : 4.726.166 ≈ 1 : 37,6 ≈ num_turns` é o comportamento correto de um laço de 38 turnos.

Frota inteira (18 logs): 423 turnos, $31,68, **47,0 M tokens de entrada para 343 K de saída —
137 tokens relidos por token produzido.**

### O diagnóstico em uma linha

`Write: 4` é constante em 13 dos 14 logs produtivos. Os turnos variam de **13 a 52**.
**O overhead varia 4×; o entregável não varia.**

## M1 — baseline do prefixo do harness

Cinco execuções triviais (`-p "responda apenas: ok"`), medindo
`input + cache_creation + cache_read` do turno 1.

| cfg | configuração | prefixo | Δ | custo de um "ok" |
|---|---|---:|---:|---:|
| a | herda tudo (como hoje) | **80.824** | — | **$0,3479** |
| b | `+ --strict-mcp-config` | 75.994 | −4.830 | $0,3085 |
| c | `+ --disable-slash-commands` | 64.118 | −11.876 | $0,2512 |
| d | `+ --setting-sources "" --tools "" --system-prompt` | **192** | **−63.926** | **$0,0016** |
| e | `--safe-mode` (controle) | 28.835 | — | $0,0262 |

Inventário que produz esses 80.824 (do `system/init`): 150 tools (35 built-in + 115 de MCP),
22 MCP servers (6 conectados, 10 `needs-auth`, 4 `pending`, **1 `failed`**), 282 slash commands,
229 skills, 90 agents, 9 plugins, 11 hooks de SessionStart. **Dos 115 tools de MCP, zero foram
usados** na geração da Techne; das 35 built-in, 8.

Três conclusões:

1. **`--safe-mode` não quebra a autenticação** (rc=0, zero suspeita) — mas **não basta**: para em
   28.835, ainda 150× acima de (d). O peso não está nos hooks nem nos plugins.
2. **O peso está nos schemas das ferramentas built-in + o system prompt default** — os 63.926
   que só caem com `--tools ""` + `--system-prompt`.
3. **MCP custa 4.830, não ~30k.** Os schemas de MCP são deferidos via `ToolSearch`; só os nomes
   entram no prefixo. A estimativa anterior ("115 tools de MCP são a maior parcela") estava errada.

E o número operacional: hoje **qualquer** invocação headless custa **$0,35 e 80.824 tokens de
janela só para dizer "ok"**, antes de qualquer trabalho. É esse piso que é multiplicado por 38.

## M2 — A/B na mesma vaga

Mesma vaga, mesmo `bundle.json`, mesmo `PROMPT.md`. Pontuado por `scripts/measure-kit.ts`, que
roda os mesmos gates do `finalize` **sem escrever no banco** (validado: reproduz exatamente
40% / 52 / 2 páginas do kit agêntico registrado).

| | agêntico | disparo único (pós-F1) | + 1 revisão |
|---|---:|---:|---:|
| turnos | 38 | 1 | 2 |
| duração | 379 s | 114 s | ~230 s |
| tokens de entrada | 4.851.953 | 14.686 | 32.003 |
| output | 28.594 | 12.518 | 17.117 |
| custo (Sonnet 5) | $2,6264 | $0,2871 | **$0,4732** |
| exit | 0 | 3 (2 `[CONFIRMAR:`) | 3 (os mesmos 2) |
| coverage | 40% (12/30) | 30% (9/30) | **43% (13/30)** |
| ATS heurístico | 52/100 | 44/100 | **54/100** |
| páginas | 2 | 2 | 2 |
| truthcheck | 16 citações | 17 | 17 |

**Veredicto: o disparo único sozinho é pior (−10 pp de cobertura, −8 de ATS). Com uma revisão
ele ultrapassa o agêntico (43%/54 contra 40%/52), a 5,6× menos dólar e 152× menos janela.**

Isso confirma que a lacuna do disparo único é exatamente a que a segunda passada endereça — no
agêntico, o ganho de ATS também veio de um laço `finalize → coverage → reescrever`.

## M2b — as três hipóteses viraram medição. Duas confirmaram, uma foi rejeitada

### S1 · `--system-prompt` **substitui**, não acrescenta

| system prompt | prefixo total |
|---|---:|
| curto (~13 tokens) | **206** |
| curto + ~1.400 tokens de texto | 1.647 |

Delta **1.441** para ~1.400 acrescentados. O prefixo é o system prompt e mais nada: **não sobra
texto de harness nenhum** com `--tools ""`. Por isso o perfil usa `--system-prompt` e nunca
`--append-system-prompt`.

### S2 · `--effort low` — REJEITADO. Barato e quebrado

| | default | `--effort low` |
|---|---:|---:|
| custo | $0,2871 | **$0,1634** (−43%) |
| output | 12.518 | 4.272 (−66%) |
| **exit** | 3 (placeholder) | **2 — TRUTHCHECK REPROVOU** |
| coverage | 30% | **20%** |
| ATS | 44 | **36** |

Corta o raciocínio, corta a veracidade junto. **Nenhum perfil de redação usa `effort`**, e o
motivo está escrito em `config/config.yaml` e no teste, para ninguém tentar de novo.

### S3 · A revisão minimal é o maior ganho isolado da rodada

Entrada: só `coverage-report.md` + `resume.md`. Sem bundle, sem perfil, sem JD.

| | revisão com `PROMPT.md` inteiro | **revisão minimal** |
|---|---:|---:|
| prompt | 40.916 chars | **7.218 chars** |
| tokens de entrada | 17.317 | **3.324** (5,2×) |
| custo | $0,1861 | **$0,1131** |
| coverage | 43% (13/30) | **53% (16/30)** |
| ATS | 54/100 | **62/100** |
| truthcheck | ok, 17 citações | **ok, 17 citações** |

Mais barato **e melhor**. O contexto focado ajuda: vendo só o currículo e o gap, o modelo otimiza
exatamente aquilo. E o truthcheck sobrevive sem o perfil no prompt porque a revisão só pode
reformular, reordenar e cortar — as citações já estão no texto que ela recebeu.

### S4 · O cache **sobrevive entre processos** — o TTL de 1h não é desperdício

| | 1º disparo | 2º disparo, prompt idêntico |
|---|---:|---:|
| cache_creation | 14.686 (1h) | 0 |
| cache_read | 0 | **14.686** |
| custo | $0,2871 | $0,2159 |

Isso inverte a hipótese: o `ephemeral_1h` não é queima, é **ativo**. Num lote, o prefixo estável
— `REGRAS` + `profile` + `tracks` + `candidate_facts`, idêntico em toda vaga — é escrito uma vez
e lido a $0,30/MTok em vez de $6/MTok. **É exatamente o que a reordenação de chaves do F1
habilitou**, e agora está medido em vez de suposto. Não há flag de TTL na CLI; não precisa.

## O caminho recomendado, medido ponta a ponta

| via | turnos | tokens de entrada | custo | coverage | ATS |
|---|---:|---:|---:|---:|---:|
| agêntico (hoje) | 38 | 4.851.953 | $2,6264 | 40% | 52 |
| **disparo único + revisão minimal** | **2** | **18.010** | **$0,4002** | **53%** | **62** |

**6,6× mais barato em dólar · 269× em janela · +13 pontos de cobertura · +10 de ATS.**

Ambos param em exit 3 pelos mesmos 2 `[CONFIRMAR:` — pretensão salarial (prescrita pelo próprio
fato) e escolaridade (indefinida de verdade). O primeiro é o que a fase F4 resolve.

## Não-regressão v2 (2026-08-08) — 5 de 5 pares, **REPROVOU de novo**

F4 ativa, paridade corrigida, amostra completa. Critério: nenhuma vaga perde mais de 5 pontos de
cobertura; zero reprovações novas de truthcheck.

| vaga | cobertura | ATS | exit | `[CONFIRMAR:` | pág |
|---|---|---|---|---|---|
| LMG Staffing — AI-Assisted SW Engineer | 57% → **50%** | 66 → 60 | 0 → 0 | 0 → 0 | 2 → 2 |
| Hospital Care — Engenheiro de IA `[STALE: --out não preservado]` | 20% → **13%** | 36 → 30 | **0 → 3** | 0 → 1 | **2 → 3** |
| Techne — Analista de Chatbot Junior | 30% → 30% | 44 → 44 | 0 → 0 | 0 → 0 | 2 → 2 |
| TSA — Analista de Automação | 30% → **33%** | 44 → 46 | 0 → 0 | 0 → 0 | 2 → 2 |
| Unimed — Fluxo Conversacional | 50% → 50% | 60 → 60 | 0 → 0 | 0 → 0 | 2 → 2 |

**Veredicto: reprovado.** Duas vagas caem 7 pontos. `--via` continua obrigatória e `agentic`
continua o caminho validado. **Nada foi consertado** — a distinção entre defeito de transcrição e
afinação de termômetro é do operador.

### O que MELHOROU, e prova que a rodada anterior valeu

- **A Techne junior foi de −13 para 0.** Era a vaga que reprovou na v1, e a causa diagnosticada
  (eco do título perdido na destilação) estava certa: corrigida a paridade, a regressão sumiu.
- **F4 funcionou em 5 de 5.** Nenhum `[CONFIRMAR:` de pretensão salarial em nenhuma vaga. O único
  marcador sobrevivente é de **escolaridade** — a vaga exige superior completo e a formação está
  em curso. É indecisão real, não falha do redator.
- **4 de 5 vagas mantiveram ou melhoraram** cobertura e ATS.

### Por que as duas caíram — fatos, sem interpretação

**LMG Staffing** (57% → 50%, resume 5.750 → 5.899 ch, 2 páginas nas duas):

| | keywords |
|---|---|
| perdidas pelo cli | `context protocols`, `mcps`, `model context`, `protocols mcps` |
| ganhas pelo cli | `accelerate development`, `front end` |

As quatro perdidas são **fragmentos de um único termo** — "Model Context Protocols (MCPs)" —
contado quatro vezes pelo n-grama. O currículo agêntico mencionava MCP e o novo não.
**A pergunta que decide é se MCP tem fato que o sustente no perfil**, e ela é do operador: o
truthcheck é referencial, não semântico, então ele aprovaria o termo mesmo num bullet cujo fato
citado não fala de MCP.

**Hospital Care** (20% → 13%, resume 4.977 → **6.854 ch**, 2 → **3 páginas**) —
**`[STALE: --out não preservado]`**. Estes números são da v2 (2026-08-08, medida original), não
recomputados desde então: o diretório `--out` da variante `--via cli` era scratch e não
sobreviveu à sessão que fechou a Fase 0 (2026-08-08, sessão seguinte). O achado de causa (palavras
genéricas, não sobreposição de n-grama — ver `KNOWN-BUGS.md`) foi verificado batendo as 4
keywords perdidas contra o algoritmo corrigido, e elas não mudam — mas isso prova só que a CAUSA
do −7 não é a que o `extractKeywords` corrigiu, não prova que o −7 continua −7 sob o critério
novo. Recompute-lo exige regerar o kit `--via cli` de novo — o preço de ter deixado o `--out`
em scratch da primeira vez.

| | keywords |
|---|---|
| perdidas pelo cli | `back end`, `dados`, `end`, `engenharia` |
| ganhas pelo cli | `artificial`, `inteligencia artificial` |

`back end` / `end` é o mesmo fragmento contado duas vezes; `dados` e `engenharia` são palavras
genéricas. O marcador que a levou a exit 3:

> `[CONFIRMAR: a vaga exige Ensino Superior Completo em Ciência da Computação, Engenharia de
> Software ou correlatas; minha formação atual é Tecnólogo em Gestão da TI, cursando, conclusão
> prevista para 06/2027 — favor confirmar se este requisito é eliminatório]`

### As 3 páginas voltaram — n=2 agora, e o orçamento não cobre o primeiro disparo

O orçamento de tamanho que entrou na rodada anterior vive **só no prompt da revisão**. As `REGRAS`
do primeiro disparo limitam bullets ("3–6, 1 linha cada") mas **não têm alvo de página**. Aqui o
currículo saiu com 6.854 caracteres — o maior já medido — e cruzou para 3 páginas.

Registrado, não corrigido. Com n=2 (Techne+F4 e Hospital Care) já não é acidente, mas a decisão de
onde o limite mora — prompt do primeiro disparo, ou gate no `finalize` — é do operador.

### O `rescore --commit` autorizado NÃO foi executado

Ele estava contaminado por uma mudança minha da rodada anterior: eu adicionei 30 keywords de
portfólio (`otimização de custo`, `melhoria contínua`, `observabilidade`…) à trilha `ai-builder`,
que é **vocabulário de MATCHING**, não de redação. Efeito medido:

| | vagas alteradas | entram na fila | maior delta |
|---|---:|---:|---:|
| com as 30 keywords | 200 | **12** | +26,0 |
| sem elas | — | **0** | **−0,3** |

Uma das que entravam era `ANALISTA FINANCEIRO (MELHORIA CONTÍNUA E QUALIDADE)` — falso positivo
puro, CLASSE-01 forma B. As keywords foram revertidas da trilha (guardadas em
`tracks.COM-keywords-portfolio.yaml`); os **fatos** do perfil, que é o que o operador pediu para
os currículos falarem de melhoria e economia, continuam lá.

Sem elas o `rescore` é **no-op**: 0 entram, 0 saem, delta máximo −0,3 (decaimento de preferências).
Não foi commitado porque `--commit` sobrescreve `score_previous`, a linha de base do rescore de
elegibilidade que já rodou — gravar 298 linhas para aplicar ±0,3 de ruído destruiria essa
proveniência por nada.

### Custo de segunda ordem, de novo: 2 das 5 vagas originais seguem bloqueadas

`E — Analista de Automação` (86,5) e `10x Advisory` (82,2) continuam com modalidade pendente — são
decisão humana, e a checagem prévia (que esta rodada fez antes de medir, como combinado) as pegou
antes de queimar geração. Foram substituídas por **LMG Staffing** e **Hospital Care**, ambas com
kit agêntico, ambas desbloqueadas, ambas de engenharia de IA. A amostra é 5, mas não é a mesma 5.

### Um bug meu que o próprio guarda pegou

O `variant-guard` bloqueou a medição inteira: `kit generate --out` escrevia os 4 arquivos num
diretório de trabalho **sem copiar o `bundle.json`**, e sem ele não dá para saber que variante o
redator recebeu. O guarda estava certo e o encanamento errado — corrigido para o `--out` levar o
bundle junto. Um kit que não carrega seu bundle não é auditável depois, que é exatamente o ponto
do guarda.

### Lição operacional: `--out` de comparação de não-regressão nunca mais em scratch

Os diretórios `--out` desta rodada (LMG, Hospital Care e os outros três pares) não sobreviveram
à sessão seguinte — eram scratch, não um lugar persistente. Consequência medida na sessão de
2026-08-08 que fechou a Fase 0: o achado da Hospital Care (−7 pontos) não pôde ser recomputado
sob o algoritmo de `extractKeywords` corrigido, só a causa pôde ser verificada indiretamente
(ver `KNOWN-BUGS.md`, e o `[STALE]` na tabela acima). Regenerar os 5 kits `--via cli` do zero é
o preço de ter jogado o `--out` fora — e é exatamente o custo que gravar num diretório persistente
em disco (ex. `output/_non-regressao/<data>/` — já gitignorado por carregar JD e currículo reais,
como todo `output/`, então não é um commit novo, só um caminho que sobrevive ao fim da sessão)
teria evitado. Da próxima vez que rodar uma comparação `--via cli` × `--via agentic` para decidir
o default, o `--out` grava em lugar que sobrevive à sessão, sempre.

## O que o critério de aceite NÃO prova

`coveragePct` e `atsScoreHeuristic` são heurísticas **deste** sistema. O coverage sai de
`extractKeywords`, frequência de n-grama pura — no JD da Stefanini, 13 das 30 "keywords" eram
texto institucional (REQ-002). Usar isso como critério é aceitável e insuficiente, e a
assimetria importa:

- **Serve como alarme de regressão grande.** A queda de 13 pontos na Techne junior apontou para
  uma causa real — uma regra perdida na destilação do prompt. O sinal foi verdadeiro apesar do
  ruído.
- **Não serve como placar de melhoria fina.** Quando o caminho novo ganhar por 3 pontos, esses 3
  pontos não querem dizer nada — cabem dentro do ruído que o próprio `extractKeywords` injeta.

Por isso o critério só pode ter a forma **"não pode piorar muito"**, nunca "tem de melhorar
tanto". A nota longa vive junto do código que calcula os números, em `scripts/measure-kit.ts`.

## Um custo de medição que eu não previ: o gate de modalidade encolhe a amostra

A não-regressão pediu 5 vagas e rodou 3. `E — Analista de Automação` e `10x Advisory` foram
recusadas pelo `prepare` com **exit 5** — modalidade não confirmada.

**O gate agiu certo:** recusar antes de gastar é exatamente o que ele existe para fazer, e é a
mesma regra que evita escrever carta aceitando um cargo presencial em São Paulo. Mas ele tem um
efeito de segunda ordem que ninguém previu: **vagas pendentes de decisão humana também não podem
ser medidas.** Uma amostra de 3 não decide troca de default.

Registrado como custo real, não como defeito. A consequência operacional é que qualquer medição
comparativa precisa checar a modalidade das vagas da amostra **antes** de começar, senão a
amostra encolhe no meio.

## O gargalo do exit 5, atacado na origem — medido, não prometido (Fase A da vigilância)

O parágrafo acima é o sintoma: `E — Analista de Automação` e `10x Advisory` caíram em exit 5
porque a modalidade nunca foi extraída na coleta (LinkedIn e `/vaga <url>` não extraem
`remote_type` — ver `src/core/modality.ts`). A vigilância por empresa (Gupy, Fase A,
2026-08-09) ataca essa causa, não o sintoma: **782 vagas efetivas coletadas de Localiza+Algar,
782 com `workplaceType` estruturado — 100%, zero inferência.**

| | valor |
|---|---:|
| vagas efetivas coletadas | 782 |
| com modalidade estruturada na origem | **782 (100%)** |
| distribuição | remote 10 · hybrid 80 · on-site 692 |

Medido em duas empresas reais, não prometido a partir de "ATS costuma expor modalidade" — a
premissa original da Fase A era mais fraca do que o resultado. Para vagas capturadas por este
caminho, o exit 5 deixa de ser um risco: a resposta "isso é remoto?" já vem no board, antes de
qualquer `kit prepare`. Não generaliza sozinho para outros ATS (Greenhouse/HTML entram na Fase
B, cada um com sua própria taxa a medir) — este número vale para Gupy especificamente.

**O outro lado da mesma medição, que não é boa notícia**: o filtro léxico título+departamento
que decide o que passa pra dentro do funil teve recall de **2/782 (0,3%)** — não "baixo", quase
zero. A assimetria de erro importa mais que a taxa: falso positivo custa um `scoreJob` (~nada);
falso negativo custa a vaga inteira, que é a única coisa que a feature existe para não perder.
Registrado em `KNOWN-BUGS.md` (ACHADO-11) como filtro calibrado na direção errada — correção não
feita nesta sessão; a pergunta certa para a Fase B não é "como melhorar o filtro", é se o filtro
pré-insert deveria existir, dado que `scoreJob`/`decidePolicy` já são um classificador melhor
que keyword match e o volume (782/poll) é trivial para o pipeline absorver sem filtro nenhum.

## Não-regressão (F2) — **REPROVOU**. O `--via=cli` não virou default

Critério do operador, em código: nenhuma vaga pode piorar mais de **5 pontos de cobertura**, e
**zero reprovações novas de truthcheck**. Uma vaga boa não autoriza troca de padrão.

**A amostra pretendida eram 5 vagas; saíram 3.** Duas (`E — Analista de Automação` e
`10x Advisory`) foram recusadas pelo `prepare` com **exit 5**: modalidade não confirmada. O gate
funcionou como projetado — mas encolheu a amostra, e isso é parte do resultado.

| vaga | cobertura | ATS | exit | `[CONFIRMAR:` | páginas |
|---|---|---|---|---|---|
| unimed — fluxo conversacional | 50% → 50% | 60 → 60 | 0 → 3 | 0 → 1 | 2 → 2 |
| tsa — analista de automação | 30% → **43%** | 44 → **54** | 0 → 3 | 0 → 2 | 2 → 2 |
| techne — chatbot junior | 30% → **17%** | 44 → **34** | 0 → 3 | 0 → 1 | 2 → 2 |

**Veredicto: reprovado por −13 pontos na Techne junior.** `--via` passou a ser **obrigatória**,
sem default, e `agentic` continua o caminho validado.

### Por que a Techne junior caiu — e por que isso acusa a métrica também

As 5 keywords que o caminho novo perdeu: `analista`, `junior`, `chatbot junior`, `areas`,
`organizacao`. Ganhou `assistentes virtuais`.

- **Três são o título da vaga.** O agêntico ecoa o título no Resumo porque `SKILL.md:61` manda
  ("título do Resumo sintonizado com o título da vaga"). As `REGRAS` destiladas em
  `portable-prompt.ts` só dizem "2-3 linhas ajustadas ao título da vaga" — mais fraco, e o
  modelo não ecoou. **Essa é uma deficiência real e barata de corrigir no prompt portátil.**
- **Duas são ruído institucional** (`areas`, `organizacao`) — REQ-002, `extractKeywords` é
  frequência de n-grama pura, já registrado no `KNOWN-BUGS.md`.

Ou seja: 4 dos 5 pontos perdidos são eco de título e ruído, e o único ganho é substantivo. A
correção do prompt é legítima, mas re-medir depois de ajustar **para a métrica** exige o aval do
operador — senão vira otimização do termômetro.

### O que a comparação mostrou de graça: o exit 0 → 3 em TODAS as três

Nenhuma reprovação nova de truthcheck (essa metade do critério passou). Mas as três vagas saíram
de exit 0 para exit 3, com 1–2 `[CONFIRMAR:` cada. **O exit 0 do agêntico vinha, em parte, de o
modelo ir pesquisar o que faltava** — pretensão salarial, sobretudo. O disparo único marca em vez
de pesquisar, que é o comportamento correto e é exatamente o que a fase **F4** (passo de busca
salarial separado) endereça. Sem F4, nenhuma via sem web fecha em exit 0.

### Custo medido nas três

| vaga | disparo | revisão | total | entrada |
|---|---:|---:|---:|---:|
| unimed | $0,2707 | $0,0828 | $0,3536 | 16.104 tok |
| tsa | $0,3377 | $0,1546 | $0,4923 | 16.330 tok |
| techne junior | $0,3251 | $0,0952 | $0,4203 | 16.772 tok |

A revisão **subiu a cobertura nas três** (37→50, 33→43, 10→17) e a regra "compara e fica com o
melhor" nunca precisou descartar. Média ~$0,42 e ~16,4k tokens de entrada por kit, contra
$1,96 e ~2,4M do caminho agêntico.

## A varredura de paridade SKILL.md × REGRAS — 5 regras perdidas, não 1

O eco do título era **defeito de transcrição**, não afinação de métrica: o `SKILL.md:63` já
prescrevia ("título do Resumo sintonizado com o título da vaga") e a destilação enfraqueceu para
"ajustadas ao título". O teste é se a correção seria aprovada sem olhar o resultado da Techne —
seria, porque as duas frases deveriam dizer a mesma coisa e não diziam.

A varredura item a item achou mais quatro, e **a pior não aparecia em cobertura nenhuma**:

| regra do `SKILL.md` | estado nas `REGRAS` | gravidade |
|---|---|---|
| `variant` A/B (metric-first × role-first) | **ausente** | **alta** — o caminho novo ignorava a variante e contaminava o experimento de conversão do /painel, sem sintoma visível |
| trilha / `track_hint` / bloco `tracks` | **ausente** | alta — o bundle carrega `tracks` e as REGRAS nunca mencionavam |
| eco do título da vaga no Resumo | enfraquecido | média — os 13 pontos da Techne junior |
| "sem jargão interno que o recrutador não conhece" | ausente | baixa |
| "STAR NÃO é para o currículo" | ausente | baixa |

**O que NÃO foi tocado:** `areas` e `organizacao`, as outras duas keywords perdidas. São ruído
institucional do `extractKeywords`. Ajustar o redator para capturá-las seria escrever para o
termômetro — o defeito está no termômetro (REQ-002).

O guarda durável é `tests/unit/paridade-prompt.test.ts`: uma tabela de contrato item a item, com
veredicto explícito em cada linha (compartilhado × divergência declarada com motivo). Tem
controle positivo, e foi verificado contra a versão anterior do arquivo — teria reprovado as
cinco, e o item de controle estava presente nos dois textos.

## F4 — a busca de faixa salarial como passo próprio, e o que ela desbloqueou

`npx tsx src/cli/salary.ts <job_id>` roda **uma** busca no perfil `salario` e grava
`salary-research.json` no kit_dir; o `prepare` seguinte o inclui no bundle.

Duas descobertas na implementação:

1. **`--tools` e `--allowedTools` são coisas diferentes e as duas são necessárias.** Com só
   `tools: [WebSearch]`, o modelo tentou buscar duas vezes e as duas voltaram em
   `permission_denials` — `--tools` diz o que EXISTE, `--allowedTools` diz o que é PERMITIDO, e
   com `isolate_settings` não há allowlist herdada de lugar nenhum.
2. **A degradação funcionou por acidente antes de funcionar de propósito.** Na execução com
   permissão negada, o modelo respondeu `FAIXA: Não disponível` e o comando devolveu erro dizendo
   que o kit sairia com `[CONFIRMAR:` — que é exatamente o comportamento correto. Nenhum número
   inventado chegou perto de um formulário.

Resultado medido na Techne, com F4 ativa: **exit 0**, coverage 47%, ATS 58, contra exit 3 antes.
Custo da busca: **$0,0839**. O kit saiu com **3 páginas** (era 2) — informação, não gate, mas
vale olhar em vaga de entrada.

## As 3 páginas — medido, e nenhuma das duas hipóteses estava certa

| via | páginas | resume.md | answers.md |
|---|---:|---:|---:|
| agêntico (n=6) | **2** em 6/6 | 4.836–5.553 ch | 2.591–4.046 ch |
| cli (n=4) | **2** em 4/4 | 5.010–5.730 ch | 1.992–3.265 ch |
| cli + F4 (n=1) | **3** | **6.035 ch** | 2.446 ch |

**Não é padrão do caminho novo** — 4 de 4 kits do `--via=cli` saíram com 2 páginas. **E não é a
pesquisa salarial inflando o `answers.md`** — o `answers.md` daquele kit é o *menor* dos três da
mesma vaga, e `pages` conta só o `resume.pdf`.

A causa é outra e é da mesma família das anteriores: **o prompt da revisão não carregava nenhum
orçamento de tamanho.** As `REGRAS` dizem "1 linha por bullet (máx. 2), 3–6 bullets"; o prompt da
revisão, que é uma terceira destilação, não repetia. Aquele kit foi o que a revisão mais subiu
(27% → 47%, o maior ganho do conjunto) e o texto extra cruzou a quebra de página — em torno de
~5.800–6.000 caracteres.

Ou seja: **a revisão otimizava cobertura sem saber que páginas existem.** Corrigido com o
orçamento explícito no prompt (2 páginas, e "se precisar de espaço, CORTE o bullet menos
relevante — não acrescente"), e `tests/unit/paridade-prompt.test.ts` passou a cobrir também esse
terceiro texto.

**Não virou gate.** n=1, e a correção é no redator, não no portão. Fica para re-medir na próxima
não-regressão: se 3 páginas reaparecer com o orçamento no prompt, aí sim vira gate.

## Correções de números que circularam antes desta medição

| afirmação anterior | medido | onde apareceu |
|---|---|---|
| "cache read 13.293.018, 97% do custo" | **4.726.166, 54%** (83% é lado-input) | `src/core/portable-prompt.ts:15-20`, corrigido |
| "279 tools, 19 MCP servers, ~61k de prompt" | **150 tools, 22 MCP, 80.824 de prefixo** | conversa |
| "o custo inclui subagentes" | **zero `Task` em todos os 18 logs** | conversa |
| "o cache está sendo revalidado" | **monotônico, zero revalidação** | brief |
| "M1 custa ~$0,20" | **$0,94** (não contei cache write de 80k a $6/MTok) | plano |
| "disparo único ~$0,09–0,17" | **$0,2871** (output 4× maior que o projetado) | plano |
| `PROMPT.md` ≈ chars/4 tokens | **chars/2,6** — subestimava 54% | `src/cli/kit.ts` |

## Custo total desta rodada de medição

$1,86 (M1 $0,94 · M2 opus acidental $0,45 · M2 sonnet $0,29 · revisão $0,19).
