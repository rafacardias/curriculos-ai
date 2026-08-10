# Bugs conhecidos

Registro dos defeitos encontrados durante a **Onda 0** (construção da rede de segurança).

A Onda 0 é rede de segurança, não refactor: a regra foi **congelar** o comportamento atual
em teste, não corrigi-lo. Cada bug abaixo tem um teste que assere o comportamento **de hoje**.
Quando a onda de correção chegar, **esses testes devem falhar** — é isso que prova que a
correção mudou algo de verdade.

A única exceção é o BUG-003, corrigido já na Onda 0 porque impedia a própria rede de existir.

| # | Gravidade | Estado | Onde |
|---|---|---|---|
| [CLASSE-01](#classe-01--critério-sem-contexto) | — | **Classe de defeito**, não instância. Leia antes de escrever filtro novo | — |
| [BUG-007](#bug-007) | **Crítica** | **Parcialmente corrigido** (`f9378e6`): taxonomia ativa, componente segue desarmado, `source:*` ainda aprende | `src/core/feedback.ts` + `src/db/repo/feedback.ts` |
| [BUG-005](#bug-005) | **Alta** | **Corrigido** | `src/core/truthcheck.ts:31-50` |
| [BUG-006](#bug-006) | **Alta** | Medido, sem teste ainda | `src/core/scoring.ts:63` |
| [BUG-002](#bug-002) | Média | **Mitigado por efeito colateral** (41.5 → 39.5) | `src/core/scoring.ts:50` |
| [BUG-001](#bug-001) | Média | Congelado | os 5 adapters |
| [BUG-003](#bug-003) | Média | **Corrigido** | `src/core/pipeline.ts:41-45` |
| [BUG-004](#bug-004) | Baixa | Sem cobertura | `src/submit/linkedin-easyapply.ts` |
| [BUG-008](#bug-008) | **Alta** | **Corrigido** | `src/cli/kit.ts` (gates de conteúdo) |
| [BUG-009](#bug-009) | Média | **Corrigido** | `src/core/scoring.ts` (filtro de idioma) |
| [BUG-010](#bug-010) | **Alta** | **Corrigido** (`ORDER BY id ASC` + desempate por especificidade, branches separadas) | `src/core/scoring.ts:46` (`scoreJob`) |
| [REQ-004](#req-004) | **Alta** | Medido; veredito pontual | `src/core/master-resume.ts` |
| [REQ-003](#req-003) | **Alta** | Medido; correção é do operador | `profile/tracks.yaml` |
| [REQ-002](#req-002--segmentação-por-seção-implementada-em-2026-08-07) | — | **IMPLEMENTADO** (`src/core/jd-sections.ts`) — 92% do acervo segmentado | `src/core/jd-sections.ts` |
| [REQ-001](#req-001) | — | Requisito aberto da Fase 2 | `src/core/master-resume.ts` |
| [LIM-001](#lim-001) | — | **FECHADO** | `tests/e2e/kit-ats-gate.test.ts` |

**Notas de decisão** (não são bugs — são custos assumidos e consequências que precisam ser
achadas de novo, não redescobertas):

| Nota | Assunto |
|---|---|
| [Consequência de `8441497`](#consequência-do-commit-8441497--a-série-histórica-de-score-quebra-aqui) | comparação histórica de fila só vale a partir deste commit |
| [Custo do filtro de Python](#custo-assumido--o-filtro-de-python-é-a-fronteira-da-trilha-não-um-detalhe-de-config) | ~13 vagas "AI Engineer" a menos; **primeira alavanca a reconsiderar** se a fila piorar |
| [Modalidade pendente](#modalidade-pendente--o-terceiro-estado) | `remote_type` NULL não é "tudo bem"; o terceiro estado e como resolvê-lo |
| [ACHADO-05](#achado-05--o-10x-advisory-escapou-de-dois-filtros-e-nenhuma-das-hipóteses-estava-certa) | o filtro de tecnologia precisa de **seção**, não de marcador; e o detector de anos perde 37 vagas |
| [CLASSE-01 inst. 6](#classe-01-instância-6--indexof-devolvendo-1-lido-como-índice-válido) | `indexOf` −1 lido como índice; dry-run e commit por caminhos diferentes |
| [CLASSE-01 inst. 7](#classe-01-instância-7--chave-sem-valor-lida-como-informação-disponível) | `candidate_facts` sem `value` custou 7 dos 38 turnos de uma geração — mais que escrever os entregáveis |
| [CLASSE-01 inst. 8](#classe-01-instância-8--variante-ausente-lida-como-variante-válida) | **a mais perigosa**: variante não declarada ao redator entraria no warehouse como dado válido. Verificado: nada entrou |
| [CLASSE-01 inst. 9](#classe-01-instância-9---tools-sem---allowedtools) | `--tools` sem `--allowedTools` = `permission_denied` silencioso. A degradação honesta salvou por sorte, agora está testada |
| [Lição de método](#lição-de-método--número-não-medido-nesta-sessão-é-hipótese-não-premissa) | **terceira vez** que número citado de memória virou fundamento de plano. Nenhuma fase é autorizada por projeção |
| [ACHADO-06](#achado-06--detectseniority-mapeia-especialistaspecialist--senior-e-filtra-51-do-acervo) | "Specialist" tratado como sênior filtra 5 vagas vivas de ai-builder. **Corrigido** (`src/core/dedup.ts:37`) |
| [Erro só em memória](#erro-de-pipeline-que-só-existe-em-memória) | cartão de erro some no restart — [promovido](#prioridade-movida-generation_runs-sai-da-fase-3) para logo depois da segmentação |
| [ACHADO-07](#achado-07--migration-002testts-prova-o-lint-anti-droprename-só-contra-migrations-limpas) | lint anti-`DROP`/`RENAME` nunca testado contra migration que deveria falhar. **Medido, não corrigido** |
| [ACHADO-08](#achado-08--remote_only-do-config-de-busca-é-decorativo-em-toda-a-stack) | nenhum adapter lê `remote_only`; `doSearch` do servidor nem repassa o campo. **Medido, não corrigido** |
| [ACHADO-09](#achado-09--err_http_headers_sent-pré-existente-em-mainnenhum-teste-sobe-o-servidor-http-real) | `ERR_HTTP_HEADERS_SENT` reproduz idêntico em `main`; nenhum dos 360 testes sobe o dispatcher HTTP de verdade. **Medido, não corrigido** |
| [ACHADO-10](#achado-10--get-apitracks-devolve-trilhas-desabilitadas-o-filtro-é-só-no-cliente) | `GET /api/tracks` devolve todas as trilhas, inclusive desabilitadas — filtro é só em `app.html`. **Medido, não corrigido** |
| [ACHADO-11](#achado-11--o-board-da-gupy-por-empresa-não-tem-api-é-scrape-de-__next_data__) | `<handle>.gupy.io/api/v1/jobs` é 404 — o board por empresa é scrape de `__NEXT_DATA__`, não integração estável. Filtro léxico da Fase A é título+departamento, sem descrição: 2/782 vagas passaram na validação real. Modalidade estruturada: 782/782 (100%). **Corrigido** (adapter redesenhado) |
| [ACHADO-12](#achado-12--totvsgupyio-é-404-de-verdade-handle-removido-do-cadastro) | `totvs.gupy.io` e 5 variações óbvias são 404 — handle errado, não "não confirmada". TOTVS removida de `config/companies.yaml`. **Corrigido** (removida) |
| [ACHADO-13](#achado-13--léxico-de-qaproduct-compartilha-6-keywords-genéricas--sobre-captura-real-mas-menor-do-que-a-primeira-medição) | 6 keywords idênticas entre `qa`/`product`. 44%/95 → 19%/57 (ordem fixa) → **18%/60 (ordem fixa + especificidade)**. Léxico não tocado |

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

### Estado — PARCIALMENTE CORRIGIDO em 2026-08-07 (`f9378e6`)

O componente **continua desarmado** (`scoring.preference: 0`). O que mudou é que a tabela parou
de ser envenenada.

| Item exigido | Estado |
|---|---|
| 1. vocabulário fechado de motivo | ✅ `elegibilidade` · `tema` · `outro` (três, não cinco — as cinco propostas colapsam nessas) |
| 2. só motivo temático alimenta `preference_weights` | ✅ `src/core/feedback.ts`; classe **ausente não aprende** |
| 3. `source:*` deixar de ser chave aprendida | ❌ **não feito** — `source:linkedin` ainda é escrito |
| 4. migration para a coluna de motivo | ~ a classe vive no payload do evento (`reason_class` + `learned`), auditável, mas não é coluna |

**Extra que a recaída exigiu:** aprovação passou a ser idempotente por `job_id`. Um retry de vaga
cuja geração morreu no limite de sessão contava como segunda aprovação.

### A recaída de 2026-08-07 — o motivo estava lá e era ignorado

Cinco rejeições em que o operador **digitou** o motivo: `"Hibridas em outras cidades"`. O sistema
gravou o texto no evento e não olhou para ele ao aprender. Resultado, em 26 chaves:

| | | | |
|---|---:|---|---:|
| `kw:orquestração` | −3,0 | `source:linkedin` | −3,5 |
| `kw:integração` | −2,0 | `kw:agentes de ia` | −1,0 |
| `kw:vector database` | −1,0 | `kw:openai` | −0,9 |

LinkedIn é a fonte de 11 das 16 vagas da fila. As 26 chaves foram **estornadas** com
`scripts/revert-eligibility-feedback.ts` (o estorno reconstrói as chaves pela mesma função que as
escreveu, e devolveu exatamente os valores pré-rejeição). As 145 chaves anteriores à taxonomia
ficam como registro de época.

**Segunda condição para religar**, além da taxonomia: a tabela precisa ser auditável quanto à
classe que gerou cada peso. Hoje só os pesos escritos a partir de `f9378e6` são — os de antes não
têm classe e nunca terão.

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

### ACHADO-06 · `detectSeniority` mapeia "especialista/specialist" → `senior` e filtra 5,1% do acervo

**Corrigido** (2026-08-08) — medido primeiro, por instrução explícita do operador: *"quero medir
quantas vagas isso atinge antes de mexer."* Depois de medido, a correção foi autorizada.

`src/core/dedup.ts:37` tratava `especialista` e `specialist` como sinônimos de sênior. Com
`exclude_seniority` incluindo `senior`, isso filtrava **33 de 642 vagas (5,1%)**.

O volume é pequeno; a composição é que importa. Das 8 vivas (`status = new`), **5 são da trilha
ai-builder**:

| score | título |
|---:|---|
| 64,83 | AI & Automation Specialist (Full-Time) |
| 60,50 | ESPECIALISTA I ENGENHARIA MACHINE LEARNING |
| 59,00 | Especialista em Automação e IA *(Techne — a vaga que o operador adicionou à mão)* |
| 38,83 | Especialista Engenheiro de IA |
| 37,30 | Marketing & Automations Specialist |

**Duas evidências de que o mapeamento está errado, não só apertado:**

1. **Em inglês, "Specialist" não carrega senioridade nenhuma.** O filtro classificou como sênior
   `Data Entry Specialist Assistant Administrator`, `Patient Care Specialist` e
   `Product Sales Specialist — Pet Health`. São títulos de entrada.
2. **Em português corporativo, "Especialista I" é banda, não topo.** Sete dos 33 casos são
   `… Especialista I`, que na escada de carreira brasileira (Especialista I/II/III) é a **entrada**
   da faixa, não o teto.

É a forma B da CLASSE-01: um token lido como classificação sem o contexto que o qualificaria.

**Correção aplicada:** `especialista`/`specialist` saiu da alternativa de `senior` sozinho — agora
só classifica como sênior quando vem com o numeral de banda de topo (`III`) ou um qualificador
explícito ("sênior"/"senior"). `especialista I`/`especialista II`/`specialist` sem numeral voltam
`undefined` (sem sinal), não mais `senior`. As 5 vagas ai-builder da tabela acima, e os três casos
"Specialist" de título de entrada em inglês, testados em `tests/unit/dedup.test.ts` (describe
`ACHADO-06`). `especialista III` e `especialista sênior` continuam `senior` — o caso real de topo
não regrediu.

`seniority` é congelado no `INSERT`, igual ao `score` — sem propagar a correção para o acervo já
coletado, as 5 vagas continuariam presas na leitura antiga. `rescoreAll` (`src/core/scoring.ts`)
agora recalcula `seniority` a partir do título a cada repontuação, do mesmo jeito que já recalcula
o score; `npx tsx src/cli/rescore.ts --commit` aplica no banco real.

**Resultado medido no `--commit` de 2026-08-08 (fila 4→6):** das 5 vagas da tabela, só 2 voltaram —
`AI & Automation Specialist` e `ESPECIALISTA I ENGENHARIA MACHINE LEARNING`. Das outras 3: uma
(`Especialista em Automação e IA`, Techne) já tinha `applications` — candidatura já decidida pelo
operador, `rescoreAll` corretamente não mexe; as outras duas (`Especialista Engenheiro de IA`,
`Marketing & Automations Specialist`) continuam de fora, agora por filtros **legítimos e
independentes** (Python fora do perfil; 3+ anos exigidos) que o filtro de senioridade errado só
mascarava. **O filtro errado escondia três exclusões corretas** — é por isso que medir antes de
corrigir valeu a pena: "5 voltando juntas" era a expectativa errada, e só ficou visível depois que
as 5 foram verificadas uma a uma, não pelo tamanho do achado original.

### ACHADO-07 · `migration-002.test.ts` prova o lint anti-`DROP`/`RENAME` só contra migrations limpas

**Medido, não corrigido** — achado da varredura de controles positivos de 2026-08-08 (28 arquivos
de teste, 0 sem controle positivo, 1 parcial — este).

O teste que confirma "nenhuma migration contém comando destrutivo" só roda a regex contra as
migrations reais, que já são limpas por construção. Ele nunca é exercitado contra um caso que
**deveria** disparar — uma migration sintética com `DROP`/`RENAME` de propósito. É a forma C da
CLASSE-01: o teste confirma o esperado sem nunca distinguir "protegido pela regex" de "correto por
acaso", porque a regex nunca teve chance de falhar contra um input que deveria reprovar.

**Correção proposta (próxima rodada):** uma migration sintética fixture com `DROP TABLE` (ou
`RENAME`), e um teste que afirma que o lint a rejeita. Uma linha de asserção nova, não redesenho.
Nada foi alterado.

### ACHADO-08 · `remote_only` do config de busca é decorativo em toda a stack

**Medido, não corrigido** — achado da exploração da Fase 1 (filtro dual de localização pedido
pelo operador; decisão foi fechar o buraco real de modalidade/localidade em vez de construir a
UI de busca dual, exatamente por causa deste achado).

`config.yaml → searches[].remote_only` existe no schema (`src/core/config.ts`), é salvo e
exibido na UI de CONFIG ("BUSCAS CONFIGURADAS"), mas **nenhum adapter o lê**: `gupy.ts`,
`remotive.ts`, `remoteok.ts` e `wwr.ts` desestruturam só `{ query, limit }` do `SearchParams`;
`linkedin-guest.ts` é o único que usa `location` de fato (na URL da busca), mas também ignora
`remoteOnly`. O toggle é armazenado e mostrado, sem nunca mudar um resultado de busca.

Consequência prática: duas buscas salvas com a mesma query e `location`/`remote_only`
diferentes, para 4 das 5 fontes, buscam exatamente o mesmo resultado bruto — a dedup por
`jobFingerprint` (que usa a localização do PRÓPRIO anúncio, não o filtro de busca) absorve a
duplicata silenciosamente, e nenhum filtro real acontece.

**Achado paralelo**: `doSearch()` no servidor (`src/server/index.ts`, usado pelo `/api/search`)
nem repassa `remote_only` para `runSearch` — só `location` — diferente do CLI (`src/cli/search.ts`),
que passa os dois. Mesma vaga, mesmo config, comportamento diferente dependendo de quem disparou
a busca.

A proteção real que o operador queria (BH aceita qualquer modalidade, fora disso só remoto) não
vem daqui — vem do filtro pós-coleta (`exclude_onsite_outside_home_uf` + `blocksGeneration`,
ver Fase 1 desta sessão). Corrigir `remote_only` para filtrar de verdade exigiria investigar a
API de cada fonte individualmente (nem toda API de vaga aceita filtro de modalidade na busca) —
escopo maior que o que foi pedido. Nada foi alterado.

### ACHADO-09 · `ERR_HTTP_HEADERS_SENT` pré-existente em `main`; nenhum teste sobe o servidor HTTP real

**Medido, não corrigido** — achado do smoke test manual da Fase 1-3 (2026-08-09). Subir
`src/server/index.ts` manualmente (`CURRICULOS_ROOT` apontando pro sandbox de teste, porta 4780)
crashou dentro de ~3s de boot, antes de qualquer `curl` deliberado:

```
Error [ERR_HTTP_HEADERS_SENT]: Cannot write headers after they are sent to the client
    at ServerResponse.writeHead (node:_http_server:365:11)
    at json (src/server/index.ts — catch genérico do dispatcher)
    at Server.<anonymous> (src/server/index.ts, mesmo catch)
```

O `catch` genérico do dispatcher HTTP (`} catch (err) { json(res, 500, ...) }`) tenta escrever
uma resposta numa conexão que **já recebeu resposta** de outro código-path da mesma requisição.

**Reproduzido igual em `main`** (checkout limpo, mesmo sandbox, mesma janela de 3s, mesmo
stacktrace, só a linha muda porque `main` não tem as rotas novas de `/api/tracks` antes) — não é
regressão dos 3 commits de Fase 1-3 (`feature/queue-improvements`). É bug pré-existente, nunca
detectado porque **nenhum dos 360 testes da suíte sobe o servidor HTTP de verdade** — todos
chamam as funções (`apiQueue`, `doApply`, `doFeedback` etc.) diretamente, pulando o dispatcher
`createServer(...)` inteiro. É por isso que rotas HTTP passam 100% verde nos testes e ainda assim
podem quebrar ao vivo.

**Gatilho confirmado do crash nas subidas manuais** (não é mais hipótese): `src/server/index.ts`
chama `execFileSync("open", ["http://localhost:4780"])` dentro do callback de `.listen()` sempre
que `process.env.CURRICULOS_SERVICE` não está setado (linha ~627). Essa variável só é setada no
plist do `launchd` (`src/local/ui-agent.ts:46`, `CURRICULOS_SERVICE=1`) — **nunca** por um `npx
tsx src/server/index.ts` manual. Ou seja: toda subida manual desta sessão (3 tentativas, mais uma
4ª com `lsof` — nenhuma setou a variável) abriu de fato uma aba de browser nova apontando pra
`localhost:4780`, que carrega `app.html` e dispara `loadAll()` imediatamente (rajada de ~7 GETs
concorrentes: `/api/summary`, `/api/queue`, `/api/applications`, `/api/companies`,
`/api/pipeline`, `/api/rejected`, `/api/tracks`) contra um processo que acabou de subir. É por
isso que `launchd` (que seta `CURRICULOS_SERVICE=1` e portanto nunca chama `open()`) nunca
crashou nas mesmas condições, e toda subida manual crashou 3 de 3 vezes.

**`lsof -i :4780` não flagrou nada**: nem antes de derrubar o serviço real, nem imediatamente
depois (porta limpa), nem 0,8s após a subida manual (processo ainda nem tinha aberto a porta
nesse instante) — o que é consistente com o gatilho ser a ABERTURA da aba pelo `open()`, que só
acontece DEPOIS do `.listen()` bem-sucedido, não uma conexão pendente de antes.

**Harness in-process criado** (`tests/e2e/server-http.test.ts`) — `createApp()` (refatoração
mínima em `src/server/index.ts`: o handler que vivia dentro de `createServer(...)` virou uma
função exportada que NÃO escuta porta nem chama `open()`; só o bloco de entrypoint no fim do
arquivo, guardado por `isMainModule` — comparação de `import.meta.url` contra `process.argv[1]`
— chama `.listen()` de verdade). O teste sobe em porta efêmera (`listen(0)`), sandbox via
`CURRICULOS_ROOT`, nunca a porta 4780 real nem o banco de produção. Fecha o buraco de cobertura
por construção: `GET /api/tracks` e `POST /api/score-confirm` agora têm prova HTTP real (6
testes, `npm test`), incluindo a prova pelo CLI de que `kit prepare` sai 6 antes da confirmação
e para de sair 6 depois.

**Tentativa de reproduzir o crash no harness in-process: não reproduziu.** Uma rajada dos mesmos
~7 GETs concorrentes que `loadAll()` dispara (via `fetch` real, não mock) contra a instância
efêmera devolveu 200 e JSON válido em todas as 7, sem exceção. Isso não prova que o dispatcher
está correto — só prova que "GETs concorrentes simples" não é o gatilho sozinho. Combinado com o
achado do `open()`, a hipótese mais provável agora é algo específico do CLIENTE real (browser)
que um `fetch` limpo não replica: uma requisição abortada a meio caminho (ex. o próprio
`loadAll()` sendo re-disparado antes da rodada anterior terminar, ou uma aba fechada cancelando
uma requisição em voo), ou a tentativa de upgrade do WebSocket (`/term`) competindo com uma
resposta HTTP normal na mesma conexão keep-alive. Não investigado mais fundo — fica registrado
como próximo passo, não como causa confirmada.

**Correção do dispatcher**: continua não feita nesta sessão, por decisão explícita — é uma
decisão separada da cobertura de teste. O que motivaria investigar: o `catch` genérico
(`} catch (err) { json(res, 500, ...) }`) não verifica `res.headersSent` antes de escrever — um
guard ali (`if (!res.headersSent) json(res, 500, ...)`) provavelmente silenciaria o sintoma sem
entender a causa raiz (por que dois code-paths respondem a mesma conexão), o que teria o mesmo
cheiro do CLASSE-01: tratar o sintoma, não a classe do defeito.

### ACHADO-10 · `GET /api/tracks` devolve trilhas desabilitadas — o filtro é só no cliente

**Medido, não corrigido** — achado do harness in-process (`tests/e2e/server-http.test.ts`,
ACHADO-09), promovido de nota de rodapé a achado próprio por pedido do operador.

`src/server/index.ts`, rota `GET /api/tracks`, chama `listTracks()` sem `{ onlyEnabled: true }` —
devolve TODAS as trilhas, `enabled: 0` incluído. O dropdown da fila (`app.html`,
`loadTrackFilter()`) filtra depois de receber a lista inteira (`.filter(t => t.enabled)`); o
painel de CRUD em CONFIG (`loadTracksAdmin()`) usa a mesma rota e precisa ver as desabilitadas
pra poder reabilitá-las — foi por isso que o servidor não filtra, não por descuido.

**Por que isso é ACHADO e não só um detalhe de implementação**: o contrato da rota, hoje, só é
seguro porque o único consumidor é `app.html`, que sabe filtrar. Qualquer consumidor NOVO que
chame `GET /api/tracks` esperando "as trilhas que valem" (o nome da rota sugere isso, não "todas
as trilhas, filtre você") recebe trilha desabilitada sem sinal nenhum de que ela está fora de
uso — a não ser ler `enabled` e saber que precisa checar. A Fase A da vigilância por empresa é
exatamente esse consumidor novo em potencial, se algum dia precisar consultar trilhas via HTTP
em vez de importar `listTracks()` direto do repo.

**Correção proposta (não feita nesta sessão)**: `GET /api/tracks` aceitar `?enabled=true`
(default mantém o comportamento atual — todas — pra não quebrar o painel de CONFIG), e
`loadTrackFilter()` passar a pedir só as habilitadas ao servidor em vez de filtrar depois de
baixar tudo. Nada alterado.

### ACHADO-11 · o board da Gupy por empresa não tem API — é scrape de `__NEXT_DATA__`

**Corrigido** — a primeira versão de `company-gupy.ts` (Fase A) assumiu, sem verificar ao vivo,
que `<handle>.gupy.io/api/v1/jobs` seria o mesmo tipo de endpoint JSON que o agregador
(`employability-portal.gupy.io`) já usa. É 404 de verdade — confirmado contra Localiza e Algar
reais. **Não existe API pública por empresa.** O que existe é a página do board
(`<handle>.gupy.io/`), Next.js server-rendered, com as vagas embutidas em
`<script id="__NEXT_DATA__">` no HTML — `props.pageProps.jobs`, um array com TODAS as vagas de
uma vez (773 pra Localiza, 9 pra Algar, sem paginação — SSR, não API paginada).

**Isto muda a natureza do adapter**: não é integração estável, é scrape estruturado. `ats: "gupy"`
em `companies-config.ts` está documentado como best-effort declarado — quebra sem aviso se a Gupy
mudar o build do Next. Falha de parse vira `error` por empresa no orquestrador, nunca uma exceção
que aborta o lote (já era assim antes; a diferença é que agora está documentado que ISTO é o
motivo de existir, não só defesa genérica).

**Consequência pra prioridade da Fase B (registrada, não muda a ordem agora)**: se Gupy já é
scrape, Greenhouse — API JSON real e versionada — passa a ser o único adapter genuinamente
estável desta feature. Vale mais peso na decisão de qual vem primeiro na Fase B do que só "caso
real confirmado" (Hotmart).

**Shape sem `description`**: `pageProps.jobs` não traz o texto do anúncio, só
`title`/`department`/`workplace`. Buscar a descrição de cada vaga exigiria um 2º request por
vaga (até 773 só pra uma empresa) — fora do escopo "núcleo mínimo" da Fase A. `department` entra
no campo `description` do `RawJob` só pra dar ao filtro léxico um pouco mais que o título
sozinho — mas o filtro da Fase A é **título+departamento**, não JD completo.

**Os três números pedidos, medidos contra Localiza + Algar reais (`watch run`, dry-run, sem
escrever):**

| | valor |
|---|---:|
| total de vagas (efetivas, banco de talentos já excluído) | 782 |
| passaram o filtro léxico título+departamento | **2 (0,3%)** |
| modalidade estruturada (`workplaceType` presente) | **782/782 (100%)** |

**O filtro título-only tem recall baixíssimo, como esperado** — "Especialista em Produto III"
não menciona "product manager"/"product owner", e não tem descrição pra compensar. Isso é uma
limitação REAL da Fase A, não um bug: qualquer melhoria de recall (buscar descrição, matching
mais permissivo) é decisão de Fase B/C, com custo de request explícito a pesar.

**A modalidade estruturada, por outro lado, é 100%** — as 782 vagas efetivas de Localiza+Algar
TÊM `workplaceType` sempre presente (distribuição real: remote 10, hybrid 80, on-site 692,
ausente 0). Pra este par de empresas, o gargalo do exit 5 (modalidade não verificada) **é
eliminado por inteiro** nas vagas que a vigilância captura — não parcialmente, 100%. Isso é
melhor do que a premissa original ("ATS quase sempre expõe modalidade de forma limpa") assumia.
Ver também `docs/custo-geracao.md`, seção "O gargalo do exit 5, atacado na origem".

**0,3% não é "recall baixo" — é o filtro calibrado na direção errada.** 2 de 782 é quase zero, e
a assimetria de erro importa mais que a taxa: falso positivo custa um `scoreJob` (~nada); falso
negativo custa a vaga inteira, a única coisa que a feature existe para não perder. Não corrigido
nesta sessão, por decisão explícita — mas a pergunta certa pra Fase B não é "como melhorar o
léxico", é **por que filtrar antes do `insertJob`**. `scoreJob`+`decidePolicy` já são um
classificador mais rico que keyword match contra título+departamento, o gate de score
(`blocksGenerationByScore`, sessão anterior) já cuida do que não presta, e 782 vagas por poll é
trivial pra HTTP+SQL absorver sem filtro léxico nenhum. Inverter — inserir tudo, deixar o score
decidir — ressuscita a pergunta que a investigação de dedup desta sessão descartou (tabela de
"vistos" pros que o filtro léxico rejeita nunca era necessária porque nada era filtrado antes do
insert): sem filtro léxico, TODA vaga vira `insertJob`, e o dedup por `(source, source_job_id)`
(007_watch_dedup.sql) passa a ser o único guarda-corpo contra floodar `jobs` com vaga de
motorista a cada poll. Decisão de fase, não desta sessão.

### ACHADO-12 · `totvs.gupy.io` é 404 de verdade — handle removido do cadastro

**Corrigido** — a nota original de `config/companies.yaml` dizia "TOTVS está em Gupy mas NÃO foi
confirmada em GPTW/BH". Verificado ao vivo nesta sessão: **`totvs.gupy.io` não existe** (404
genuíno, não just "não confirmada"). Tentadas 5 variações óbvias de handle
(`totvsgrupo`, `grupototvs`, `totvscarreiras`, `totvs-carreiras`, `vagastotvs`) — todas 404.
Parado de adivinhar em vez de continuar tentando variações às cegas.

TOTVS removida de `config/companies.yaml`. O critério de aceite da Fase A passa a ser
Localiza + Algar (2 empresas reais e verificadas) — a prova de dedup (segunda execução → zero
vagas novas) funciona igual com n=2. Se um dia fizer sentido incluir a TOTVS, o handle certo
precisa ser achado primeiro (busca dedicada, não adivinhação de padrão).

### ACHADO-13 · léxico de `qa`/`product` compartilha 6 keywords genéricas — sobre-captura real, mas menor do que a primeira medição

**Medido, não corrigido.** Pedido do operador depois de notar que "AGILE TRANSFORMATION ANALYST
SÊNIOR" (vaga real da vigilância, Localiza) caiu em `qa` quando deveria competir com `product`.

**A primeira medição (44%, 42/95) não era reproduzível** — ela usou o `track_hint` GRAVADO no
banco, que carrega o BUG-010 (consulta sem `ORDER BY`, desempate por acidente de ordem). Refeita
com `ORDER BY id ASC` explícito (determinístico, ainda que não "correto" — ver BUG-010) antes de
tratar qualquer número como baseline:

| | valor original (não reproduzível) | valor sob ordem fixa |
|---|---:|---:|
| vagas classificadas `qa` | 95 | **57** |
| sem nenhuma keyword QA-específica | 42 (44%) | **11 (19%)** |

**O número mudou — e isso já prova o ponto que motivou medir de novo**: 38 das 95 vagas
originais só estavam em `qa` por causa do empate não-determinístico (BUG-010), não por overlap
de léxico genuíno. Descontado o ruído do BUG-010, a sobre-captura real por léxico compartilhado
é **19%, não 44%** — menor, mas ainda não-zero, e ainda estrutural: seis keywords do léxico de
`qa` são IDÊNTICAS às de `product` (`jira`, `agile`, `scrum`, `kanban`, `critérios de aceite`,
`acceptance criteria` — comparar os dois arrays em `profile_tracks`), nenhuma delas
QA-específica.

**Caso concreto, verificado sob ordem fixa**: `"SCRUM MASTER PL"` e `"SCRUM MASTER SR"` — cargo
que o próprio léxico de `product` reconhece por nome (`"scrum master"` é keyword literal ali) —
recalculadas com `ORDER BY id ASC` viram `product`, corrigindo o exemplo original. Mas isso é
`product` vencer por vir antes de `qa` na ordem alfabética dos ids, não por especificidade — o
BUG-010 sozinho (`ORDER BY`, sem peso por especificidade) resolveria ESTE par por coincidência
de nomenclatura, não resolveria a classe.

**11 vagas que sob ordem fixa continuam em `qa` só por termo genérico** (`sql`/`agile` sem
nenhum termo QA-específico) — a lista completa está no output da medição, não reproduzida aqui;
inclui casos como `Analista de CRM Júnior`, `Senior AML Analyst`, que não são vagas de QA.

**Atualização (2026-08-09, depois do desempate por especificidade)**: com `ORDER BY` +
especificidade (ver BUG-010 → "Desempate por especificidade"), o número passa de 19%/57 para
**18%/60** — praticamente igual, mas o CONJUNTO de vagas mudou: 2 vagas obviamente mal
classificadas por acidente alfabético entraram em `qa` corretamente (`QA Automation Engineer`,
`Analista Automação Testes Pleno`), e 1 falso-positivo novo entrou por outro motivo (`quality
assurance` como boilerplate de JD, não sinal real — ver detalhe no BUG-010). A especificidade não
substitui a correção de léxico abaixo; ataca um bug de critério, não o léxico compartilhado em si.

**Correção proposta (não feita nesta sessão)**: remover de `qa` as 6 keywords compartilhadas com
`product` (ou vice-versa, decisão de léxico) — resolve os ~18% remanescentes. Antes do BUG-010 não
fazia sentido tocar o léxico porque parte do sinal de "sobre-captura" vinha do bug de ordenação;
agora o número é limpo o bastante pra essa correção valer a pena, quando for a vez do léxico.

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

## BUG-010 — `scoreJob` não tem `ORDER BY` na consulta de trilhas: `track_hint` é parcialmente não-determinístico

Achado inicial: ACHADO-13 (vigilância por empresa, "AGILE TRANSFORMATION ANALYST SÊNIOR"
classificada `qa` quando deveria competir com `product`). Reclassificado de achado pra bug
depois de medir — ausência de `ORDER BY` numa consulta que decide empate é defeito objetivo, o
fix é trivial e isolado, não é uma questão de léxico.

`src/core/scoring.ts:46`, `scoreJob`: `SELECT id, keywords FROM profile_tracks WHERE enabled =
1` — sem `ORDER BY`. Quando duas trilhas empatam em `frac` de overlap (`if (frac > overlap)` é
estritamente maior, nunca `>=`), a vencedora é a que a consulta devolve primeiro — e SQLite não
garante ordem sem `ORDER BY` explícito. Na prática, a ordem tende a ser estável entre execuções
do mesmo processo (ordem de inserção/rowid), mas não é uma garantia da linguagem, muda com
`VACUUM`, reindexação, ou qualquer mudança na tabela.

**Medido (2026-08-09), recalculando as 733 vagas que hoje têm `track_hint`, com `ORDER BY id
ASC` × `ORDER BY id DESC` explícitos:**

| | valor |
|---|---:|
| vagas cujo `track_hint` recalculado difere do valor GRAVADO hoje no banco | **72/733 (9,8%)** |
| a MESMA vaga, mesmo texto, classificação diferente só trocando ASC↔DESC | **72/733 (9,8%)** — os mesmos 72 |

Os dois números baterem exatos confirma: são exatamente os casos de empate, e são casos reais,
não hipotéticos — quase 1 em cada 10 vagas já classificadas no banco tem uma trilha que depende
de ordem de leitura, não de sinal.

**Verificado com um par concreto**: `SCRUM MASTER PL` e `SCRUM MASTER SR` (gravadas `qa`) viram
`product` sob `ORDER BY id ASC` — mas por ACIDENTE alfabético (`product` vem antes de `qa` na
ordem alfabética dos ids das trilhas), não porque `ORDER BY id` seja uma correção de verdade.
`ORDER BY` sozinho torna o resultado REPRODUTÍVEL, não CORRETO — o desempate continua arbitrário
(a trilha "primeira na ordem" vence, não a trilha com o sinal mais específico). A correção real
é desempate por especificidade (keyword exclusiva de uma trilha pesa mais que keyword
compartilhada com outra) — não feita nesta sessão. Ver ACHADO-13 pra a consequência disso na
contagem de sobre-captura de `qa`.

### Corrigido (2026-08-09)

**Escopo travado pelo operador: só o `ORDER BY`, nada de desempate por especificidade nesta
rodada.**

**Teste primeiro, e ele falhava sem o fix.** `tests/unit/scoring.test.ts`, describe `scoreJob —
desempate de trilha é determinístico`: cria as trilhas `qa` e `product` com o MESMO léxico
(`scrum`, `agile` — empate real de overlap, não vaga que uma trilha descreve melhor), insere uma
vaga que só bate essas duas keywords, e afirma qual trilha vence. Rodado ANTES do fix: `qa` vence
(porque foi criada primeiro — a consulta sem `ORDER BY` devolve em ordem de inserção/rowid),
teste falha contra o esperado `product`. Isso prova que o teste exercita o bug de verdade, não só
"a ordem é estável".

**Fix**: `src/core/scoring.ts:47` — `SELECT id, keywords FROM profile_tracks WHERE enabled = 1
ORDER BY id ASC`. `id ASC` é **arbitrário-mas-estável, não semanticamente correto** — é ordem
alfabética do slug da trilha (`product` vence `qa` por "p" < "q"), não especificidade de keyword.
Documentado como tal no comentário do código, para não ser lido como "a" correção no futuro.
Mesma convenção que `listTracks()` (`src/db/repo/profile-tracks.ts:18`) já usava — a inconsistência
era `scoreJob` ter sua própria consulta inline sem seguir o padrão que já existia no repo.

Rodado de novo depois do fix: os dois testes passam (o de empate real e o de invariância a ordem
de inserção). Suíte completa 393/393, typecheck limpo.

**Varredura pedida — outras consultas sem `ORDER BY` cujo resultado alimenta decisão, não só
exibição** (medido, não corrigido nesta rodada). As duas candidatas abaixo estão **ranqueadas**:
`answers.ts:45` é a mais forte candidata a virar o próximo BUG numerado; `feedback.ts:39` é dívida
registrada, mas sem sangramento ativo hoje.

1. **`src/cli/answers.ts:45`** (comando `answers add`) — `SELECT id FROM answer_bank WHERE
   question_fingerprint = ? AND language = ? AND track_id IS ? AND company_id IS ?` sem
   `ORDER BY`, **e a tabela não tem `UNIQUE` nessa tupla** (só índice não-único em
   `question_fingerprint, language` — `001_init.sql:105`). É o pior dos dois: falta ordenação
   *e* falta a constraint que tornaria a ordenação irrelevante. Se alguma vez existirem duas
   linhas duplicadas na mesma tupla (hoje o próprio comando evita criar, mas nada no schema
   impede), `.get()` decide qual delas recebe o `UPDATE` sem critério — dedup decidido por ordem
   de leitura, a mesma classe de falha que o BUG-010 media, só que sem teste algum em cima.
   Candidata mais forte ao próximo BUG.
2. **`src/db/repo/feedback.ts:39`** (`preferenceKeysFor`) — `SELECT keywords FROM profile_tracks`
   (sem `ORDER BY`, e nem filtra `enabled`) alimenta `termsPresent(...).slice(0, 8)`: QUAIS
   keywords viram chave `kw:*` em `preference_weights` depende da ordem das trilhas na consulta.
   Mesma classe de bug que o `scoreJob`. **Dívida sem sangramento agora**: o componente
   `preference` está desarmado (peso 0, decisão do BUG-007), então nada de decisão viva depende
   disto hoje — mas os dados continuam sendo gravados "para reprocessamento futuro"
   (decisions.md, 2026-07-12), e herdariam essa não-determinismo se o componente for reativado.
- Checado e descartado: `src/cli/kit.ts:131` (despeja TODAS as trilhas no bundle pro redator, não
  escolhe uma vencedora por código — ordem não decide nada); `src/core/company-watch.ts:56` (une
  keywords num `Set`, união é comutativa); `src/core/policy.ts` (checagens de existência/`COUNT`,
  agregados não dependem de ordem); `src/cli/submit.ts:107` (itera TODAS as `applications
  kit_ready`, não escolhe uma).

**Recontagem do ACHADO-13 sobre base determinística de verdade** (não o script standalone da
medição anterior — o `scoreJob()` real, pós-fix, rodado contra as 733 vagas do banco de produção,
leitura pura, nada gravado): **57 vagas em `qa`, 11 sem keyword específica (19%)** — idêntico ao
número medido antes sob `ORDER BY id ASC` manual. **O baseline é reproduzível**: não muda de novo.
(72/733 vagas recalculadas divergem do `track_hint` hoje GRAVADO no banco — esperado, o banco
ainda não passou por `rescore --commit` com o fix; nenhum `--commit` rodado nesta sessão, por
não estar no escopo pedido.)

### Desempate por especificidade (2026-08-09, branch separada)

**Deliberadamente numa branch própria** (`feature/track-specificity-tiebreak`), não empacotada
com o `ORDER BY`: um é fix isolado com teste que falha sem ele, o outro é mudança de comportamento
de classificação — se reclassificar vagas de forma indesejada, precisa dar pra isolar sem desfazer
o fix já estável.

**Achado antes de implementar**: exclusividade sozinha (keyword que só uma trilha tem, peso
uniforme) NÃO quebra o empate real de `SCRUM MASTER PL`/`SCRUM MASTER SR` (Globalweb) — os dois
lados têm exatamente 1 keyword exclusiva + 1 compartilhada: `product` = `["scrum master"
(exclusiva), "scrum" (compartilhada)]`, `qa` = `["sql" (exclusiva), "scrum" (compartilhada)]`.
`"sql"` é um falso-positivo do léxico de `qa` (a JD menciona "Sql" como ferramenta de modelagem de
dados, nada a ver com QA) tão "exclusivo" quanto `"scrum master"` pela definição literal.

**Fix** (`src/core/scoring.ts`, `keywordOwnerCounts` + `specificityScore`): peso por keyword
batida = `(exclusiva ? 2 : 1) × nº de palavras`. `"scrum master"` (bigrama exclusivo) = 4; `"sql"`
(palavra solta exclusiva) = 2 — `product` vence 5 a 3. Mesma convenção que `extractKeywords` já
usa para bigramas (`src/core/keywords.ts:42`, "bigramas valem mais").

**Fronteira dura preservada**: a especificidade só decide `trackHint` quando `frac === overlap`
(empate de verdade) — o valor de `overlap` que vira `detail.keyword_overlap` **não muda**, nunca.
Testado explicitamente (`tests/unit/scoring.test.ts`): o score de uma vaga empatada é idêntico
com ou sem a ponderação por especificidade.

**Critério de aceite cumprido**: `SCRUM MASTER` → `product` sob `ORDER BY id ASC` **e** sob
`ORDER BY id DESC` — testado nos dois sentidos, não é mais acidente alfabético.

**Recontagem em produção (leitura pura, nada gravado)**: 7/733 vagas mudam de trilha entre
"só `ORDER BY`" e "`ORDER BY` + especificidade". `ACHADO-13`: **60 vagas em `qa`** (era 57), 11
sem keyword específica → **18% (11/60)**, praticamente igual ao número anterior (19%/57) — a
especificidade não teve efeito líquido relevante sobre a taxa de sobre-captura, mas MUDOU QUAIS
vagas estão no conjunto:

| Vaga | Movimento | Correto? |
|---|---|---|
| `QA Automation Engineer \| Mid-Level` | `ai-builder` → `qa` | **Sim** — título literalmente "QA", estava classificada `ai-builder` só porque `ai-builder < qa` alfabeticamente num empate de 3 vias (`automação`/`automation`/`integração` vs `qa`/`testes funcionais`/`casos de teste`, ambos 3 hits) |
| `Analista Automação Testes Pleno` | `product` → `qa` | **Sim** — mesma classe: "Testes" no título, estava em `product` por empate 2-vias vencido por alfabeto |
| `B2B SaaS PPC Manager` | `ai-builder` → `qa` | **Não** — falso-positivo novo. Vaga de marketing, sem relação com QA. `"quality assurance"` bateu como frase de boilerplate corporativo genérico (não sobre o trabalho em si), e por ser bigrama pesou mais que os hits igualmente fracos de `ai-builder` (`"automation"`) e `product` (`"stakeholders"`) — 1 hit cada, overlap de 0,067 (6,7%), a mesma característica do caso `sql`: um termo que É exclusivo de uma trilha mas não é SINAL de que a vaga é daquela trilha. **Stakes baixos**: contribuição de `keyword_overlap` ao score é ~4,3 pontos com qualquer um dos três vencedores — a vaga já era baixo-sinal em todas as trilhas antes de qualquer desempate. |

**Limite do mecanismo, registrado e não perseguido nesta rodada**: comprimento de keyword é um
proxy de especificidade, não uma medida de relevância temática. Resolve o caso que motivou o
pedido (`scrum master` vs `sql`) e dois casos reais adicionais de vagas obviamente mal
classificadas, mas pode, em vagas de baixíssimo overlap em todas as trilhas (~0,07, quase ruído),
trocar um vencedor arbitrário por outro. Não voltar a mexer sem medir de novo — o próximo item
depende do cadastro de empresas crescer o suficiente para esse tipo de caso aparecer com volume.

Suíte 397/397, typecheck limpo.

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

---

## CLASSE-01 — critério sem contexto

**Ausência de sinal lida como sinal negativo, ou menção lida como exigência.**

Não é um bug: é a família à qual quatro defeitos já pertenceram. Está registrada como classe
porque o próximo filtro tende a cair aqui também, e reconhecer o padrão é mais barato que
descobrir cada instância pela quinta vez.

**As duas formas.**

| Forma | O que o critério faz | O que o dado realmente diz |
|---|---|---|
| **A — ausência como evidência** | trata "campo vazio", "flag ausente" ou "termo não encontrado" como resposta negativa | ninguém mediu; o silêncio é do coletor, não do mundo |
| **B — menção como exigência** | trata a presença de um token como requisito, sem ler o contexto de obrigatoriedade | menção fraca, alternativa e requisito obrigatório são a mesma string |

**As quatro instâncias conhecidas, e o que cada uma custou.**

| Instância | Forma | Sintoma medido |
|---|---|---|
| [BUG-006](#bug-006) | A | `location_fit` só via "Brasil" na string; 119 vagas da Gupy perdiam metade da pontuação de local — e a flag `remote` do RemoteOK, constante em 100% do catálogo, ganhava a nota cheia. Constante não carrega informação |
| [REQ-002](#req-002) | B | `extractKeywords` é frequência de n-grama: 13 das 30 "keywords" do JD da Stefanini eram texto institucional (`clube vantagens`, `voce`). Toda métrica de cobertura só é comparável consigo mesma |
| Falso positivo do `blocking_technologies` | B | filtro de keyword simples tirava 20 das 33 vagas da fila, com 2 falsos positivos em 6 amostradas — "Noções de Python" (a vaga nº 1) e "(Node.js, Python **ou** PHP)", onde ele qualifica pelo Node |
| `detectRequiredYears` cego a "N ou mais" | B | "3 ou mais anos" passava direto pelo teto de 2 anos. Ver a nota de contaminação abaixo |
| `remote_type` NULL | A | 138 vagas sem modalidade; filtrar por ausência mataria 16 onde ninguém verificou, 5 delas remotas segundo o próprio anúncio. Corrigido com um **terceiro estado**, não com um chute — `src/core/modality.ts` |
| [`candidate_facts` sem `value`](#classe-01-instância-7--chave-sem-valor-lida-como-informação-disponível) | A | o bundle levava `{key, language}` e omitia `value`. O redator via o **nome** do dado e não o dado — e ia buscá-lo no disco: **7 dos 38 turnos** da geração da Techne, **$0,33**, mais caro que escrever os 4 entregáveis ($0,21) |

**O teste que separa as duas.** Antes de escrever um critério novo, duas perguntas:

1. *Se este campo estiver vazio, o que eu vou concluir?* Se a resposta for qualquer coisa
   diferente de "nada, e isso fica visível", é a forma A. A saída costuma ser um terceiro
   estado explícito, não um default.
2. *Este token, sozinho, distingue exigência de menção?* Se não, é a forma B. A saída é janela
   de contexto (obrigatoriedade / enfraquecimento / alternativa), ou não implementar.

**O que NÃO resolve.** Estender lista de exceções. Foi tentado no `master gaps` — cada palavra
genérica nova removia um caso e deixava o defeito de pé. A correção é sempre no critério, nunca
no catálogo de vítimas.

---

## Consequência do commit `8441497` — a série histórica de score quebra aqui

`detectRequiredYears` não conhecia a forma **"N ou mais anos"** (nem "N or more years") — a
grafia mais comum em JD brasileiro depois de "N+". O teto `max_years_required: 2` estava sendo
furado **silenciosamente desde o começo**: nenhum erro, nenhum log, apenas vagas que deveriam
ter sido filtradas passando para a fila.

**Correção de alcance (2026-08-07, depois de medir).** Eu registrei isto como se a correção
tivesse fechado o buraco. **Não fechou** — fechou uma grafia. O padrão exige a palavra
"experiência" **adjacente** à expressão de anos, e `"3+ years of professional software engineering
experience"` tem três palavras no meio. Medido: o detector estrito enxerga **10% do acervo**
(62 de 641). O buraco real era estrutural, não de grafia, e só foi fechado pela segmentação por
seção (`src/core/jd-sections.ts`), que acrescentou 25 vagas.

**Alcance.** Não é só a fila de hoje. Todo score calculado antes de `8441497` saiu de um detector
cego para "N ou mais anos", e todo score anterior à segmentação saiu de um detector cego para
"N anos de <palavras> experiência" dentro de seção de requisito. O `rescore --commit`
de 2026-08-07 (backup `curriculos.2026-08-07T14-07-35Z.db`, sha256 `149eddcd…`) recalculou os
305 registros repontuáveis com o detector corrigido.

**Regra prática:** comparação histórica de fila — precisão, p50, tamanho — só vale **a partir
deste commit**. Números de antes descrevem outra régua. A baseline em `docs/baseline-onda1.md`
continua válida como registro do que foi medido na época, não como termo de comparação com o
estado atual.

**Extensão (2026-08-08, ACHADO-06) — a mesma quebra, um campo a mais.** `rescoreAll` agora
recalcula `seniority` a partir do título a cada repontuação, não só `score` — a correção do
ACHADO-06 só alcançava vagas futuras sem isso, do mesmo jeito que a de "N ou mais anos" só
alcançava sem o `rescore --commit` de 2026-08-07. O `rescore --commit` de 2026-08-08 (backup
`curriculos.2026-08-08T23-26-59Z.pre-rescore.db`, sha256 `f853b850…`) recalculou 327 registros
com o `detectSeniority` corrigido — fila 4→6. Comparação histórica de `seniority` armazenado
também só vale a partir deste commit, pelo mesmo motivo.

## `extractKeywords` — bigrama de stride 2 (2026-08-08), e o que ficou provado vs. não provado

**Correção aplicada** (commit `8163760`, `src/core/keywords.ts`): bigramas passam a formar de 2
em 2 tokens, não de 1 em 1. Antes, um termo composto de N tokens gerava N-1 bigramas encadeados
que se sobrepunham — cada token do meio entrava em dois bigramas vizinhos, além do próprio
unigrama. Era a causa direta da reprovação da LMG Staffing na não-regressão v2
(`docs/custo-geracao.md`): "Model Context Protocols (MCPs)" contado como 4 fragmentos
(`context protocols`, `mcps`, `model context`, `protocols mcps`).

**Verificado, sem regenerar kits** (regeneração via `--via cli` chama o binário `claude`
diretamente — `src/local/generate-runner.ts:118` — e travaria num shell sandboxado do Claude
Code; decisão do operador foi validar sem gastar). Recomputado `extractKeywords` sobre o JD REAL
da LMG (`output/lmg-staffing-solutions-ai-assisted-software-engineer-web-app-xxn1qe/bundle.json`,
que menciona "Model Context Protocols" 3 vezes em posições diferentes do texto) no `top=30` que
`coverageReport()` usa de fato em produção:

| termo | antigo (top30) | novo (top30) |
|---|---|---|
| `context protocols` | entra, count=6 | **fora do top30** |
| `mcps` | entra, count=5 | entra, count=5 |
| `model context` | entra, count=6 | entra, count=4 |
| `protocols mcps` | entra, count=6 | entra, count=4 |

O fragmento que causava a perda de cobertura (`context protocols`) some do corte real. **Isso é
o que a correção prova, e só isso** — a contagem não zera para as outras formas porque a mesma
frase aparece 3× em pontos diferentes do JD, e o alinhamento par/ímpar do stride depende de
quantos tokens (pós-stopword) vieram antes de CADA ocorrência — cada uma "sorteia" um
alinhamento próprio. Não há dupla-contagem por ocorrência individual (o que a correção garante),
mas o conjunto de termos ainda pode conter mais de uma forma do mesmo termo composto quando ele
recorre várias vezes com alinhamentos diferentes. Termo canônico único (1 entrada por entidade
composta, sempre) exigiria rastrear ocorrências por posição, não por stride global — não fiz
isso; ficaria como trabalho futuro se o padrão se repetir.

**Não verificado, e por quê**: a mesma checagem rodada no JD da Hospital Care (segunda vaga que
caiu 7 pontos na v2) mostra as 4 keywords perdidas (`back end`, `end`, `dados`, `engenharia`)
com contagem **idêntica** entre o algoritmo antigo e o novo — esta correção não as afeta. A causa
ali é outra: são palavras curtas genéricas (REQ-002 na forma original — n-grama sem noção de
termo composto), não sobreposição de cadeia. **A não-regressão completa não foi reexecutada** —
os diretórios `--out` da comparação v2 (`docs/custo-geracao.md`) eram scratch e não sobreviveram
à sessão; reconstruir a tabela completa exige regerar os 5 kits `--via cli`, que não foi feito
(decisão do operador, custo e risco de trava). Antes de decidir se `--via cli` volta a ser
candidato a default, essa tabela precisa ser refeita de verdade — o que está registrado aqui é a
prova pontual de que o mecanismo do bug está corrigido, não uma nova rodada de não-regressão.

---

## Custo assumido — o filtro de Python é a fronteira da trilha, não um detalhe de config

**Decisão do operador em 2026-08-07, consciente e registrada para ser reconsiderada.**

`filters.blocking_technologies: [python]` existe porque ele não programa em Python **ainda**. O
efeito não é remover ruído: é escolher um subconjunto do mercado.

**Medido no acervo de 305 vagas repontuáveis:**

- ~13 vagas do tipo **"AI Engineer" / "Engenheiro de IA"** saem por exigência real de Python
- entre as 8 que deixaram a fila neste rescore, **5 eram Python**, incluindo a nº 1 (BIX
  Tecnologia, 68,4) e duas de 60,5 (Capgemini, ioasys)
- o p50 da fila **caiu de 50,9 para 47,6** e o topo de 68,7 para 67,7 — o filtro tira de cima,
  não de baixo
- o que sobra pende para **"Analista de Automação / Chatbot / CRM / Growth"**: mesma trilha
  `ai-builder`, teto salarial e senioridade diferentes

**Por que fica.** Candidatar-se a vaga com exigência sólida de Python queima geração (~$3/kit),
queima resposta e não converte. A escolha é dele e está tomada.

**Quando reconsiderar — esta é a primeira alavanca.** Se em ~2 semanas a fila estiver ruim
(poucas vagas, score baixo, nenhuma entrevista), o primeiro movimento é **religar Python** e
medir, antes de mexer em threshold, em pesos ou em busca. Basta remover a entrada de
`config/config.yaml` e rodar `rescore --commit`; o `--dry-run` mostra quantas voltam.

**Não entraram na lista, e por quê.** `salesforce` e `hubspot` aparecem em 2 vagas cada
(ACHADO-04) — volume de ruído, e Salesforce ele ainda consideraria dependendo do resto do JD.
Filtro duro exige que a exclusão seja verdadeira em 100% dos casos, não na maioria.

---

## Modalidade pendente — o terceiro estado

**Estado:** implementado (`src/core/modality.ts`, migration `003`, `src/cli/modality.ts`).

`jobs.remote_type` guarda o que o **adapter** afirmou. Dois dos seis adapters não extraem
modalidade em lugar nenhum do código: o `linkedin-guest` e o `manual-url` — que é o fallback
universal `/vaga <url>`. Para essas fontes, NULL é o normal, não a exceção. **138 vagas no
acervo, 14 na fila aberta.**

O erro que isto previne é nomeado: *candidatar-se a um presencial em São Paulo achando que era
remoto*. A pendência não pode virar aprovação por omissão.

| | |
|---|---|
| **Não filtra** | ausência não é evidência (CLASSE-01, forma A). O filtro `exclude_onsite_outside_home_uf` só age sobre estado **afirmado** |
| **Marca** | `unknown` aparece como `⚠ modalidade não verificada` na fila e no `modality` |
| **Não infere** | `remoteHints()` devolve **trechos do anúncio** para o operador ler. Texto ambíguo devolve as duas pistas e não escolhe vencedor — a contradição é o que ele precisa ver |
| **Registra** | `modality set <id> remote\|hybrid\|onsite --note "…"` grava com data e origem, em coluna **separada** de `remote_type`: a divergência entre fonte e operador fica inspecionável |
| **Tem efeito** | o filtro lê o estado **resolvido**, então confirmar `onsite` numa vaga muda faz ela sair na repontuação seguinte. Resolver na mão não é anotação decorativa |

**Coberto por:** `tests/unit/modality.test.ts`, `tests/unit/scoring.test.ts` (confirmação ativa e
desativa o filtro; `remote_type` sobrevive) e `tests/unit/migration-002.test.ts` (a 003 é aditiva
e nasce NULL para todo mundo).

---

## ACHADO-05 · o 10x Advisory escapou de DOIS filtros, e nenhuma das hipóteses estava certa

**Contexto.** O kit da 10x Advisory (score 82, o segundo maior) passou por `blocking_technologies:
[python]`, e foi o **próprio `answers.md` gerado** que denunciou: *"nenhum fato registrado no perfil
mestre documenta experiência profissional com Python/FastAPI/Flask"*. Primeiro falso negativo do
filtro detectado pela geração.

**As duas hipóteses eram:** (a) JD sem marcador de obrigatoriedade — refinamento estreito demais;
(b) descrição não salva — filtro rodando sobre texto vazio, CLASSE-01 outra vez. **Nenhuma das duas.**

A descrição está salva (3.933 caracteres) e o filtro encontrou as três menções a Python. O que
falta não é marcador: é **seção**.

| # | trecho | onde está | veredito do filtro |
|---|---|---|---|
| 1 | "Develop scalable backend services **using Python**" | Responsibilities | passou |
| 2 | "Ideal candidates will have experience with **many of the following**: Programming Python FastAPI or Flask" | lista morna | passou |
| 3 | "**Preferred Qualifications** … Experience building production applications using Python" | preferencial | passou |

A #3 o filtro acertou: o próprio anúncio diz *preferred*. A #1 é o problema — **construir backend
em Python é a descrição do trabalho**, e nenhuma palavra de obrigatoriedade aparece perto porque
não precisa: está sob *Responsibilities*.

**O eixo está errado.** Em JD em inglês estruturado por seção, o que decide não é a proximidade de
um marcador, é em qual bloco a menção cai — Responsibilities > Required/Minimum > Preferred. O
filtro não tem noção de seção. É o **REQ-002** (segmentação de JD) de novo, na terceira aparição.

### O achado de brinde: `detectRequiredYears` é mais cego do que a correção de ontem sugeriu

A mesma vaga também passou pelo teto de 2 anos, tendo *"3+ years of professional software
engineering experience"* escrito. O padrão exige `experi[êe]nc` **adjacente** à expressão de anos:

```
(\d{1,2})\s*(?:\+|ou mais|or more|…)?\s*(?:anos?|years?)(?:\s+(?:de|of))?\s+experi[êe]nc
```

`"3+ years of professional software engineering experience"` tem três palavras entre "years of" e
"experience", e por isso não casa. A correção de ontem ("N ou mais anos") era real, mas **só vale
quando a adjacência existe** — o alcance é menor do que eu dei a entender.

**Medido no acervo (641 vagas com descrição):**

| | |
|---|---:|
| o detector atual acha | **62 (10%)** — confirma o ACHADO-02 |
| um padrão que tolera até 6 palavras no meio acha | 108 (17%) |
| **acima do teto de 2 anos que o detector hoje PERDE** | **37** |

**Não alargar sem segmentação.** Entre os 37, aparecem *"30 anos de atuação"* e *"31 anos de
experiência"* — que são a **idade da empresa**, não requisito. Alargar o padrão sozinho trocaria
falso negativo por falso positivo: CLASSE-01 forma B pela porta oposta. Os dois achados desta
entrada convergem na mesma capacidade que falta.

**Estado:** medido, sem correção. Depende do REQ-002.

---

## CLASSE-01, instância 6 · `indexOf` devolvendo −1 lido como índice válido

Aconteceu **dentro do commit que documenta a classe**, e por isso fica registrado.

`scripts/revert-eligibility-feedback.ts` lia o corte de data assim:

```ts
const since = argv[argv.indexOf("--since") + 1] ?? "2026-08-07";
```

Sem a flag, `indexOf` devolve **−1**, e `argv[0]` vira o valor. No dry-run (sem argumentos)
`argv[0]` era `undefined` e o default entrava — tudo certo. Rodando com `--commit`, `argv[0]` era
a string `"--commit"`, e como `'-' < '2'` em ASCII, a comparação `created_at >= '--commit'` é
**verdadeira para toda data ISO**. O reparo estornou as ~60 rejeições da história em vez das 5 do
dia.

Detectado na verificação pós-escrita (a soma de `preference_weights` saltou de −132,85 para
310,53 e 8 chaves bateram no teto ±10), revertido pelo backup `curriculos.2026-08-07T15-25-30Z`
restaurando só a tabela e o evento inseridos, e reaplicado corretamente.

### A forma nova: **flag ausente lida como valor posicional**

É a forma A da classe (ausência lida como evidência) na camada de argumentos. `indexOf` devolve
−1 para "não existe", e −1 + 1 = 0 é um índice perfeitamente válido — a ausência vira o primeiro
argumento da linha de comando. O sintoma depende de qual flag o operador digitou, o que é a pior
propriedade possível num comando destrutivo.

### Invariante: dry-run tem de percorrer o MESMO caminho de argumento da escrita

Foi por isso que o dry-run passou limpo e a escrita não: sem argumentos, `argv[0]` era `undefined`
e o default entrava; com `--commit`, `argv[0]` era `"--commit"`. **Um dry-run que não exercita
exatamente os mesmos argumentos da escrita não prova nada sobre a escrita.** Vale para todo
comando com `--commit` no repositório, não só para este.

### Auditoria de `argv` (2026-08-07) — havia outra

| ponto | forma | veredito |
|---|---|---|
| `scripts/revert-eligibility-feedback.ts` | `indexOf("--since") + 1` | **explodiu** — corrigido para `parseArgs` + validação de formato |
| `src/cli/rescore.ts:38` | `Number(argv[argv.indexOf("--top") + 1]) \|\| 10` | **mesma bomba, benigna por acidente**: `Number("--commit")` é `NaN` e o `\|\| 10` engolia. Num campo de texto teria apagado o filtro igual. Corrigido |
| `company` · `feedback` · `job-url` · `kit` · `master` · `track-status` · `schedule` · `ui-service` | destructuring posicional puro, sem flags | ok — não misturam posição com flag |
| `modality` · `dashboard` | `parseArgs` / `includes` | ok |

**Regra:** comando que lê flag usa `parseArgs` e valida o formato do valor. Aritmética sobre
`indexOf` está proibida.

### Pré-condição: backup antes de escrita em massa

O que tornou o dano reversível não foi cuidado — foi o backup automático feito segundos antes.
Isso deixa de ser conveniência e passa a ser pré-condição, com uma função só
(`src/db/backup.ts`) para que "quem faz backup" seja grep por um nome.

| comando | backup |
|---|---|
| `rescore --commit` | ✅ |
| `revert-eligibility-feedback --commit` | ✅ |

**Uma escrita em massa fica de fora e não tem dry-run nem backup:**
`decayPreferenceWeights` (`src/core/scoring.ts`) roda a cada busca, multiplica todos os pesos por
`0.95` e **apaga** as chaves abaixo de |0,05|. É intencional, mas significa que as 145 chaves
guardadas como "registro de época" encolhem sozinhas a cada rodada.
**Deixou de ser "registrado, não alterado" em 2026-08-07:** o operador o moveu para dentro da
fase F5 da Onda 2 — se backup é pré-condição de escrita em massa, o comando que roda **a cada
busca e apaga chaves** não pode ser a exceção.

---

## CLASSE-01, instância 7 · chave sem valor lida como informação disponível

**Forma A**, na camada de contexto — a mesma do `remote_type = NULL`, só que o dado ausente não
está no banco, está no pacote que vai para o redator.

`src/cli/kit.ts` montava o bundle assim:

```ts
candidate_facts: loadCandidateFacts().map((f) => ({ key: f.key, language: f.language })),
```

O redator recebia `{key: "salary_expectation_brl", language: "pt"}` — o **nome** do dado, sem o
dado. Do ponto de vista dele isso é indistinguível de "o dado existe e está aqui": a chave está
presente, a lista não está vazia, nada sinaliza omissão. Então ele foi buscar no disco.

**Custo medido** (geração da Techne, 2026-08-07): turnos 12 a 18 — quatro `Grep` por
`candidate_facts` em `src/`, mais `src/core/profile.ts`, mais `CANDIDATE_FACTS_PATH`, mais
`profile/candidate-facts.yaml`. **7 dos 38 turnos, $0,332 de input — mais caro que os 4 turnos
que escreveram os entregáveis ($0,208).** Zero informação nova: tudo já estava em disco a um
`readFileSync` de distância do processo que montou o bundle.

**Confirmação independente.** No disparo único (M2), que não tem acesso a disco, o mesmo bundle
produziu **5 marcadores `[CONFIRMAR:`** — pretensão, aviso prévio, autorização de trabalho,
experiência com HeyGen, escolaridade. Três desses **estavam em `candidate-facts.yaml`**
(`notice_period`, `work_authorization`, `salary_expectation_brl`). Com o `value` no bundle,
caíram para **2**, e os 2 restantes são legítimos: um é prescrito pelo próprio fato
(`salary_expectation_brl` = *"A combinar [CONFIRMAR por vaga — estratégia: pesquisar a média
local…]"*) e o outro é uma decisão de fato indefinida (diploma em curso).

**Um contrato foi revertido, e isso não foi descuido de leitura.** O comportamento antigo era
deliberado — `tests/e2e/smoke-pipeline.test.ts` o assertava como *"CONTRATO DE PRIVACIDADE: o
bundle vai para o Claude com as CHAVES dos candidate_facts, nunca com os valores"*. Caiu porque
a fronteira não protegia o que dizia proteger: o bundle já leva o `profile` inteiro (nome,
e-mail, telefone, histórico), e os `candidate_facts` são exatamente os dados que vão ser
**digitados no formulário do empregador**. Esconder do redator o que o formulário vai receber
não é privacidade, é custo. A reversão e o motivo estão escritos no teste; desfazê-la é uma
linha.

**Generalização.** Ao montar contexto para um modelo, *chave sem valor* é pior que *chave
ausente*: a chave ausente sinaliza a lacuna, a chave vazia a esconde. Se um campo é omitido de
propósito, ele precisa dizer que foi omitido.

---

## CLASSE-01, instância 8 · variante ausente lida como variante válida

**Forma A, camada de experimento — e a mais perigosa das oito, porque é silenciosa.**

O caminho é: `prepare` atribui a variante A/B e grava no `bundle.json` → `finalize` copia
`bundle.variant` para `resume_versions.variant` (`src/cli/kit.ts:369`) → o `/painel` agrega
conversão por variante (`src/dashboard/build.ts:73`). **Nada nesse caminho verifica que o REDATOR
conhecia a variante.** O que é registrado é a variante *atribuída*, não a *seguida*.

As `REGRAS` do prompt portátil nunca mencionavam `variant` (ver a varredura de paridade). Um kit
escrito pelo disparo único teria entrado no warehouse como "variante B" tendo sido redigido sem
disciplina de variante nenhuma.

**Por que é pior que um kit ruim.** Kit ruim aparece na cobertura. Instrumento corrompido não
aparece em lugar nenhum — e contamina toda decisão futura tomada a partir da série. Não é regra
perdida: é **dado inválido injetado numa série destinada a decidir**.

**Verificado no banco (2026-08-07):** 19 `resume_versions`, **0 sem variante**, e todas as 19 do
caminho agêntico — o `--out` do `kit generate` nunca registra. **Nada não-computável entrou.** A
verificação foi feita antes do guarda existir, justamente para saber se havia dano a marcar.

**Correção:** `src/core/variant-guard.ts`. Experimento ligado + variante não declarada = recusa,
nunca default. Vale no `gerarKit` (antes de disparar) e no `measure-kit` (exit 6). Quando o
experimento está desligado, `variant: null` é o estado correto e o guarda não age — a ausência ali
é declarada, não omissão.

---

## CLASSE-01, instância 9 · `--tools` sem `--allowedTools`

Duas flags que parecem uma. `--tools` diz quais ferramentas **existem**; `--allowedTools` diz
quais são **permitidas**. Com `--setting-sources ""` não há allowlist herdada de lugar nenhum.

Medido em 2026-08-07: o perfil `salario` declarava `tools: [WebSearch]` e nada mais. O modelo
tentou buscar duas vezes, as duas voltaram em `permission_denials`, **o processo pai não viu erro
nenhum**, e o modelo respondeu em prosa que não tinha conseguido pesquisar.

É o mesmo defeito do `--model`: ausência de uma segunda declaração lida como permissão herdada.
Corrigido em `buildHarnessArgv`, que recusa perfil com `tools` sem `allowed_tools` correspondente
e nomeia qual faltou.

### O que salvou, e por sorte

A resposta do modelo (*"FAIXA: Não disponível no momento (falha de permissão na busca)"*) caiu no
`null` do parser, o kit saiu com `[CONFIRMAR: pretensão]` e o `finalize` saiu 3. **O caminho de
falha estava certo antes de o caminho feliz existir** — nenhum número inventado chegou perto de um
formulário. Mas foi sorte: o parser nem conhecia aquela forma de resposta. Agora está testado
(`tests/unit/variant-e-degradacao.test.ts`), com as frases reais que o modelo produziu, e com a
cadeia inteira provada: sem faixa → `null` → `[CONFIRMAR:` → exit 3.

---

## Lição de método · número não medido nesta sessão é hipótese, não premissa

**Terceira ocorrência. Por isso virou entrada.**

| # | O número | O que ele fundamentou | Como caiu |
|---|---|---|---|
| 1 | "a correção do `8441497` fechou o buraco do teto de anos" | uma nota de alcance no próprio KNOWN-BUGS | medido: o detector via **10% do acervo**; o buraco era estrutural |
| 2 | "`3+ years…` está sob **Requirements** no 10x Advisory" | a premissa de que o teto de anos falhava ali | medido: está sob **Preferred Qualifications** — o teto acertava |
| 3 | "cache read 13.293.018, **97%** do custo" | **o brief inteiro** da Onda 2 de custo | medido no `result`: **4.726.166, 54%** (83% é lado-input) |

Nos três casos o número foi citado de memória, soou plausível, e virou **fundamento** de uma
decisão em vez de hipótese a verificar. Nos três a conclusão sobreviveu — o que é sorte, não
método: um número errado por 2,8× poderia ter apontado para a alavanca errada.

E a mesma sessão que registrou isto produziu duas instâncias novas: "M1 custa ~$0,20" (custou
**$0,94** — não contei o cache write de 80k tokens a $6/MTok) e "o disparo único custa
$0,09–0,17" (custou **$0,2871** — projetei 3.200 tokens de saída, vieram 12.518, dos quais ~62%
raciocínio).

**Regra:** número que não foi medido *nesta sessão*, com o comando à vista, entra no texto
marcado como projeção — e nenhuma fase é autorizada por projeção. É por isso que M1 e M2 são
aprovadas separadamente das fases de implementação, e por isso o gate de abandono da M1 é
código (`m1-baseline.sh`, `exit 2`) e não intenção.

---

## Erro de pipeline que só existe em memória

**Estado:** registrado, sem correção — resolvido pela Fase 3 (`generation_runs`).

Os cartões de erro da fila vivem em `pipelineItems`, um `Map` em memória do servidor. A vaga em
erro **não sai da fila** (`apiQueue` mantém quem tem `stage === "erro"`, e `doApply` aceita
reentrada), então clicar Aprovar de novo funciona hoje. Mas reiniciar o serviço apaga os cartões,
e a vaga volta a parecer intacta na fila — sem nenhum registro de que a geração já falhou. O
`logs/pipeline-<id>.log` sobrevive e nada aponta para ele.

**É a mesma classe:** erro que desaparece no restart é ausência de sinal lida como sucesso. O
sistema já tem dois detectores de crash — `submissions.status='pending'` e
`search_runs.finished_at IS NULL` — e **ninguém lê nenhum dos dois**.

Evidência do que a Fase 3 precisa tratar: em 2026-08-06 18h14, sete gerações dispararam em rajada,
a primeira bateu no limite de sessão e as outras seis levaram HTTP 429 em ~1 segundo cada, com
zero tokens consumidos. **Limite de sessão encerra a noite; nunca vira retry.**

---

## REQ-002 — segmentação por seção: IMPLEMENTADA em 2026-08-07

Três aparições e uma causa só. `src/core/jd-sections.ts`.

**O eixo era o errado.** O filtro de tecnologia decidia por PROXIMIDADE — procurava marcador de
obrigatoriedade numa janela ao redor da menção. Funciona em JD brasileiro ("Python (obrigatório)")
e falha em JD em inglês estruturado por seção, porque **a seção já é o marcador**: *"Develop
scalable backend services using Python"* sob *Responsibilities* não precisa de "required" para ser
exigência.

| peso | cabeçalhos | efeito |
|---|---|---|
| `obligation` | Requisitos · Qualifications · Required/Minimum · Must have · Responsibilities · O que buscamos · What you'll do | a seção é o marcador |
| `weak` | Diferenciais · Desejável · Preferred Qualifications · Nice to have · Bonus | não filtra |
| `context` | Sobre nós · Quem somos · Benefícios · What we offer | não fala do candidato |
| `neutral` | nenhum cabeçalho reconhecido | **comportamento anterior**, janela de proximidade |

`FRACO` ("noções de", "básico") e `ALTERNATIVA` ("Node.js, Python ou PHP") **vencem em qualquer
seção**: o anúncio enfraqueceu explicitamente, e nenhuma seção sobrepõe uma declaração direta.

### O texto chega achatado — e foi onde a primeira versão falhou

`stripHtml` colapsa a estrutura: o cabeçalho vem grudado na frase anterior, *"…Azure OpenAI
Anthropic **Preferred Qualifications** 3+ years…"*. Sem ponto e sem quebra. A primeira versão
exigia fronteira à esquerda e classificou **as três** menções da 10x Advisory como
*Responsibilities*, inclusive a que está declaradamente sob *Preferred*.

O que sobrevive ao achatamento é a **capitalização**: um `<h3>` vira Title Case no meio da frase, e
prosa corrida não faz isso. `"Preferred Qualifications"` abre seção; `"we have preferred
qualifications"` não. Conservador de propósito — perder um cabeçalho devolve o trecho ao
comportamento anterior; inventar um reclassifica texto que ninguém marcou.

*(Segundo erro do dia na mesma família: a lista sem-fronteira era derivada por
`re.source.replace(...)`, e a substituição falhava em silêncio por causa do `\]` dentro da classe
de caracteres — as duas listas ficavam idênticas. Agora as duas variantes são construídas a partir
da mesma string de frases, nunca por cirurgia num `source` já montado.)*

### Medido

| | antes | depois |
|---|---:|---:|
| vagas com ao menos uma seção reconhecida | — | **591 / 641 (92%)** |
| anos exigidos detectados | 62 (10%) | **87** (+25) |
| fila aberta filtrada a mais | — | 2 de 11 |

**O caso nomeado, nos dois sentidos** (`tests/unit/jd-sections.test.ts`):

| menção | seção | veredito |
|---|---|---|
| "Develop scalable backend services **using Python**" | Responsibilities | **filtra** |
| "…experience with many of the following: … Python" | Qualifications | filtra |
| "Experience building production applications using Python" | **Preferred** Qualifications | **não filtra** |

**Correção de premissa.** Ficou registrado que `"3+ years of professional software engineering
experience"` estaria sob *Requirements*. Está sob **Preferred Qualifications** — medido no texto
real. Portanto o teto de anos corretamente **não** dispara nessa vaga; ela é filtrada pela menção
sob *Responsibilities*, e só por ela.

### As duas vagas que entraram no filtro, conferidas uma a uma

| # | vaga | trecho | seção | veredito |
|---|---|---|---|---|
| 65 | Ajinomoto | "Requisitos … Conhecimentos técnicos **Programação em Python**" | Requisitos | exigência real |
| 62 | Foundever | "**Python for all the AI part**" | Qualifications | exigência real |

Nenhum falso positivo na amostra. A primeira menção da Foundever (`Python / JavaScript /
Typescript`) é corretamente ignorada como lista de alternativas; o que filtra é a segunda.

### Anos: dois consumidores, um segmentador

`blockingTechnology` e `requiredYears` chamam `matchesInSections`. Não são dois detectores
independentes — foi a duplicação de cascata que fez `scoreNewJobs` e `rescoreAll` divergirem antes.

O padrão largo (até 6 palavras entre "anos" e "experiência") só conta **dentro de seção de
obrigatoriedade**, o que resolve as duas pontas de uma vez: ganha `"4 years of professional
non-academic writing experience"` sob *Requirements* e continua ignorando `"30 anos de atuação"`
sob *Sobre nós*.

---

## Prioridade movida: `generation_runs` sai da Fase 3

O reinício do serviço de 2026-08-07 apagou os 7 cartões de erro ao vivo — a melhor evidência
possível de que o defeito é real.

O que isso mudou não é a gravidade, é a **frequência**: reinício não é exceção, é rotina. Toda
mudança de código aprovada reinicia o serviço e apaga o histórico de falha junto. Um defeito que
some quando a ferramenta é usada normalmente não é um caso de borda.

`generation_runs` (migration aditiva `004`, já que a `003` virou modalidade) passa a ser **a
próxima coisa depois da segmentação**, antes do resto da Fase 3.

---

## Backlog de UI reportado pelo operador (2026-08-07, não construído)

Registrado para não se perder. Nenhum destes estava na rodada autorizada.

1. **Notificações sem dispensar.** Os cartões de conclusão ("concluída — Especialista em
   Automação e IA @ Techne") não têm marcar-como-lida nem fechar; acumulam no topo da fila.
2. **Vaga bloqueada por modalidade não mostra a URL.** Justamente quando o operador precisa abrir
   o anúncio para decidir remoto/híbrido/presencial, o link não está no cartão — enquanto no
   kanban ele está. O botão `JD` existe, mas a URL da vaga original não.
3. **Fontes de vaga ausentes.** Careerjet, Glassdoor, Jooble, Trampos, NetVagas, Talent.com,
   RioVagas, Remotar, Jobbol, Agrou, YDUQS, Portal de Vagas da Gupy. Avaliar quais têm API ou
   HTML estável o bastante para virar adapter (o `src/adapters/` já isola falha por fonte).
