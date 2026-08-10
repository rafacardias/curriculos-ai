# Cadastro de vigilância — candidatos (GPTW 2026 / presença em BH)

Log de verificação, não backlog priorizado. Fonte: pesquisa massiva de 08/08 (transcript da
sessão, 8 grupos de subagentes A–H, ~53 empresas — a recontagem exata deu **52**). Regra: handle
Gupy só entra em `config/companies.yaml` **confirmado por board que responde de verdade**
(`fetchGupyCompanyJobs` retornando dados reais, não 404) — nunca por padrão de nome assumido.
Empresa sem board Gupy acessível fica registrada aqui como tal, não sai da lista silenciosamente
e não entra no YAML "por enquanto".

Verificação em lotes, cada lote revisado antes do próximo (pedido do operador, 2026-08-09).

## Status

| Empresa | Grupo | Status | Handle | Vagas efetivas | Nota |
|---|---|---|---|---:|---|
| Localiza&Co | A | **Em produção** | `localiza` | — | Fase A, já mesclado |
| Algar | A | **Em produção** | `algar` | — | Fase A, já mesclado |
| Banco Mercantil | A | **Verificada** | `mercantil` | 22 | |
| Alcoa Alumínio | A | Sem board Gupy | `alcoa` (404) | — | Indício de ATS diferente (Workday/Senior) na pesquisa original — 404 confirma, não contradiz |
| Centro Universitário Una | A | Sem board Gupy | `una`, `grupouna`, `unaeducacional` (404) | — | Pode ter Gupy sob outro handle — não descartada |
| Centro Universitário Uni-BH | A | Sem board Gupy | `unibh`, `uni-bh` (404) | — | Idem |
| Martins | A | Sem board Gupy | `martins`, `gruposmartins`, `martinsatacado` (404) | — | Idem |
| Bretas | B | **Verificada, escopo pendente** | `cencosudbrasil` | 298 | Handle é da holding Cencosud Brasil, não da Bretas — cadastrar assim traz vagas de todo o grupo. Decisão do operador, não técnica |
| Grupo Zema | B | Sem board Gupy | `zema`, `grupozema` (404) | — | Indício de ATS diferente — 404 confirma |
| 3corações | B | **Verificada** | `3coracoes` | 174 | |
| BHS Soluções Digitais | B | **Verificada** | `bhs` | 13 | |
| Montreal Informática | B | **Verificada** | `montreal` | 48 | |
| IOASYS | B | **Verificada** | `ioasys` | 1 | |
| A3 Data | B | Sem board Gupy | `a3data`, `a3-data` (404) | — | Pode ter Gupy sob outro handle — não descartada |
| Arqia | C | Pendente | — | — | |
| Queima Diária | C | Pendente | — | — | |
| Sabin Diagnóstico e Saúde | C | Pendente | — | — | |
| Unidas Locadora | C | Pendente | — | — | |
| Shippify Tecnologia | C | Pendente | — | — | |
| Bridge Transportes e Logística | C | Pendente | — | — | |
| AeC Centro de Contatos | C | Pendente | — | — | |
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

## Taxa de conversão (parcial — 14/52 tentadas)

- **Verificada e limpa**: 7/14 (Localiza, Algar, Banco Mercantil, 3corações, BHS, Montreal, IOASYS)
- **Verificada, escopo pendente**: 1/14 (Bretas — handle é de holding, não da empresa)
- **Sem board Gupy acessível**: 6/14

Número final só depois dos grupos C–H (38 empresas restantes). Se a taxa se mantiver perto de
50%, o argumento "Gupy sozinho não sustenta a vigilância" (favorável a priorizar Greenhouse na
Fase B) ganha força — mas é cedo pra concluir com 14/52.
