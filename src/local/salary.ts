/**
 * Pesquisa de faixa salarial — um passo próprio, antes da redação.
 *
 * POR QUE EXISTE. O fato `salary_expectation_brl` do perfil tem como valor
 * literal: *"A combinar [CONFIRMAR por vaga — estratégia: pesquisar a média
 * local de entrada para a função e citar valor de iniciante]"*. Ou seja: a busca
 * na web é **prescrita pelo próprio fato**, não é improviso do modelo. Foi isso
 * que fez o caminho agêntico abrir WebSearch no turno 30 da geração da Techne.
 *
 * O disparo único roda com `--tools ""` e não tem web. Sem este passo ele marca
 * `[CONFIRMAR: pretensão]` e o `finalize` sai 3 — que é o comportamento
 * correto, e foi exatamente o que aconteceu nas 3 vagas da não-regressão
 * (todas 0 -> 3). Enquanto isso não existir, comparar exit code entre as vias
 * mede a ausência deste passo, não a qualidade do redator.
 *
 * A separação é o ponto: a busca acontece UMA vez, num perfil com WebSearch e
 * teto de $0,15, e o disparo de redação continua puro e sem rede.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runHarness } from "./generate-runner.js";
import type { AppConfig } from "../core/config.js";

export const SALARY_FILE = "salary-research.json";

export interface SalaryResearch {
  /** Texto pronto para o `answers.md` usar como pretensão. */
  faixa: string;
  /** De onde veio — o operador tem de poder auditar um número que vai num formulário. */
  fontes: string;
  pesquisadoEm: string;
  custoUsd: number;
  modelo: string;
}

export function lerSalaryResearch(kitDir: string): SalaryResearch | null {
  const p = join(kitDir, SALARY_FILE);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as SalaryResearch;
  } catch {
    return null;
  }
}

const SYS =
  "Você pesquisa faixas salariais de mercado. Responda em português, curto e factual, " +
  "sempre citando as fontes que você consultou. Nunca invente número.";

/**
 * Separa a resposta da busca. Devolve `null` quando NÃO há faixa confiável.
 *
 * A DEGRADAÇÃO É O CAMINHO PRINCIPAL, não o de exceção — e este parser é onde
 * ela mora. Em 2026-08-07 a primeira execução rodou sem `allowed_tools`, as
 * buscas voltaram em `permission_denials`, e o modelo respondeu
 * "FAIXA: Não disponível no momento (falha de permissão na busca)". O `null`
 * daqui fez o kit sair com `[CONFIRMAR: pretensão]` e o finalize sair 3.
 *
 * Aquilo funcionou por sorte: o caminho de falha estava certo antes de o
 * caminho feliz existir. Sorte não é garantia — por isso está testado.
 *
 * Qualquer coisa que não seja uma faixa afirmada vira `null`: o marcador
 * INDISPONIVEL, mas também qualquer resposta em que o modelo diz que não
 * conseguiu. Um número inventado num formulário é pior que um campo em branco.
 */
export function parseSalaryResponse(texto: string): { faixa: string; fontes: string } | null {
  const faixa = /^FAIXA:\s*(.+)$/im.exec(texto)?.[1]?.trim();
  const fontes = /^FONTES:\s*(.+)$/im.exec(texto)?.[1]?.trim() ?? "";
  if (!faixa) return null;
  if (/^INDISPONIVEL$/i.test(faixa)) return null;
  // O modelo raramente devolve o marcador exato quando algo dá errado — ele
  // narra a falha dentro do próprio campo. Isso também é ausência de dado.
  if (/n[ãa]o (?:dispon[íi]vel|consegui|foi poss[íi]vel)|falha|indispon[íi]vel|N\/A/i.test(faixa)) return null;
  return { faixa, fontes };
}

/**
 * Roda UMA busca e grava `salary-research.json` no kitDir.
 *
 * Não lança se a busca falhar — devolve `null` e o kit segue com
 * `[CONFIRMAR: pretensão]`, que é a degradação correta: melhor um marcador
 * honesto que o operador preenche do que um número inventado num formulário.
 */
export async function pesquisarSalario(
  config: AppConfig,
  kitDir: string,
  job: { title: string; location?: string | null; seniority?: string | null; company_name?: string },
  estrategia: string
): Promise<SalaryResearch | null> {
  const perfil = config.harness.profiles["salario"];
  if (!perfil) throw new Error('perfil "salario" não existe em config/config.yaml');

  const prompt = [
    `Pesquise a faixa salarial de mercado para esta vaga no Brasil, em 2026:`,
    ``,
    `  cargo: ${job.title}`,
    `  local: ${job.location ?? "não informado"}`,
    `  senioridade detectada: ${job.seniority ?? "não informada"}`,
    ``,
    `A estratégia definida pelo candidato é, literalmente:`,
    `  "${estrategia}"`,
    ``,
    `Consulte fontes públicas (Glassdoor, salario.com.br, Vagas.com, Love Mondays e similares).`,
    `Responda EXATAMENTE neste formato, sem nada antes ou depois:`,
    ``,
    `FAIXA: <uma frase com a pretensão a declarar, ancorada no piso da faixa por ser entrada no segmento, mencionando abertura a negociação>`,
    `FONTES: <as fontes consultadas e os intervalos que cada uma indicou, em uma linha>`,
    ``,
    `Se você não encontrar dado confiável, responda exatamente: FAIXA: INDISPONIVEL`,
  ].join("\n");

  const r = await runHarness("salario", perfil, { systemPrompt: SYS, stdin: prompt });
  if (!r.ok) return null;

  const parsed = parseSalaryResponse(r.text);
  if (!parsed) return null;
  const { faixa, fontes } = parsed;

  const res: SalaryResearch = {
    faixa,
    fontes,
    pesquisadoEm: new Date().toISOString(),
    custoUsd: r.costUsd,
    // TODOS os modelos: o WebSearch roda num executor haiku separado, e
    // registrar só o primeiro faria a proveniência dizer 'haiku' para um
    // trabalho que o sonnet redigiu.
    modelo: r.models.length ? r.models.join(" + ") : perfil.model,
  };
  writeFileSync(join(kitDir, SALARY_FILE), JSON.stringify(res, null, 2), "utf-8");
  return res;
}
