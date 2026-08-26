const COOKIE_NAME = "agenda_session";
const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 210000;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      if (request.method !== "GET" && !sameOrigin(request)) return json({ error: "Richiesta non autorizzata." }, 403);
      if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request, env);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
      if (url.pathname === "/api/auth/me" && request.method === "GET") return me(request, env);
      if (url.pathname === "/api/setup" && request.method === "POST") return setup(request, env);
      const session = await requireSession(request, env);
      if (session.response) return session.response;
      if (url.pathname === "/api/users" && request.method === "GET") return listUsers(env, session.user);
      if (url.pathname === "/api/users" && request.method === "POST") return createUser(request, env, session.user);
      const match = url.pathname.match(/^\/api\/users\/([^/]+)$/);
      if (match && request.method === "PATCH") return updateUser(request, env, session.user, decodeURIComponent(match[1]));
      if (match && request.method === "DELETE") return revokeUser(env, session.user, decodeURIComponent(match[1]));
      return json({ error: "Risorsa non trovata." }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: "Errore interno. Riprova tra poco." }, 500);
    }
  }
};

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
function normalizeUsername(value) { return String(value || "").trim().toLowerCase(); }
function validUsername(value) { return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(value); }
function validPassword(value) { return typeof value === "string" && value.length >= 10 && value.length <= 128; }
function publicUser(row) { return { id: row.id, username: row.username, name: row.name, role: row.role, active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at }; }
function bytesToBase64(bytes) { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function sha256(value) { return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
async function passwordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function makePassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await passwordHash(password, salt), salt: bytesToBase64(salt), iterations: PASSWORD_ITERATIONS };
}
async function verifyPassword(password, row) {
  const candidate = await passwordHash(password, base64ToBytes(row.password_salt), row.password_iterations);
  return constantTimeEqual(candidate, row.password_hash);
}
function cookieValue(request) {
  const cookies = request.headers.get("cookie") || "";
  const found = cookies.split(";").map(v => v.trim()).find(v => v.startsWith(`${COOKIE_NAME}=`));
  return found ? decodeURIComponent(found.slice(COOKIE_NAME.length + 1)) : "";
}
function sessionCookie(token, maxAge) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
async function requireSession(request, env) {
  const token = cookieValue(request);
  if (!token) return { response: json({ error: "Accesso richiesto." }, 401) };
  const idHash = await sha256(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`SELECT u.*, s.id_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=? AND s.expires_at>?`).bind(idHash, now).first();
  if (!row || !row.active) {
    if (row?.id_hash) await env.DB.prepare("DELETE FROM sessions WHERE id_hash=?").bind(idHash).run();
    return { response: json({ error: "Sessione scaduta o accesso revocato." }, 401, { "set-cookie": sessionCookie("", 0) }) };
  }
  return { user: row, idHash };
}
async function me(request, env) {
  const session = await requireSession(request, env);
  return session.response || json({ user: publicUser(session.user) });
}
async function login(request, env) {
  const body = await request.json();
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const row = await env.DB.prepare("SELECT * FROM users WHERE username=?").bind(username).first();
  if (!row || !row.active || !(await verifyPassword(password, row))) return json({ error: "Credenziali non corrette o utente bloccato." }, 401);
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now.toISOString()),
    env.DB.prepare("INSERT INTO sessions (id_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)").bind(await sha256(token), row.id, expires.toISOString(), now.toISOString())
  ]);
  return json({ user: publicUser(row) }, 200, { "set-cookie": sessionCookie(token, SESSION_DAYS * 86400) });
}
async function logout(request, env) {
  const token = cookieValue(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE id_hash=?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
}
function requireAdmin(user) { return user.role === "ADMIN" ? null : json({ error: "Funzione riservata all’amministratore." }, 403); }
async function listUsers(env, admin) {
  const denied = requireAdmin(admin); if (denied) return denied;
  const result = await env.DB.prepare("SELECT id,username,name,role,active,created_at,updated_at FROM users ORDER BY name COLLATE NOCASE").all();
  return json({ users: result.results.map(publicUser) });
}
async function createUser(request, env, admin) {
  const denied = requireAdmin(admin); if (denied) return denied;
  const body = await request.json();
  const username = normalizeUsername(body.username), name = String(body.name || "").trim(), password = String(body.password || "");
  const role = body.role === "ADMIN" ? "ADMIN" : "ISTRUTTORE";
  if (!validUsername(username)) return json({ error: "Username non valido: usa almeno 3 lettere, numeri, punto, trattino o underscore." }, 400);
  if (!name || name.length > 100) return json({ error: "Nome non valido." }, 400);
  if (!validPassword(password)) return json({ error: "La password deve contenere almeno 10 caratteri." }, 400);
  const secret = await makePassword(password), now = new Date().toISOString(), id = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO users (id,username,name,role,password_hash,password_salt,password_iterations,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id, username, name, role, secret.hash, secret.salt, secret.iterations, 1, now, now).run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) return json({ error: "Questo username è già utilizzato." }, 409);
    throw error;
  }
  const row = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  return json({ user: publicUser(row) }, 201);
}
async function updateUser(request, env, admin, id) {
  const denied = requireAdmin(admin); if (denied) return denied;
  const target = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  if (!target) return json({ error: "Utente non trovato." }, 404);
  const body = await request.json(), updates = [], values = [];
  if (Object.hasOwn(body, "name")) { const name = String(body.name || "").trim(); if (!name || name.length > 100) return json({ error: "Nome non valido." }, 400); updates.push("name=?"); values.push(name); }
  if (Object.hasOwn(body, "active")) {
    const active = Boolean(body.active);
    if (id === admin.id && !active) return json({ error: "Non puoi bloccare il tuo stesso account." }, 400);
    updates.push("active=?"); values.push(active ? 1 : 0);
  }
  if (Object.hasOwn(body, "password")) {
    const password = String(body.password || ""); if (!validPassword(password)) return json({ error: "La password deve contenere almeno 10 caratteri." }, 400);
    const secret = await makePassword(password); updates.push("password_hash=?", "password_salt=?", "password_iterations=?"); values.push(secret.hash, secret.salt, secret.iterations);
  }
  if (!updates.length) return json({ error: "Nessuna modifica richiesta." }, 400);
  updates.push("updated_at=?"); values.push(new Date().toISOString(), id);
  await env.DB.prepare(`UPDATE users SET ${updates.join(",")} WHERE id=?`).bind(...values).run();
  if (body.active === false || Object.hasOwn(body, "password")) await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
  const row = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  return json({ user: publicUser(row) });
}
async function revokeUser(env, admin, id) {
  const denied = requireAdmin(admin); if (denied) return denied;
  if (id === admin.id) return json({ error: "Non puoi revocare il tuo stesso account." }, 400);
  const found = await env.DB.prepare("SELECT id FROM users WHERE id=?").bind(id).first();
  if (!found) return json({ error: "Utente non trovato." }, 404);
  await env.DB.batch([env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id), env.DB.prepare("DELETE FROM users WHERE id=?").bind(id)]);
  return json({ ok: true });
}
async function setup(request, env) {
  const supplied = request.headers.get("authorization") || "";
  if (!env.ADMIN_BOOTSTRAP_TOKEN || supplied !== `Bearer ${env.ADMIN_BOOTSTRAP_TOKEN}`) return json({ error: "Configurazione non autorizzata." }, 403);
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM users").first();
  if (count.total > 0) return json({ error: "La configurazione iniziale è già stata completata." }, 409);
  const body = await request.json(), username = normalizeUsername(body.username), name = String(body.name || "").trim(), password = String(body.password || "");
  if (!validUsername(username) || !name || !validPassword(password)) return json({ error: "Dati amministratore non validi." }, 400);
  const secret = await makePassword(password), now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO users (id,username,name,role,password_hash,password_salt,password_iterations,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), username, name, "ADMIN", secret.hash, secret.salt, secret.iterations, 1, now, now).run();
  return json({ ok: true }, 201);
}
