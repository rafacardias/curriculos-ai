# Baseline da Onda 1 — busca

Medição do estado **antes** de qualquer mudança na camada de busca, para que o aceite da
Onda 1 seja um delta numérico e não uma impressão. Todas as consultas são somente-leitura
sobre o banco real (`db/curriculos.db`, aberto em `mode=ro`).

**Data:** 2026-08-06 · **Commit:** `7bfa3bf` · **Última busca registrada:** 2026-07-13

---

## 1. Volume e funil

| Métrica | Valor |
|---|---|
| Vagas no banco | 375 |
| Empresas | 253 |
| `queued` (na fila) | 84 |
| `new` (filtradas ou abaixo do threshold) | 243 |
| `rejected` (rejeitadas por você) | 48 |
| Aplicações registradas | **1** |

## 2. Distribuição de score na fila — o problema em números

| Faixa | Vagas na fila | % |
|---|---:|---:|
| 40–45 (fundo do poço) | **36** | 43% |
| 45–55 | 25 | 30% |
| 55–65 | 18 | 21% |
| 65+ | **5** | 6% |

`min = 40.0` · `média = 49.5` · `max = 72.0`

**A leitura que importa:** `policy.generate_min_score` é **65**. Das 84 vagas que a fila
exibe, **5 passariam no crivo do próprio sistema para gerar kit**. Os outros 94% são ruído
que você percorre à mão. É literalmente a dor "abro a fila e não tem vaga que valha a pena".

E 43% da fila está entre 40 e 45 — coerente com o **BUG-002** (piso de 41,5 acima do
`queue_threshold` de 40).

## 3. Fontes

| Fonte | Vagas | Na fila | `location_fit` médio (de 15) |
|---|---:|---:|---:|
| gupy | 181 | 34 | **8.84** |
| linkedin | 74 | 20 | 13.99 |
| wwr | 45 | 8 | 15.00 |
| remotive | 40 | 2 | 15.00 |
| remoteok | 35 | 20 | 15.00 |

### BUG-006 (novo) — vagas brasileiras são penalizadas no score

`src/core/scoring.ts:63` só reconhece o Brasil quando a **string** "brasil"/"brazil" aparece
no campo `location`:

```ts
else if (job.location && /brazil|brasil/i.test(job.location)) locationFit = 1;
```

A Gupy — fonte 100% brasileira e a maior do banco — devolve `"São Paulo, SP"`,
`"Belo Horizonte, Minas Gerais"`. Nenhuma casa o padrão. **119 vagas da Gupy não-remotas
recebem `locationFit = 0.5` em vez de `1.0`.**

Efeito líquido: as vagas locais perdem ~6 pontos de score contra vagas remotas
internacionais, que recebem 15 automaticamente por serem `remote`. Num sistema cujo piso de
fila é 40, **6 pontos decidem quem entra**. A fila está enviesada para vagas remotas em inglês
e afunda as vagas brasileiras — o oposto do que a configuração pede
(`location: Brazil`, `remote_only: true`).

## 4. Duplicatas que o dedup exato não pega

O fingerprint é `sha256(normalize(empresa|título|local))`. Variação de título escapa.

**LawnStarter — 17 vagas no banco, 3 vagas reais:**

```
Senior Quality Engineer (Belo Horizonte | Campinas | Florianópolis | Porto Alegre | São Paulo)
Staff Product Engineer (Belo Horizonte | Campinas | Florianópolis | Mexico City | Montevideo | São Paulo)
Staff Software Engineer, Product (mesmas 6 cidades)
```

14 das 17 são ruído puro — a mesma vaga replicada por cidade, com o sufixo `(Cidade)`
fazendo o fingerprint diferir. **82% de ruído numa única empresa.**

**Stefanini Latam — 14 vagas, 12 títulos distintos.** Aqui vale a ressalva honesta: os três
`QA Automatizador` idênticos **não são** falha do dedup — são Santiago, Lima e Bogotá, com
job ids diferentes. São vagas distintas de verdade. O problema delas é outro: são vagas no
Chile, Peru e Colômbia numa busca configurada para o Brasil, e chegaram porque
`location` e `remote_only` são ignorados pelos adapters (**BUG-001**).

| Métrica | Valor |
|---|---:|
| Empresas com mais de 1 vaga | 12+ |
| Ruído de título na maior ofensora (LawnStarter) | 14 de 17 (82%) |
| Pares título+empresa normalizados com fingerprints distintos | 6 |

## 5. Saúde das fontes — falha silenciosa confirmada

