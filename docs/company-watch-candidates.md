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
| CNH | G | Sem board Gupy | 7 variações tentadas (404) | — | Portal global próprio (`join.cnh.com`/`careers.cnh.com`), provavelmente Workday/SuccessFactors |
| SEST SENAT | G | Sem board Gupy | `sestsenat`, `sest`, `senat`, `sistemas`, `sestsenatmg` (404) | — | Usa Plooral (`sestsenatvagas.enlizt.me`) — recrutamento nacional centralizado, confirma o padrão dos sistemas S (como Sicoob) |
| Grupo UbyAgro | G | **Em produção** | `vemprauby` | 9 | 10 brutas, 1 banco de talentos. Handle não óbvio (nome no board: "Ubyfol Agroquímica") — achado via busca web |
| iCrop | G | Sem board Gupy | `icrop`, `icropirrigacao`, `icropgestaodeirrigacao`, `icropagricola`, `icroptecnologia` (404) | — | Usa Mindsight (`oportunidades.mindsight.com.br/icrop`) |
| BH Airport | G | **Em produção** | `bh-airport` | 0 | Board real, sem vaga aberta agora (1 bruta é banco de talentos) — mantido registrado, `watch run` reflete quando abrir vaga |
| IGL – Importação e Comércio de Materiais de Construção | G | **Em produção** | `vagasgrupoigl` | 5 | Handle não óbvio — achado via busca web. Dono das marcas Viveza e BEL LAR |
| Alctel Telecom | H | Sem board Gupy | `alctel`, `alctel-telecom`, `alctel-telecomunicacoes` (404) | — | Usa Solides (`alctel.vagas.solides.com.br`) |
| TQI | H | Sem board Gupy | `tqi` (404) | — | Portal próprio (`vagas.tqi.com.br`, SPA custom), sem ATS terceirizado identificável |
| Framework (Framework Digital, BH) | H | Sem board Gupy | `framework`, `framework-digital`, `frameworkdigital`, `framework-digital-consultoria`, `fw-digital` (404); `vempraframe` respondeu 404 HTTP mas com `__NEXT_DATA__` trazendo `"page": "/404"` — mesmo padrão do caso `jdctech` (Grupo D), board desativado, não confirma | — | Usa InHire (`frameworkdigital.inhire.app/vagas`) |
| Unimed São Sebastião do Paraíso | H | Sem board Gupy | `unimedssp`, `unimedsaosebastiaodoparaiso` (404) | — | Usa Solides (`unimedssp.vagas.solides.com.br`) |
| iGreen Energy | H | Sem board Gupy | `igreen`, `igreenenergy`, `igreen-energy` (404) | — | Sem ATS terceirizado — site institucional, captação via WhatsApp |
| Ipê Digital | H | **Em produção** | `ipedigital` | 1 | 3 brutas, 2 talent pool |
| Rumo Soluções (Lagoa Santa) | H | Sem board Gupy | `rumo`, `rumosolucoes`, `rumo-solucoes` (404) — atenção: `rumolog.gupy.io` existe mas é da Rumo Logística/Grupo Cosan, empresa não relacionada; não tratado como confirmação | — | Usa Compleo (`jobs.compleo.app/rumosolucoes/joblist`) |

## Taxa de conversão, por grupo (não só acumulada — grupos maiores/mais estruturados
convertem melhor, e misturar tudo esconde isso)

| Grupo | Tentadas | Convertidas (produção, cobertura nova) | Taxa |
|---|---:|---:|---:|
| A+B | 14 | 8 (Localiza, Algar, Bretas, Banco Mercantil, 3corações, BHS, Montreal, IOASYS) | 57% |
| C | 7 | 3 (Queima Diária, Sabin, Unidas Locadora) | 43% |
| D | 6 | 0 — Algar Tech tem board respondendo, mas é o MESMO handle de "Algar" já em produção: zero cobertura nova | 0% |
| E | 6 | 1 (Supergasbras) | 17% |
| F | 6 | 1 (Kinross Brasil Mineração) | 17% |
| G | 6 | 3 (Grupo UbyAgro, BH Airport, IGL) | 50% |
| H | 7 | 1 (Ipê Digital) | 14% |
| **Total** | **52** | **17** | **33%** |

