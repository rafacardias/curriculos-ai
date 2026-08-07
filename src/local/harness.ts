/**
 * harness — o ÚNICO lugar que monta a linha de comando do `claude`.
 *
 * POR QUE UM SÓ. Antes disso o argv era construído inline em
 * `src/server/index.ts`, com uma lista de `--allowedTools` e nada mais: sem
 * `--model`, sem `--strict-mcp-config`, sem teto. O subprocesso herdava
 * `process.env` inteiro e, com ele, 150 tools, 22 MCP servers, 282 slash
 * commands, 229 skills, 90 agents e 11 hooks de SessionStart — **80.824 tokens
 * de prefixo antes de qualquer trabalho**, relidos a cada um dos 38 turnos.
 *
 * O QUE FOI MEDIDO (2026-08-07, `docs/custo-geracao.md`):
 *   herda tudo ................................... 80.824 tokens · $0,3479 por "ok"
 *   --strict-mcp-config .......................... 75.994
 *   + --disable-slash-commands ................... 64.118
 *   + --setting-sources "" --tools "" --system-prompt ... 192  ($0,0016)
 *   --safe-mode (controle, auth intacta) ......... 28.835
 *
 * `--system-prompt` **substitui** o prompt default, não acrescenta — confirmado
 * com dois pontos: com um system prompt curto o prefixo inteiro é 206 tokens, e
 * acrescentar ~1.400 tokens de texto move o total em exatamente 1.441. Não
 * sobra texto de harness nenhum.
 */

/**
 * Modelo é obrigatório em todo perfil e NÃO tem default.
 *
 * `isolate_settings` passa `--setting-sources ""`, que derruba
 * `~/.claude/settings.json` inteiro — inclusive a chave `model`. Sem `--model`
 * explícito o disparo cai num default arbitrário do binário. Aconteceu: a
 * primeira execução da M2 rodou em `claude-opus-5` sem ninguém pedir, a
 * $0,4471, e a medição teve de ser refeita.
 *
 * É a CLASSE-01 na camada de configuração: **ausência de configuração lida como
 * default seguro**. O acidente custou $0,45 num disparo; num lote de 20 kits
 * seria $9 e vinte kits escritos por um modelo que ninguém escolheu.
 */
export interface HarnessProfile {
  model: string;
  /**
   * Lista de built-in liberadas, ou `"all"` para não passar `--tools`.
   *
   * NÃO tem default de propósito: um perfil que esquece o campo receberia as 35
   * built-in e os 115 tools de MCP em silêncio — 80.824 tokens de prefixo. Seria
   * a CLASSE-01 outra vez. `"all"` é uma escolha que alguém escreveu.
   */
  tools: string[] | "all";
  /** Allowlist de permissão (`--allowedTools`). Só o perfil agêntico precisa. */
  allowed_tools?: string[];
  strict_mcp?: boolean;
  disable_slash_commands?: boolean;
  isolate_settings?: boolean;
  max_budget_usd: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Minutos até abortar. */
  timeout_min?: number;
}

export interface HarnessOptions {
  /**
   * Substitui o system prompt inteiro (`--system-prompt`, nunca `--append-`).
   *
   * Omitido no perfil agêntico, que PRECISA do prompt default do harness — é
   * ele que ensina o modelo a usar as ferramentas e a carregar a skill.
   */
  systemPrompt?: string;
  /** `text` | `json` (default) | `stream-json`. */
  outputFormat?: "text" | "json" | "stream-json";
  /** Prompt posicional. Omitido = o `claude` lê de stdin. */
  prompt?: string;
  /** `--verbose`, exigido pelo `stream-json`. */
  verbose?: boolean;
}

export class HarnessProfileError extends Error {}

/**
 * Monta o argv de `claude -p` para um perfil.
 *
 * Lança se o perfil não declarar `model` ou `max_budget_usd`. Lançar é
 * deliberado: um perfil sem modelo não tem fallback seguro, e escolher um por
 * ele seria exatamente o defeito que este módulo existe para impedir.
 */
export function buildHarnessArgv(
  nome: string,
  perfil: HarnessProfile,
  opts: HarnessOptions
): string[] {
  if (!perfil.model || !perfil.model.trim()) {
    throw new HarnessProfileError(
      `perfil de harness "${nome}" não declara \`model\`. ` +
        "É obrigatório: `--setting-sources \"\"` derruba a chave `model` de " +
        "~/.claude/settings.json, e sem `--model` o disparo cai num default arbitrário."
    );
  }
  if (!(perfil.max_budget_usd > 0)) {
    throw new HarnessProfileError(
      `perfil de harness "${nome}" não declara \`max_budget_usd\` positivo. ` +
        "Teto atingido encerra e reporta — nunca vira retry."
    );
  }

  if (perfil.tools === undefined) {
    throw new HarnessProfileError(
      `perfil de harness "${nome}" não declara \`tools\`. Use \`[]\` para desligar todas, ` +
        'uma lista, ou `"all"` — que carrega as 35 built-in e os 115 tools de MCP, 80.824 ' +
        "tokens de prefixo. Não há default: essa escolha tem de estar escrita."
    );
  }

  const argv = ["-p"];
  if (opts.prompt != null) argv.push(opts.prompt);

  argv.push("--output-format", opts.outputFormat ?? "json");
  if (opts.verbose) argv.push("--verbose");
  argv.push("--model", perfil.model);
  argv.push("--max-budget-usd", String(perfil.max_budget_usd));

  if (opts.systemPrompt != null) argv.push("--system-prompt", opts.systemPrompt);

  // `--tools ""` desliga TODAS as built-in. É o corte que vale 63.926 tokens —
  // maior que MCP (4.830) e que skills/comandos (11.876) somados.
  if (perfil.tools !== "all") argv.push("--tools", perfil.tools.join(","));
  if (perfil.allowed_tools?.length) argv.push("--allowedTools", ...perfil.allowed_tools);

  if (perfil.strict_mcp !== false) argv.push("--strict-mcp-config");
  if (perfil.disable_slash_commands !== false) argv.push("--disable-slash-commands");
  if (perfil.isolate_settings !== false) argv.push("--setting-sources", "");
  if (perfil.effort) argv.push("--effort", perfil.effort);

  return argv;
}

/** Todos os perfis declarados, validados de uma vez. Use no boot, não no uso. */
export function assertProfilesValid(profiles: Record<string, HarnessProfile>): void {
  const nomes = Object.keys(profiles);
  if (nomes.length === 0) throw new HarnessProfileError("nenhum perfil de harness declarado");
  for (const nome of nomes) {
    buildHarnessArgv(nome, profiles[nome]!, { systemPrompt: "x" });
  }
}
