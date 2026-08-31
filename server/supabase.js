const ACCESS_COOKIE = "mcr_access";
const REFRESH_COOKIE = "mcr_refresh";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function cloudConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return { url, anonKey, configured: Boolean(url && anonKey) };
}

export function parseCookies(header = "") {
  return header.split(";").reduce((cookies, item) => {
    const separator = item.indexOf("=");
    if (separator < 0) return cookies;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

export function sameOriginRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
    const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    return parsed.host === host && parsed.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

function cookie(name, value, maxAge = COOKIE_MAX_AGE) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function setSessionCookies(res, session) {
  const maxAge = Math.max(60, Number(session.expires_in) || 3600);
  res.setHeader("Set-Cookie", [
    cookie(ACCESS_COOKIE, session.access_token, maxAge),
    cookie(REFRESH_COOKIE, session.refresh_token, COOKIE_MAX_AGE),
  ]);
}

export function clearSessionCookies(res) {
  res.setHeader("Set-Cookie", [cookie(ACCESS_COOKIE, "", 0), cookie(REFRESH_COOKIE, "", 0)]);
}

async function authRequest(path, { method = "GET", token, body } = {}) {
  const config = cloudConfig();
  if (!config.configured) return { ok: false, status: 503, data: { error: "Cloud workspace is not connected yet." } };
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method,
    headers: {
      apikey: config.anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function signIn(email, password) {
  return authRequest("token?grant_type=password", { method: "POST", body: { email, password } });
}

export async function signUp(email, password) {
  return authRequest("signup", { method: "POST", body: { email, password } });
}

export async function signOut(token) {
  if (!token) return { ok: true, status: 200, data: {} };
  return authRequest("logout", { method: "POST", token });
}

async function refreshSession(refreshToken) {
  if (!refreshToken) return null;
  const result = await authRequest("token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: refreshToken },
  });
  return result.ok && result.data.access_token ? result.data : null;
}

export async function getSession(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  let accessToken = cookies[ACCESS_COOKIE];
  let result = accessToken ? await authRequest("user", { token: accessToken }) : null;

  if (!result?.ok && cookies[REFRESH_COOKIE]) {
    const refreshed = await refreshSession(cookies[REFRESH_COOKIE]);
    if (refreshed) {
      setSessionCookies(res, refreshed);
      accessToken = refreshed.access_token;
      result = await authRequest("user", { token: accessToken });
    }
  }

  if (!result?.ok || !result.data?.id) return null;
  return { token: accessToken, user: result.data };
}

export async function dataRequest(path, token, { method = "GET", body, prefer } = {}) {
  const config = cloudConfig();
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export async function storageRequest(path, token, { method = "POST", bytes, contentType = "application/octet-stream" } = {}) {
  const config = cloudConfig();
  const response = await fetch(`${config.url}/storage/v1/object/evidence/${path}`, {
    method,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      "content-type": contentType,
      "x-upsert": "false",
    },
    body: bytes,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

export async function readJson(req, limit = 4_000_000) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
