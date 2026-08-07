/**
 * Paridade entre os DOIS textos de contrato de redação.
 *
 * `.claude/skills/gerar/SKILL.md` rege o caminho agêntico. As `REGRAS` em
 * `src/core/portable-prompt.ts` regem o disparo único e a via externa. São
 * traduções um do outro, e traduções perdem coisas em silêncio.
 *
 * O QUE MOTIVOU: na não-regressão de 2026-08-07 a vaga "Analista de Chatbot
 * Junior" caiu 13 pontos de cobertura pelo caminho novo. Três das cinco
 * keywords perdidas eram o TÍTULO DA VAGA. O SKILL.md manda ecoar o título
 * ("título do Resumo sintonizado com o título da vaga", :63); as REGRAS diziam
 * só "ajustadas ao título" — mais fraco, e o modelo não ecoou.
 *
 * Não era o único. A varredura item a item achou CINCO regras perdidas na
 * destilação, e a pior nem aparecia na cobertura: as REGRAS nunca mencionavam
 * `variant` nem `tracks`, dois campos que o bundle carrega. O caminho novo
 * estava ignorando a variante A/B — ou seja, contaminando o experimento de
 * conversão do /painel sem nenhum sintoma visível.
 *
 * É a mesma classe do `hardFilterReason` divergindo entre dois lugares, agora
 * entre dois textos de contrato em vez de duas funções. Este teste é o análogo
 * de `harness-single-path`: não dá para ter um construtor só (os dois textos
 * servem leitores diferentes), então o invariante é a paridade item a item.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../helpers/sandbox.js";

const SKILL = readFileSync(join(REPO_ROOT, ".claude/skills/gerar/SKILL.md"), "utf-8");
const PROMPT_TS = readFileSync(join(REPO_ROOT, "src/core/portable-prompt.ts"), "utf-8");

interface Item {
  item: string;
  skill: RegExp;
  /** `null` = divergência DECLARADA: a regra existe só no SKILL.md, de propósito. */
  regras: RegExp | null;
  porque?: string;
}

/**
 * O contrato, item a item. Cada linha é um veredicto explícito:
 * `regras: RegExp` → compartilhado, os dois textos têm de dizer.
 * `regras: null`   → divergência intencional, com o motivo escrito.
 */
