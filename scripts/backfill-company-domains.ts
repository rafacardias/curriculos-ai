/**
 * backfill-company-domains — popula `companies.domain` só para as empresas
 * com candidatura REAL (23 hoje), pesquisado manualmente (WebSearch, sessão
 * de 2026-08-11).
 *
 * POR QUE ISSO EXISTE. `companies.domain` existe no schema desde
 * 001_init.sql mas nunca foi escrito por nenhum caminho de código — 0 de 518
 * empresas tinham domínio antes deste script. O Estágio 2 da cascata de
 * `inbox-watch` (docs/roadmap.md → Onda 3) depende desse dado pra comparar
 * contra o domínio do remetente do e-mail; sem ele, o estágio mede zero por
 * falta de dado, não por falha real da heurística — contaminaria a medição
 * do Bloco C do mesmo jeito que o ACHADO-16 contaminou a anterior.
 *
 * Escopo deliberadamente pequeno: só as empresas com `applications` reais,
 * não as 518 do acervo de vagas. Backfill amplo fica fora — decisão do
 * operador em 2026-08-11 (sessão de inbox-watch).
 *
 * `npx tsx scripts/backfill-company-domains.ts [--commit]`
 */
import { parseArgs } from "node:util";
import { getDb } from "../src/db/client.js";
import { getCompanyByName, setCompanyDomain } from "../src/db/repo/companies.js";

const { values } = parseArgs({ options: { commit: { type: "boolean", default: false } } });

/**
 * company_name → domínio, pesquisado via WebSearch (agente dedicado,
 * 2026-08-11). `null` = nome capturado não é uma empresa de verdade (título
 * de vaga ou texto de chamada extraído por engano — CLASSE-01) — não
 * inventa domínio.
 */
const DOMAINS: ReadonlyArray<{ name: string; domain: string | null; confidence: "high" | "medium" | "low"; note: string }> = [
  { name: "10x Advisory", domain: "10x-advisory.com", confidence: "medium", note: "consultoria M&A/valuation" },
  { name: "ADMINISTRADOR DE REDES", domain: null, confidence: "low", note: "título de vaga, não empresa (CLASSE-01)" },
  { name: "Ahoy by Belago", domain: "ahoy.com.br", confidence: "low", note: "palpite via handle 'ahoybr', sem confirmação direta" },
  { name: "Campaign Creators", domain: "campaigncreators.com", confidence: "high", note: "agência HubSpot Elite Partner" },
  { name: "Coinbase", domain: "coinbase.com", confidence: "high", note: "exchange conhecida" },
  { name: "E", domain: null, confidence: "low", note: "nome curto demais pra identificar (ruído de extração)" },
  { name: "Foundever", domain: "foundever.com", confidence: "high", note: "BPO internacional" },
  { name: "Freedom24", domain: "freedom24.com", confidence: "high", note: "corretora europeia" },
  { name: "Gomes de Matos Consultoria", domain: "gomesdematos.com.br", confidence: "high", note: "consultoria Fortaleza; também usa Gupy" },
  { name: "Grupo Suno", domain: "suno.com.br", confidence: "high", note: "educação financeira/investimentos" },
  { name: "Grupo SysMap", domain: "sysmap.com.br", confidence: "high", note: "grupo de tecnologia; também usa Gupy" },
  { name: "Itaú Unibanco", domain: "itau.com.br", confidence: "high", note: "banco" },
  { name: "LMG Staffing Solutions", domain: "lmgstaffing.com", confidence: "low", note: "múltiplas entidades 'LMG', sem match exato confirmado" },
  { name: "Raro Labs", domain: "rarolabs.com.br", confidence: "high", note: "startup de software, BH" },
  { name: "Stefanini Group", domain: "stefanini.com", confidence: "high", note: "multinacional de TI; também usa Gupy" },
  { name: "TSA Tecnologia de Sistemas de Automação SA", domain: "tsaengenharia.com.br", confidence: "medium", note: "engenharia/automação industrial" },
  { name: "Techne", domain: "techne.com.br", confidence: "medium", note: "tecnologia/gestão para governo/saúde/educação" },
  { name: "Techne ", domain: "techne.com.br", confidence: "medium", note: "mesma empresa acima, nome com espaço extra (fonte diferente)" },
  { name: "Ubots", domain: "ubots.com.br", confidence: "high", note: "IA conversacional para instituições financeiras" },
  { name: "Unimed Federação Minas", domain: "unimed.coop.br", confidence: "medium", note: "federação MG do sistema Unimed; também usa Gupy e portal próprio" },
  { name: "VAAS", domain: "vaas.com.br", confidence: "medium", note: "antifraude/decisão KYB/PLD, Florianópolis — também usa vaas.live" },
  { name: "Venha fazer parte do Corporativo da Hospital Care", domain: "hospitalcare.com.br", confidence: "medium", note: "título de chamada, não nome de empresa (CLASSE-01) — empresa real é Hospital Care" },
  { name: "iK", domain: "ik.com.br", confidence: "low", note: "nome ambíguo — provável iK Solution, mas confiança baixa" },
];

const db = getDb();
console.log(`modo: ${values.commit ? "COMMIT" : "dry-run"} (${DOMAINS.length} empresas na lista)\n`);

let matched = 0;
let written = 0;
let skippedNoDomain = 0;
let notFound = 0;

for (const entry of DOMAINS) {
  const company = getCompanyByName(entry.name);
  if (!company) {
    console.log(`[não encontrada no banco] "${entry.name}"`);
    notFound++;
    continue;
  }
  matched++;
  if (!entry.domain) {
    console.log(`[sem domínio — ${entry.note}] "${entry.name}"`);
    skippedNoDomain++;
    continue;
  }
  console.log(`[${entry.confidence}] "${entry.name}" → ${entry.domain}  (${entry.note})`);
  if (values.commit) {
    setCompanyDomain(company.id, entry.domain);
    written++;
  }
}

console.log(
  `\n${matched}/${DOMAINS.length} encontradas no banco, ${skippedNoDomain} sem domínio (nome não é empresa), ${notFound} não encontradas.`
);
console.log(values.commit ? `${written} domínios gravados.` : "dry-run — nada gravado. Rode com --commit pra aplicar.");

if (values.commit) db.exec("PRAGMA optimize");
