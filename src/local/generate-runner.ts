/**
 * generate-runner — o ÚNICO lugar que executa `claude`.
 *
 * `src/local/harness.ts` monta o argv; este arquivo dispara. O servidor e o CLI
 * chamam os dois — não existe segundo caminho. A duplicação é o que fez
 * `hardFilterReason` divergir antes, e argv de subprocesso é pior: a divergência
 * não aparece em teste, aparece na conta.
 *
 * O que ele conserta em relação ao spawn que existia inline no servidor:
 *
 * 1. **O `result` deixa de ser jogado fora.** O `--output-format` pedia
 *    stream-json e ninguém dava `JSON.parse` — os bytes iam para o log e o
 *    evento final, com custo, turnos e modelo, era descartado. Agora ele é
 *    parseado e devolvido, que é o que permite registrar proveniência e provar
 *    que o teto funcionou.
 * 2. **O log abre em append.** Abria com `"w"`: cada retry apagava a evidência
 *    da tentativa anterior. Foi assim que sete cartões de erro sumiram.
 */
import { spawn } from "node:child_process";
import { mkdirSync, openSync, writeSync, closeSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "../db/client.js";
import { buildHarnessArgv, type HarnessProfile, type HarnessOptions } from "./harness.js";

export interface HarnessUsage {
  input: number;
  cacheCreation: number;
  cacheRead: number;
  output: number;
  /** Tokens de ENTRADA processados — a métrica de "kits por janela". */
  prefixo: number;
}

export interface HarnessRun {
  ok: boolean;
  text: string;
  usage: HarnessUsage;
  costUsd: number;
  turns: number;
  durationMs: number;
  models: string[];
  exitCode: number | null;
  /** Preenchido quando `ok` é falso. */
  erro?: string;
}

/** Limite de sessão ENCERRA. Nunca vira retry — foi o 429 em rajada de 2026-08-06. */
export class SessionLimitError extends Error {}
export class AuthError extends Error {}

const VAZIO: HarnessUsage = { input: 0, cacheCreation: 0, cacheRead: 0, output: 0, prefixo: 0 };

/** Último objeto JSON de uma linha do stream — o `result` vem por último. */
export function parseResultEvent(raw: string): Record<string, unknown> | null {
  let achado: Record<string, unknown> | null = null;
  for (const linha of raw.split("\n")) {
    const s = linha.trim();
    if (!s.startsWith("{")) continue;
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      if (o.type === "result" || o.usage) achado = o;
    } catch {
      /* linha parcial — o stream-json escreve conforme acontece */
    }
  }
  if (achado) return achado;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function lerUsage(o: Record<string, unknown> | null): HarnessUsage {
  const u = (o?.usage ?? {}) as Record<string, number>;
  const input = u.input_tokens ?? 0;
  const cacheCreation = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  return {
    input,
    cacheCreation,
    cacheRead,
    output: u.output_tokens ?? 0,
    prefixo: input + cacheCreation + cacheRead,
  };
}

export interface RunOptions extends HarnessOptions {
  /** Texto enviado por stdin (o PROMPT.md, tipicamente). */
  stdin?: string;
  /** Arquivo de log; sempre aberto em APPEND. */
  logPath?: string;
}

/**
 * Executa um perfil e devolve o resultado estruturado.
 *
 * Não lança em falha do modelo — devolve `ok: false` com o motivo, porque quem
 * chama precisa distinguir "reprovou" de "não rodou". Lança só nos dois casos em
 * que continuar é errado: limite de sessão e autenticação.
 */
export async function runHarness(
  nome: string,
  perfil: HarnessProfile,
  opts: RunOptions
): Promise<HarnessRun> {
  const argv = buildHarnessArgv(nome, perfil, opts);
  const timeoutMs = (perfil.timeout_min ?? 15) * 60_000;

  return new Promise((resolve, reject) => {
    let log: number | null = null;
    if (opts.logPath) {
      mkdirSync(join(PROJECT_ROOT, "logs"), { recursive: true });
      log = openSync(opts.logPath, "a"); // append: retry não apaga a tentativa anterior
      writeSync(log, `\n===== ${new Date().toISOString()} · perfil ${nome} =====\n`);
    }

    const child = spawn(process.env.CLAUDE_BIN ?? "claude", argv, {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: [opts.stdin != null ? "pipe" : "ignore", "pipe", "pipe"],
    });

    let saida = "";
    let tail = "";
    const onData = (buf: Buffer) => {
      if (log != null) writeSync(log, buf);
      saida += buf.toString();
      tail = (tail + buf.toString()).slice(-8192);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    if (opts.stdin != null && child.stdin) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }

    let expirou = false;
    const timer = setTimeout(() => {
      expirou = true;
      child.kill();
    }, timeoutMs);

    child.on("error", (e) => {
      clearTimeout(timer);
      if (log != null) closeSync(log);
      reject(new Error(`não consegui iniciar o claude: ${e.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (log != null) closeSync(log);

      const limite = tail.match(/hit your (?:session|usage) limit[^"\\]*/i);
      if (limite) {
        reject(new SessionLimitError(`limite de uso da assinatura atingido (${limite[0].trim()})`));
        return;
      }
      if (/failed to authenticate|please run \/login|invalid.*api key|token.*(expired|revoked)/i.test(tail)) {
        reject(new AuthError('sessão do Claude Code expirada — rode "claude /login" no terminal'));
        return;
      }

      const evento = parseResultEvent(saida);
      const usage = lerUsage(evento);
      const modelos = Object.keys((evento?.modelUsage ?? {}) as Record<string, unknown>);
      const run: HarnessRun = {
        ok: code === 0 && !expirou && evento?.is_error !== true,
        text: (evento?.result as string) ?? "",
        usage,
        costUsd: (evento?.total_cost_usd as number) ?? 0,
        turns: (evento?.num_turns as number) ?? 0,
        durationMs: (evento?.duration_ms as number) ?? 0,
        models: modelos.length ? modelos : [perfil.model],
        exitCode: code,
      };
      if (expirou) run.erro = `excedeu ${perfil.timeout_min ?? 15} min e foi abortado`;
      else if (!run.ok) run.erro = `claude saiu com ${code}`;
      if (!evento) run.usage = VAZIO;
      resolve(run);
    });
  });
}
