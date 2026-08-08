/**
 * Perfis de harness — e o invariante que existe por causa de um acidente.
 *
 * Em 2026-08-07 a primeira medição do disparo único rodou em `claude-opus-5`
 * sem ninguém ter pedido: `--setting-sources ""` derruba
 * `~/.claude/settings.json` inteiro, INCLUSIVE a chave `model`, e sem `--model`
 * explícito o binário escolhe sozinho. Custou $0,4471 e invalidou a medição.
 *
 * É a CLASSE-01 na camada de configuração: **ausência de configuração lida como
 * default seguro**. Num disparo o acidente é barato; num lote de 20 kits seriam
 * vinte currículos escritos por um modelo que ninguém escolheu.
 *
 * O teste que importa é o último: ele lê os perfis REAIS de `config/config.yaml`
 * e reprova se qualquer um deles produzir argv sem `--model`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildHarnessArgv,
  assertProfilesValid,
  HarnessProfileError,
  type HarnessProfile,
} from "../../src/local/harness.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { REPO_ROOT } from "../helpers/sandbox.js";
import { ConfigSchema } from "../../src/core/config.js";

const OK: HarnessProfile = { model: "claude-sonnet-5", tools: [], max_budget_usd: 1 };

/** Valor que segue uma flag no argv. */
function valorDe(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
}

describe("buildHarnessArgv", () => {
  it("emite --model com o valor do perfil", () => {
    const argv = buildHarnessArgv("redacao", OK, { systemPrompt: "s" });
    assert.equal(valorDe(argv, "--model"), "claude-sonnet-5");
  });

  it("RECUSA perfil sem model — não escolhe um por conta própria", () => {
    const semModel = { ...OK, model: "" };
    assert.throws(
      () => buildHarnessArgv("x", semModel, { systemPrompt: "s" }),
      HarnessProfileError,
      "perfil sem modelo tem de explodir, não cair num default"
    );
  });

  it("RECUSA perfil sem teto de custo positivo", () => {
    assert.throws(
      () => buildHarnessArgv("x", { ...OK, max_budget_usd: 0 }, { systemPrompt: "s" }),
      HarnessProfileError
    );
  });

  it("--tools vazio desliga todas as built-in", () => {
    const argv = buildHarnessArgv("redacao", OK, { systemPrompt: "s" });
    assert.equal(valorDe(argv, "--tools"), "");
  });

  it("--tools lista as ferramentas quando o perfil declara (com allowlist)", () => {
    // A allowlist agora é obrigatória junto: `--tools` só torna a ferramenta
    // disponível, `--allowedTools` a permite. Ver variant-e-degradacao.test.ts.
    const argv = buildHarnessArgv(
      "salario",
      { ...OK, tools: ["WebSearch"], allowed_tools: ["WebSearch"] },
      { systemPrompt: "s" }
    );
    assert.equal(valorDe(argv, "--tools"), "WebSearch");
    assert.ok(argv.includes("--allowedTools"));
  });

  it("substitui o system prompt em vez de acrescentar", () => {
    // Medido: com system prompt próprio o prefixo INTEIRO é 206 tokens, e somar
    // ~1.400 tokens ao texto move o total em exatamente 1.441. Não sobra prompt
    // de harness. Por isso é `--system-prompt`, nunca `--append-system-prompt`.
    const argv = buildHarnessArgv("redacao", OK, { systemPrompt: "regras" });
    assert.equal(valorDe(argv, "--system-prompt"), "regras");
    assert.ok(!argv.includes("--append-system-prompt"));
  });

  it("isola MCP, skills e settings por default", () => {
    const argv = buildHarnessArgv("redacao", OK, { systemPrompt: "s" });
    assert.ok(argv.includes("--strict-mcp-config"));
    assert.ok(argv.includes("--disable-slash-commands"));
    assert.equal(valorDe(argv, "--setting-sources"), "");
  });

  it("o perfil pode reabrir MCP e settings — o /linkedin* precisa", () => {
    const argv = buildHarnessArgv(
      "chrome",
      { ...OK, strict_mcp: false, disable_slash_commands: false, isolate_settings: false },
      { systemPrompt: "s" }
    );
    assert.ok(!argv.includes("--strict-mcp-config"));
    assert.ok(!argv.includes("--disable-slash-commands"));
    assert.ok(!argv.includes("--setting-sources"));
    // mas --model continua obrigatório mesmo com as settings ligadas
    assert.equal(valorDe(argv, "--model"), "claude-sonnet-5");
  });

  it("sem prompt posicional, o claude lê de stdin", () => {
    const argv = buildHarnessArgv("redacao", OK, { systemPrompt: "s" });
    assert.equal(argv[0], "-p");
    assert.equal(argv[1], "--output-format", "nada posicional entre -p e a primeira flag");
  });

  it("effort só aparece quando o perfil pede", () => {
    assert.ok(!buildHarnessArgv("a", OK, { systemPrompt: "s" }).includes("--effort"));
    // NB: `effort: low` foi medido em redação e REPROVA no truthcheck (cobertura
    // 30% -> 20%, ATS 44 -> 36). Barato e quebrado. Nenhum perfil de redação usa.
    const argv = buildHarnessArgv("a", { ...OK, effort: "low" }, { systemPrompt: "s" });
    assert.equal(valorDe(argv, "--effort"), "low");
  });
});