Últimas 3 execuções de busca (`search_runs.per_source`):

| Fonte | Comportamento nas 3 últimas |
|---|---|
| remotive | 38 encontradas, **0 novas** nas 3 |
| remoteok | 0 · 2 · 0 |
| wwr | 0 · 24 · 2 |
| gupy | 0 · 1 · 3 |
| **linkedin** | **`timeout 30000ms` nas 3 execuções — 0 vagas** |

O LinkedIn está morto há pelo menos 3 buscas. O erro foi gravado corretamente em
`search_runs` **e nunca chegou a você** — não há alerta. É o modo de falha silenciosa que a
Onda 1 precisa fechar.

`new: 0` em quase tudo também diz que as queries atuais já esgotaram o que essas fontes
oferecem: o problema não é só ranquear melhor, é **buscar em mais lugares**.

## 6. Adapters honrando os parâmetros de busca

| Parâmetro | Adapters que honram |
|---|---|
| `remote_only` | **0 de 5** |
| `location` | 1 de 5 (só `linkedin-guest`) |
| `limit` | 0 de 5 (aceito na assinatura, nunca repassado pelo pipeline) |

---

## Critério de aceite da Onda 1

O commit da Onda 1 precisa trazer estas mesmas seis medidas, medidas do mesmo jeito, e o
delta contra esta baseline. Metas:

| # | Métrica | Hoje | Meta |
|---|---|---:|---|
| 1 | Vagas na fila acima do `generate_min_score` (65) | 5 de 84 (6%) | subir a fração de forma material |
| 2 | Fração da fila no fundo do poço (40–45) | 43% | cair |
| 3 | `location_fit` médio da Gupy | 8.84 | ~15 (BUG-006 corrigido) |
| 4 | Ruído de título na LawnStarter | 14 de 17 | ≤ 3 vagas após dedup por similaridade |
| 5 | Adapters honrando `remote_only` | 0 de 5 | 5 de 5 |
| 6 | Fonte morta sem alerta | LinkedIn, 3 buscas | alerta visível no `/status` e na UI |

**Nota de método:** as medidas 1–4 são recalculadas sobre o banco existente, sem busca nova,
para que o delta isole o efeito da mudança de algoritmo. Uma busca ao vivo depois disso mede
o efeito nas medidas 5–6 e traz vagas novas — mas ela insere linhas no banco real, então
acontece só com seu aval.

---

# Adendo — 1.2a `rescore`: medição do dry-run (2026-08-06)

O comando `rescore` foi construído antes de qualquer mudança no scorer, para que o efeito de
cada mudança fosse mensurável no acervo já coletado (o score é congelado no insert, então sem
ele nenhuma melhoria alcançaria a fila que o operador abre). O primeiro dry-run rodou com o
scorer **inalterado** — e é justamente por isso que ele mede algo.

## Resultado

`374` vagas elegíveis (375 no banco, 1 excluída por ter candidatura registrada).

| Cenário | Fila | Título relevante | Precisão | p50 | p90 | max |
|---|---:|---:|---:|---:|---:|---:|
| Hoje, score congelado | 84 | 53 | 63% | 45.8 | 60.4 | 69.7 |
| `rescore`, `preference` em 0.10 | 24 | 21 | 88% | 45.7 | 60.2 | 60.3 |
| `rescore`, `preference` em 0 (`keyword_overlap` 0.65) | 32 | 28 | 88% | 50.3 | 64.5 | 68.8 |

"Título relevante" = título casa `qa|quality|test|product owner|product manager|scrum|po|pm|automation`.
É uma proxy grosseira de relevância, mas é a mesma proxy nas três linhas, então o delta vale.

## Três achados que mudam o plano

**1. Dois dos cinco componentes estão mortos ou contra o operador.**

A queda que domina o diff (~22 pontos, uniforme) **não é ganho de scorer**. Decompõe em:

- `recency` → 0 para todas as 374 vagas. O decaimento é de 21 dias e o sistema ficou 3,5
  semanas parado. O componente (peso 0.15) deixou de discriminar qualquer coisa.
- `preference` → 0 para as vagas que antes pontuavam ~9.4/10. Não por decaimento: por sinal.

Aritmética do caso `Firefighter ARFF` (45.5 → 23.7): −12.4 de recência −9.4 de preferência = −21.8.

**2. `preference_weights` está anti-correlacionado com o objetivo declarado.**

98 chaves aprendidas de 70 eventos de feedback. Os extremos:

