# Bugs conhecidos

Registro dos defeitos encontrados durante a **Onda 0** (construção da rede de segurança).

A Onda 0 é rede de segurança, não refactor: a regra foi **congelar** o comportamento atual
em teste, não corrigi-lo. Cada bug abaixo tem um teste que assere o comportamento **de hoje**.
Quando a onda de correção chegar, **esses testes devem falhar** — é isso que prova que a
correção mudou algo de verdade.

A única exceção é o BUG-003, corrigido já na Onda 0 porque impedia a própria rede de existir.

| # | Gravidade | Estado | Onde |
|---|---|---|---|
| [BUG-007](#bug-007) | **Crítica** | Componente desarmado; causa não corrigida | `src/cli/feedback.ts` + `src/core/scoring.ts:70-85` |
| [BUG-005](#bug-005) | **Alta** | **Corrigido** | `src/core/truthcheck.ts:31-50` |
| [BUG-006](#bug-006) | **Alta** | Medido, sem teste ainda | `src/core/scoring.ts:63` |
| [BUG-002](#bug-002) | Média | **Mitigado por efeito colateral** (41.5 → 39.5) | `src/core/scoring.ts:50` |
| [BUG-001](#bug-001) | Média | Congelado | os 5 adapters |
| [BUG-003](#bug-003) | Média | **Corrigido** | `src/core/pipeline.ts:41-45` |
| [BUG-004](#bug-004) | Baixa | Sem cobertura | `src/submit/linkedin-easyapply.ts` |
| [BUG-008](#bug-008) | **Alta** | **Corrigido** | `src/cli/kit.ts` (gates de conteúdo) |
| [BUG-009](#bug-009) | Média | **Corrigido** | `src/core/scoring.ts` (filtro de idioma) |
| [REQ-004](#req-004) | **Alta** | Medido; veredito pontual | `src/core/master-resume.ts` |
| [REQ-003](#req-003) | **Alta** | Medido; correção é do operador | `profile/tracks.yaml` |
| [REQ-002](#req-002) | — | **Pré-requisito** da Fase 2 | `src/core/keywords.ts` |
| [REQ-001](#req-001) | — | Requisito aberto da Fase 2 | `src/core/master-resume.ts` |
| [LIM-001](#lim-001) | — | **FECHADO** | `tests/e2e/kit-ats-gate.test.ts` |

---

## BUG-007

**O `/feedback` não tem taxonomia de motivo, então elegibilidade é gravada como preferência
de tópico — e o componente aprende o inverso do objetivo do candidato.**

### O que foi medido (2026-08-06, banco real, 70 eventos de feedback → 98 chaves)

| Pesos negativos | | Pesos positivos | |
|---|---:|---|---:|
| `kw:product manager` | **−9.50** | `source:remoteok` | **+3.61** |
| `kw:qa` | **−7.65** | `kw:claude` | +2.85 |
| `kw:scrum master` | −7.60 | `source:wwr` | +2.85 |
| `source:gupy` | −5.65 | `kw:ai agents` | +2.85 |
| `kw:product owner` | −5.65 | `kw:llm` · `kw:rag` | +1.90 |
| `kw:playwright` · `cypress` · `istqb` | −2.85 | `kw:n8n` | +1.90 |
| **`seniority:junior`** | **−1.90** | | |

`seniority:junior` negativo é a prova irrefutável: o sistema aprendeu a punir o próprio
nível-alvo do candidato. E `source:gupy` — a única fonte 100% brasileira, para quem configurou
`location: Brazil` — carrega −5.65, enquanto `source:remoteok`, a fonte que produziu
`Firefighter ARFF` em Mangaluru e `Health Navigator I` em Portland, é o **maior peso positivo
do banco**.

### Causa raiz: ausência de taxonomia de motivo, não atribuição difusa

O diagnóstico inicial ("a rejeição credita todos os termos do JD") descreve o mecanismo, mas
erra a causa. A causa é anterior:

**Quase todas as ~70 rejeições foram pelo mesmo motivo — a vaga exigia experiência comprovada
na área e/ou diploma. Nenhuma foi sobre o tema da vaga.** O candidato busca a primeira vaga
nessas áreas e não tem nenhum dos dois.

O `/feedback` só sabe registrar "rejeitar". Não existe onde dizer *por quê*. Então o
aprendizado converte um fato de **elegibilidade** ("não me qualifico para esta vaga") num fato
de **preferência** ("não gosto deste assunto"). E como vaga sênior e júnior compartilham
vocabulário, cada rejeição honesta puniu exatamente a área desejada.

### Por que o componente não pode ser religado nem com escopo por trilha

Escopar os pesos por trilha não resolve: dentro da trilha `ai-builder`, uma vaga sênior de
ai-builder e uma júnior de ai-builder usam o mesmo léxico. A rejeição da sênior continuaria
punindo a júnior. Sem **motivo estruturado**, o sinal é irrecuperável.

### Correção exigida antes de religar

1. `/feedback` passa a exigir motivo de um vocabulário fechado:
   `nao_elegivel` · `fora_do_tema` · `senioridade` · `remuneracao` · `empresa`.
2. Só `fora_do_tema` e `empresa` alimentam `preference_weights`. `nao_elegivel` e `senioridade`
   alimentam o componente de barreira de entrada (item 1.2d) — **campo estrutural, nunca `kw:*`**.
3. `source:*` deixa de ser chave aprendida. Uma fonte não é uma preferência: é um canal, e
   aprender peso de canal codificou "prefiro board internacional" a partir de rejeições que
   nada tinham a ver com o canal.
4. Migration aditiva para a coluna de motivo; as 98 chaves atuais **ficam** no banco — quando
   houver motivo registrado, elas podem ser reprocessadas em vez de descartadas.

### Estado

**Desarmado, não corrigido.** `config/config.yaml` tem `scoring.preference: 0` (o peso migrou
para `keyword_overlap: 0.65`). As chaves envenenadas seguem no banco, inertes. Voltar o peso
para 0.10 sem os 4 itens acima reintroduz a inversão.

**Regra de captura, aprendida desta inversão:** motivo estrutural mora em campo estrutural.
`"exige 5 anos"` nunca pode virar peso em `kw:*`.

### O que conta como validação (e o que não conta)

As 48 vagas em `status='rejected'` **não** são um conjunto rotulado utilizável, por três razões
medidas:

1. **41 das 48 são da trilha `product`**; `ai-builder` — a trilha-alvo — tem 1 de 73.
2. **0 de 95 vagas `senior` aparecem em `rejected`**: foram barradas pelo filtro duro antes de
   chegar aos olhos do operador. Viés de sobrevivência por construção.
3. O sinal que mais discrimina (fraseado qualitativo de experiência, lift 1.75–1.83×) dispara em
   **51% das vagas que o operador aprovou**. Nessa separação, um classificador erra metade da fila.

**Validação real exigida:** ~25 decisões de `ai-builder` **com motivo registrado**, coletadas
*depois* de o BUG-007 ser corrigido. Vinte e cinco rótulos limpos na população certa valem mais
que 48 confundidos na errada. Qualquer extração retroativa antes disso é chute com aparência de
dado.

Amostra de 15 rejeitadas para rótulo manual, com as limitações no topo:
`docs/labels-onda1-amostra.md`. Serve para desenhar a taxonomia — não para validá-la.

---

## Achados medidos que não são bugs

Registrados aqui porque foram medidos com rigor e mudam decisões, mas nenhum é defeito de código.

### ACHADO-01 · `ai-builder` é a trilha mais acessível do acervo

Barreira de entrada por trilha, sobre as 375 vagas (2026-08-06):

| Trilha | N | fraseado qualitativo | diploma obrigatório | anos > 2 | **acessíveis** |
|---|---:|---:|---:|---:|---:|
| `ai-builder` | 73 | 21% | 12% | 15% | **45 (62%)** |
| `qa` | 64 | 36% | 16% | 2% | 34 (53%) |
| `product` | 199 | 53% | 27% | 6% | **69 (35%)** |

A hipótese de trabalho era a oposta — que `ai-builder` exigiria mais lastro. **Exige menos, e por
uma margem grande.** `product` é a trilha mais fechada: 53% pedem experiência comprovada. É
coerente com o mercado: ai-builder é campo novo, quase ninguém tem cinco anos dele.

**Consequência:** confirma a decisão de trilha, e enfraquece o caso de um componente de barreira
de entrada — ele atacaria com mais força a trilha que o operador está deixando.

### ACHADO-02 · `detectRequiredYears` cobre 10% do acervo por limitação estrutural

37 de 375 vagas. Não é parametrização: o extrator casa `"N anos de experiência"`, e o JD
brasileiro pede requisito de forma **qualitativa** — `"vivência em"`, `"experiência prévia"`,
`"sólida experiência"`, `"formação completa em"`. Aumentar o alcance exige NLP de requisito
qualitativo, não ajuste de regex.

Corolário de método: a primeira medição comparou 37% (`queued`) contra 35% (`rejected`) e concluiu
"anti-discriminante". Estava medindo **missingness**. No subconjunto onde o extrator devolve
valor, a direção é a certa e forte — mediana de 2 anos nas `queued` contra 5 nas `rejected`,
média 2.3 contra 5.5 — mas com **n=4** nas rejeitadas, pequeno demais para concluir. Registrado
como direção plausível, não como evidência.

### ACHADO-04 · As lacunas reais da trilha ai-builder — o que nenhuma fase do pipeline move

Derivado do grupo "não tenho" depois de descontar ruído do anúncio, grafia diferente e variante
morfológica, sobre as 32 vagas `queued` da trilha (2026-08-06).

**Leitura curada, não saída de ferramenta.** O comando `master gaps ai-builder` produz a tabela de
frequência bruta, mas ela é inutilizável sem segmentação (REQ-002): o topo dela é `voce` 13×,
`solucoes` 12×, `dados` 10×. Estender a lista de palavras genéricas para limpar isso seria curar
sintoma. O que segue é o sinal que sobrevive a leitura humana da tabela:

| Falta em | Termo | Natureza |
|---:|---|---|
| 4 | **low-code / no-code como plataforma** | está no léxico da trilha em `tracks.yaml`, mas **nenhum fato o sustenta** — é keyword declarada sem lastro |
| 3 | **machine learning** | lacuna real de domínio: o perfil é IA generativa e RAG, não ML clássico |
| 2 | **Make / Zapier** | ferramenta. O perfil tem n8n, que é concorrente direto |
| 2 | **Salesforce** | plataforma de CRM |
| 2 | **HubSpot** | plataforma de CRM/marketing |
| 2 | **Python** | linguagem. O perfil é TypeScript/JavaScript |

**Por que isto importa mais que a Fase 2.** Estas seis linhas são as únicas coisas em todo o
diagnóstico que nenhum sinônimo, reescrita de bullet, gate ou seleção determinística move. Se duas
horas de tutorial de Make produzem um fato real, o teto de 2 vagas sobe de verdade — e nenhum
trabalho de pipeline entrega isso.

**Achado de brinde:** `low-code`/`no-code` estão no léxico de `profile/tracks.yaml` sem nenhum fato
que os sustente. O léxico da trilha é usado no *scoring* de vaga (o que entra na fila), não no
currículo, então isso não viola a Regra nº 1 — mas significa que a fila está sendo pontuada por
uma competência que o perfil não comprova. Vale uma passada no `tracks.yaml` na mesma revisão.

### ACHADO-03 · `posted_at` com 1276 dias

A idade do acervo é min 25d, p50 41d, **max 1276d** — 3,5 anos. É `posted_at` mal parseado por
algum adapter. Não afeta o score depois do `recency_floor` (a vaga assenta no piso como qualquer
outra vaga velha), mas contamina qualquer análise de frescor. Roadmap: qualidade de dado.

---

## BUG-005

**A metade "bullet sem citação" do truthcheck não dispara no formato canônico do sistema.**

`truthcheck()` usa uma máquina de estado que liga `inExperience` em headings que casam
`/experi[êe]ncia|experience/i` e **desliga em qualquer outro heading**:

```ts
if (/^#{1,3}\s/.test(line)) {
  inExperience = /experi[êe]ncia|experience/i.test(line);
  continue;
}
```

A skill `/gerar` prescreve (`.claude/skills/gerar/SKILL.md:52`) exatamente:

```
## Experiência Profissional
### <Cargo> — <Empresa>
- <bullet> [exp:fact_id]
```

O subheading `### Analista de QA — ACME Software` não casa o padrão, então `inExperience`
volta a `false` e **todos os bullets reais do currículo ficam sem verificação de citação**.

**Impacto.** Um bullet inventado, sem tag `[exp:...]` nenhuma, passa no guardrail. A metade
"citação inexistente" continua funcionando normalmente (ela não depende da máquina de estado),
então uma citação *falsa* é barrada — mas a *ausência* de citação não é. É um buraco direto na
Regra nº 1 do projeto.

**Congelado em:** `tests/unit/truthcheck.test.ts` ("BUG-005 CONGELADO") e
`tests/e2e/truthcheck-exit2.test.ts` (prova via exit code do processo real).

**Correção sugerida:** desligar `inExperience` apenas em headings de mesmo nível ou superior
ao que ligou a seção (`##` desliga `##`; `###` não desliga), ou rastrear o nível do heading.

---

## BUG-006

**`location_fit` só reconhece o Brasil quando a palavra "Brasil"/"Brazil" está na string.**

`src/core/scoring.ts:63`:

```ts
else if (job.location && /brazil|brasil/i.test(job.location)) locationFit = 1;
```

A Gupy — fonte 100% brasileira e a maior do banco (181 de 375 vagas) — devolve
`"São Paulo, SP"`, `"Belo Horizonte, Minas Gerais"`. Nenhuma dessas casa o padrão, então caem
no default `0.5`.

**Medido no banco real** (ver `docs/baseline-onda1.md`):

| Fonte | `location_fit` médio (de 15) |
|---|---:|
| gupy | **8.84** |
| linkedin | 13.99 |
| remotive / remoteok / wwr | 15.00 |

119 vagas da Gupy não-remotas recebem metade da pontuação de localização que mereciam.

**Impacto.** Vagas brasileiras perdem ~6 pontos de score contra vagas remotas internacionais,
que ganham 15 automaticamente por serem `remote`. Com o piso da fila em 40, 6 pontos decidem
quem entra. A fila fica enviesada para vaga remota em inglês, exatamente ao contrário do que a
configuração pede (`location: Brazil`, `remote_only: true`). É uma das causas mensuráveis de
"a fila não traz vagas boas".

**Sem teste congelado ainda** — descoberto durante a medição de baseline da Onda 1, depois do
commit da Onda 0. O teste entra junto da correção, na Onda 1.

---

## BUG-002

**Com `profile_tracks` vazia, o piso de score (41,5) fica acima do `queue_threshold` (40).**

O fallback de `scoring.ts:50` dá `overlap = 0.3` quando não há trilhas no banco:

```
keyword_overlap  0.3 × 0.55 × 100 = 16.5
recency          0.5 × 0.15 × 100 =  7.5   (posted_at nulo)
location_fit     0.5 × 0.15 × 100 =  7.5   (nem remoto nem Brasil)
language_fit     1.0 × 0.05 × 100 =  5.0
preference       0.5 × 0.10 × 100 =  5.0
                                    -----
                                     41.5  >  40
```

**Impacto.** Antes do perfil ser ingerido, **qualquer** vaga entra na fila. É uma das causas
diretas de "a fila não traz vagas boas".

**Estado (2026-08-06): mitigado, não corrigido.** Com `keyword_overlap` em 0.65 e `preference`
em 0 (ver BUG-007), a aritmética passou a somar **39.5**, abaixo do `queue_threshold` de 40:

```
keyword_overlap  0.3 × 0.65 × 100 = 19.5   (fallback morto, INTACTO)
recency          0.5 × 0.15 × 100 =  7.5   (posted_at nulo → desconhecido, não velho)
location_fit     0.5 × 0.15 × 100 =  7.5
language_fit     1.0 × 0.05 × 100 =  5.0
preference       0   × 0    × 100 =  0.0   (componente desarmado)
                                    -----
                                     39.5  <  40
```

O fallback continua dando 19.5 pontos de aderência a uma vaga sem nenhuma trilha no banco — o
defeito está lá. O que mudou é que o total parou de passar o threshold sozinho.

**A margem é de 0.5 ponto.** Baixar `queue_threshold` para 39 na calibração (item 1.6) ressuscita
o BUG-002 inteiro. Congelado em `tests/unit/scoring.test.ts`, que assere `39.5` componente a
componente **e** `status === 'new'`.

---

## BUG-001

**`remote_only` é configuração morta.**

A chave existe em `config/config.yaml`, no `SearchSpec` (`src/core/config.ts:11`), no
`SearchParams` (`src/adapters/types.ts:6`) e é editável na aba Config da UI. **Nenhum dos 5
adapters sequer desestrutura `remoteOnly`** — o filtro que a interface promete nunca acontece.

Na mesma família: `location` só é lido pelo `linkedin-guest`, e o `limit` é aceito pelos
adapters mas nunca repassado pelo pipeline (fica sempre no default de cada um).

**Impacto.** O operador liga uma opção na UI e nada muda. Confiança na configuração corroída.

**Congelado em:** `tests/unit/adapters-remote-only.test.ts` — para cada adapter, assere que
ligar e desligar `remoteOnly` produz a mesma URL e o mesmo conjunto de vagas.

---

## BUG-003 — CORRIGIDO na Onda 0

**`runSearch` não limpava o `setTimeout` do `Promise.race`.**

Quando o adapter respondia antes do timeout, o timer de 30 s continuava vivo segurando o
event loop. Medido: a suíte de testes saltava de **0,77 s para 30,8 s** por causa de um único
arquivo que chamava `runSearch`.

Foi o único bug corrigido na Onda 0, pela razão de que **impedia a rede de segurança de
existir**. O fix (`clearTimeout` num `finally`) preserva a semântica do timeout integralmente.

**Coberto por:** `tests/unit/pipeline.test.ts` — conta `Timeout` em
`process.getActiveResourcesInfo()` antes e depois.

---

## BUG-004

**`runEasyApply` não persiste em `submissions`, ao contrário de `runSubmission`.**

Assimetria de rastreamento entre os dois caminhos de submissão: uma candidatura via LinkedIn
Easy Apply não deixa linha na tabela, então não aparece em `/submeter --pending` nem no
warehouse do painel.

**Sem cobertura, deliberadamente.** Só é observável com browser real e sessão LinkedIn logada;
testá-lo exigiria mockar `playwright-core` — prova de mock, não de comportamento.

---

## BUG-008 — CORRIGIDO

**`[CONFIRMAR: ...]` sobrevivia até o envio, e o `finalize` só olhava o `resume.md`.**

O prompt do pipeline de aprovação (`src/server/index.ts:204`) instrui, literalmente: *"Se faltar
um candidate_fact, escreva `[CONFIRMAR: ...]` no answers.md e prossiga"*. A instrução está certa —
é assim que o sistema evita inventar pretensão salarial. O defeito era não haver nada barrando
depois.

**Não era hipótese.** O único kit em `output/` tinha **dois marcadores vivos** no `answers.md`,
linhas 4 e 28, um deles pedindo pretensão salarial. Em `full_auto` isso iria literalmente no
formulário da empresa.

Agravante: `answers.md` e `outreach.md` estavam em `expected_files` desde sempre e o `finalize`
**nunca os lia — nem checava se existiam**. `cover-letter.md` era renderizado se existisse, sem
validação nenhuma.

**Corrigido:** gates de conteúdo em `src/core/gates.ts`, aplicados aos quatro entregáveis, com
`process.exit(3)`. O código é distinto do 2 de propósito — a prova de que "exit 2 é específico do
truthcheck" não pode ser diluída, e a ordem importa: veracidade reprova primeiro.

**Congelado em:** `tests/unit/gates.test.ts` e `tests/e2e/truthcheck-exit2.test.ts`, incluindo o
caso de precedência (currículo com citação falsa **e** placeholder sai 2, não 3).

---

## BUG-009 — CORRIGIDO · exigência de idioma nativo não era filtro duro

A vaga `AI No-Code/Low-Code Developer` da Freedom24 entrou na fila com score 52,
recebeu kit completo — currículo, carta, respostas, outreach, PDF — e só então
alguém leu, na lista de requisitos: **`Russian: native`**. Requisito eliminatório,
escrito no JD desde o começo, custando uma geração de ~$3 e uma carta redigida à toa.

Medido no acervo: **2 vagas em 641**, ambas na fila. Volume baixo, custo por
ocorrência alto — é exatamente o perfil de defeito que compensa filtrar.

**Corrigido:** `filters.blocking_native_languages` em `config/config.yaml`, dado
versionado e editável (quem sabe que idiomas o operador fala é ele). O filtro casa
as duas ordens em que o JD escreve — `Russian: native` e `native Russian speaker` —
e entra na cascata de `hardFilterReason`, junto de senioridade e anos exigidos.
Português, inglês e espanhol ficam fora da lista de propósito.

A vaga foi retirada do funil (`applications.status = 'withdrawn'`) e o kit ficou em
disco como evidência.

---

## REQ-004 — a compressão fato → `skills[]` é um ponto de perda não auditado

**Veredito: PONTUAL, não sistêmico.** Um caso real em 261 sinônimos.

### O que se assumia

Toda a Fase 2 tratava `from: <tag>` e `from: <trecho do texto>` como autorizações
equivalentes. Não são. O caso que revelou isso: `serverless` ← `arquitetura-sem-servidor`,
tag que veio de "arquitetura sem servidor **de aplicação**" — a compressão descartou o
qualificador antes de qualquer sinônimo existir, e o sinônimo só herdou a perda.

### Auditado — `npx tsx src/cli/master.ts tags <trilha>`

158 tags em 33 fatos da trilha `ai-builder`:

| Categoria | n | O que é |
|---|---:|---|
| `literal` | 43 | aparece no texto e nada a qualifica logo depois |
| `truncada` | 11 | aparece, mas o texto **continua** com um qualificador que ela descartou |
| `interpretada` | **104** | **não aparece no texto** — rótulo atribuído, não extraído |

**O número que reformula o problema são os 104 (66%).** A tag não é compressão do
fato para dois terços dos casos: é uma **reivindicação independente**, feita por quem
etiquetou. `kanban` em "Priorizou backlog dinâmico" é inferência sobre método, não
resumo de texto. Então `from` apontando para tag é autorização de segunda ordem — ela
mesma sem lastro textual.

**O detector de `truncada` tem precisão de 1 em 11**, como a métrica de risco tem 1 em
7. Das 11, dez são falsos positivos (`ia-generativa` "perdeu" *para atendimento*,
`monorepo` "perdeu" *com npm*): qualificador de escopo, não de sentido. **Só o
`serverless` muda o que a frase afirma.** Os detectores servem para gerar candidatos
baratos, não veredito.

### Regra

`from` que aponta para `fact.text` é autorização forte — o texto inteiro está lá para
conferir. `from` que aponta para `skills[]` é fraca, e a força cai na ordem
`literal > truncada > interpretada`. O `master review` ordena por esse eixo.

**Não recalibrar a métrica de risco agora.** Ela detecta troca de idioma e isso é
sabido; o eixo `skills[] vs fact.text` já entrou como ordenação. Qualquer refinamento
espera, porque o REQ-004 podia ter redefinido o que conta como origem confiável — e
o veredito de pontual significa que não redefiniu.

---

## REQ-003 — termo no léxico de trilha sem fato que o comprove é defeito de RANKING

**Não é problema de redação. É a fila apontando para as vagas erradas.**

O léxico de `profile/tracks.yaml` alimenta `keyword_overlap` (`src/core/scoring.ts:42-51`), que
pesa **0.65** — é o componente dominante do score. Ele decide **quais vagas entram na fila**, não
o que o currículo escreve. Um termo sem lastro faz o sistema premiar vaga que pede competência que
o perfil não evidencia, e o operador gasta tempo triando na direção errada. O currículo continua
honesto (o truthcheck protege isso); a **seleção** é que está viesada.

### Medido em 2026-08-06 — `npx tsx src/cli/master.ts lexicon all`

| Trilha | Termos | Sem match literal | **Sem lastro real** | |
|---|---:|---:|---:|---:|
| `ai-builder` | 61 | 32 | **13** | 21% |
| `product` | 37 | 25 | **22** | 59% |
| `qa` | 31 | 26 | **24** | **77%** |
| **total** | **129** | 83 | **59** | **46%** |

A coluna do meio e a da direita são diferentes de propósito. `termsPresent` é match exato de
token: `teste de regressão` não casa `testes de regressão`. Dos 83 sem match literal, **24 são
variante morfológica** de algo que a trilha tem — limitação do matcher, não ausência. Os 59
restantes não existem em nenhum fato da trilha, em nenhuma forma.

> **Suspeita registrada (operador, 2026-08-07):** 77% em `qa` com 20 fatos etiquetados
> não é lacuna de redação — é indício de que **a trilha não existe no perfil**. A
> resposta certa para `qa` pode ser remover a trilha, não escrever 24 fatos. Tratado
> separado da revisão do mestre.

**A trilha `qa` é a mais grave: 77% do vocabulário que ranqueia suas vagas não tem fato.** Termos
como `quality assurance`, `regression testing`, `ISTQB`, `Cypress`, `SQL`, `test cases` não
aparecem em nenhum dos 20 fatos etiquetados `qa`. A trilha `product` está em 59%.

### Regra

Todo termo de léxico precisa de pelo menos um fato da **própria trilha** que o sustente. Termo
sustentado só por experiência de outra trilha não justifica ranquear vaga desta — e a saída do
comando distingue os dois casos, porque a correção é diferente: *retag* da experiência, versus
remover o termo, versus criar o fato que falta.

### Correção é do operador, não do pipeline

Três caminhos por termo, e a escolha é de quem sabe o que fez: **remover** do léxico (não é
competência dele); **criar o fato** em `master-profile.yaml` (é competência, faltava registro); ou
**re-etiquetar** a experiência que já o sustenta em outra trilha. Nenhum é automatizável sem
adivinhar.

Enquanto não for corrigido, `queue_threshold` e qualquer calibração de fila herdam esse viés — o
que inclui a calibração da Onda 1, feita sobre o léxico atual.

---

## REQ-002 — segmentação do JD é PRÉ-REQUISITO da Fase 2, e invalida a comparação com o passado

**`extractKeywords` não separa requisito de texto institucional, então o denominador de toda
métrica de cobertura está sujo.**

Contado no JD real da Stefanini (2026-08-06): das 30 "keywords" medidas, **13 não são requisito**.
Três são o nome da empresa (`stefanini`, `owner stefanini`, `stefanini acreditamos`) e dez são
copy de marketing (`clube vantagens`, `você`, `parceria`, `nossos clientes`, `acreditamos poder`,
`poder colaboracao`, `colaboracao criamos`, `criamos solucoes`, `parceria nossos`, `nossos`).
Na `Analista de Automação` a contaminação é menor mas existe: `criar`, `solucoes`, `apis nocoes`,
`ingles leitura` são artefatos do extrator de bigramas, não pedidos do anunciante.

A causa é estrutural, não parametrização: `extractKeywords` (`src/core/keywords.ts:21-36`) é
frequência pura de unigrama e bigrama sobre o JD inteiro. Empresa que repete o próprio nome e
escreve três parágrafos de "quem somos" empurra esse vocabulário para o topo do ranking.

### Consequência para os números já produzidos

**Toda métrica de cobertura anterior à segmentação é comparável entre si e com mais nada.**

Isso inclui, explicitamente: o `coveragePct` e o `atsScoreHeuristic` de qualquer kit gerado até
aqui; os tetos de `master ceiling`; os totais 36 (fatos crus) / 28 (bullets) / 42 (bullets +
sinônimos) do adendo da Fase 1; o "+17%" derivado deles; e o "7 contra 8" da `Analista de
Automação`. Nenhum desses números está errado como *medida do que mediu* — todos usam o mesmo
denominador sujo, então o delta entre eles vale. O que não vale é lê-los como "quanto do que a
vaga pede eu cubro", nem compará-los com qualquer número produzido depois da segmentação.

**Não refazer a medição retroativamente.** Refazer com o denominador antigo não conserta nada, e
refazer com o novo produz números que não conversam com o histórico. A regra é: quando a
segmentação existir, a baseline recomeça, e o adendo da Fase 1 vira registro histórico rotulado
como tal.

### O que a segmentação precisa entregar

Separar, dentro do JD, o bloco de **requisitos** (o que a pessoa precisa ter) do bloco
**institucional** (quem é a empresa, benefícios, cultura). O `extractKeywords` passa a rodar só
sobre o primeiro. Sem isso, nenhum gate de piso de cobertura pode existir — ele estaria reprovando
currículo por não mencionar `clube vantagens`.

---

## REQ-001 — substituir o sinônimo é requisito da Fase 2, não refinamento

**Sinônimo listado e não substituído é teto de mentira.**

O mestre guarda, por bullet, as grafias alternativas que aquele fato autoriza. O `master ceiling`
mede a cobertura contando essas grafias — ou seja, mede o que o currículo **poderia** cobrir.

Isso só vira cobertura real se a Fase 2 **trocar o termo dentro do texto do bullet** quando o JD
usar aquela grafia. Se o sinônimo ficar apenas listado no YAML e o bullet for renderizado com a
redação original, o teto diz uma coisa e o ATS lê outra — e a diferença é invisível, porque
nenhum gate compara "o que o ceiling prometeu" com "o que o PDF entregou".

**Portanto, na Fase 2:**

1. A montagem do `resume.md` substitui a grafia do bullet pela do sinônimo quando o JD usa a
   grafia alternativa. Substituição, não anexação — encher o bullet de sinônimos entre parênteses
   é keyword stuffing e reprova em leitura humana.
2. Um gate compara a cobertura **prometida** pelo `ceiling` com a **medida** no `coverage-report`
   do kit gerado. Divergência é defeito, não variação aceitável.
3. Superar o teto continua sendo o sinal de alarme do BUG-008: significa vocabulário sem fato.

Medido em 2026-08-06, trilha ai-builder, 6 vagas da fila (180 keywords no total): fatos crus 36 ·
só os bullets 28 · bullets + 262 sinônimos **42**. O ganho é real no agregado, mas desigual — numa
das vagas o mestre ainda fica **abaixo** dos fatos crus (7 contra 8), porque a reescrita em CAR
derrubou vocabulário de negócio em português que os sinônimos não recuperaram. O teto por vaga é
o número honesto; a média esconde isso.

---

## LIM-001 — FECHADO em 2026-08-06

**Era:** "o smoke test não prova que o PDF tem camada de texto extraível por um ATS. Assere que
o arquivo existe, tem mais de 5 KB e começa com `%PDF-`. Provar extração exigiria um parser de
PDF, ou seja, uma dependência nova — e o projeto se compromete com zero dependências."

A limitação era real: um PDF feito só de imagem satisfaz header e tamanho.

**Fechado com um recorte da regra, não com uma exceção a ela.** O parser (`unpdf`) entrou como
**devDependency**, importado *lazy* e usado só no gate e nos testes. O que a regra de zero-dep
protege é o runtime de produção do futuro SaaS: `src/core/` continua sem dependência nenhuma, e
por isso o gate de PDF mora em `src/render/pdf-text.ts` — a camada onde o Chrome já vive.

Se o parser não puder ser carregado, o gate **lança**. Um gate que se desliga sozinho quando a
ferramenta some é pior que gate nenhum: cria a impressão de que foi verificado.

**A prova são três verificações que não se substituem** (`src/cli/kit.ts`, exit 4):

| Verificação | O que prova |
|---|---|
| `checkAtsHostileHtml` | o HTML não tem `<table>`, `<img>`, `column-count` nem `position:absolute` |
| `checkTextFidelity` | toda linha significativa do markdown sobreviveu até o texto extraído do PDF |
| `checkReadingOrder` | o `innerText` (ordem do DOM) e o texto do PDF (ordem visual) casam em **sequência** |

A terceira é a que o parser sozinho não daria. Ela compara as duas extrações **entre si**: num
layout coluna única elas coincidem, e é a coincidência que prova que nada embaralhou a leitura.

Detalhe de implementação que custou um falso positivo: o casamento é por **subsequência**, com o
cursor avançando até o fim da âncora anterior. Buscar sempre do início fazia o heading
`CERTIFICAÇÕES` casar com a palavra "certificações" citada num bullet acima, e o gate acusava
desordem num documento correto. Congelado em `tests/unit/gates.test.ts` como teste de regressão.

**Coberto por:** `tests/e2e/kit-ats-gate.test.ts` (tabela → exit 4 com o PDF removido; PDF válido
→ extração confere linha a linha; parser indisponível → lança) e `tests/unit/gates.test.ts`.