describe("os perfis REAIS de config/config.yaml", () => {
  // Lê o config DO REPOSITÓRIO, não o da sandbox. A suíte roda com
  // CURRICULOS_ROOT apontando para .test-sandbox, e um `loadConfig()` aqui
  // validaria uma fixture — o arquivo que precisa estar correto é o que vai
  // para produção. Se este teste falhar, o argv real é que está errado.
  const profiles = (parse(readFileSync(join(REPO_ROOT, "config", "config.yaml"), "utf-8"))
    ?.harness?.profiles ?? {}) as Record<string, HarnessProfile>;

  it("existe pelo menos um perfil declarado", () => {
    assert.ok(Object.keys(profiles).length > 0);
  });

  it("TODO perfil produz argv com --model explícito e não vazio", () => {
    for (const [nome, perfil] of Object.entries(profiles)) {
      const argv = buildHarnessArgv(nome, perfil, { systemPrompt: "s" });
      const modelo = valorDe(argv, "--model");
      assert.ok(
        modelo && modelo.trim().length > 0,
        `perfil "${nome}" não emitiu --model. Sem ele, --setting-sources "" derruba ` +
          "a chave `model` das settings e o disparo roda num modelo arbitrário."
      );
    }
  });

  it("TODO perfil declara teto de custo positivo", () => {
    for (const [nome, perfil] of Object.entries(profiles)) {
      assert.ok(perfil.max_budget_usd > 0, `perfil "${nome}" sem teto`);
    }
  });

  it("assertProfilesValid valida o conjunto de uma vez", () => {
    assert.doesNotThrow(() => assertProfilesValid(profiles));
  });

  // PROVA DE QUE O GUARDA REPROVA, e não só de que hoje passa. Um teste que só
  // verifica o config atual não distingue "protegido" de "por acaso correto":
  // aqui o config real é mutado para tirar o `model` e o schema TEM de recusar.
  it("o schema RECUSA o config real se um perfil perder o model", () => {
    const raw = parse(readFileSync(join(REPO_ROOT, "config", "config.yaml"), "utf-8"));
    assert.doesNotThrow(() => ConfigSchema.parse(raw), "controle: o config real tem de passar");

    for (const mutacao of [
      { rot: "sem model", fn: (c: any) => delete c.harness.profiles.redacao.model },
      { rot: "model vazio", fn: (c: any) => (c.harness.profiles.redacao.model = "") },
      { rot: "sem teto", fn: (c: any) => delete c.harness.profiles.redacao.max_budget_usd },
    ]) {
      const c = JSON.parse(JSON.stringify(raw));
      mutacao.fn(c);
      assert.throws(
        () => ConfigSchema.parse(c),
        `config com "${mutacao.rot}" tem de ser recusado no parse, não descoberto no disparo`
      );
    }
  });

  it("todo perfil que isola settings TEM de trazer model — é a combinação perigosa", () => {
    for (const [nome, perfil] of Object.entries(profiles)) {
      if (perfil.isolate_settings === false) continue;
      assert.ok(
        perfil.model?.trim(),
        `perfil "${nome}" isola settings sem declarar model — foi exatamente isso que rodou opus por acidente`
      );
    }
  });
});
