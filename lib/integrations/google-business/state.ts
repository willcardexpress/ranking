import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Assina o parâmetro `state` do fluxo OAuth para evitar CSRF/forjamento,
 * sem precisar de uma tabela dedicada para nonces. Usa um segredo
 * dedicado (GBP_OAUTH_STATE_SECRET) — antes reaproveitava
 * SUPABASE_SERVICE_ROLE_KEY, mas isso acoplava dois propósitos
 * diferentes ao mesmo segredo (rotacionar a service role key do Supabase
 * invalidaria, de quebra, qualquer fluxo OAuth em andamento). Um segredo
 * próprio evita esse acoplamento e pode ser rotacionado independentemente.
 */

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos

interface StatePayload {
  businessId: string;
  userId: string;
  nonce: string;
  iat: number;
}

function getSecret(): string {
  const secret = process.env.GBP_OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error("GBP_OAUTH_STATE_SECRET não configurada — necessária para assinar o state do OAuth.");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createOAuthState(businessId: string, userId: string): string {
  const payload: StatePayload = {
    businessId,
    userId,
    nonce: randomBytes(12).toString("hex"),
    iat: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(state: string, expectedUserId: string): { businessId: string } | null {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;

  const expectedSignature = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
  } catch {
    return null;
  }

  if (Date.now() - payload.iat > STATE_TTL_MS) return null;
  if (payload.userId !== expectedUserId) return null;

  return { businessId: payload.businessId };
}
