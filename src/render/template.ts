import { marked } from "marked";

/**
 * Template ATS-safe: coluna única, headings semânticos, fonte de sistema,
 * sem tabelas/ícones/imagens — o texto sai 100% extraível.
 */
export function wrapAtsHtml(markdownContent: string, docTitle: string): string {
  const body = marked.parse(markdownContent, { async: false }) as string;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(docTitle)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #111;
    max-width: 100%;
    margin: 0;
  }
  h1 { font-size: 17pt; margin: 0 0 2pt; }
  h2 {
    font-size: 12pt;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
    border-bottom: 1pt solid #999;
    padding-bottom: 2pt;
    margin: 14pt 0 6pt;
  }
  h3 { font-size: 11pt; margin: 10pt 0 2pt; }
  p { margin: 4pt 0; }
  ul { margin: 4pt 0 8pt; padding-left: 16pt; }
  li { margin: 2pt 0; }
  a { color: #111; text-decoration: none; }
  hr { border: none; border-top: 0.5pt solid #ccc; margin: 8pt 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
