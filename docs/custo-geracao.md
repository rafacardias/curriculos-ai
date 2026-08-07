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