**Fechado.** 17/52 (33%) convertido. A/B (57%) e G (50%) — empresas maiores/mais estruturadas —
puxam a média pra cima; C (43%), E/F (17%), D (0%) e H (14%) — mistura de pequenas, cartórios,
cooperativas regionais e empresas de nicho — puxam pra baixo. A curva não caiu monotonicamente
(G quebrou a sequência D→E→F), mas o padrão qualitativo se sustentou do início ao fim: **porte e
estrutura da empresa prevê conversão melhor que "grupo da pesquisa"**.

## Ranking de ATS concorrentes (por ocorrência) — fechado

Não é achado isolado — é dado que decide qual adapter importa mais depois de Greenhouse, se
decidir por Fase B: cada empresa sem board Gupy que expõe outro ATS conta um voto.

| ATS | Ocorrências | Empresas |
|---|---:|---|
| **Solides** | 6 | Cartório 1º Ofício de Registro de Imóveis de BH (D), Jungle Consultoria (D), Profitto (E), Sicoob Credicopa (F), Alctel Telecom (H), Unimed São Sebastião do Paraíso (H) |
| Empregare | 2 | Sicoob Credivaz (F), Sicoob Carlos Chagas (F) — portal nacional do sistema Sicoob |
| Greenhouse | 1 | Arqia (C) |
| Yapp Rec | 1 | Shippify Tecnologia (C) |
| Pandapé | 1 | AeC Centro de Contatos (C) |
| ABGi Consulting Jobs | 1 | ABGI Brasil (D) |
| Flash Vagas | 1 | JDC Tech e People (D) |
| Plooral | 1 | SEST SENAT (G) — recrutamento nacional centralizado, mesmo padrão dos sistemas S visto no Sicoob |
| Mindsight | 1 | iCrop (G) |
| InHire | 1 | Framework (H) |
| Compleo | 1 | Rumo Soluções (H) |
| Sinergy RH | 1 | Algar Tech (D) — já coberta pelo handle de "Algar", não candidata a registro próprio |
| jobs.lear.com / CNH próprio (portais de matriz, não plataforma de mercado) | 2 | Lear Corporation (F), CNH (G) |

**Solides isolado na liderança — 6 ocorrências contra 1 do Greenhouse.** Se a Fase B for decidida
por esta amostra, o próximo adapter que mais amplia cobertura não é Greenhouse — é **Solides**.
Dado real, não intuição de mercado; decisão em si fica pra quando essa fase abrir.

**Correção própria, achada fechando esta tabela**: as 6 empresas dos grupos A/B sem board (Alcoa,
Centro Universitário Una, Centro Universitário Uni-BH, Martins, Grupo Zema, A3 Data) tinham
ficado de fora da contagem de "sem ATS identificável" — o bucket só começou a ser preenchido a
partir do Grupo C, quando a tabela de ranking foi criada. Reconciliado agora:

| Sem ATS identificável (formulário próprio, e-mail, LinkedIn, portal SPA sem terceiro, ou não localizado) | 15 | Alcoa Alumínio (A), Centro Universitário Una (A), Centro Universitário Uni-BH (A), Martins (A), Grupo Zema (B), A3 Data (B), Bridge Transportes (C), Cartório 2º Ofício de Notas (D), Conquista Intermediadora (E), NTW Contabilidade (E), UaiRango (E), Rede Inova Drogarias (E), Eletrozema (F), TQI (H), iGreen Energy (H) |

Reconciliação: 17 (Gupy) + 20 (ATS de terceiros identificado, somando a tabela acima) + 15 (sem
ATS) = 52. Bate com o total tentado — nenhuma empresa ficou de fora da contagem final.