| Negativos | | Positivos | |
|---|---:|---|---:|
| `kw:product manager` | −9.50 | `source:remoteok` | +3.61 |
| `kw:qa` | −7.65 | `kw:claude` | +2.85 |
| `kw:scrum master` | −7.60 | `source:wwr` | +2.85 |
| `source:gupy` | −5.65 | `kw:ai agents` | +2.85 |
| `kw:product owner` | −5.65 | `kw:llm` · `kw:rag` | +1.90 |
| `kw:playwright` · `cypress` · `istqb` | −2.85 | `kw:n8n` | +1.90 |
| `seniority:junior` | −1.90 | | |

Todo termo que descreve as trilhas do operador carrega peso negativo; `source:remoteok` — a
fonte que produziu `Firefighter ARFF` e `Health Navigator I` — é o maior peso positivo do banco.

**Causa raiz: atribuição de culpa, não captura invertida nem ruído.** O aprendizado credita a
rejeição a *todos* os termos do JD, inclusive aos que fizeram a vaga ser um match. Rejeitar
"QA Senior" (rejeitada por ser sênior) ensinou que `qa` é ruim. Com uma fila 94% abaixo do
`generate_min_score`, 70 rejeições foram suficientes para inverter o vocabulário inteiro.

Com peso 0.10 contra 0.55 do `keyword_overlap`, o componente não decide sozinho — mas em vagas
cujo overlap é baixo (a maioria), ele decide.

**3. O `--commit` com a `preference` como está removeria vagas boas da fila.**

31 vagas de título relevante saem da fila, entre elas:

| Vaga | Antes | Depois |
|---|---:|---:|
| QA Automation Pleno - REMOTO | 60.1 | 38.3 |
| QA Automation Engineer \| Mid-Level (Remoto) | 52.8 | 31.0 |
| QA (Quality Assurance) Pleno \| Mobile \| Remoto | 52.8 | 31.0 |
| Technical Product Manager (Plataforma de Dados) | 45.8 | 35.8 |

Com `preference` em 0, esse número cai de 31 para 24 e o p50 sobe 4.6 pontos.

## Consequência para a ordem da onda

O 1.7 deixa de ser diagnóstico opcional no fim e passa a **bloquear** o primeiro `--commit`:
aplicar o rescore com o componente invertido gravaria a inversão sobre 374 linhas.

Correção recomendada, em duas partes separadas:

- **Agora, reversível e não destrutivo:** `scoring.preference: 0.10 → 0` e
  `scoring.keyword_overlap: 0.55 → 0.65` em `config/config.yaml`. Torna os pesos envenenados
  inertes **sem apagá-los** — eles seguem no banco para quando a regra de aprendizado for
  corrigida. Zerar a tabela `preference_weights` é destrutivo e não é necessário para desarmar
  o componente.
- **Roadmap:** consertar a atribuição de culpa (rejeição precisa creditar o *motivo* — nível,
  localidade, empresa — não o vocabulário inteiro do JD). Enquanto isso não existir, religar o
  componente reintroduz o problema.

## Nota de incomparabilidade de escala

Mudar `preference` para 0 e `keyword_overlap` para 0.65 mantém o denominador em 1.00, mas
**muda a semântica do número**: 45.5 na escala antiga e 45.5 na nova não são a mesma coisa.
`queue_threshold: 40` e `generate_min_score: 65` ficam descalibrados **por construção** — é
exatamente para isso que o item 1.6 (calibração final) existe. Nenhuma comparação de score
entre commits anteriores e posteriores a essa mudança é válida; use `score_previous` (migration
002) para reconstruir a escala antiga quando precisar comparar.

## Limite honesto do `rescore`

Ele é idempotente **na mesma leitura de relógio**, não ao longo do tempo: `recency` depende de
`Date.now()`, então rodar amanhã dá scores menores. Isso é correto (uma vaga de 40 dias não
pode manter a recência do dia 1) e está declarado aqui para não ser lido como bug depois.

---

# Adendo 2 — 1.2b/c aplicado, e as duas medições que reordenam a onda (2026-08-06)

`config/config.yaml`: `scoring.preference 0.10 → 0` e `keyword_overlap 0.55 → 0.65`.
Motivo e evidência completos em `KNOWN-BUGS.md` BUG-007.

## Dry-run na escala nova (nada escrito)

| | Fila | p50 | p90 | max | precisão |
|---|---:|---:|---:|---:|---:|
| Hoje, score congelado | 84 | 45.8 | 60.4 | 69.7 | 63% |
| `rescore`, escala nova | 32 | 50.3 | 64.5 | 68.8 | 91% |

