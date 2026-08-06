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
| [LIM-001](#lim-001) | — | Limitação aceita | `tests/e2e/smoke-pipeline.test.ts` |

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

## LIM-001

**O smoke test não prova que o PDF tem camada de texto extraível por um ATS.**

Assere que o arquivo existe, tem mais de 5 KB e começa com `%PDF-`. Provar extração de texto
exigiria um parser de PDF, ou seja, uma dependência nova — o projeto se compromete com zero
dependências. Registrado como `todo` no `tests/e2e/smoke-pipeline.test.ts`.
