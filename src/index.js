import {
  ApiError,
  decryptToken,
  encryptToken,
  normalizeCooldown,
  randomToken,
  sha256,
  validateCardInput,
  validatePublicFields,
} from "./helpers.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (request.method === "GET" && url.pathname === "/") {
        return assetPage(request, env, "/index.html");
      }
      if (request.method === "GET" && /^\/p\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
        return assetPage(request, env, "/scan.html");
      }
      if (request.method === "GET" && /^\/manage\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
        return assetPage(request, env, "/manage.html");
      }
      return secureAsset(await env.ASSETS.fetch(request));
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status);
      console.error("Request failed", error instanceof Error ? error.message : "Unknown error");
      return json({ error: "服务暂时不可用，请稍后重试" }, 500);
    }
  },
};

async function handleApi(request, env, url) {
  if (request.method === "POST" && url.pathname === "/api/cards") {
    return createCard(request, env);
  }

  let match = url.pathname.match(/^\/api\/cards\/([A-Za-z0-9_-]+)$/);
  if (match && request.method === "GET") return getCard(request, env, match[1]);
  if (match && request.method === "PATCH") return updateCard(request, env, match[1]);
  if (match && request.method === "DELETE") return deleteCard(request, env, match[1]);

  match = url.pathname.match(/^\/api\/public\/([A-Za-z0-9_-]+)$/);
  if (match && request.method === "GET") return getPublicCard(env, match[1]);

  match = url.pathname.match(/^\/api\/cards\/([A-Za-z0-9_-]+)\/notify$/);
  if (match && request.method === "POST") return notifyOwner(request, env, match[1]);

  throw new ApiError(404, "接口不存在");
}

async function createCard(request, env) {
  const body = await readJson(request);
  if (body.website) return json({ ok: true }, 201);
  const input = validateCardInput(body);
  const id = randomToken(9);
  const ownerSecret = randomToken(24);
  const ownerSecretHash = await sha256(ownerSecret);
  const encrypted = await encryptToken(input.appToken, env.ENCRYPTION_KEY);
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO parking_cards
      (id, owner_secret_hash, uid, encrypted_token, token_iv, title, note, theme, style, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      ownerSecretHash,
      input.uid,
      encrypted.encryptedToken,
      encrypted.iv,
      input.title,
      input.note,
      input.theme,
      input.style,
      now,
      now,
    )
    .run();

  return json({ id, ownerSecret }, 201);
}

async function getPublicCard(env, id) {
  const card = await env.DB.prepare(
    "SELECT title, note, theme, style, enabled FROM parking_cards WHERE id = ?",
  )
    .bind(id)
    .first();
  if (!card || !card.enabled) throw new ApiError(404, "这个挪车码不存在或已停用");
  return json({ title: card.title, note: card.note, theme: card.theme, style: card.style });
}

async function getCard(request, env, id) {
  const card = await requireOwner(request, env, id);
  return json({
    id,
    uid: maskUid(card.uid),
    title: card.title,
    note: card.note,
    theme: card.theme,
    style: card.style,
    enabled: Boolean(card.enabled),
    sendCount: card.send_count,
    createdAt: card.created_at,
    lastSentAt: card.last_sent_at,
  });
}

async function updateCard(request, env, id) {
  await requireOwner(request, env, id);
  const input = validatePublicFields(await readJson(request));
  await env.DB.prepare(
    "UPDATE parking_cards SET title = ?, note = ?, theme = ?, style = ?, updated_at = ? WHERE id = ?",
  )
    .bind(input.title, input.note, input.theme, input.style, Date.now(), id)
    .run();
  return json({ ok: true });
}

async function deleteCard(request, env, id) {
  await requireOwner(request, env, id);
  await env.DB.prepare("DELETE FROM parking_cards WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

async function notifyOwner(request, env, id) {
  const body = await readJson(request);
  if (body.website) return json({ ok: true });
  const cooldown = normalizeCooldown(env.SEND_COOLDOWN_SECONDS);
  const now = Date.now();
  const threshold = now - cooldown * 1000;

  const result = await env.DB.prepare(
    `UPDATE parking_cards
       SET last_sent_at = ?, send_count = send_count + 1
     WHERE id = ? AND enabled = 1 AND (last_sent_at IS NULL OR last_sent_at <= ?)`,
  )
    .bind(now, id, threshold)
    .run();

  if (!result.meta.changes) {
    const card = await env.DB.prepare("SELECT enabled, last_sent_at FROM parking_cards WHERE id = ?")
      .bind(id)
      .first();
    if (!card || !card.enabled) throw new ApiError(404, "这个挪车码不存在或已停用");
    const retryAfter = Math.max(1, Math.ceil((card.last_sent_at + cooldown * 1000 - now) / 1000));
    return json({ error: `提醒已发送，请 ${retryAfter} 秒后再试`, retryAfter }, 429, {
      "retry-after": String(retryAfter),
    });
  }

  const card = await env.DB.prepare(
    "SELECT uid, encrypted_token, token_iv FROM parking_cards WHERE id = ?",
  )
    .bind(id)
    .first();

  try {
    const appToken = await decryptToken(card.encrypted_token, card.token_iv, env.ENCRYPTION_KEY);
    const response = await fetch("https://wxpusher.zjiecode.com/api/send/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appToken,
        content: "有人扫描了您的挪车二维码，请尽快查看车辆并前往挪车。",
        summary: "挪车提醒：有人需要您挪车",
        contentType: 1,
        uids: [card.uid],
        verifyPay: false,
      }),
    });
    const wxResult = await response.json().catch(() => null);
    if (!response.ok || !wxResult?.success) {
      await releaseCooldown(env, id, now);
      throw new ApiError(502, "WxPusher 发送失败，请联系车主检查配置");
    }
    return json({ ok: true, message: "已通知车主" });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    await releaseCooldown(env, id, now);
    throw new ApiError(502, "通知服务暂时不可用，请稍后重试");
  }
}

async function releaseCooldown(env, id, expectedTimestamp) {
  await env.DB.prepare(
    "UPDATE parking_cards SET last_sent_at = NULL, send_count = MAX(0, send_count - 1) WHERE id = ? AND last_sent_at = ?",
  )
    .bind(id, expectedTimestamp)
    .run();
}

async function requireOwner(request, env, id) {
  const authorization = request.headers.get("authorization") || "";
  const secret = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!secret) throw new ApiError(401, "缺少管理密钥");
  const hash = await sha256(secret);
  const card = await env.DB.prepare("SELECT * FROM parking_cards WHERE id = ? AND owner_secret_hash = ?")
    .bind(id, hash)
    .first();
  if (!card) throw new ApiError(403, "管理链接无效");
  return card;
}

async function readJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new ApiError(415, "请求格式必须是 JSON");
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "JSON 内容无效");
  }
}

function maskUid(uid) {
  return `${uid.slice(0, 8)}...${uid.slice(-5)}`;
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

async function assetPage(request, env, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return secureAsset(await env.ASSETS.fetch(new Request(url, request)));
}

function secureAsset(response) {
  const secured = new Response(response.body, response);
  secured.headers.set("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  secured.headers.set("referrer-policy", "no-referrer");
  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("x-frame-options", "DENY");
  secured.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (secured.headers.get("content-type")?.includes("text/html")) {
    secured.headers.set("cache-control", "no-store");
  }
  return secured;
}
