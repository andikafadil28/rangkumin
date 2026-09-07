import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { marked } from "marked";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = join(root, "docs", "pdf");
const documents = [
  {
    source: join(root, "docs", "setup.id.md"),
    output: join(outputDirectory, "rangkumin-setup-id.pdf"),
    language: "id",
  },
  {
    source: join(root, "docs", "setup.en.md"),
    output: join(outputDirectory, "rangkumin-setup-en.pdf"),
    language: "en",
  },
];

const browserCandidates = [
  process.env.CHROME_PATH,
  process.env.EDGE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter(Boolean);

const browser = browserCandidates.find((candidate) => existsSync(candidate));
if (!browser) {
  console.error(
    "Browser Chromium tidak ditemukan. Set CHROME_PATH atau EDGE_PATH ke executable Chrome/Edge.",
  );
  process.exit(1);
}

const style = `
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { color: #20221f; font: 10.5pt/1.55 Arial, sans-serif; margin: 0; }
  h1, h2, h3 { color: #23423a; line-height: 1.2; page-break-after: avoid; }
  h1 { border-bottom: 3px solid #cf765f; font-size: 25pt; padding-bottom: 8px; }
  h2 { border-bottom: 1px solid #d8d8d0; font-size: 17pt; margin-top: 28px; padding-bottom: 5px; }
  h3 { font-size: 13pt; margin-top: 20px; }
  a { color: #326c61; }
  code { background: #f2f0ea; border-radius: 3px; font: 9.5pt Consolas, monospace; padding: 1px 4px; }
  pre { background: #202a27; border-radius: 6px; color: #f6f4ed; font: 8.5pt/1.45 Consolas, monospace; overflow-wrap: anywhere; padding: 12px; white-space: pre-wrap; }
  pre code { background: transparent; color: inherit; padding: 0; }
  table { border-collapse: collapse; font-size: 9.5pt; margin: 14px 0; width: 100%; }
  th, td { border: 1px solid #d6d3ca; padding: 7px; text-align: left; vertical-align: top; }
  th { background: #eef3ef; }
  blockquote { border-left: 4px solid #cf765f; color: #4d554f; margin: 14px 0; padding: 3px 14px; }
  img { max-width: 100%; }
  li { margin: 3px 0; }
`;

mkdirSync(outputDirectory, { recursive: true });
const temporaryDirectory = mkdtempSync(join(tmpdir(), "rangkumin-docs-"));

try {
  for (const document of documents) {
    const markdown = readFileSync(document.source, "utf8");
    const htmlPath = join(temporaryDirectory, `${document.language}.html`);
    const html = `<!doctype html>
<html lang="${document.language}">
<head><meta charset="utf-8"><style>${style}</style></head>
<body>${marked.parse(markdown)}</body>
</html>`;
    writeFileSync(htmlPath, html, "utf8");

    const result = spawnSync(
      browser,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        `--print-to-pdf=${document.output}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: "inherit" },
    );

    if (result.error || result.status !== 0) {
      throw (
        result.error ??
        new Error(`Browser keluar dengan status ${result.status}`)
      );
    }
    if (!existsSync(document.output) || statSync(document.output).size === 0) {
      throw new Error(`PDF tidak terbentuk: ${document.output}`);
    }
    console.info(`PDF dibuat: ${document.output}`);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
