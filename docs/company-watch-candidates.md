# Cadastro de vigilância — candidatos (GPTW 2026 / presença em BH)

Log de verificação, não backlog priorizado. Fonte: pesquisa massiva de 08/08 (transcript da
sessão, 8 grupos de subagentes A–H, ~53 empresas — a recontagem exata deu **52**). Regra: handle
Gupy só entra em `config/companies.yaml` **confirmado por board que responde de verdade**
(`fetchGupyCompanyJobs` retornando dados reais, não 404) — nunca por padrão de nome assumido.
Empresa sem board Gupy acessível fica registrada aqui como tal, não sai da lista silenciosamente
e não entra no YAML "por enquanto".

Verificação em lotes. Lote 1 foi revisado pelo operador antes do lote 2; a partir daí o log de
verificação por empresa faz a auditoria sozinho — não é mais preciso revisar lote a lote
(2026-08-09).

## Status

| Empresa | Grupo | Status | Handle | Vagas efetivas | Nota |
|---|---|---|---|---:|---|
| Localiza&Co | A | **Em produção** | `localiza` | — | Fase A, já mesclado |
| Algar | A | **Em produção** | `algar` | — | Fase A, já mesclado |
| Banco Mercantil | A | **Em produção** | `mercantil` | 22 | |
| Alcoa Alumínio | A | Sem board Gupy | `alcoa` (404) | — | Indício de ATS diferente (Workday/Senior) na pesquisa original — 404 confirma, não contradiz |
| Centro Universitário Una | A | Sem board Gupy | `una`, `grupouna`, `unaeducacional` (404) | — | Pode ter Gupy sob outro handle — não descartada |
| Centro Universitário Uni-BH | A | Sem board Gupy | `unibh`, `uni-bh` (404) | — | Idem |
| Martins | A | Sem board Gupy | `martins`, `gruposmartins`, `martinsatacado` (404) | — | Idem |
| Bretas | B | **Em produção** | `cencosudbrasil` | 298 | Handle é da holding Cencosud Brasil, não da Bretas — cadastrada assim de propósito (decisão do operador, 2026-08-09): filtro de localização + classificador determinístico cobrem a maior parte do ruído, reversível numa linha se incomodar. `name` no YAML carrega a ressalva |
| Grupo Zema | B | Sem board Gupy | `zema`, `grupozema` (404) | — | Indício de ATS diferente — 404 confirma |
| 3corações | B | **Em produção** | `3coracoes` | 174 | |
| BHS Soluções Digitais | B | **Em produção** | `bhs` | 13 | |
| Montreal Informática | B | **Em produção** | `montreal` | 48 | |
| IOASYS | B | **Em produção** | `ioasys` | 1 | |
| A3 Data | B | Sem board Gupy | `a3data`, `a3-data` (404) | — | Pode ter Gupy sob outro handle — não descartada |
| Arqia | C | Sem board Gupy | `arqia`, `arqiaconsultoria`, `arqiaengenharia`, `grupoarqia`, `arqiatelecom`, `arqiaconectividade` (404) | — | Usa **Greenhouse** (`job-boards.eu.greenhouse.io/arqia`) — dado pra quando a Fase B abrir, não agir agora |
| Queima Diária | C | **Em produção** | `queimadiaria` | 1 | 5 no board bruto, 4 são talent pool |
| Sabin Diagnóstico e Saúde | C | **Em produção** | `gruposabin` | 220 | 245 no board bruto, 25 talent pool |
| Unidas Locadora | C | **Em produção** | `unidas` | 157 | 159 no board bruto, 2 talent pool |
| Shippify Tecnologia | C | Sem board Gupy | `shippify`, `shippifytecnologia`, `shippifybrasil`, `shippifybr`, `shippifyco` (404) | — | Usa ATS "Yapp Rec" |
| Bridge Transportes e Logística | C | Sem board Gupy | `bridge`, `bridgetransportes`, `bridgetransporteslogistica`, `grupobridge`, `bridgelogistica`, `bridgelog`, `grupobridgelog` (404) | — | Formulário próprio no site, sem ATS externo |
| AeC Centro de Contatos | C | Sem board Gupy | `aec`, `grupoaec`, `aecdigital`, `aecatendimento`, `aeccentrodecontatos`, `aecgrupo`, `aeccontactcenter`, `aec-centrodecontatos` (404) | — | Usa Pandapé (`aeccentrodecontatos.pandape.com.br`) |
| Algar Tech | D | Já coberto (não registrada de novo) | `algar` (200, board real) | — | O board que responde é o do **Grupo Algar**, mesmo handle já em produção como "Algar" desde a Fase A — não é canal próprio da Algar Tech. Canal oficial real: Sinergy RH (`portalsinergyrh.com.br`), fora do escopo Gupy. Registrar de novo seria duplicar o mesmo handle sob outro nome, sem ganhar cobertura — decisão: não registrar |
| Cartório 1º Ofício de Registro de Imóveis de BH | D | Sem board Gupy | `cartorio1registrobh`, `cartorio1registro`, `cartorio1bh`, `registrodeimoveisbh`, `1oficiobh`, `cartorio1oficiobh` (404) | — | Usa Solides (`primeirazona.vagas.solides.com.br`) |
| Cartório 2º Ofício de Notas de BH | D | Sem board Gupy | `cartorio2notasbh`, `cartorio2notas`, `cartorio2oficionotasbh`, `2oficionotasbh` (404) | — | Nenhuma página de carreiras encontrada — provavelmente sem ATS formal |
| ABGI Brasil | D | Sem board Gupy | `abgibrasil`, `abgi-brasil`, `abgi` (404) | — | Usa portal próprio ABGi Consulting Jobs (`jobs.abgi-consulting.com/pt-BR`) |
| Jungle Consultoria e Soluções Sociais | D | Sem board Gupy | `jungleconsultoria`, `jungle-consultoria`, `jungle` (404) | — | Usa Solides (`gesuas.vagas.solides.com.br`) — opera como "Jungle Social"/produto GESUAS |
| JDC Tech e People | D | Sem board Gupy | `jdctech` (200 mas `__NEXT_DATA__` traz `"page": "/404"` — board desativado), `jdctechpeople`, `jdc-tech-people`, `jdcpeople`, `jdc-people`, `jdctecnologia` (404) | — | Link legado morto no rodapé do site aponta pro Gupy; canal real hoje é Flash Vagas (`jdctechpeople.vagas.flashapp.com.br`) |
| Conquista Intermediadora de Negócios | E | Sem board Gupy | 10 variações tentadas (404) | — | Entidade legal não identificada com segurança; nenhum ATS de terceiros achado |
| Profitto | E | Sem board Gupy | 8 variações tentadas (404) | — | Usa Solides (`profitto.vagas.solides.com.br`) |
| NTW Contabilidade e Gestão Empresarial | E | Sem board Gupy | 9 variações tentadas (404) | — | Formulário próprio no site, sem ATS externo |
| UaiRango | E | Sem board Gupy | 7 variações tentadas (404) | — | Sem ATS de terceiros identificado |
| Rede Inova Drogarias | E | Sem board Gupy | 11 variações tentadas (404) | — | Recrutamento via e-mail/LinkedIn, sem ATS |
| Supergasbras | E | **Em produção** | `supergasbras` | 96 | 111 brutas, 15 talent pool |
| Sicoob Credicopa | F | Sem board Gupy | `sicoobcredicopa`, `credicopa` (404) | — | Usa Solides (`sicoobcredicopa.vagas.solides.com.br`) |
| Sicoob Credivaz | F | Sem board Gupy | `sicoobcredivaz`, `credivaz` (404) | — | Usa Empregare (`sicoob.empregare.com`) — portal nacional do sistema Sicoob |
| Sicoob Carlos Chagas | F | Sem board Gupy | `sicoobcarloschagas`, `carloschagas`, `sicoobcarlos` (404) | — | Usa Empregare, mesmo portal nacional |
| Kinross Brasil Mineração | F | **Em produção** | `kinross` | 1 | 2 no board, 1 talent pool |
| Eletrozema | F | Sem board Gupy | `eletrozema`, `zema`, `grupozema`, `eletrozemavarejo` (404) | — | Sem ATS de terceiros — formulário próprio |
| Lear Corporation | F | Sem board Gupy | `lear`, `learcorporation`, `learcorp`, `learbrasil`, `lear-brasil`, `learbr`, `learjundiai`, `learautomotive` (404) | — | Portal próprio da matriz (`jobs.lear.com`), não Gupy |
| CNH | G | Pendente | — | — | |
| SEST SENAT | G | Pendente | — | — | |
| Grupo UbyAgro | G | Pendente | — | — | |
| iCrop | G | Pendente | — | — | |
| BH Airport | G | Pendente | — | — | |
| IGL – Importação e Comércio de Materiais de Construção | G | Pendente | — | — | |
| Alctel Telecom | H | Pendente | — | — | |
| TQI | H | Pendente | — | — | |
| Framework | H | Pendente | — | — | |
| Unimed São Sebastião do Paraíso | H | Pendente | — | — | |
| iGreen Energy | H | Pendente | — | — | |
| Ipê Digital | H | Pendente | — | — | |
| Rumo Soluções | H | Pendente | — | — | |

