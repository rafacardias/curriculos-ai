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

## 4. Item 1.5 — `AdapterCapabilities` e filtro cliente único

`remote_only` é configuração morta: existe no YAML, no `SearchSpec`, no `SearchParams`, é
editável na UI, e **0 de 5 adapters a desestrutura**. `location` só é lido pelo `linkedin-guest`;
`limit` é aceito na assinatura e nunca repassado pelo pipeline.

Interface já congelada no plano: `AdapterCapabilities` declara o que a fonte resolve no servidor,
e `applyClientSideFilters` é a implementação **única** do resto — para 5 adapters não divergirem
em 5 noções de "remoto".

Congelado em `tests/unit/adapters-remote-only.test.ts`, que assere que ligar e desligar
`remoteOnly` produz a mesma URL e o mesmo conjunto de vagas.

## 5. Item 1.4 — alerta de fonte morta

Erro de adapter é gravado em `search_runs.per_source` e **nunca alertado**. O LinkedIn está com
timeout há 3 buscas e isso nunca chegou ao operador. Escopo: leitura de `search_runs` no
`/status` e na UI.

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
