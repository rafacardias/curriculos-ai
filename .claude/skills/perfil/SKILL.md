---
name: perfil
description: Ingestão e manutenção do perfil mestre — extrai experiências dos PDFs/LinkedIn/GitHub em profile/sources/, monta master-profile.yaml + tracks.yaml + candidate-facts.yaml com confirmação interativa, e sincroniza com o DB. Use quando o usuário pedir /perfil, quiser criar/atualizar o perfil mestre, ou antes do primeiro /gerar.
---

# /perfil — Perfil Mestre

Subcomandos: `ingest` (padrão se os YAMLs estão vazios), `edit`, `show`.

## /perfil ingest

1. **Liste as fontes**: arquivos em `profile/sources/` (PDFs de currículos, export do LinkedIn, texto colado). Se vazio, peça ao usuário para soltar os arquivos lá e pare. Se ele tiver GitHub no perfil, busque os repos públicos via `https://api.github.com/users/<user>/repos` (curl) e READMEs relevantes.
2. **Leia cada PDF** diretamente com a ferramenta Read (ela lê PDFs nativamente).
3. **Extraia para o formato do `profile/master-profile.yaml`** (veja o exemplo comentado no próprio arquivo):
   - Experiências com ids estáveis kebab-case (`exp-<empresa>-<função>`).
   - Cada experiência vira uma lista de **fatos atômicos e verificáveis** (`facts`), cada um com id `<exp_id>.f<n>`, texto factual e skills. Um fato = uma alegação checável (métrica, entrega, responsabilidade). NÃO parafraseie inflando números.
   - Conflitos entre fontes (datas/cargos divergentes entre currículos antigos): **pergunte ao usuário**, nunca escolha silenciosamente.
4. **Proponha as trilhas** em `profile/tracks.yaml`: agrupe as experiências por área (ex.: marketing, ops, tech), cada trilha com `summary` de posicionamento e `keywords` (léxico que o scoring usa — inclua sinônimos PT e EN dos skills reais).
5. **Entreviste os candidate_facts** (um por vez, via AskUserQuestion quando fizer sentido) e grave em `profile/candidate-facts.yaml`: work_authorization, salary_expectation_brl, salary_expectation_usd, location_flexibility, visa_sponsorship_needed, notice_period, years_of_experience:<skill> para os skills principais, pronouns (opcional), disability (opcional).
6. **Confirmação interativa**: mostre um resumo (experiências, nº de fatos, trilhas propostas) e peça aprovação antes de gravar.
7. **Sincronize**: `npx tsx src/cli/ingest-profile.ts sync` — deve terminar com `sync OK`.
8. Sugira commit (master-profile.yaml e tracks.yaml são versionados; candidate-facts.yaml é gitignored).

## /perfil edit

Aplique a mudança pedida nos YAMLs, rode `npx tsx src/cli/ingest-profile.ts sync` e mostre o resumo.

## /perfil show

Rode `npx tsx src/cli/ingest-profile.ts show` e apresente o resumo.

## Regras

- Fatos só entram no master-profile se vierem de uma fonte ou forem confirmados pelo usuário — este arquivo é a fronteira da veracidade de TODO o sistema.
- Ids de fatos nunca mudam depois de criados (currículos antigos os citam).
- Sempre termine rodando `sync` — o scoring depende das trilhas no DB.
