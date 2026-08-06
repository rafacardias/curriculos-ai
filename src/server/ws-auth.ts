import { randomUUID } from "node:crypto";

/**
 * Autorização do upgrade de WebSocket.
 *
 * Contexto: o endpoint /term dá acesso a um PTY. Bind em 127.0.0.1 protege
 * contra a rede, mas NÃO contra o próprio browser do usuário — conexões
 * WebSocket não passam pela política de mesma origem, então uma página
 * qualquer aberta numa aba consegue abrir um socket para localhost.
 *
 * Duas checagens, ambas obrigatórias:
 *   1. Origin numa allowlist estrita (ausência de Origin = recusa);
 *   2. token de sessão, gerado no boot e entregue só ao HTML servido por nós.
 *
 * Função pura de propósito: é o que permite testá-la exaustivamente sem
 * levantar servidor nem PTY.
 */

export interface UpgradeRequest {
  url?: string | undefined;
  headers: { origin?: string | undefined };
}

export type UpgradeVerdict =
  | { ok: true }
  | { ok: false; code: number; reason: "origin" | "token" };

/** Gera o token de sessão. Novo a cada boot — reiniciar o serviço invalida os antigos. */
export function newSessionToken(): string {
  return randomUUID();
}

export function allowedOrigins(port: number): string[] {
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

export function isAuthorizedUpgrade(
  req: UpgradeRequest,
  expectedToken: string,
  port: number
): UpgradeVerdict {
  const origin = req.headers.origin;
  // Sem Origin também recusa: clientes não-browser não têm por que falar com /term.
  if (!origin || !allowedOrigins(port).includes(origin)) {
    return { ok: false, code: 4403, reason: "origin" };
  }

  let token: string | null = null;
  try {
    token = new URL(req.url ?? "/", `http://127.0.0.1:${port}`).searchParams.get("token");
  } catch {
    token = null;
  }
  if (!token || !safeEqual(token, expectedToken)) {
    return { ok: false, code: 4401, reason: "token" };
  }

  return { ok: true };
}

/** Comparação de tempo constante — não vaza o prefixo correto por timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
