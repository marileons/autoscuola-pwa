const COOKIE_NAME = "agenda_session_v2";
const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 100000;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const EMPLOYMENT_TYPES = Object.freeze(["PART_TIME", "FULL_TIME"]);
function employmentFields(referenceDate = today()) {
  return `
    (SELECT p.employment_type FROM user_employment_periods p
      WHERE p.user_id=u.id AND p.effective_from<='${referenceDate}'
      ORDER BY p.effective_from DESC LIMIT 1) AS employment_type,
    (SELECT p.effective_from FROM user_employment_periods p
      WHERE p.user_id=u.id AND p.effective_from<='${referenceDate}'
      ORDER BY p.effective_from DESC LIMIT 1) AS employment_effective_from,
    (SELECT p.employment_type FROM user_employment_periods p
      WHERE p.user_id=u.id AND p.effective_from>'${referenceDate}'
      ORDER BY p.effective_from ASC LIMIT 1) AS scheduled_employment_type,
    (SELECT p.effective_from FROM user_employment_periods p
      WHERE p.user_id=u.id AND p.effective_from>'${referenceDate}'
      ORDER BY p.effective_from ASC LIMIT 1) AS scheduled_employment_effective_from`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      if (isPublicAsset(url.pathname)) return env.ASSETS.fetch(request);
      const session = await requireSession(request, env);
      if (session.response) return session.response;
      return env.ASSETS.fetch(request);
    }
    try {
      if (request.method !== "GET" && !sameOrigin(request)) return json({ error: "Richiesta non autorizzata." }, 403);
      if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request, env);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
      if (url.pathname === "/api/auth/me" && request.method === "GET") return me(request, env);
      if (url.pathname === "/api/public-config/road-report" && request.method === "GET") return json({roadReport:{enabled:env.ROAD_REPORT_ENABLED!=="false",provider:"OpenStreetMap Nominatim pubblico",endpoint:"https://nominatim.openstreetmap.org/reverse",maxRequests:40,intervalMs:1250},enabled:env.ROAD_REPORT_ENABLED!=="false",provider:"OpenStreetMap Nominatim pubblico",endpoint:"https://nominatim.openstreetmap.org/reverse",maxRequests:40,intervalMs:1250});
      if (url.pathname === "/api/setup" && request.method === "POST") return setup(request, env);
      const session = await requireSession(request, env);
      if (session.response) return session.response;
      if (url.pathname === "/api/auth/password" && request.method === "POST") return changeOwnPassword(request, env, session);
      if (url.pathname === "/api/account/employment" && request.method === "GET") return ownEmploymentHistory(env, session.user);
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
function isPublicAsset(pathname) {
  return pathname === "/" || pathname === "/index.html" || pathname === "/auth-client.js" || pathname === "/service-worker.js" || pathname === "/manifest.json" || pathname === "/favicon.ico" || /\.(?:css|png|jpg|jpeg|webp)$/i.test(pathname);
}

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
function publicUser(row) {
  return {
    id: row.id, username: row.username, name: row.name, role: row.role,
    active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at,
    employmentType: row.employment_type || null,
    employmentEffectiveFrom: row.employment_effective_from || null,
    scheduledEmploymentType: row.scheduled_employment_type || null,
    scheduledEmploymentEffectiveFrom: row.scheduled_employment_effective_from || null
  };
}
function publicEmploymentPeriods(rows) {
  return rows.map((row) => ({
    employmentType: row.employment_type,
    effectiveFrom: row.effective_from
  }));
}
function normalizeEmploymentType(value) {
  return EMPLOYMENT_TYPES.includes(value) ? value : "";
}
function normalizeDate(value) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : "";
}
function mondayOf(value) {
  const date = normalizeDate(value);
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  const weekday = parsed.getUTCDay();
  parsed.setUTCDate(parsed.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return parsed.toISOString().slice(0, 10);
}
function today() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function userSelect(whereClause) {
  return `SELECT u.*, ${employmentFields()} FROM users u ${whereClause}`;
}
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
  const row = await env.DB.prepare(`SELECT u.*, s.id_hash, ${employmentFields()}
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.id_hash=? AND s.expires_at>?`).bind(idHash, now).first();
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
  const row = await env.DB.prepare(userSelect("WHERE u.username=?")).bind(username).first();
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
async function changeOwnPassword(request, env, session) {
  const body = await request.json();
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  const confirmPassword = String(body.confirmPassword || "");
  if (!currentPassword) return json({ error: "Inserisci la password attuale." }, 400);
  if (newPassword !== confirmPassword) return json({ error: "La conferma non coincide con la nuova password." }, 400);
  if (!validPassword(newPassword)) return json({ error: "La nuova password deve contenere almeno 10 caratteri." }, 400);
  if (!(await verifyPassword(currentPassword, session.user))) return json({ error: "Password attuale non corretta." }, 400);
  if (currentPassword === newPassword) return json({ error: "La nuova password deve essere diversa da quella attuale." }, 400);
  const secret = await makePassword(newPassword);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,updated_at=? WHERE id=?").bind(secret.hash, secret.salt, secret.iterations, new Date().toISOString(), session.user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND id_hash<>?").bind(session.user.id, session.idHash)
  ]);
  return json({ ok: true, message: "Password modificata correttamente." });
}
function requireAdmin(user) { return user.role === "ADMIN" ? null : json({ error: "Funzione riservata all’amministratore." }, 403); }
async function ownEmploymentHistory(env, user) {
  const result = await env.DB.prepare(`SELECT employment_type,effective_from
    FROM user_employment_periods WHERE user_id=? ORDER BY effective_from ASC`).bind(user.id).all();
  return json({ periods: publicEmploymentPeriods(result.results) });
}
async function listUsers(env, admin) {
  const denied = requireAdmin(admin); if (denied) return denied;
  const result = await env.DB.prepare(userSelect("ORDER BY u.name COLLATE NOCASE")).all();
  return json({ users: result.results.map(publicUser) });
}
async function createUser(request, env, admin) {
  const denied = requireAdmin(admin); if (denied) return denied;
  const body = await request.json();
  const username = normalizeUsername(body.username), name = String(body.name || "").trim(), password = String(body.password || "");
  const role = body.role === "ADMIN" ? "ADMIN" : "ISTRUTTORE";
  const employmentType = normalizeEmploymentType(body.employmentType);
  const requestedEffectiveFrom = normalizeDate(body.employmentEffectiveFrom);
  const employmentEffectiveFrom = mondayOf(requestedEffectiveFrom);
  if (!validUsername(username)) return json({ error: "Username non valido: usa almeno 3 lettere, numeri, punto, trattino o underscore." }, 400);
  if (!name || name.length > 100) return json({ error: "Nome non valido." }, 400);
  if (!validPassword(password)) return json({ error: "La password deve contenere almeno 10 caratteri." }, 400);
  if (!employmentType) return json({ error: "Seleziona PART TIME oppure FULL TIME." }, 400);
  if (!requestedEffectiveFrom || employmentEffectiveFrom < mondayOf(today())) {
    return json({ error: "La decorrenza lavorativa non può precedere la settimana corrente." }, 400);
  }
  const secret = await makePassword(password), now = new Date().toISOString(), id = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id,username,name,role,password_hash,password_salt,password_iterations,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind(id, username, name, role, secret.hash, secret.salt, secret.iterations, 1, now, now),
      env.DB.prepare("INSERT INTO user_employment_periods (id,user_id,employment_type,effective_from,created_at,created_by) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), id, employmentType, employmentEffectiveFrom, now, admin.id)
    ]);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) return json({ error: "Questo username è già utilizzato." }, 409);
    throw error;
  }
  const row = await env.DB.prepare(userSelect("WHERE u.id=?")).bind(id).first();
  return json({ user: publicUser(row) }, 201);
}
async function updateUser(request, env, admin, id) {
  const denied = requireAdmin(admin); if (denied) return denied;
  const target = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  if (!target) return json({ error: "Utente non trovato." }, 404);
  const body = await request.json(), updates = [], values = [];
  let employmentChange = null;
  const changesEmployment = Object.hasOwn(body, "employmentType") || Object.hasOwn(body, "employmentEffectiveFrom");
  if (changesEmployment) {
    const employmentType = normalizeEmploymentType(body.employmentType);
    const requestedEffectiveFrom = normalizeDate(body.employmentEffectiveFrom);
    const effectiveFrom = mondayOf(requestedEffectiveFrom);
    if (!employmentType || !requestedEffectiveFrom) return json({ error: "Tipo e decorrenza lavorativa sono obbligatori." }, 400);
    if (effectiveFrom <= mondayOf(today())) return json({ error: "Il cambio deve decorrere dall’inizio di una nuova settimana futura." }, 400);
    employmentChange = { employmentType, effectiveFrom };
  }
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
  if (!updates.length && !employmentChange) return json({ error: "Nessuna modifica richiesta." }, 400);
  const now = new Date().toISOString();
  const statements = [];
  if (updates.length) {
    updates.push("updated_at=?"); values.push(now, id);
    statements.push(env.DB.prepare(`UPDATE users SET ${updates.join(",")} WHERE id=?`).bind(...values));
  }
  if (employmentChange) {
    statements.push(env.DB.prepare(`INSERT INTO user_employment_periods
      (id,user_id,employment_type,effective_from,created_at,created_by) VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id,effective_from) DO UPDATE SET
        employment_type=excluded.employment_type,
        created_at=excluded.created_at,
        created_by=excluded.created_by`)
      .bind(crypto.randomUUID(), id, employmentChange.employmentType, employmentChange.effectiveFrom, now, admin.id));
  }
  try {
    if (statements.length === 1) await statements[0].run(); else await env.DB.batch(statements);
  } catch (error) { throw error; }
  if (body.active === false || Object.hasOwn(body, "password")) await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
  const row = await env.DB.prepare(userSelect("WHERE u.id=?")).bind(id).first();
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
  const employmentType = normalizeEmploymentType(body.employmentType);
  const requestedEffectiveFrom = normalizeDate(body.employmentEffectiveFrom);
  const employmentEffectiveFrom = mondayOf(requestedEffectiveFrom);
  if (!validUsername(username) || !name || !validPassword(password) || !employmentType || !requestedEffectiveFrom) {
    return json({ error: "Dati amministratore non validi." }, 400);
  }
  if (employmentEffectiveFrom < mondayOf(today())) return json({ error: "Decorrenza lavorativa non valida." }, 400);
  const secret = await makePassword(password), now = new Date().toISOString(), id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id,username,name,role,password_hash,password_salt,password_iterations,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id, username, name, "ADMIN", secret.hash, secret.salt, secret.iterations, 1, now, now),
    env.DB.prepare("INSERT INTO user_employment_periods (id,user_id,employment_type,effective_from,created_at,created_by) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), id, employmentType, employmentEffectiveFrom, now, id)
  ]);
  return json({ ok: true }, 201);
}

export {
  normalizeEmploymentType,
  normalizeDate,
  mondayOf,
  publicUser,
  publicEmploymentPeriods,
  requireAdmin
};