const CONTRATO: Item[] = [
  // ---------- compartilhados: perder um destes é defeito de transcrição ----------
  { item: "citação [exp:fact_id] obrigatória", skill: /\[exp:<fact_id>\]/, regras: /\[exp:<fact_id>\]/ },
  { item: "pode reformular com vocabulário do JD", skill: /reformular/i, regras: /reformul/i },
  { item: "quantificar só com números do fato", skill: /quantificar/i, regras: /quantifique|quantificado/i },
  { item: "nunca adicionar skill/empregador/métrica", skill: /NUNCA pode adicionar/i, regras: /NUNCA pode acrescentar/i },
  { item: "keyword sem fato fica de fora", skill: /fica de fora/i, regras: /FICA DE FORA/i },
  { item: "não esticar fato para fingir cobertura", skill: /fingir cobertura/i, regras: /fingir cobertura/i },
  { item: "idioma = job.language", skill: /job\.language/, regras: /job\.language/ },
  { item: "espelhamento de vocabulário (grafia EXATA do JD)", skill: /grafia EXATA do JD/i, regras: /grafia EXATA do JD/i },
  { item: "trilha: track_hint como ponto de partida", skill: /track_hint/, regras: /track_hint/ },
  { item: "variante A/B do experimento", skill: /variant\.instructions/, regras: /variant\.instructions/ },
  { item: "eco do título da vaga no Resumo", skill: /sintonizado com o título da vaga/i, regras: /sintonizad\w+ com o título da vaga/i },
  { item: "ordem reverso-cronológica", skill: /reverso-cronológica/i, regras: /reverso-cronológica/i },
  { item: "CAR com verbo de ação forte no pretérito", skill: /verbo de ação forte/i, regras: /verbo de ação forte/i },
  { item: 'proibido "responsável por"', skill: /responsável por/i, regras: /responsável por/i },
  { item: "3–6 bullets por experiência", skill: /3–6 bullets/, regras: /3–6 bullets/ },
  { item: "sem adjetivo vazio (proativo/dinâmico)", skill: /proativo/i, regras: /proativo/i },
  { item: "sem jargão interno que o recrutador não conhece", skill: /jargão interno/i, regras: /jargão interno/i },
  { item: "STAR não é para o currículo", skill: /STAR .*não é para o currículo/is, regras: /STAR .*NÃO é para o currículo/is },
  { item: "cover letter ≤250 palavras", skill: /250 palavras/, regras: /250 palavras/ },
  { item: "outreach: DM ≤80 palavras", skill: /80 palavras/, regras: /80 palavras/ },
  { item: "outreach: follow-up d+7", skill: /d\+7/i, regras: /D\+7/i },
  { item: "reutilizar known_screening_answers", skill: /known_screening_answers/, regras: /known_screening_answers/ },
  { item: "[CONFIRMAR: quando falta candidate_fact", skill: /\[CONFIRMAR:/, regras: /\[CONFIRMAR:/ },
  { item: "pretensão vem de salary_research, não de estimativa própria", skill: /salary_research/, regras: /salary_research/ },

  // ---------- divergências DECLARADAS ----------
  {
    item: "resolver a URL de aplicação direta",
    skill: /job-url\.ts/,
    regras: null,
    porque: "fluxo de ferramenta, não redação — o redator externo não tem shell",
  },
  {
    item: "rodar prepare/finalize",
    skill: /kit\.ts finalize/,
    regras: null,
    porque: "o processo pai roda os dois; o redator só escreve",
  },
  {
    item: "não caçar kit doador anterior",
    skill: /kit doador/,
    regras: null,
    porque: "o prompt portátil não tem acesso a disco — a proibição é vazia lá",
  },
  {
    item: "apresentar cobertura e ressalva do ATS ao usuário",
    skill: /estimativa heurística/,
    regras: null,
    porque: "apresentação de resultado, não redação",
  },
];

describe("paridade SKILL.md × REGRAS do prompt portátil", () => {
  it("controle positivo: os dois arquivos foram lidos e têm conteúdo", () => {
    // Sem isto, um caminho errado deixaria as duas strings vazias e TODOS os
    // "não contém" passariam — o teste reprovaria só os compartilhados e
    // aprovaria todas as divergências declaradas por acidente.
    assert.ok(SKILL.length > 2000, `SKILL.md curto demais (${SKILL.length})`);
    assert.ok(PROMPT_TS.length > 2000, `portable-prompt.ts curto demais (${PROMPT_TS.length})`);
    assert.ok(SKILL.includes("REGRA Nº 1"), "SKILL.md não parece ser o arquivo certo");
    assert.ok(PROMPT_TS.includes("REGRA Nº 1"), "portable-prompt.ts não parece ter as REGRAS");
  });

  it("toda regra do contrato existe no SKILL.md (senão a tabela está velha)", () => {
    const sumidas = CONTRATO.filter((c) => !c.skill.test(SKILL)).map((c) => c.item);
    assert.deepEqual(
      sumidas,
      [],
      "regras que a tabela espera no SKILL.md e não estão lá — o SKILL mudou e a tabela não:\n  " +
        sumidas.join("\n  ")
    );
  });

  it("toda regra COMPARTILHADA também está nas REGRAS do prompt portátil", () => {
    const perdidas = CONTRATO.filter((c) => c.regras && !c.regras.test(PROMPT_TS)).map((c) => c.item);
    assert.deepEqual(
      perdidas,
      [],
      "regras que o caminho agêntico tem e o portátil perdeu na destilação:\n  " +
        perdidas.join("\n  ") +
        "\n\nDefeito de transcrição, não decisão de escopo. Se a omissão for intencional, " +
        "mova a linha para as divergências declaradas com o motivo escrito."
    );
  });

  it("as divergências declaradas continuam divergindo (não viraram paridade sem nota)", () => {
    const inesperadas = CONTRATO.filter((c) => c.regras === null && c.skill.test(PROMPT_TS)).map(
      (c) => `${c.item} (declarado como: ${c.porque})`
    );
    assert.deepEqual(
      inesperadas,
      [],
      "estas regras foram declaradas como exclusivas do caminho agêntico, mas apareceram " +
        "no prompt portátil:\n  " +
        inesperadas.join("\n  ") +
        "\nSe passaram a valer para os dois, promova-as a compartilhadas."
    );
  });

  it("toda divergência declarada tem motivo escrito", () => {
    const semMotivo = CONTRATO.filter((c) => c.regras === null && !c.porque).map((c) => c.item);
    assert.deepEqual(semMotivo, [], "divergência sem justificativa não é decisão, é esquecimento");
  });
});
