/**
 * Gates de entregável — as verificações que REPROVAM o `kit.ts finalize`.
 *
 * Só funções puras, sem I/O e sem dependência nenhuma: este módulo faz parte do
 * pacote portável (`src/core/`) e precisa continuar rodando num backend
 * Next.js/Supabase sem arrastar Chrome nem parser de PDF junto. O gate que
 * depende de extrair texto de PDF mora em `src/render/pdf-text.ts`, que é a
 * camada onde o PDF já é assunto.
 *
 * Motivação medida (2026-08-06): o `finalize` validava SÓ o `resume.md`.
 * `answers.md` e `outreach.md` estavam em `expected_files` e nunca eram lidos —
 * nem checados quanto à existência. E o prompt do pipeline manda escrever
 * `[CONFIRMAR: ...]` quando falta um candidate_fact e prosseguir, sem nada
 * barrando depois: uma candidatura podia sair com o marcador literal no
 * formulário.
 */

/** Um gate que reprovou, com o suficiente para o operador consertar. */
export interface GateFailure {
  gate: string;
  /** Linhas legíveis para stderr — já formatadas, uma por problema. */
  detail: string[];
}

/** Marcador que a skill `/gerar` escreve quando falta um candidate_fact. */
const PLACEHOLDER_RE = /\[CONFIRMAR:[^\]]*\]/gi;

/**
 * Nenhum entregável pode conter `[CONFIRMAR: ...]`.
 *
 * O marcador é deliberado e correto DURANTE a geração — é assim que o sistema
 * evita inventar pretensão salarial. O defeito é ele sobreviver até o envio.
 */
export function checkPlaceholders(files: Record<string, string>): GateFailure | null {
  const detail: string[] = [];
  for (const [name, content] of Object.entries(files)) {
    PLACEHOLDER_RE.lastIndex = 0;
    for (const m of content.matchAll(PLACEHOLDER_RE)) {
      const line = content.slice(0, m.index).split("\n").length;
      detail.push(`${name}:${line}  ${m[0]}`);
    }
  }
  return detail.length ? { gate: "placeholder", detail } : null;
}

/**
 * Aberturas que a skill `/gerar` proíbe explicitamente — sintoma de bullet fora
 * do formato CAR (Contexto → Ação → Resultado).
 *
 * Só as proibições LITERAIS da skill (.claude/skills/gerar/SKILL.md) viram
 * bloqueio. "Abrir com verbo de ação forte" e "terminar com resultado
 * quantificado" ficam de fora de propósito: a própria skill qualifica o segundo
 * ("sem número no fato → resultado qualitativo, nunca inventar métrica"), e
 * cobrar mecanicamente uma nuance produz falso positivo — que treina o operador
 * a ignorar o gate.
 *
 * ANCORADA na ABERTURA (depois de tirar o marcador `- `/`* ` do bullet), não em
 * qualquer posição da frase: a regra da skill é sobre como o bullet COMEÇA
 * ("Construí o serviço responsável por processar 2M eventos/dia" é PT-BR
 * legítimo — "responsável" qualifica o sistema, não abre o bullet sobre o
 * candidato). Cobre as flexões de preposição (pelo/pela/pelos/pelas) que
 * "respons[aá]vel por" sozinho deixava passar por acidente de gênero/número.
 */
const ABERTURA_FRACA_RE =
  /^(respons[aá]vel pel[ao]s?|respons[aá]vel por|ajudei (?:a|em|no|na)|participei (?:de|do|da)|auxiliei)\b/i;

/**
 * Nenhum bullet de experiência abre de forma passiva.
 *
 * A metodologia CAR estava só no texto do prompt: nada no pipeline conferia, e
 * prompt sem gate degrada em silêncio na primeira geração que sair do formato.
 */
export function checkWeakBulletPhrasing(bullets: string[]): GateFailure | null {
  const detail: string[] = [];
  for (const b of bullets) {
    const abertura = b.replace(/^\s*[-*]\s+/, "");
    if (ABERTURA_FRACA_RE.test(abertura)) {
      detail.push(
        `"${b.slice(0, 90)}" — evite abertura passiva; abra com verbo de ação forte ` +
          `(metodologia CAR, skill /gerar)`
      );
    }
  }
  return detail.length ? { gate: "car_frase_fraca", detail } : null;
}

/** Um arquivo é "vazio" se não tem nada além de espaço em branco. */
const MIN_CHARS = 1;

/**
 * Todo arquivo prometido em `expected_files` existe e tem conteúdo.
 *
 * `expected_files` sempre foi um contrato do bundle que ninguém cobrava. Um kit
 * sem `answers.md` chegava ao envio e só falhava na hora de responder a triagem.
 */
export function checkExpectedFiles(
  expected: string[],
  present: Record<string, string | null>
): GateFailure | null {
  const detail: string[] = [];
  for (const name of expected) {
    const content = present[name];
    if (content == null) detail.push(`${name}  — ausente`);
    else if (content.trim().length < MIN_CHARS) detail.push(`${name}  — vazio`);
  }
  return detail.length ? { gate: "expected_files", detail } : null;
}