A prova de que o `preference` era a causa: as 12 maiores quedas passaram a ser **todas ruído**
(Social Media Coordinator, Deputy CEO, Firefighter ARFF, HR Assistant, Support Technician).
No dry-run anterior, com `preference` em 0.10, três das doze maiores quedas eram vagas de QA
remoto — o componente estava punindo exatamente o alvo.

## Decisão de `recency` para o 1.6

**Idade do acervo: min 25d · p50 41d · max 1276d.** O decaimento é de 21 dias, então `recency`
vale 0 para **374 de 374** vagas. Não é um componente neutro: são 15 pontos de escala ausentes.

| Hipótese | `recency`>0 | fila | p50 | p90 | max | precisão |
|---|---:|---:|---:|---:|---:|---:|
| atual (21d linear) | 0/374 | 32 | 50.3 | 64.5 | 68.8 | 91% |
| H1 meia-vida 90d | 344/374 | 45 | 53.3 | 70.7 | 75.0 | 87% |
| H2 piso 0.4 | 374/374 | 41 | 52.0 | 69.3 | 74.8 | 90% |

**Escolha recomendada: H2.** H1 devolve discriminação *falsa* — com 90 dias, uma vaga de 60 dias
leva 33% dos pontos de recência, premiando vaga provavelmente preenchida. H2 preserva a
discriminação real na janela de 21 dias (que é quando importa: busca nova traz vagas de 0–21d)
e, para o acervo velho, devolve 6 pontos **uniformes** — que não discriminam nada, mas impedem
que a escala evapore e descalibre os dois thresholds. É calibração, não sinal.

Qualidade de dado para o roadmap: a vaga de 1276 dias é `posted_at` mal parseado.

## 1.2d — barreira de entrada: a medição ANTES do design

Medido sobre as 375 vagas (0 sem `description`, extração possível em todas).

**Os dois sinais especificados são anti-discriminantes.** Taxa de disparo por grupo:

| Sinal | `queued` | `rejected` | lift rej/queued |
|---|---:|---:|---:|
| "vivência em…" | 25% | 46% | **1.83×** |
| "experiência prévia / comprovada / sólida" | 24% | 42% | **1.75×** |
| anos em número (`detectRequiredYears`) | 11% | 8% | **0.78×** ✗ |
| diploma obrigatório | 25% | 21% | **0.83×** ✗ |

`detectRequiredYears` cobre só **10% do acervo** (37 de 375): o JD brasileiro pede requisito de
forma qualitativa, não numérica. Diploma obrigatório aparece em 31% — mas *menos* nas rejeitadas.

**Funil real:** 236 de 375 sem barreira pela definição original (63% acessíveis). Incluindo o
sinal qualitativo, ~47% ficam limpas. Na trilha `ai-builder`: 73 vagas, 49 acessíveis.

**Consequência de design:** não pode ser filtro duro. O sinal qualitativo dispara em 51% das
vagas que o operador **aprovou** — filtrar removeria metade da fila acessível. Penalidade
graduada + campo exibido na fila é o que a medição sustenta.

## Validação retroativa contra as 48 rejeições: NÃO serve como teste de aceitação

Serve como sanity check direcional. Três razões, a terceira fatal:

1. Lift de 1.8× é real, mas **51% das vagas mantidas também disparam o sinal**. Um classificador
   nessa separação erraria em metade da fila.
2. **41 das 48 rejeitadas são da trilha `product`; `ai-builder` tem 1 de 73.** A trilha-alvo
   passou a ser `ai-builder` — validar contra rejeições de Produto testa a população errada.
3. **0 de 95 vagas `senior` estão em `rejected`** — foram barradas pelo filtro duro antes de
   chegar aos olhos do operador. O conjunto rotulado tem viés de sobrevivência por construção.

O teste de aceitação honesto: corrigir o BUG-007, capturar motivo estruturado, e validar sobre
~25 decisões de `ai-builder` com motivo registrado. Vinte e cinco rótulos limpos valem mais que
48 confundidos.

---

# Adendo 3 — `rescore --commit` aplicado (2026-08-06)

## Proveniência do banco

| | |
|---|---|
| Backup automático pré-escrita | `db/backups/curriculos.2026-08-06T19-26-39Z.db` |
| `sha256` do backup | `1b2491caf0bd826aeaf89d7667869481b5e1cb30ddc4f24d8cab5629bcc06ad9` |
| `sha256` do banco **pós-commit** (WAL checkpointado) | `27ab405f1f6aaff439bc787e290e54a1a46756aefa63cd8f5d2460eb7021289a` |
| Vagas repontuadas | 374 de 375 (1 excluída por ter candidatura) |
| `score_previous` / `score_rescored_at` gravados | 374 / 374 |

