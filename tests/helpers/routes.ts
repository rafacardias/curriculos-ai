import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./sandbox.js";
import type { StubRoute } from "./net.js";

const http = (name: string) => readFileSync(join(REPO_ROOT, "tests/fixtures/http", name), "utf-8");

const json = (name: string): StubRoute => ({ body: http(name), contentType: "application/json" });
const text = (name: string, type: string): StubRoute => ({ body: http(name), contentType: type });

/** Todas as rotas das 5 fontes. Qualquer URL fora daqui explode o teste (kill-switch). */
export function allRoutes(): Array<[RegExp, StubRoute]> {
  return [
    [/remotive\.com\/api\/remote-jobs/, json("remotive.search.json")],
    [/remoteok\.com\/api/, json("remoteok.api.json")],
    [/weworkremotely\.com\/remote-jobs\.rss/, text("wwr.rss.xml", "application/rss+xml")],
    [/employability-portal\.gupy\.io/, json("gupy.jobs.json")],
    [/jobs-guest\/jobs\/api\/seeMoreJobPostings/, text("linkedin.search.html", "text/html")],
    [/linkedin\.com\/jobs\/view\//, text("linkedin.job-detail.html", "text/html")],
  ];
}