/**
 * O HTML que vira PDF não pode ter construções que quebram parser de ATS.
 *
 * O template (`src/render/template.ts`) é coluna única, sem flex, grid, float,
 * imagem ou header/footer — auditado, está correto. O buraco é outro: o `marked`
 * renderiza tabela GFM, então se o LLM escrever uma tabela em markdown ela vira
 * `<table>` no PDF e o parser do ATS embaralha ou perde as células. É o único
 * risco estrutural que o template não elimina sozinho, porque não depende dele.
 */
export function checkAtsHostileHtml(html: string): GateFailure | null {
  const detail: string[] = [];
  const proibidos: Array<[RegExp, string]> = [
    [/<table[\s>]/i, "<table> — ATS embaralha células; reescreva como lista"],
    [/<img[\s>]/i, "<img> — texto dentro de imagem é invisível para o ATS"],
    [/column-count\s*:/i, "column-count — múltiplas colunas quebram a ordem de leitura"],
    [/position\s*:\s*absolute/i, "position:absolute — desacopla ordem visual da ordem do documento"],
  ];
  for (const [re, msg] of proibidos) if (re.test(html)) detail.push(msg);
  return detail.length ? { gate: "ats_html", detail } : null;
}

/**
 * Normaliza texto para COMPARAR duas extrações da mesma página.
 *
 * Agressivo de propósito: minúsculas, sem acento, pontuação virando espaço,
 * espaço colapsado. O PDF quebra linha onde o HTML não quebra, e o markdown tem
 * `#` e `-` que nenhum dos dois tem. Comparar sem isso produziria só ruído.
 */
export function normalizeForCompare(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Linhas do markdown que precisam sobreviver até o PDF: headings e bullets. */
export function significantLines(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((l) => l.replace(/^\s*(#{1,6}|[-*])\s+/, "").trim())
    .filter((l) => normalizeForCompare(l).length >= 12);
}

/**
 * Todo conteúdo significativo do markdown aparece no texto extraído.
 *
 * Direção deliberada: markdown ⊂ extraído. O contrário não vale — o PDF contém
 * texto que o markdown não tem (quebras, hifenização) e isso não é defeito.
 * O que é defeito é conteúdo SUMIR no caminho.
 */
export function checkTextFidelity(
  markdown: string,
  extracted: string,
  rotulo: string
): GateFailure | null {
  const haystack = normalizeForCompare(extracted);
  const faltando = significantLines(markdown).filter((l) => !haystack.includes(normalizeForCompare(l)));
  if (!faltando.length) return null;
  return {
    gate: `fidelidade_${rotulo}`,
    detail: faltando.slice(0, 10).map((l) => `sumiu: ${l.slice(0, 90)}`),
  };
}

/**
 * A ordem de leitura sobreviveu da página para o PDF?
 *
 * Compara duas extrações da MESMA página: o `innerText` (ordem do DOM) e o texto
 * do PDF (ordem do fluxo de conteúdo, que é a ordem visual). Enquanto o layout é
 * coluna única os dois coincidem. Se alguém introduzir coluna, `position:absolute`
 * ou tabela, o visual desgruda do documento e as sequências divergem — que é
 * exatamente o que o ATS enxerga de errado.
 *
 * Checagem de SEQUÊNCIA, não de presença: as âncoras têm de aparecer no PDF em
 * ordem não-decrescente. Uma verificação de `includes` passaria com o documento
 * inteiro embaralhado, e chamar isso de "ordem de leitura" seria mentir no nome.
 */
export function checkReadingOrder(domText: string, pdfText: string): GateFailure | null {
  const haystack = normalizeForCompare(pdfText);
  const detail: string[] = [];
  // Casamento de SUBSEQUÊNCIA: o cursor avança até o FIM da âncora casada, e a
  // próxima é procurada daí em diante. Buscar sempre do início faz a primeira
  // ocorrência solta de uma palavra vencer a âncora real — medido: o heading
  // "CERTIFICAÇÕES" casava com a palavra "certificações" citada num bullet lá em
  // cima, e o gate acusava desordem num documento perfeitamente ordenado.
  let cursor = 0;
  let ancoraAnterior = "";
  for (const linha of significantLines(domText)) {
    const agulha = normalizeForCompare(linha);
    const pos = haystack.indexOf(agulha, cursor);
    if (pos === -1) {
      // Achar no documento inteiro mas não daqui para frente é DESORDEM.
      // Não achar em lugar nenhum é PERDA. São defeitos diferentes e o
      // operador precisa saber qual dos dois aconteceu.
      detail.push(
        haystack.includes(agulha)
          ? `fora de ordem: "${linha.slice(0, 60)}" vem antes de "${ancoraAnterior.slice(0, 50)}" no PDF`
          : `sumiu do PDF: ${linha.slice(0, 80)}`
      );
      continue;
    }
    cursor = pos + agulha.length;
    ancoraAnterior = linha;
  }
  return detail.length ? { gate: "ordem_de_leitura", detail: detail.slice(0, 10) } : null;
}

/** Formata as falhas para stderr, no estilo do resto dos CLIs. */
export function formatGateFailures(falhas: GateFailure[]): string {
  return falhas
    .map((f) => `  [${f.gate}]\n` + f.detail.map((d) => `    ✗ ${d}`).join("\n"))
    .join("\n");
}
