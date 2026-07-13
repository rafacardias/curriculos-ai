---
name: gerar
description: Gera o kit completo de aplicação para uma vaga — currículo ATS espelhando o vocabulário do JD (só com fatos reais), cover letter, respostas de triagem e outreach. Use quando o usuário pedir /gerar <job_id> ou aprovar uma vaga na /fila.
---

# /gerar <job_id>

## Fluxo

1. `npx tsx src/cli/kit.ts prepare <job_id>` — retorna o bundle JSON: vaga + JD, keywords ranqueadas, trilhas, perfil mestre completo (fatos com ids), candidate_facts disponíveis e respostas de triagem já conhecidas.
2. **Resolver a URL de aplicação direta** (só se a vaga veio de board agregador — `source` remoteok/remotive/wwr — ou se a URL atual é uma página de redirect/paywall do board): localize a vaga na página de carreiras da própria empresa (WebSearch/WebFetch: "<empresa> careers <título>"; priorize greenhouse/lever/workday/gupy). Se achar, grave: `npx tsx src/cli/job-url.ts <job_id> <url_direta>` — isso destrava o submission adapter certo. Se não achar, siga com a URL do board (a aplicação por lá é gratuita; paywalls como o "premium" do RemoteOK sempre têm caminho de skip — NUNCA pagar).
3. Redija os 4 arquivos no `kit_dir` indicado no bundle (regras abaixo).
4. `npx tsx src/cli/kit.ts finalize <job_id>` — roda truthcheck (falha se houver citação inválida), gera coverage report e renderiza os PDFs.
5. Apresente ao usuário: cobertura %, keywords não cobertas (com a nota honesta abaixo), trilha usada, e ofereça iterar ou seguir para `/submeter`.

## REGRA Nº 1 — VERACIDADE (inegociável)

Cada bullet de experiência DEVE terminar com a citação `[exp:<fact_id>]` de um fato existente no perfil mestre (bundle → profile.experiences[].facts[].id). Você pode:
- **reformular** o texto do fato com o vocabulário exato do JD;
- **reordenar** e **selecionar** os fatos mais relevantes;
- **quantificar** apenas com números presentes no fato.

Você NUNCA pode adicionar skill, ferramenta, empregador, cargo, data, métrica ou conquista que não exista nos fatos. Se uma keyword do JD não tem fato que a sustente, ela fica de fora do currículo e aparecerá em "keywords não cobertas" — isso é o comportamento correto, não um defeito. Não estique um fato para fingir cobertura.

## Reaproveitamento de kits anteriores (economia de tokens)

Os kits vivem em `output/<empresa>-<titulo>-<id6>/` (o `bundle.json` de cada um registra a trilha em `job.track_hint`). Antes de redigir do zero:

1. Liste os kits existentes da MESMA trilha (`ls output/*/bundle.json` + grep do track_hint) e pegue o `resume.md` mais recente.
2. Se a sobreposição entre as keywords do JD atual e esse currículo for alta (mesma família de vaga), **parta dele**: ajuste headline/Resumo ao título novo, reordene bullets pela relevância do JD atual e troque as grafias para as EXATAS do novo JD. Isso custa uma fração de gerar do zero.
3. Se a sobreposição for baixa (outra família de vaga, mesmo dentro da trilha), gere do zero — adaptar um currículo errado sai pior que escrever certo.
4. Reaproveitado ou não, TODAS as citações `[exp:id]` passam pelo mesmo `finalize` — reaproveitar texto nunca dispensa o truthcheck.

## Variante do experimento

O bundle traz `variant` (A = metric-first, B = role-first) atribuída round-robin por segmento — siga as `variant.instructions` na estrutura do Resumo e na ordenação dos bullets. Isso alimenta a comparação de conversão no /painel. Se `variant` for null, use seu julgamento.

## resume.md (currículo ATS)

