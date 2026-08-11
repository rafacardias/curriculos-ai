# Roadmap — o que ficou fora da Onda 1

Escrito no fechamento da Onda 1 (2026-08-06). Cada item traz a evidência medida que o
justifica, para que a priorização futura não precise redescobrir nada.

Ordem: os dois primeiros são **bloqueadores** de outros itens. O resto está ordenado por
(dor medida ÷ risco).

---

## 1. BUG-007 — taxonomia de motivo no `/feedback` · BLOQUEADOR

Ver `KNOWN-BUGS.md` BUG-007 para a evidência completa. Em uma frase: o `/feedback` só sabe
registrar "rejeitar", então elegibilidade ("não me qualifico") foi gravada como preferência de
tópico ("não gosto disto"), e o componente aprendeu a punir as trilhas e o nível do próprio
operador — `kw:qa` −7.65, `kw:product manager` −9.50, `seniority:junior` −1.90.

**Estado:** componente desarmado (`scoring.preference: 0`), 98 chaves preservadas no banco.

**Bloqueia:** o item 2 (barreira de entrada) e qualquer religamento do `preference`.

**Escopo:** motivo de vocabulário fechado (`nao_elegivel` · `fora_do_tema` · `senioridade` ·
`remuneracao` · `empresa`); só `fora_do_tema` e `empresa` alimentam `preference_weights`;
`source:*` deixa de ser chave aprendida; migration aditiva para a coluna de motivo. (A taxonomia
efetivamente implementada colapsou pra 3 valores — `elegibilidade`/`tema`/`outro` — não os 5
listados acima; ver `KNOWN-BUGS.md` BUG-007 "Estado — PARCIALMENTE CORRIGIDO".)

**Aceite — original:** ~25 decisões de `ai-builder` com motivo registrado. Não as 48 rejeições
atuais (na época) — 41 delas eram de `product` e 0 de 95 vagas `senior` chegaram a ser vistas pelo
operador.

