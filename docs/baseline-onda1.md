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
