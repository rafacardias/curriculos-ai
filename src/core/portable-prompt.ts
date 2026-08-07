/**
 * Prompt portátil — gerar o kit em QUALQUER LLM, não só no Claude Code.
 *
 * POR QUE ISSO É POSSÍVEL SEM AFROUXAR NADA. O sistema já separa as duas metades:
 * `kit prepare` monta o contexto (determinístico), uma LLM redige (julgamento), e
 * `kit finalize` valida MECANICAMENTE — truthcheck de citação (exit 2), marcador
 * `[CONFIRMAR:` sobrevivente (exit 3), HTML hostil a ATS e fidelidade do PDF
 * (exit 4). O `finalize` não sabe nem pergunta quem escreveu os arquivos.
 *
 * Ou seja: a Regra nº 1 não depende da boa vontade do redator. Um currículo
 * escrito por uma LLM externa que invente um `[exp:id]` inexistente é **reprovado
 * pelo mesmo gate** que reprovaria o Claude Code. A garantia é o gate, não o
 * gerador — e é por isso que abrir essa porta não é concessão.
 *
 * ECONOMIA. Medido na geração da Techne (2026-08-07): 13,3 milhões de tokens de
 * leitura de cache para 30,8 mil de saída — 97% do custo é o laço agêntico
 * relendo o prompt de sistema do harness a cada um dos 39 turnos. O conteúdo em
 * si é o bundle (~10k tokens) e a resposta (~8k). Num único disparo, sem laço,
 * é outra ordem de grandeza — e numa assinatura que o operador já paga, é zero
 * marginal.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Delimitador de arquivo na resposta. */
export const FILE_MARK = "===== FILE:";

/**
 * Regras que a LLM externa precisa ter, destiladas da skill `/gerar`.
 *
 * Deliberadamente NÃO é a skill inteira: o que fala de reaproveitar kit anterior,
 * resolver URL de aplicação e apresentar resultado ao usuário é fluxo de
 * ferramenta, não de redação. O que sobra é o que muda o texto.
 */