**Aceite — revisado 2026-08-10, corrigido no mesmo dia (a primeira revisão errou o diagnóstico):**
a primeira leitura desta nota dizia que a UI trata `reason_class` como opcional e que isso explicava
40 dos 45 eventos de `ai-builder` sem motivo. **Errado** — checado contra `git log` e o dado por
timestamp: `src/server/app.html` (linha ~516) já bloqueia a rejeição com um prompt obrigatório de
classe desde o commit `f9378e6` (2026-08-07T12:29-03:00, "reason class decides whether the score
learns"). Os 12 rejeições de `ai-builder` sem `reason_class` são **legado pré-fix** — as mesmas 12
da "recaída" já documentada em `KNOWN-BUGS.md` BUG-007 (5× "Hibridas em outras cidades", 5×
"presenciais em outros estados...", 2 isoladas), já estornadas por
`scripts/revert-eligibility-feedback.ts`. Desde o fix, **0 de 6 rejeições em qualquer trilha
ficaram sem `reason_class`** — captura na UI funciona.

O bloqueador real, com o dado limpo (só pós-fix, 2026-08-07T15:29Z em diante): **16 decisões de
`ai-builder`** (11 aprovações + 4 `elegibilidade` + 1 `tema`), não as 36 que a primeira revisão
contou — aquele número confundia `status='queued'` (vaga na fila, sem feedback nenhum ainda) com
"decisão registrada". Abaixo do aceite de ~25, e com um desbalanço que o aceite original não
previa: das decisões que de fato MOVEM peso (aprovação sempre aprende; só `tema` aprende na
rejeição), é **11 positivas contra 1 negativa** — amostra útil pra validar uma reativação de
`preference` precisa de mais rejeição temática, não só mais volume total. **O bloqueador é tempo/
volume de decisão real, não captura** — a UI já captura corretamente desde 08-07.

## 2. Componente de barreira de entrada (ex-1.2d)

Cortado da Onda 1 com evidência, não por falta de tempo. Os dois sinais especificados são
**anti-discriminantes**: anos em número dispara em 8% das rejeitadas contra 11% das enfileiradas
(0.78×), diploma obrigatório em 21% contra 25% (0.83×). O que discrimina é o fraseado
qualitativo — `"vivência em"`, `"experiência prévia"` — a 1.75–1.83×, mas ele também dispara em
**51% das vagas que o operador aprovou**, então não pode ser filtro duro.

`detectRequiredYears` cobre 10% do acervo por limitação estrutural, não por parametrização (ver
`KNOWN-BUGS.md` ACHADO-02). Ampliar exige NLP de requisito qualitativo.

**Depende do item 1:** sem motivo capturado na rejeição, qualquer extração retroativa é chute com
aparência de dado. Insumo de desenho da taxonomia: `docs/labels-onda1-amostra.md`.

**Desenho que a medição sustenta:** penalidade graduada + requisito **exibido na fila**. Não
filtro duro.

### Pergunta aberta acoplada: o peso de `location_fit` está subdimensionado?

Medido no 1.3: `location_fit` mudou em 252 vagas e a composição da fila não se moveu (41 → 40
vagas, 9 → 9 de MG, as mesmas 13 remotas internacionais sem elegibilidade). **Isso não é falha do
1.3 — é a aritmética funcionando como configurada:** com peso 0.15, o componente vale no máximo 15
de 100 pontos, e deslocá-lo em 6 não reordena uma fila cuja variância é dominada pelo
`keyword_overlap` de peso 0.65.

A pergunta é se 0.15 reflete o peso real da localização na decisão do operador. Evidência a favor
de que não: **2 das 15 rejeições rotuladas à mão foram por localização** ("híbrido em Porto
Alegre", "presencial") — 13% de uma amostra pequena, contra 15% do score.

**Não mexer agora.** Subir o peso com base em 2 casos de 15 é a mesma classe de erro que produziu o
BUG-007: inferir um peso de pouquíssimo sinal. A decisão vem **depois** do BUG-007, quando
`nao_elegivel` e localização forem motivos distintos e contáveis. Aí o peso é medível, não
chutado.

**Nota, registro não autorização:** com a variante de busca por BH (item novo abaixo, dependente
do item 4) entrando, vaga presencial local passa a chegar na fila — hoje isso praticamente não
acontece, porque o acervo é majoritariamente remoto/fora de BH. Isso torna a pergunta acima
**mensurável**: vai existir vaga de BH na fila pra comparar contra as rejeições por localização (2
de 15 na amostra rotulada à mão). O peso continua intocado; a decisão continua vindo depois do
BUG-007. Isto só registra que a pré-condição de medir ("ter vaga de BH na fila") deixa de faltar.

## 3. Configuração de busca para a trilha `ai-builder`

**A dor medida que resta.** Na fila calibrada, 30 das 40 vagas são de `product` e **5 são de
`ai-builder`** — a trilha-alvo. As `searches` em `config/config.yaml` são majoritariamente de
Produto, herdadas de quando essa era a trilha.

Nenhum ajuste de score corrige uma fila que nunca recebeu as vagas certas.

> **Este item é do operador, não do sistema.** As queries são escritas pelo Rafael — o que ele
> quer buscar não é inferível do código, e nenhuma heurística deve adivinhar. O trabalho aqui é
> editar `searches:` em `config/config.yaml`. Depois disso, `rescore --commit` torna o efeito
> visível no acervo já coletado, e uma busca nova traz o resto.

Dado que ajuda: `ai-builder` é a trilha **mais acessível** do acervo (62% sem barreira de
entrada, contra 35% de `product`) — ver `KNOWN-BUGS.md` ACHADO-01.

## 4. Item 1.5 — `AdapterCapabilities` e filtro cliente único · **FEITO (2026-08-11)**

> **Implementado.** `AdapterCapabilities` declarado pelas 5 fontes, `applyClientSideFilters`
> (`src/core/search-filters.ts`) aplicado uma única vez em `runSearch`, `limit` acrescentado ao
> `SearchSpec` e repassado, e a divergência CLI×UI do `doSearch` fechada. O que nenhuma camada
> resolveu vai para `search_runs.per_source.ignored` em vez de sumir — é isso que torna "nenhum
> adapter ignora em silêncio" verificável. O teste que congelava o bug foi invertido; a política
> para modalidade ausente (`unknownRemoteType`) é parâmetro obrigatório e nomeado, com teste dos
> dois lados. Ver `KNOWN-BUGS.md` → `ACHADO-18` e `ACHADO-19`.


`remote_only` é configuração morta: existe no YAML, no `SearchSpec`, no `SearchParams`, é
editável na UI, e **0 de 5 adapters a desestrutura**. `location` só é lido pelo `linkedin-guest`;
`limit` é aceito na assinatura e nunca repassado pelo pipeline.

Interface já congelada no plano: `AdapterCapabilities` declara o que a fonte resolve no servidor,
e `applyClientSideFilters` é a implementação **única** do resto — para 5 adapters não divergirem
em 5 noções de "remoto".

Congelado em `tests/unit/adapters-remote-only.test.ts`, que assere que ligar e desligar
`remoteOnly` produz a mesma URL e o mesmo conjunto de vagas.

**Matriz medida ao vivo em 2026-08-11** (`KNOWN-BUGS.md` → ACHADO-18), a mesma investigação que o
ACHADO-08 original chamava de "escopo maior que o pedido" — deixou de ser escopo desconhecido:

| fonte | resolve `location` no servidor | resolve `remote_only` no servidor |
|---|---|---|
| gupy | sim — `&city=<nome da cidade>` | sim — `&workplaceType=remote` |
| linkedin-guest | sim — `location=` (já usado hoje) | não — `f_WT` é ignorado pela fonte |
| remotive / remoteok / wwr | não | não se aplica — board 100% remoto por construção |

Consequência direta pra `AdapterCapabilities`: Gupy declara os dois filtros como server-side;
LinkedIn declara só `location`; os três boards remotos não declaram nenhum (não precisam —
`applyClientSideFilters` não tem o que filtrar num board já 100% remoto). O trabalho de
implementação passa de "investigar 5 APIs" para "codificar 3 respostas já conhecidas".

## 5. Item 1.4 — alerta de fonte morta · **FEITO (2026-08-11)**

> **Implementado.** `src/db/repo/search-runs.ts` lê o histórico; `/status` (`queue.ts --digest`) e
> a UI mostram `⛔ fonte morta` para quem falhou nas 2 últimas corridas seguidas **em que
> participou**. A janela é por fonte, não por linha de `search_runs` — o porquê está no
> `ACHADO-20`, e contar em linhas brutas teria feito o alerta nunca disparar para gupy/linkedin.


Erro de adapter é gravado em `search_runs.per_source` e **nunca alertado**. Escopo: leitura de
`search_runs` no `/status` e na UI.

**Correção de evidência, 2026-08-11** — a versão anterior desta nota dizia "o LinkedIn **está** com
timeout há 3 buscas". Conferido contra `search_runs`: os timeouts do LinkedIn são todos de
**2026-07-13** (4 corridas seguidas, `errors: ["timeout 30000ms"]`, uma delas com `0 vagas —
provável bloqueio anti-bot`). Na corrida mais recente com a config cheia (2026-08-09T01:24, 13
entradas) o LinkedIn respondeu nas 7 entradas PT, 8 a 10 vagas cada, sem erro. **A fonte se
recuperou sozinha e ninguém soube de nenhum dos dois lados do episódio** — nem da queda, nem da
volta.

Isso não enfraquece o item, reforça: o episódio de julho é a evidência de que o alerta faltava, e o
fato de ter passado de desatualizado a corrigido só por alguém abrir o banco à mão é a evidência de
que continua faltando. O que muda é o tempo verbal — evidência histórica, não estado atual.

## 6. Dedup por similaridade de título

O dedup é hash exato de empresa+título+local, então "Analista QA Jr" ≠ "Analista de QA Júnior".
Caso concreto medido: 17 vagas da LawnStarter que são 3 vagas reais. Escopo: segundo estágio de
trigram/Jaccard **dentro da mesma empresa**, mantendo o fingerprint exato como primeiro estágio.

## 7. BUG-002 — fallback morto do `keyword_overlap`

Mitigado por efeito colateral, não corrigido: o piso caiu de 41.5 para 39.5 e passou para baixo
do `queue_threshold`. Uma vaga sem nenhuma trilha no banco ainda ganha **19.5 pontos de aderência
que não existem**. A margem é de 0.5 ponto — baixar o threshold para 39 ressuscita o bug inteiro.

## 8. Qualidade de dado — `posted_at`

Uma vaga com 1276 dias de idade (`KNOWN-BUGS.md` ACHADO-03). Não afeta o score depois do
`recency_floor`, mas contamina qualquer análise de frescor.

## 9. BUG-004 — `runEasyApply` não persiste em `submissions`

Candidatura via LinkedIn Easy Apply não deixa linha na tabela, então não aparece em
`/submeter --pending` nem no warehouse. Deliberadamente sem cobertura: só observável com browser
real e sessão logada.

## 10. Quebra do god file `src/server/index.ts`

537 linhas com 5 `as any` na fronteira DB→UI. A extração mínima de `ws-auth.ts` (Onda 0.8) foi
deliberadamente cirúrgica e **não** é este refactor.

## 11. Variantes de busca por geografia/modalidade · **FEITO (2026-08-11)**

> **Implementado e medido.** `config/config.yaml` passou de 13 para 20 entradas: por termo PT, uma
> variante `Belo Horizonte` (qualquer modalidade) e uma `Brazil` (`remote_only: true`); os 6 termos
> EN seguem intactos. Critério aplicado antes de commitar o config: ≥10 vagas de BH inéditas —
> medido 47, depois de descontar as 14 que eram artefato de paginação (`ACHADO-19`). O ganho da
> Gupy foi **zero** e ela fica na variante mesmo assim, só pelo caso em que o termo satura
> `limit=50` (1 dos 7 termos hoje).
>
> **Resultado da primeira corrida real (2026-08-11T21:45Z, 20 entradas): 236 vagas novas, 109
> delas em BH/RMBH.** O acervo tinha 49 vagas com BH/MG no `location` antes; passou a 126 só com
> "Belo Horizonte". Zero timeout, zero erro de adapter. Runtime 132,4s contra 53,0s da corrida de
> 2026-08-09 com 13 entradas — 2,5×, dentro do aceitável, e a regra de corte ("cortar termo PT
> antes de cortar variante") não precisou ser usada.
>
> **A previsão da medição bateu na produção**: a variante BH pela Gupy trouxe **6 vagas e 0 novas**
> — exatamente o zero que a sondagem previu. O ganho inteiro veio do LinkedIn, e a maior parte dele
> vem de paginar (`ACHADO-19`), não da geografia. Se um dia o custo de runtime apertar, a Gupy da
> variante BH é a primeira coisa a cair, não o termo.


Pedido do operador: dois recortes por termo de busca — **fora de Belo Horizonte só remoto; em BH
presencial, híbrido e remoto**. Hoje `config.yaml → searches[]` só tem uma entrada por termo, sem
esse split.

**DEPENDENTE do item 4 (`AdapterCapabilities`).** `remote_only` é lido por 0 de 5 adapters e
`location` só pelo `linkedin-guest` (ACHADO-08) — então, hoje, duas entradas de config com
recortes diferentes (uma "fora de BH, remoto"; outra "BH, qualquer modalidade") devolveriam
exatamente o mesmo conjunto bruto de cada fonte, e a dedup por `jobFingerprint` absorveria a
duplicata em silêncio, sem erro visível. Construir a variante antes do item 4 é construir uma UI
que não filtra nada — o mesmo buraco que o ACHADO-08 já documentou, só que com uma segunda config
apontando pra ele.

**O que esta feature não é**: o filtro "BH aceita qualquer modalidade, fora de BH não" **já
existe** na camada pós-coleta — `blocksGeneration` em `src/core/modality.ts:107-128` e
`exclude_onsite_outside_home_uf` em `src/core/scoring.ts:244`, com `config/locality.yaml → base` =
Belo Horizonte/MG. Essa camada já decide, para uma vaga que chegou ao acervo, se ela pode virar
kit. O que as variantes de busca compram é **recall** — fazer a vaga presencial de BH *chegar* ao
acervo antes de qualquer filtro pós-coleta rodar —, não um filtro novo.

---

## Onda 2 — geração (a segunda dor declarada)

A dor é "o kit gerado não convence". Escopo levantado no recon, ainda não iniciado:

- **Coverage com peso por seção do JD** — hoje é overlap dos top-30 termos por frequência, sem
  distinguir obrigatório de desejável, e sem classificar hard/soft/tool.
- **`atsScoreHeuristic`** é `coveragePct × 0.8 + 20`: piso de 20 com 0% de cobertura. Rótulo
  honesto exigido em qualquer lugar que exiba isso.
- **Truthcheck estendido à cover letter** — o maior buraco restante na Regra nº 1. Hoje o
  guardrail valida **só** `resume.md`; cover letter, answers e outreach não têm validação nenhuma.
  O BUG-005 (bullets sob subheading) foi corrigido na Onda 1.0, mas apenas para o currículo.
- **Format checker mecânico** do currículo: headings, comprimento, bullets, ordem.
- **Judge como skill** (regra E5): `.claude/skills/avaliar/SKILL.md` com rubrica versionada em
  `config/rubrics/kit-review.yaml`. `src/core/` faz só o determinístico — montar o bundle e
  persistir a nota. Mesmo sanduíche do `kit.ts prepare` → Claude → `finalize`.
- **Biblioteca de prompts versionada** em vez de string embutida em `wrapAtsHtml()`.
- **Extrair `kit.ts` para módulo exportável**, protegido pelo teste de integração da Onda 0.

Migrations desta onda seguem a regra E4: aditivas, `003_*.sql` em diante, com teste sobre um banco
no schema anterior — o padrão está em `tests/unit/migration-002.test.ts`.

## Roadmap de submissão

Radio e checkbox **não são tratados** pelo form-filler. Heurísticas de detecção de campo entram
como fonte **adicional** na cascata (`candidate_facts → identity → answer_bank → heurística →
pausa`), jamais substituindo a pausa: confiança baixa continua sendo pausa. Também: saída `.docx`.

## Onda 3 — `inbox-watch` (Gmail → sinal sobre `applications`)

> **Posição neste arquivo é ordem de leitura, não fila de prioridade.** Esta seção está por
> último porque foi escrita por último, não porque vem depois de tudo. **Prioridade real:
> atrás do BUG-007 (item 1, bloqueador) — e só dele.** Não compete com os itens 2–10 da Onda 1
> nem com a Onda 2; nenhum dos dois foi comparado contra `inbox-watch` pra decidir ordem.

Não resolve o bloqueador do BUG-007 — volume de decisão continua sendo volume de decisão — mas
tem um efeito colateral que é o argumento mais forte a favor: e-mail de resposta de empresa é
sinal negativo natural, e rejeição é exatamente o lado que falta na amostra 11:1 do BUG-007.
`inbox-watch` não fecha o BUG-007, mas pode alimentá-lo.

**Status, 2026-08-11: Fase A construída e medida — feature parada e devolvida ao backlog por
critério, não por hipótese.** A taxa de match dos dois estágios prontos ficou em 4,3% (1/23),
abaixo do critério de ~60% definido abaixo. Estágio 3 **não construído** — exatamente como a
"parada dura" desta seção previa que aconteceria se o número não desse. Detalhe da medição:
`KNOWN-BUGS.md` → ACHADO-17. O resto desta seção documenta o que foi construído, o que a medição
achou, e o que continua sendo plano (Fases B/C, nunca alcançadas).

**Achado de arquitetura, registrado antes de codar**: Gmail é canal de SINAL sobre `applications`
já existentes, não fonte de vaga nova. Não herda `AdapterCapabilities` (item 4 desta lista) — a
regra "nenhum adapter novo" das sessões de medição não se aplica aqui, é categoria diferente.

**Fases**: A detectar+notificar (**construída e medida**) · B casar e-mail↔card (não construída) ·
C rascunho de resposta (não construída).

**Migration aditiva, `009_inbox.sql`** — não `008` como esta seção previa originalmente: o `008`
acabou sendo `008_answer_bank_dedup.sql`, de outro trabalho que entrou primeiro. Tabelas
`inbox_messages` (`gmail_message_id` único, `gmail_thread_id`, remetente/domínio, classificação,
`application_id` nullable — `NULL` = não casado) e `inbox_state` (chave/valor, guarda o
`historyId` do Gmail pra poll incremental idempotente) criadas exatamente como planejado. **Zero
coluna nova em `applications`** — transição de card, quando a Fase B existir, escreve pelo mesmo
caminho que a UI já usa (`doStatus`/`doFeedback` em `server/index.ts`), não um caminho paralelo;
isso ainda não foi exercido porque a transição automática (Fase B) não foi construída.

**Adapter Gmail construído**: `src/adapters/gmail.ts`, REST puro, escopo OAuth
`gmail.readonly`. Comandos do operador em `src/cli/inbox.ts` — `inbox auth` (autorização OAuth,
uma vez, salva refresh token) e `inbox ingest [--commit]` (busca e-mails; sem `--commit` é
dry-run, não grava). O poll incremental por `historyId` vive em `src/core/inbox-ingest.ts`, não
num arquivo `gmail-watch.ts` separado como o plano original nomeava — mesma lógica, outro nome de
arquivo. **Não wireado a `launchd`** ainda: hoje `inbox ingest` roda por invocação manual do
operador, não em background como `/agendar`. Pub/Sub segue descartado — exige endpoint público,
não faz sentido numa ferramenta local. `historyId` expirado (>7 dias parado) força resync
completo — comportamento implementado, não só planejado.

**Casamento e-mail↔card, cascata pura em `src/core/inbox-match.ts` — só 2 dos 3 estágios existem
hoje**:

1. `gmail_thread_id` já visto → herda `application_id` (determinístico). **Construído e medido** —
   nenhuma construção nova, só leitura de thread já casada antes. Na medição, contribuiu 0 além do
   que o Estágio 2 já achou — sem seed manual pré-existente, thread só herda de um match anterior
   no mesmo thread, exatamente o "frio na primeira vez" que esta seção já previa.
2. `from_domain` contra o domínio da empresa da `application`. **Construído e medido** — dado já
   existe em `applications`/`companies`, é comparação direta.
3. Remetente de ATS conhecido (gupy.io/greenhouse.io/myworkday.com/lever.co) sem match nos dois
   primeiros → extrair empresa/título do corpo e casar por similaridade. **NÃO existe** — dependia
   do estágio trigram/Jaccard do item 6 desta lista, que também não foi construído. É
   pré-requisito real a construir, não reuso de algo pronto.

Sem match em nenhum estágio: `application_id` fica `NULL`, aba "Inbox não casado", operador liga
em um clique (`match_method='manual'`, vira dado de avaliação da própria heurística). Essa aba
ainda não foi construída — é Fase B/UI, não alcançada.

**Parada dura da Fase A, medida só com os estágios 1+2 — executada em 2026-08-11**: taxa de match
e-mail↔candidatura nas aplicações reais, usando thread+domínio, ANTES de decidir se o estágio 3
(similaridade) precisa ser construído. Corpus: 23 candidaturas reais e 1434 e-mails ingeridos
(desde 2026-07-13). **Pré-requisito descoberto no meio do caminho**: `companies.domain` nunca
tinha sido escrito por nenhum caminho de código — 0 de 518 empresas tinham domínio antes desta
sessão. Sem backfill, o Estágio 2 mediria zero por falta de dado, não por teto real da heurística
— mesma classe de contaminação do ACHADO-16. Backfill manual via WebSearch, só das 23 empresas com
candidatura real (`scripts/backfill-company-domains.ts`).

**Resultado: 1/23 = 4,3%, contra o critério de ~60%.** Estágio 1 sozinho: 0/23. Estágio 2: 1/23
(`Coinbase`, `no-reply@coinbase.com` — inequívoco, zero falso positivo na amostra). Combinado:
4,3%. **O que a medição significa não é "thread+domínio deu certo sozinho"** — o resultado é pior
que isso, não melhor: nem thread nem domínio bastaram, e a causa dominante não é falha da cascata.

**Achado estrutural, o mais importante para quem reabrir isto**: o ATS (Gupy, LinkedIn) notifica
**pelo domínio do próprio ATS, não pelo domínio da empresa**. O Estágio 2 compara `from_domain`
contra o domínio da empresa e é cego a isso. Isto é **o oposto do risco que esta seção temia
originalmente** — o texto abaixo ("riscos registrados") antecipava falso positivo por domínio
compartilhado; o que a medição achou foi falso negativo por domínio nunca usado pelo Estágio 2 (e
por isso nunca chegando a comparar nada).

**Ressalva honesta**: 22 das 23 candidaturas tinham entre 1 e 5 dias de existência no momento da
medição — o prazo de resposta de RH em boa parte nem tinha passado ainda. Isso não invalida o
número (o critério é objetivo e foi aplicado como estava escrito), mas é a razão concreta para
remedir, não para desconfiar do método.

**Remedição**: em 3–4 semanas, quando as candidaturas de agosto tiverem tido tempo real de
receber resposta, rodar `scripts/measure-inbox-match.ts` — já existe, não precisa ser reescrito.

**Critério de abandono, não só de prosseguir**: se a taxa de match com os dois estágios prontos
ficar abaixo de ~60% nas aplicações reais, `inbox-watch` **volta pro backlog** em vez de ganhar o
estágio 3. Construir similaridade de título pra salvar um casamento ruim custa mais do que casar
manualmente um punhado de cards à mão — a feature não se justifica só porque foi começada.
**Aplicado sem negociar em 2026-08-11**: 4,3% < 60%, decisão tomada, Estágio 3 não construído —
por critério medido, não por hipótese. O plano original previa que, **se** thread+domínio dessem
taxa aceitável sozinhos, o estágio 3 talvez nunca fosse necessário — o melhor resultado possível,
menos código pra manter. **O que aconteceu foi diferente e pior**: thread+domínio não deram taxa
aceitável, e mesmo assim o estágio 3 não nasce — porque o critério de abandono, escrito antes de
qualquer medição, manda a feature inteira pro backlog nesse cenário. A decisão veio do número, não
de uma leitura otimista dele.

**Cuidado de medição, direto do ACHADO-16**: `rescore --commit` contaminou `jobs.status` porque a
medição comparou contra um estado que já tinha sido reescrito depois do fato. A viabilidade de
match tem o mesmo risco: medir contra `applications.status`/domínio como está gravado HOJE não
prova nada sobre o que era verdade no momento em que o e-mail chegou, a menos que exista trilha de
transição DATADA (evento com timestamp) pra comparar contra `received_at`. Se não existir essa
trilha, isso é um achado a registrar — "só o casamento é mensurável agora, não a acurácia da
classificação histórica" — não um número a reportar como se fosse.

**Corpus de validação colide com o BUG-007**: as aplicações candidatas a corpus de teste são
provavelmente as mesmas ~16 decisões pós-fix do BUG-007, com o mesmo desbalanço 11:1
positivo/negativo. Léxico de `rejected` — o ramo perigoso, falso positivo apaga card ativo — é
exatamente o que menos tem exemplo real pra testar. Reforça por que regressão de estágio fica
bloqueada por padrão e por que o léxico de `rejected` é o último a ganhar confiança suficiente
pra sair de trás da flag.

**Classificação**: léxico primeiro, `unknown` como saída honesta (não adivinha) — `interview` ←
entrevista/agendar/calendly; `screening` ← teste/triagem/formulário; `offer` ← proposta/oferta;
`rejected` ← infelizmente/seguimos com outros; `noise` ← confirmação automática. `unknown` vai pra
Claude, mesmo sanduíche prepare→Claude→finalize do `kit.ts`. Teste de tabela sobre corpus real de
assunto de e-mail, não sintético.

**Transição de card**: avanço automático; regressão NUNCA — e-mail sugerindo estágio anterior ao
atual grava o evento e não toca o card. Toda transição registra `classifier` + `gmail_message_id`,
reversível em um clique na UI ("movido por e-mail", com link). Atrás de flag
`inbox.autoTransition: false` por default.

**Resposta (Fase C, por último)**: `drafts.create` na própria thread + notificação — nunca
`send`. Escopo OAuth `gmail.compose`, não `gmail.send`: a garantia de "nunca envia sozinho" fica
estrutural (permissão da API), não só de código — mesmo espírito de `linkedin-comentar`.

**Notificação**: `osascript "display notification"`, mesmo padrão de `search.ts --auto`, + badge
em `/status`.

**Sequência combinada com a parada dura — status real, 2026-08-11**: (1) OAuth + ingest populando
`inbox_messages` read-only, `applied_transition=0` sempre — **feito**; medir viabilidade de match
nas aplicações reais — **feito, resultado 4,3%** (ACHADO-17); passos seguintes decidem se
acontecem a partir desse número — **decidido: não acontecem agora.** (2) classificador léxico +
testes de tabela — não iniciado; (3) UI — aba não casados + notificação — não iniciado; (4)
transição automática atrás de flag — não iniciado; (5) rascunho de resposta, `gmail.compose` — não
iniciado. `inbox-watch` volta pro backlog com só o passo (1) construído; os passos (2)–(5) ficam
exatamente onde esta seção já os planejava, esperando remedição.

**Riscos registrados**: token OAuth em disco (mesma classe de segredo que `answer_bank` — nunca
commitar) — **materializado**: a Fase A construída de fato guarda o refresh token em
`.env.local`, gitignored, mesmo tratamento; rate limit do Gmail; `historyId` expirado força
resync — implementado, não só previsto; e-mail de candidato/thread só resolve match depois do
primeiro casamento manual (frio na primeira vez) — confirmado na medição, Estágio 1 contribuiu
zero; falso positivo de `rejected` apagaria card ativo se a regressão não estivesse bloqueada por
padrão — ainda hipotético, classificador não foi construído.
