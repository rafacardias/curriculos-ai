/**
 * Extração de texto do PDF gerado — a metade do gate de ATS que fecha o LIM-001.
 *
 * Mora em `src/render/` e não em `src/core/` de propósito: `src/core/` é o pacote
 * portável para o SaaS futuro e não pode arrastar parser de PDF. Aqui o PDF já é
 * assunto (o Chrome vive nesta camada).
 *
 * O parser é **devDependency**. A regra de zero-dep do projeto protege o runtime
 * de produção, e nada disto entra em `src/core/`. O import é lazy, dentro da
 * função, para que quem só renderiza PDF nunca carregue o parser.
 *
 * REGRA DURA: se o import falhar, esta função LANÇA. Um gate que passa em
 * silêncio quando a ferramenta some é pior que gate nenhum, porque cria a
 * impressão de que foi verificado.
 */

export interface PdfText {
  text: string;
  pages: number;
}

/** Extrai a camada de texto do PDF. Lança se o parser não estiver disponível. */
export async function extractPdfText(pdfPath: string): Promise<PdfText> {
  let unpdf: typeof import("unpdf");
  try {
    unpdf = await import("unpdf");
  } catch (err) {
    throw new Error(
      "GATE DE ATS INDISPONÍVEL: o parser de PDF ('unpdf') não pôde ser carregado — " +
        `rode 'npm install' e tente de novo. Motivo: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const { readFile } = await import("node:fs/promises");
  const buf = new Uint8Array(await readFile(pdfPath));

  // O pdf.js despeja avisos de substituição de fonte e de Math.sumPrecise em
  // console.warn. São inócuos (as fontes vêm embutidas do Chrome) e poluiriam a
  // saída do finalize, então ficam abafados só durante a extração.
  const warn = console.warn;
  console.warn = () => {};
  try {
    const doc = await unpdf.getDocumentProxy(buf);
    const { totalPages, text } = await unpdf.extractText(doc, { mergePages: true });
    return { text, pages: totalPages };
  } finally {
    console.warn = warn;
  }
}
