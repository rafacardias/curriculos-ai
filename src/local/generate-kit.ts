/**
 * generate-kit — orquestra a geração de um kit por qualquer via.
 *
 * As vias não são caminhos de código diferentes: são **transportes diferentes
 * para o mesmo contrato**. Todas produzem os 4 arquivos e todas passam pelo
 * `finalize`, que não sabe nem pergunta quem escreveu.
 *
 *   cli      disparo único (+1 revisão) via `claude -p` sem laço  — o barato
 *   agentic  o laço completo com a skill /gerar                    — o antigo
 *   external escreve PROMPT.md e para; o operador cola onde quiser
 *
 * `agentic` continua vivo e funcional de propósito. Se o disparo único falhar
 * numa vaga que o laço resolve, o caminho de volta é uma flag, não um revert.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runHarness, type HarnessRun } from "./generate-runner.js";
import { parsePortableResponse, buildPortablePrompt } from "../core/portable-prompt.js";
import { coverageReport, renderCoverageMd } from "../core/coverage.js";
import { stripCitations } from "../core/truthcheck.js";
import type { AppConfig } from "../core/config.js";

export const VIAS = ["cli", "agentic", "external"] as const;
export type Via = (typeof VIAS)[number];

/**
 * `--via` é OBRIGATÓRIA. Não há default.
 *
 * Havia: era `cli`. Saiu depois da medição de não-regressão de 2026-08-07, que
 * o operador exigiu antes de qualquer troca de padrão — e que **reprovou**: em
 * 3 pares comparáveis, uma vaga caiu 13 pontos de cobertura (limite: 5). A regra
 * dele era explícita: uma vaga boa não autoriza troca de default.
 *
 * E um default silencioso aqui seria a CLASSE-01 pela quarta vez nesta onda:
 * ausência de escolha lida como escolha segura. Quem gera escreve qual via quer.
 */
export function parseVia(raw: string | undefined): Via {
  if (!raw) {
    throw new Error(
      `--via é obrigatória: ${VIAS.join(" | ")}. ` +
        "`agentic` é o caminho validado; `cli` é 6x mais barato mas ainda não passou " +
        "na não-regressão (ver docs/custo-geracao.md)."
    );
  }
  if ((VIAS as readonly string[]).includes(raw)) return raw as Via;
  throw new Error(`via desconhecida: "${raw}". Use ${VIAS.join(" | ")}`);
}

export const EXPECTED = ["resume.md", "cover-letter.md", "answers.md", "outreach.md"];

const SYS_REDACAO =
  "Você é um redator de currículos ATS. Siga à risca as regras e o formato de saída do " +
  "prompt do usuário. Responda SÓ com os quatro blocos delimitados, sem comentário antes ou depois.";

const SYS_REVISAO =
  "Você é um redator de currículos ATS. Responda SÓ com o bloco delimitado pedido.";

export interface GerarResultado {
  via: Via;
  ok: boolean;
  erro?: string;
  /** Onde os 4 arquivos foram escritos. */
  outDir: string;
  disparos: HarnessRun[];
  /** Soma de tokens de ENTRADA — a métrica de "kits por janela". */
  prefixoTotal: number;
  custoTotal: number;
  revisou: boolean;
  /** Motivo de a revisão não ter rodado, ou de ter sido descartada. */
  revisaoNota?: string;
}

/** Extrai um bloco delimitado único (a revisão devolve só o resume.md). */
function blocoUnico(texto: string, nome: string): string | null {
  const { files } = parsePortableResponse(texto, [nome]);
  return files[nome] ?? null;
}

/**
 * Gera o kit. Escreve os 4 arquivos em `outDir` e NÃO chama o `finalize` — quem
 * chama decide se finaliza (caminho real) ou se só mede (comparação).
 */
