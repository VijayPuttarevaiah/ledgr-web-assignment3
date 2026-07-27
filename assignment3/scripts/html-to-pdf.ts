import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
(async () => {
  const src = resolve(process.argv[2]);
  const out = resolve(process.argv[3]);
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(pathToFileURL(src).href, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  await p.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:7pt;color:#888;width:100%;padding:0 16mm;">Ledgr — Advanced Web Development, Assignment 3</div>`,
    footerTemplate: `<div style="font-size:7pt;color:#888;width:100%;text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
  });
  await b.close();
  console.log("wrote", out);
})();
