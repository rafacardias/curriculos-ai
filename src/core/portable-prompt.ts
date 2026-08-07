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
 * ECONOMIA. Medido na geração da Techne (2026-08-07, `docs/custo-geracao.md`):
 * 4.726.166 tokens de leitura de cache e 125.787 de escrita, para 28.594 de
 * saída — **83% do custo é lado-input**, o laço agêntico relendo 80.824 tokens
 * de inventário de harness a cada um dos 38 turnos. O conteúdo que importa é o
 * bundle (~13k) e a resposta (~3k).
 *
 * (Uma versão anterior deste comentário dizia "13,3 milhões, 97%". Era um número
 * citado de memória, não medido — ver a lição de método no KNOWN-BUGS.md.)
 *
 * Medido ponta a ponta: disparo único + 1 revisão custa $0,40 e 18.010 tokens de
 * entrada, contra $2,63 e 4.851.953. Mas **não é default**: a não-regressão em
 * 3 vagas reprovou (uma caiu 13 pontos de cobertura), e `--via` é obrigatória.
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

## Trilha e variante — dois campos do bundle que você TEM de usar

**Trilha:** parta de \`job.track_hint\` e do bloco \`tracks\` do bundle, mas decida você — pode
misturar experiências de outras trilhas se elas cobrirem keywords que a dominante não cobre.

**Variante do experimento:** o bundle traz \`variant\` (A = metric-first, B = role-first). Siga as
\`variant.instructions\` na estrutura do Resumo e na ordenação dos bullets. Isso alimenta uma
comparação de conversão real — ignorar contamina o experimento. Se \`variant\` for null, use seu
julgamento.

## resume.md — currículo ATS

Idioma: o mesmo do JD (campo job.language). Coluna única, sem tabelas, sem ícones, sem imagens.

Espelhamento de vocabulário: quando um fato e o JD dizem a mesma coisa com palavras
diferentes, use a grafia EXATA do JD (fato diz "anúncios pagos", JD diz "Performance
Marketing" → escreva "Performance Marketing").

Estrutura:

    # <Nome>
    <cidade> · <email> · <telefone> · <linkedin> · <github>

    ## Resumo                          (ou "Summary" em inglês)
    <2-3 linhas SINTONIZADAS com o título da vaga — use o título EXATO como o
     anúncio o escreve, e as keywords principais do JD>

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
  - 1 linha cada (máx. 2), 3–6 bullets por experiência, ordenados pela relevância ao JD
    (a variante A/B decide metric-first vs role-first);
  - sem pronome "eu", sem adjetivo vazio ("proativo", "dinâmico"), sem jargão interno que o
    recrutador não conhece.

Ordem reverso-cronológica; o título do Resumo sintonizado com o título da vaga.

**STAR (Situação-Tarefa-Ação-Resultado) NÃO é para o currículo** — é o formato das respostas
comportamentais, e vai no \`answers.md\`.

## cover-letter.md

Até 250 palavras, idioma do JD. Um proof point concreto (fato citável) por requisito principal
do anúncio. Sem adjetivo vazio. Termina com call-to-action simples.

## answers.md — respostas de triagem

Antecipe as perguntas prováveis do JD e as comuns: pretensão salarial, disponibilidade, por que
esta empresa, modelo de trabalho.

**Pretensão salarial:** se o bundle trouxer \`salary_research\` preenchido, use a \`faixa\` dela como
resposta — ela foi pesquisada num passo anterior, com fontes. Se \`salary_research\` for null,
escreva \`[CONFIRMAR: pretensão salarial]\` e siga. NUNCA estime um valor você mesmo.

Reutilize \`known_screening_answers\` do bundle quando a pergunta for equivalente. Para os demais
dados canônicos (disponibilidade, autorização de trabalho, aviso prévio), use os
\`candidate_facts\` — eles vêm com o VALOR, não só a chave. Se o dado NÃO existir no bundle,
escreva \`[CONFIRMAR: <o que falta>]\` e siga — nunca invente.

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