export async function gerarKit(opts: {
  via: Via;
  config: AppConfig;
  kitDir: string;
  /** Destino dos arquivos. Default: o próprio kitDir. */
  outDir?: string;
  jobId: string;
  jdText: string;
  /** Roda a segunda passada se a cobertura ficar abaixo do limiar. */
  revisar?: boolean;
  /** Limiar de cobertura (%) abaixo do qual a revisão dispara. */
  limiarCobertura?: number;
  logPath?: string;
}): Promise<GerarResultado> {
  const outDir = opts.outDir ?? opts.kitDir;
  const perfis = opts.config.harness.profiles;
  const res: GerarResultado = {
    via: opts.via,
    ok: false,
    outDir,
    disparos: [],
    prefixoTotal: 0,
    custoTotal: 0,
    revisou: false,
  };

  const contabiliza = (r: HarnessRun) => {
    res.disparos.push(r);
    res.prefixoTotal += r.usage.prefixo;
    res.custoTotal += r.costUsd;
  };

  if (opts.via === "agentic") {
    const perfil = perfis["agentic"];
    if (!perfil) throw new Error('perfil "agentic" não existe em config/config.yaml');
    const prompt =
      `Execute o fluxo do skill /gerar (arquivo .claude/skills/gerar/SKILL.md) de ponta a ponta para a vaga ${opts.jobId}, ` +
      `de forma 100% autônoma, sem fazer nenhuma pergunta. A REGRA Nº 1 (veracidade, citações [exp:id]) vale integralmente. ` +
      `Se faltar um candidate_fact, escreva [CONFIRMAR: ...] no answers.md e prossiga. ` +
      `Só termine depois que "npx tsx src/cli/kit.ts finalize ${opts.jobId}" passar. NÃO execute /submeter. ` +
      `Rode comandos Bash um por um (sem encadear com && ou ;) — comandos compostos são bloqueados pela permissão headless.`;
    const r = await runHarness("agentic", perfil, {
      prompt,
      outputFormat: "stream-json",
      verbose: true,
      logPath: opts.logPath,
    });
    contabiliza(r);
    res.ok = r.ok;
    res.erro = r.erro;
    return res;
  }

  // ---- cli e external partem do mesmo PROMPT.md
  const promptPath = join(opts.kitDir, "PROMPT.md");
  const texto = buildPortablePrompt(opts.kitDir);
  writeFileSync(promptPath, texto, "utf-8");

  if (opts.via === "external") {
    res.ok = true;
    res.revisaoNota = "via externa: o operador redige e roda `kit ingest`";
    return res;
  }

  // ---- disparo único
  const perfilRedacao = perfis["redacao"];
  if (!perfilRedacao) throw new Error('perfil "redacao" não existe em config/config.yaml');
  const shot = await runHarness("redacao", perfilRedacao, {
    systemPrompt: SYS_REDACAO,
    stdin: texto,
    logPath: opts.logPath,
  });
  contabiliza(shot);
  if (!shot.ok) {
    res.erro = shot.erro ?? "disparo falhou";
    return res;
  }

  const { files, missing } = parsePortableResponse(shot.text, EXPECTED);
  if (missing.length) {
    res.erro = `resposta incompleta — faltam: ${missing.join(", ")}`;
    return res;
  }

  mkdirSync(outDir, { recursive: true });
  for (const nome of EXPECTED) writeFileSync(join(outDir, nome), files[nome]!, "utf-8");
  res.ok = true;

  if (!opts.revisar) return res;

  // ---- segunda passada, LIMITE RÍGIDO 1
  //
  // Entrada: só o coverage-report e o currículo atual. Medido: mandar o
  // PROMPT.md inteiro de novo custa 5,2x mais tokens e produz um resultado PIOR
  // (43% de cobertura contra 53%). Contexto focado ganha.
  //
  // O truthcheck sobrevive sem o perfil no prompt porque a revisão só pode
  // reformular, reordenar e cortar — as citações já vêm no texto que ela recebe.
  const resumeAtual = readFileSync(join(outDir, "resume.md"), "utf-8");
  const antes = coverageReport(opts.jdText, stripCitations(resumeAtual));
  const limiar = opts.limiarCobertura ?? 100;
  if (antes.coveragePct >= limiar) {
    res.revisaoNota = `cobertura ${antes.coveragePct}% >= limiar ${limiar}% — revisão não disparou`;
    return res;
  }

  const perfilRevisao = perfis["revisao"];
  if (!perfilRevisao) throw new Error('perfil "revisao" não existe em config/config.yaml');
  const relatorio = renderCoverageMd(antes, { pages: 0, extractedChars: 0 });
  const promptRevisao = [
    "Você é o redator deste currículo. Abaixo estão o relatório de cobertura e o currículo atual.",
    "Reescreva o currículo para cobrir as keywords do JD que TÊM lastro nos fatos já citados.",
    "",
    "REGRAS INEGOCIÁVEIS:",
    "- Cada bullet de experiência TERMINA com a citação [exp:<fact_id>] que ele já tem.",
    "- Você NÃO pode inventar citação nova, nem skill, nem métrica, nem empregador.",
    "- Você só pode: reformular com a grafia exata do JD, reordenar, e cortar.",
    "- Keyword que não tem fato que a sustente FICA DE FORA.",
    "- Ruído de scraping (copiar link, etapa, link, voce, pessoas) deve ser ignorado.",
    "",
    "Responda SÓ com o bloco delimitado:",
    "===== FILE: resume.md =====",
    "",
    "===== COVERAGE REPORT =====",
    relatorio,
    "",
    "===== resume.md ATUAL =====",
    resumeAtual,
  ].join("\n");

  const rev = await runHarness("revisao", perfilRevisao, {
    systemPrompt: SYS_REVISAO,
    stdin: promptRevisao,
    logPath: opts.logPath,
  });
  contabiliza(rev);
  if (!rev.ok) {
    res.revisaoNota = `revisão falhou (${rev.erro}) — mantido o currículo do primeiro disparo`;
    return res;
  }

  const revisado = blocoUnico(rev.text, "resume.md");
  if (!revisado) {
    res.revisaoNota = "revisão não devolveu bloco resume.md — mantido o do primeiro disparo";
    return res;
  }

  // COMPARA E FICA COM O MELHOR. Sem isto, uma revisão que piora sobrescreve em
  // silêncio e não sobra sinal nenhum de que piorou.
  const depois = coverageReport(opts.jdText, stripCitations(revisado));
  if (depois.coveragePct < antes.coveragePct) {
    res.revisaoNota =
      `revisão DESCARTADA: cobertura caiu de ${antes.coveragePct}% para ${depois.coveragePct}%`;
    return res;
  }
  writeFileSync(join(outDir, "resume.md"), revisado, "utf-8");
  res.revisou = true;
  res.revisaoNota = `revisão aceita: cobertura ${antes.coveragePct}% -> ${depois.coveragePct}%`;
  return res;
}

/** Escreve o coverage-report num dir já preenchido (a revisão e a medição usam). */
export function escreveCoverage(outDir: string, jdText: string): void {
  const resumePath = join(outDir, "resume.md");
  if (!existsSync(resumePath)) return;
  const r = coverageReport(jdText, stripCitations(readFileSync(resumePath, "utf-8")));
  writeFileSync(join(outDir, "coverage-report.md"), renderCoverageMd(r, { pages: 0, extractedChars: 0 }), "utf-8");
}