const REGRAS = `Você vai redigir 4 arquivos de um kit de candidatura. Leia o BUNDLE no fim deste
prompt: ele traz a vaga, o JD completo, as keywords ranqueadas do anúncio, o perfil
profissional real do candidato (com um id em cada fato) e as respostas de triagem já conhecidas.

## REGRA Nº 1 — VERACIDADE (inegociável, e é verificada por máquina)

Cada bullet de experiência DEVE terminar com a citação \`[exp:<fact_id>]\` de um fato que
EXISTE no bundle (profile.experiences[].facts[].id). Você pode:
  - reformular o fato com o vocabulário exato do JD;
  - reordenar e selecionar os fatos mais relevantes;
  - quantificar SOMENTE com números que já estão no fato.

Você NUNCA pode acrescentar skill, ferramenta, empregador, cargo, data, métrica ou conquista
que não exista nos fatos. Keyword do JD sem fato que a sustente FICA DE FORA — isso é o
comportamento correto, não uma falha. Não estique um fato para fingir cobertura.

Um validador automático confere cada \`[exp:id]\` contra o perfil e REPROVA o kit se a citação
não existir. Inventar não passa; só atrasa.

## resume.md — currículo ATS

Idioma: o mesmo do JD (campo job.language). Coluna única, sem tabelas, sem ícones, sem imagens.

Espelhamento de vocabulário: quando um fato e o JD dizem a mesma coisa com palavras
diferentes, use a grafia EXATA do JD (fato diz "anúncios pagos", JD diz "Performance
Marketing" → escreva "Performance Marketing").

Estrutura:

    # <Nome>
    <cidade> · <email> · <telefone> · <linkedin> · <github>

    ## Resumo                          (ou "Summary" em inglês)
    <2-3 linhas ajustadas ao título da vaga, com as keywords principais>

    ## Experiência Profissional        (ou "Professional Experience")
    ### <Cargo> — <Empresa>
    <início> – <fim>
    - <bullet> [exp:fact_id]

    ## Formação / Education
    ## Certificações                   (se houver)
    ## Skills
    <skills REAIS que batem com o JD, grafadas como no JD>

Bullets em CAR (Contexto → Ação → Resultado):
  - abrem com verbo de ação forte no pretérito ("Implementei", "Built", "Reduzi"). Nunca
    "responsável por", "ajudei em", "participei de";
  - contexto curto + ação específica com as keywords do JD na sintaxe natural da frase + resultado;
  - resultado quantificado sempre que o FATO tiver número. Sem número no fato, resultado
    qualitativo. NUNCA inventar métrica;
  - 1 linha cada (máx. 2), 3–6 bullets por experiência, ordenados pela relevância ao JD;
  - sem pronome "eu", sem adjetivo vazio ("proativo", "dinâmico").

Ordem reverso-cronológica.

## cover-letter.md

Até 250 palavras, idioma do JD. Um proof point concreto (fato citável) por requisito principal
do anúncio. Sem adjetivo vazio. Termina com call-to-action simples.

## answers.md — respostas de triagem

Antecipe as perguntas prováveis do JD e as comuns: pretensão salarial, disponibilidade, por que
esta empresa, modelo de trabalho. Reutilize \`known_screening_answers\` do bundle quando a
pergunta for equivalente. Para dado canônico (salário, disponibilidade, autorização de
trabalho), use os \`candidate_facts\`; se o dado NÃO existir no bundle, escreva
\`[CONFIRMAR: <o que falta>]\` e siga — nunca invente.

Perguntas comportamentais ("conte uma vez em que…") vão em STAR, montadas sobre fatos citáveis.

## outreach.md

DM para recrutador (até 80 palavras, idioma do JD, 1 gancho concreto do anúncio) e um e-mail de
follow-up para D+7 (curto, reafirma interesse, 1 proof point).

## FORMATO DA SUA RESPOSTA — obrigatório

Responda SÓ com os quatro blocos abaixo, nesta ordem, sem comentário antes ou depois.
A linha delimitadora tem que aparecer exatamente assim, sozinha na linha:

${FILE_MARK} resume.md =====
<conteúdo>
${FILE_MARK} cover-letter.md =====
<conteúdo>
${FILE_MARK} answers.md =====
<conteúdo>
${FILE_MARK} outreach.md =====
<conteúdo>
`;

/** Monta o prompt autocontido: regras + bundle. */
export function buildPortablePrompt(kitDir: string): string {
  const bundle = readFileSync(join(kitDir, "bundle.json"), "utf-8");
  return `${REGRAS}\n\n===== BUNDLE (JSON) =====\n${bundle}\n`;
}

export interface ParsedResponse {
  files: Record<string, string>;
  missing: string[];
}

/**
 * Separa a resposta da LLM nos arquivos.
 *
 * Tolerante ao que modelo de chat faz de errado na prática: prosa antes do
 * primeiro delimitador, cerca de markdown envolvendo tudo, espaçamento variável
 * no delimitador. Não é tolerante a arquivo faltando — isso volta em `missing`, e
 * quem chama recusa. Gravar 3 de 4 arquivos e deixar o `finalize` reclamar depois
 * seria empurrar o erro para longe da causa.
 */
export function parsePortableResponse(texto: string, esperados: string[]): ParsedResponse {
  const limpo = texto.replace(/^\s*```[a-z]*\s*$/gim, "");
  const re = new RegExp(`^\\s*=====\\s*FILE:\\s*([^=\\n]+?)\\s*=====\\s*$`, "gim");
  const marcas = [...limpo.matchAll(re)];
  const files: Record<string, string> = {};
  for (let i = 0; i < marcas.length; i++) {
    const nome = marcas[i]![1]!.trim();
    const ini = marcas[i]!.index + marcas[i]![0].length;
    const fim = i + 1 < marcas.length ? marcas[i + 1]!.index : limpo.length;
    const corpo = limpo.slice(ini, fim).trim();
    if (corpo) files[nome] = corpo + "\n";
  }
  return { files, missing: esperados.filter((f) => !files[f]) };
}
