# Bugs conhecidos

Registro dos defeitos encontrados durante a **Onda 0** (construção da rede de segurança).

A Onda 0 é rede de segurança, não refactor: a regra foi **congelar** o comportamento atual
em teste, não corrigi-lo. Cada bug abaixo tem um teste que assere o comportamento **de hoje**.
Quando a onda de correção chegar, **esses testes devem falhar** — é isso que prova que a
correção mudou algo de verdade.

A única exceção é o BUG-003, corrigido já na Onda 0 porque impedia a própria rede de existir.

| # | Gravidade | Estado | Onde |
|---|---|---|---|
| [BUG-005](#bug-005) | **Alta** | Congelado | `src/core/truthcheck.ts:26-28` |
| [BUG-002](#bug-002) | Média | Congelado | `src/core/scoring.ts:50` |
| [BUG-001](#bug-001) | Média | Congelado | os 5 adapters |
| [BUG-003](#bug-003) | Média | **Corrigido** | `src/core/pipeline.ts:41-45` |
| [BUG-004](#bug-004) | Baixa | Sem cobertura | `src/submit/linkedin-easyapply.ts` |
| [LIM-001](#lim-001) | — | Limitação aceita | `tests/e2e/smoke-pipeline.test.ts` |

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

**Congelado em:** `tests/unit/scoring.test.ts` — assere `score === 41.5` componente a componente.

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
