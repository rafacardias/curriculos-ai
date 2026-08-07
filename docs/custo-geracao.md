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

### O que ainda está caro, e é hipótese não medida

1. **Raciocínio é ~62% do output** nas duas vias. `--effort low` não foi testado.
2. **`cache_creation` no TTL de 1 hora ($6/MTok) para conteúdo que nunca é relido** — 32.003
   tokens × $6/MTok = $0,19, **41% do custo do caminho novo**, puro desperdício num processo
   de 2 minutos.
3. **A revisão reenviou o `PROMPT.md` inteiro** (17.317 tokens). Ela precisa só do currículo
   atual, do gap de cobertura e dos fatos — não do bundle todo de novo.

Se os três forem endereçados, há caminho crível para ~$0,15–0,20 o par de disparos. **É
projeção, não medição** — ver a lição de método no `KNOWN-BUGS.md`.

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
