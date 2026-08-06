import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];

export function findChrome(): string {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      "Nenhum browser Chromium encontrado. Instale o Google Chrome (usado para renderizar PDFs)."
    );
  }
  return found;
}

/**
 * Renderiza HTML em PDF A4 com camada de texto real (extraível por ATS).
 *
 * Devolve também o `innerText` da página renderizada. Não é um extra gratuito:
 * é a metade do gate de ATS que o parser de PDF não cobre bem. O `innerText`
 * vem em ordem do DOM; o texto extraído do PDF vem em ordem do fluxo de
 * conteúdo, que é a ordem VISUAL. Enquanto o layout é coluna única os dois
 * coincidem — e é justamente essa coincidência que prova que nenhum
 * posicionamento absoluto, coluna ou tabela embaralhou a leitura. Comparar um
 * contra o outro é o teste; comparar cada um contra o markdown, não.
 *
 * Capturado aqui dentro porque o Chrome já está aberto: custa zero.
 */
export async function htmlToPdf(html: string, outPath: string): Promise<{ innerText: string }> {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    // Avaliado DENTRO do Chrome. Passado como string porque `document` é global
    // do browser e o tsconfig do projeto é Node-only, sem a lib "dom" — incluí-la
    // só por esta linha traria window/localStorage/fetch-do-browser para todo o
    // resto do código, que é pior que a string.
    const innerText = (await page.evaluate("document.body.innerText")) as string;
    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: false,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    });
    return { innerText };
  } finally {
    await browser.close();
  }
}
