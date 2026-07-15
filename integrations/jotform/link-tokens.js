import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const base64url = (value) => Buffer.from(value).toString("base64url");

export function hashDealerToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function createDealerLinkToken(secret, id = randomUUID(), nonce = randomBytes(24).toString("base64url")) {
  const signature = createHmac("sha256", secret).update(`${id}.${nonce}`).digest("base64url");
  const token = `${base64url(id)}.${signature}`;
  return { id, nonce, token, tokenHash:hashDealerToken(token) };
}

export function restoreDealerLinkToken(secret, id, nonce) {
  return createDealerLinkToken(secret, id, nonce).token;
}

export function safeSecretEqual(received, expected) {
  const left = Buffer.from(String(received || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