## Taxa de conversão, por grupo (não só acumulada — grupos maiores/mais estruturados
convertem melhor, e misturar tudo esconde isso)

| Grupo | Tentadas | Convertidas (produção, cobertura nova) | Taxa |
|---|---:|---:|---:|
| A+B | 14 | 8 (Localiza, Algar, Bretas, Banco Mercantil, 3corações, BHS, Montreal, IOASYS) | 57% |
| C | 7 | 3 (Queima Diária, Sabin, Unidas Locadora) | 43% |
| D | 6 | 0 — Algar Tech tem board respondendo, mas é o MESMO handle de "Algar" já em produção: zero cobertura nova | 0% |
| E | 6 | 1 (Supergasbras) | 17% |
| F | 6 | 1 (Kinross Brasil Mineração) | 17% |
| G–H | 0/13 | — | pendente |

Acumulado até aqui: **13/39 (33%)**. As 3 cooperativas Sicoob confirmaram a hipótese de recrutamento
centralizado no sistema nacional (Empregare/Solides), não Gupy — nenhuma delas tem board próprio.
G–H seguem em aberto.

## Ranking de ATS concorrentes (por ocorrência, atualizado a cada lote fechado)

Não é achado isolado — é dado que decide qual adapter importa mais depois de Greenhouse, se
decidir por Fase B: cada empresa sem board Gupy que expõe outro ATS conta um voto.

| ATS | Ocorrências | Empresas |
|---|---:|---|
| **Solides** | 4 | Cartório 1º Ofício de Registro de Imóveis de BH (D), Jungle Consultoria (D), Profitto (E), Sicoob Credicopa (F) |
| Empregare | 2 | Sicoob Credivaz (F), Sicoob Carlos Chagas (F) — portal nacional do sistema Sicoob |
| Greenhouse | 1 | Arqia (C) |
| Yapp Rec | 1 | Shippify Tecnologia (C) |
| Pandapé | 1 | AeC Centro de Contatos (C) |
| ABGi Consulting Jobs | 1 | ABGI Brasil (D) |
| Flash Vagas | 1 | JDC Tech e People (D) |
| Sinergy RH | 1 | Algar Tech (D) — já coberta pelo handle de "Algar", não candidata a registro próprio |
| jobs.lear.com (portal próprio de matriz) | 1 | Lear Corporation (F) |
| Sem ATS identificável (formulário próprio, e-mail, LinkedIn, ou não localizado) | 7 | Bridge Transportes (C), Cartório 2º Ofício de Notas (D), Conquista Intermediadora (E), NTW Contabilidade (E), UaiRango (E), Rede Inova Drogarias (E), Eletrozema (F) |