**Idempotência verificada mecanicamente:** um `--dry-run` imediatamente após o `--commit`
devolveu `com mudança: 0`, `entram: 0`, `saem: 0` e distribuição idêntica.

O que mudou junto neste ciclo, além da repontuação: `scoring.recency_floor: 0.4` (H2 aprovada) e
`scoring.preference: 0` com `keyword_overlap: 0.65` (BUG-007).

## Antes/depois — as métricas da fila

Comparação sobre o **mesmo conjunto** nos dois lados: as 374 vagas repontuáveis, excluindo em
ambos a vaga com candidatura registrada (que mantém score congelado, `PRODUCT OWNER I` 72.0).
Os números "antes" vêm do `--dry-run`, medidos **antes** da escrita — é por isso que o dry-run
existe: depois do `--commit` a informação de qual vaga estava na fila já não é reconstruível.

| Métrica | Antes | Depois | Δ |
|---|---:|---:|---|
| Vagas na fila | 83 | **41** | −42 |
| Título relevante na fila | 52 (63%) | **37 (90%)** | +27 p.p. |
| p50 do score na fila | 45.8 | **52.0** | +6.2 |
| p90 do score na fila | 60.4 | **69.3** | +8.9 |
| max | 69.7 | **74.8** | +5.1 |
| Acima do `generate_min_score` (65) | 5 (6%) | **9 (22%)** | +16 p.p. |
| Fundo do poço (40–45) | 43% | **22%** | −21 p.p. |

Método: `p50` é mediana verdadeira (média dos dois centrais em n par) e `p90` é percentil por
`ceil`. A CLI foi uniformizada para o mesmo método — indexar por `floor` produzia um número que
discordava de qualquer outra leitura da mesma fila.

## Critério de aceite — estado das 6 métricas originais

| # | Métrica | Hoje (baseline) | Agora | Estado |
|---|---|---:|---:|---|
| 1 | Fila acima do `generate_min_score` | 5 de 84 (6%) | 9 de 41 (22%) | **atingido** |
| 2 | Fração da fila no fundo do poço (40–45) | 43% | 22% | **atingido** |
| 3 | `location_fit` médio da Gupy | 8.84 | 8.84 | pendente — item 1.3 |
| 4 | Ruído de título na LawnStarter | 14 de 17 | 14 de 17 | roadmap (dedup por similaridade) |
| 5 | Adapters honrando `remote_only` | 0 de 5 | 0 de 5 | roadmap (item 1.5) |
| 6 | Fonte morta sem alerta | LinkedIn, 3 buscas | idem | roadmap (item 1.4) |

## Topo da fila depois do rescore

| Score | Era | Vaga | Empresa | Fonte |
|---:|---:|---|---|---|
| 74.8 | 60.2 | Analista de Produto | Amo Promo | linkedin |
| 73.7 | 64.8 | Product Owner (EdTech) | Coruja Labs | gupy |
| 73.7 | 67.8 | Product Owner (Seguros de Vida) | Extractta | gupy |
| 70.5 | 69.7 | Analista Quality Assurance (QA) Júnior | Globo | linkedin |
| 69.3 | 63.5 | Product Manager | Ponta | linkedin |
| 69.3 | 56.7 | Product Owner (PO) | Prime Results | linkedin |

**Ressalva que o número não mostra.** O topo da fila é quase todo Produto/PO — porque as
`searches` em `config/config.yaml` são majoritariamente de Produto. A fila melhorou de verdade,
mas está otimizada para a trilha que o operador está **deixando**, não para `ai-builder`. Isso é
configuração de busca, não scorer: nenhum ajuste de score corrige uma fila que nunca recebeu as
vagas certas. É a próxima decisão de produto, e é do operador.

## Efeito colateral no BUG-002

Com `keyword_overlap` em 0.65 e `preference` em 0, o piso do fallback morto caiu de **41.5 para
39.5** — abaixo do `queue_threshold` de 40. O fallback **não** foi corrigido (uma vaga sem
trilha no banco ainda ganha 19.5 pontos de aderência que não existem), mas parou de encher a
fila sozinho. **A margem é de 0.5 ponto:** baixar `queue_threshold` para 39 na calibração do
item 1.6 ressuscita o BUG-002 inteiro. Congelado em `tests/unit/scoring.test.ts`.
