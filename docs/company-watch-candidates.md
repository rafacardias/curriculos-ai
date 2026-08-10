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
| Algar Tech | D | Pendente | — | — | |
| Cartório 1º Ofício de Registro de Imóveis de BH | D | Pendente | — | — | |
| Cartório 2º Ofício de Notas de BH | D | Pendente | — | — | |
| ABGI Brasil | D | Pendente | — | — | |
| Jungle Consultoria e Soluções Sociais | D | Pendente | — | — | |
| JDC Tech e People | D | Pendente | — | — | |
| Conquista Intermediadora de Negócios | E | Pendente | — | — | |
| Profitto | E | Pendente | — | — | |
| NTW Contabilidade e Gestão Empresarial | E | Pendente | — | — | |
| UaiRango | E | Pendente | — | — | |
| Rede Inova Drogarias | E | Pendente | — | — | |
| Supergasbras | E | Pendente | — | — | |
| Sicoob Credicopa | F | Pendente | — | — | |
| Sicoob Credivaz | F | Pendente | — | — | |
| Sicoob Carlos Chagas | F | Pendente | — | — | |
| Kinross Brasil Mineração | F | Pendente | — | — | |
| Eletrozema | F | Pendente | — | — | |
| Lear Corporation | F | Pendente | — | — | |
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

| Grupo | Tentadas | Convertidas (produção) | Taxa |
|---|---:|---:|---:|
| A+B | 14 | 8 (Localiza, Algar, Bretas, Banco Mercantil, 3corações, BHS, Montreal, IOASYS) | 57% |
| C | 7 | 3 (Queima Diária, Sabin, Unidas Locadora) | 43% |
| D–H | 0/31 | — | pendente |

A/B (empresas maiores e mais estruturadas) e C (mistura) seguem perto uma da outra — 57% e 43%,
não a queda abrupta esperada ainda. D–H tem cartórios, Sicoobs regionais e consultorias pequenas,
categorias com prior mais baixo de usar um ATS de mercado — a hipótese de queda continua de pé,
só não confirmada com 21/52. O acumulado até aqui: **11/21 (52%)**. Número final só depois de
D–H; um achado lateral do lote C vale registrar: Arqia usa Greenhouse — primeiro dado real de que
"ATS diferente" nas empresas sem board Gupy não é só suposição, é observação. Não muda a ordem
(Fase B continua bloqueada), mas é o tipo de fato que vale ter na mão quando ela abrir.
