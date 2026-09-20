const encoder = new TextEncoder();

export const LIMITS = Object.freeze({
  title: 24,
  note: 80,
});

export function validateCardInput(value) {
  const input = value && typeof value === "object" ? value : {};
  const uid = String(input.uid || "").trim();
  const appToken = String(input.appToken || "").trim();
  const title = String(input.title || "临时停车，请联系车主").trim();
  const note = String(input.note || "给您带来不便，十分抱歉").trim();
  const theme = ["green", "blue", "amber", "mono"].includes(input.theme)
    ? input.theme
    : "green";
  const style = ["clean", "bold"].includes(input.style) ? input.style : "clean";

  if (!/^UID_[A-Za-z0-9_-]{8,100}$/.test(uid)) {
    throw new ApiError(400, "请输入有效的 WxPusher UID");
  }
  if (!/^AT_[A-Za-z0-9_-]{16,160}$/.test(appToken)) {
    throw new ApiError(400, "请输入有效的 WxPusher AppToken");
  }
  if (!title || title.length > LIMITS.title) {
    throw new ApiError(400, `标题需为 1-${LIMITS.title} 个字符`);
  }
  if (!note || note.length > LIMITS.note) {
    throw new ApiError(400, `说明需为 1-${LIMITS.note} 个字符`);
  }

  return { uid, appToken, title, note, theme, style };
}

export function validatePublicFields(value) {
  const input = value && typeof value === "object" ? value : {};
  const title = String(input.title || "").trim();
  const note = String(input.note || "").trim();
  const theme = ["green", "blue", "amber", "mono"].includes(input.theme)
    ? input.theme
    : "green";
  const style = ["clean", "bold"].includes(input.style) ? input.style : "clean";
  if (!title || title.length > LIMITS.title) {
    throw new ApiError(400, `标题需为 1-${LIMITS.title} 个字符`);
  }
  if (!note || note.length > LIMITS.note) {
    throw new ApiError(400, `说明需为 1-${LIMITS.note} 个字符`);
  }
  return { title, note, theme, style };
}

export function normalizeCooldown(raw) {
  const value = Number.parseInt(raw || "60", 10);
  return Number.isFinite(value) ? Math.min(3600, Math.max(30, value)) : 60;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function randomToken(bytes = 24) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return toBase64Url(data);
}

export async function encryptToken(token, secret) {
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(token),
  );
  return {
    encryptedToken: toBase64Url(new Uint8Array(encrypted)),
    iv: toBase64Url(iv),
  };
}

export async function decryptToken(encryptedToken, iv, secret) {
  const key = await encryptionKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv) },
    key,
    fromBase64Url(encryptedToken),
  );
  return new TextDecoder().decode(decrypted);
}

async function encryptionKey(secret) {
  if (!secret || secret.length < 16) {
    throw new Error("ENCRYPTION_KEY must contain at least 16 characters");
  }
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