- **Idioma**: o mesmo do JD (`job.language`).
- **Espelhamento de vocabulário**: onde um fato e o JD descrevem a mesma coisa com palavras diferentes, use a grafia EXATA do JD (fato diz "anúncios pagos", JD diz "Performance Marketing" → escreva "Performance Marketing").
- **Trilha**: parta do `track_hint`, mas decida você — pode misturar experiências de outras trilhas se cobrirem keywords que a dominante não cobre. Declare a decisão em 1 linha no início da sua resposta ao usuário (não no arquivo).
- **Formato** (o template já é ATS-safe — coluna única, sem tabelas/ícones):
  ```
  # <Nome>
  <cidade> · <email> · <telefone> · <linkedin> · <github>

  ## Resumo
  <2-3 linhas ajustadas ao título da vaga, com as keywords principais>

  ## Experiência Profissional        (ou "Professional Experience" em EN)
  ### <Cargo> — <Empresa>
  <início> – <fim>
  - <bullet com vocabulário do JD> [exp:fact_id]

  ## Formação / Education
  ## Certificações (se houver)
  ## Skills
  <lista das skills REAIS que batem com o JD, grafadas como no JD>
  ```
- Ordem reverso-cronológica; título do Resumo sintonizado com o título da vaga.

### Metodologia dos bullets — CAR (Contexto → Ação → Resultado)

Keyword certa em sintaxe fraca não converte. Cada bullet segue a estrutura CAR (variante da fórmula XYZ do Google: "alcancei X, medido por Y, fazendo Z"):

- **Abre com verbo de ação forte** no pretérito (PT: implementou→"Implementei"/liderou/reduziu/automatizou; EN: led/built/reduced/automated). Nunca "responsável por", "ajudei em", "participei de".
- **Contexto curto** (onde/escala) + **ação específica** (o que fez, com as keywords do JD na sintaxe natural da frase — não em lista) + **resultado**.
- **Resultado quantificado sempre que o fato tiver número** (%, R$, prazo, volume). Sem número no fato → resultado qualitativo do próprio fato; NUNCA inventar métrica (Regra nº 1).
- 1 linha por bullet (máx. 2), 3–6 bullets por experiência, ordenados pela relevância para o JD (variante A/B decide metric-first vs role-first).
- Sem pronomes ("eu"), sem adjetivos vazios ("proativo", "dinâmico"), sem jargão interno que o recrutador não conhece.

**STAR (Situação-Tarefa-Ação-Resultado) não é para o currículo** — é o formato das respostas comportamentais: use no `answers.md` (perguntas "conte uma vez em que...") e no material de entrevista, sempre montado sobre fatos citáveis do perfil.

## cover-letter.md

≤250 palavras, idioma do JD. Um proof point concreto (fato citável) por requisito principal do JD. Sem adjetivos vazios. Termina com call-to-action simples.

## answers.md (respostas de triagem)

- Detecte perguntas prováveis no JD (e as comuns: pretensão salarial, disponibilidade, por que a empresa, modelo de trabalho).
- Reutilize `known_screening_answers` do bundle quando a pergunta for equivalente.
- Para dados canônicos use os `candidate_facts` (o bundle lista as chaves existentes; se faltar uma, marque `[CONFIRMAR: <o que falta>]` — nunca invente pretensão salarial, disponibilidade ou autorização de trabalho).

## outreach.md

- DM para recrutador (≤80 palavras, idioma do JD, 1 gancho concreto do JD).
- E-mail de follow-up para d+7 (curto, reafirma interesse, 1 proof point).

## Depois do finalize

- Se o truthcheck falhar, corrija as citações e rode finalize de novo — NUNCA remova a citação para "passar".
- Ao apresentar keywords não cobertas, seja honesto: diga quais faltam porque o Rafael não tem a experiência (correto ficarem de fora) vs. quais têm fato equivalente que você pode reformular melhor (vale iterar).
- O "ATS score" é estimativa heurística — apresente sempre com essa ressalva.
