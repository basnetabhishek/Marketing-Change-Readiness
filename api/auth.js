import {
  clearSessionCookies,
  cloudConfig,
  getSession,
  json,
  parseCookies,
  readJson,
  sameOriginRequest,
  setSessionCookies,
  signIn,
  signOut,
  signUp,
} from "../server/supabase.js";

export default async function handler(req, res) {
  const config = cloudConfig();
  const action = new URL(req.url, "https://local.invalid").searchParams.get("action") || "status";

  if (req.method === "GET" && action === "status") {
    if (!config.configured) return json(res, 200, { configured: false, user: null });
    const session = await getSession(req, res);
    return json(res, 200, { configured: true, user: session ? { id: session.user.id, email: session.user.email } : null });
  }

  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
  if (!sameOriginRequest(req)) return json(res, 403, { error: "Cross-site request blocked." });
  if (!config.configured) return json(res, 503, { error: "Cloud workspace is not connected yet." });

  try {
    if (action === "signout") {
      const accessToken = parseCookies(req.headers.cookie || "").mcr_access;
      clearSessionCookies(res);
      await signOut(accessToken).catch(() => null);
      return json(res, 200, { ok: true });
    }

    const body = await readJson(req, 20_000);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: "Enter a valid email address." });
    if (password.length < 8) return json(res, 400, { error: "Use a password with at least 8 characters." });

    const result = action === "signup" ? await signUp(email, password) : action === "signin" ? await signIn(email, password) : null;
    if (!result) return json(res, 404, { error: "Unknown sign-in action." });
    if (!result.ok) return json(res, result.status, { error: result.data.msg || result.data.message || result.data.error_description || "Authentication failed." });

    const session = result.data.session || (result.data.access_token ? result.data : null);
    if (session) setSessionCookies(res, session);
    return json(res, 200, {
      ok: true,
      needsConfirmation: !session,
      user: result.data.user ? { id: result.data.user.id, email: result.data.user.email } : null,
    });
  } catch (error) {
    return json(res, 400, { error: error.message || "Authentication request failed." });
  }
}
