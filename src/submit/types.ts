import type { Page } from "playwright-core";
import type { MasterProfile, SubmissionMode } from "../core/types.js";

export interface SubmissionKit {
  jobId: string;
  applicationId: string;
  kitDir: string;
  resumePdfPath: string;
  coverLetterText: string | null;
  profile: MasterProfile;
  language: "pt" | "en";
}

export interface FillOutcome {
  filled: Array<{ field: string; source: string }>;
  unknown: string[]; // labels de perguntas obrigatórias sem resposta conhecida
}

/**
 * Contrato dos adapters de ATS. `navigateToForm` leva a page até o formulário
 * de aplicação; o preenchimento em si é genérico (form-filler) — o adapter só
 * fornece particularidades (seletor do botão de submit, passos extras).
 */
export interface SubmissionAdapter {
  readonly id: string;
  matches(url: string): boolean;
  navigateToForm(page: Page, jobUrl: string): Promise<void>;
  submitButtonSelector: string;
}

export interface SubmissionRequest {
  kit: SubmissionKit;
  mode: SubmissionMode;
  jobUrl: string;
}
