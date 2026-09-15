const COOKIE_NAME = "agenda_session_v2";
const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 100000;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const EMPLOYMENT_TYPES = Object.freeze(["PART_TIME", "FULL_TIME"]);
const AUTHORIZATION_ROLES = Object.freeze(["ADMIN", "USER_MANAGER", "ISTRUTTORE"]);
const TEMPORARY_PASSWORD_MS = 2 * 60 * 60 * 1000;
const PASSWORD_CHANGE_SESSION_MS = 15 * 60 * 1000;
const AUDIT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const THROTTLE_MAX_FAILURES = 5;
const THROTTLE_BLOCK_MS = 15 * 60 * 1000;
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
      if (session.purpose !== "NORMAL" || effectiveRole(session.user) === "USER_MANAGER") return json({ error: "Risorsa non autorizzata." }, 403);
      return env.ASSETS.fetch(request);
    }
    try {
      if (request.method !== "GET" && url.pathname !== "/api/setup" && !sameOrigin(request)) return json({ error: "Richiesta non autorizzata." }, 403);
      if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request, env);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
      if (url.pathname === "/api/auth/me" && request.method === "GET") return me(request, env);
      if (url.pathname === "/api/public-config/road-report" && request.method === "GET") return json({roadReport:{enabled:env.ROAD_REPORT_ENABLED!=="false",provider:"OpenStreetMap Nominatim pubblico",endpoint:"https://nominatim.openstreetmap.org/reverse",maxRequests:40,intervalMs:1250},enabled:env.ROAD_REPORT_ENABLED!=="false",provider:"OpenStreetMap Nominatim pubblico",endpoint:"https://nominatim.openstreetmap.org/reverse",maxRequests:40,intervalMs:1250});
      if (url.pathname === "/api/setup" && request.method === "POST") return setup(request, env);
      const session = await requireSession(request, env);
      if (session.response) return session.response;
      if (session.purpose === "PASSWORD_CHANGE" && !["/api/auth/password", "/api/auth/logout"].includes(url.pathname)) return json({ error: "Prima di continuare devi scegliere una nuova password personale." }, 403);
      if (url.pathname === "/api/auth/password" && request.method === "POST") return changeOwnPassword(request, env, session);
      if (url.pathname === "/api/account/employment" && request.method === "GET") return ownEmploymentHistory(env, session.user);
      if (url.pathname === "/api/users" && request.method === "GET") return listUsers(env, session.user);
      if (url.pathname === "/api/users" && request.method === "POST") return createUser(request, env, session.user);
      const match = url.pathname.match(/^\/api\/users\/([^/]+)$/);
      if (match && request.method === "PATCH") return updateUser(request, env, session.user, decodeURIComponent(match[1]));
      if (match && request.method === "DELETE") return revokeUser(env, session.user, decodeURIComponent(match[1]));
      if (url.pathname === "/api/user-management/users" && request.method === "GET") return managerListUsers(env, session.user);
      if (url.pathname === "/api/user-management/users" && request.method === "POST") return managerCreateUser(request, env, session.user);
      if (url.pathname === "/api/user-management/audit" && request.method === "GET") return principalAudit(url, env, session.user);
      const statusMatch = url.pathname.match(/^\/api\/user-management\/users\/([^/]+)\/status$/);
      if (statusMatch && request.method === "POST") return managerSetStatus(request, env, session.user, decodeURIComponent(statusMatch[1]));
      const passwordMatch = url.pathname.match(/^\/api\/user-management\/users\/([^/]+)\/temporary-password$/);
      if (passwordMatch && request.method === "POST") return managerTemporaryPassword(request, env, session.user, decodeURIComponent(passwordMatch[1]));
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
  return Boolean(origin) && origin === new URL(request.url).origin;
}
function normalizeUsername(value) { return String(value || "").trim().toLowerCase(); }
function validUsername(value) { return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(value); }
function validPassword(value) { return typeof value === "string" && value.length >= 10 && value.length <= 128; }
function effectiveRole(row) {
  const legacy = row?.role;
  const assigned = row?.authorization_role;
  if (assigned == null || assigned === "") return ["ADMIN", "ISTRUTTORE"].includes(legacy) ? legacy : null;
  if (!AUTHORIZATION_ROLES.includes(assigned)) return null;
  if (assigned === "USER_MANAGER") return legacy === "ISTRUTTORE" ? assigned : null;
  return assigned === legacy ? assigned : null;
}
function capabilitiesFor(row) {
  const role = effectiveRole(row), primary = Boolean(row?.is_primary_admin);
  return { useApplication: role === "ADMIN" || role === "ISTRUTTORE", manageUsers: role === "ADMIN" || role === "USER_MANAGER", managePrivilegedUsers: role === "ADMIN" && primary, viewAudit: role === "ADMIN" && primary };
}
function publicUser(row, purpose = "NORMAL") {
  return {
    id: row.id, username: row.username, name: row.name, role: effectiveRole(row) || "INVALID",
    active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at,
    employmentType: row.employment_type || null,
    employmentEffectiveFrom: row.employment_effective_from || null,
    scheduledEmploymentType: row.scheduled_employment_type || null,
    scheduledEmploymentEffectiveFrom: row.scheduled_employment_effective_from || null,
    mustChangePassword: Boolean(row.must_change_password) || purpose === "PASSWORD_CHANGE",
    capabilities: capabilitiesFor(row)
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
function strictBody(body, allowed) { return body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).every(key => allowed.includes(key)); }
function requestId(request) { return String(request.headers.get("cf-ray") || crypto.randomUUID()).slice(0, 100); }
async function throttleKey(scope, value) { return sha256(`${scope}:${value}`); }
async function throttleStatus(env, scope, value) {
  const keyHash = await throttleKey(scope, value), row = await env.DB.prepare("SELECT * FROM security_throttles WHERE scope=? AND key_hash=?").bind(scope, keyHash).first();
  return { keyHash, blocked: Boolean(row?.blocked_until && row.blocked_until > new Date().toISOString()) };
}
async function throttleFailure(env, scope, keyHash) {
  const now = new Date(), row = await env.DB.prepare("SELECT failure_count FROM security_throttles WHERE scope=? AND key_hash=?").bind(scope, keyHash).first();
  const failures = Number(row?.failure_count || 0) + 1, blockedUntil = failures >= THROTTLE_MAX_FAILURES ? new Date(now.getTime() + THROTTLE_BLOCK_MS).toISOString() : null;
  await env.DB.prepare(`INSERT INTO security_throttles(scope,key_hash,failure_count,window_started_at,blocked_until,updated_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(scope,key_hash) DO UPDATE SET failure_count=excluded.failure_count,blocked_until=excluded.blocked_until,updated_at=excluded.updated_at`)
    .bind(scope, keyHash, failures, now.toISOString(), blockedUntil, now.toISOString()).run();
}
async function throttleClear(env, scope, keyHash) { await env.DB.prepare("DELETE FROM security_throttles WHERE scope=? AND key_hash=?").bind(scope, keyHash).run(); }
async function audit(env, request, actorId, targetId, action, outcome, reasonCode) {
  const now = new Date(), cutoff = new Date(now.getTime() - AUDIT_RETENTION_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO user_management_audit(id,occurred_at,actor_user_id,target_user_id,action,outcome,reason_code,request_id) VALUES(?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), now.toISOString(), actorId || null, targetId || null, action, outcome, reasonCode, requestId(request)),
    env.DB.prepare("DELETE FROM user_management_audit WHERE occurred_at<?").bind(cutoff)
  ]);
}
function randomTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join("");
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
  const row = await env.DB.prepare(`SELECT u.*, s.id_hash, s.purpose, s.session_version AS authenticated_session_version, ${employmentFields()}
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.id_hash=? AND s.expires_at>?`).bind(idHash, now).first();
  if (!row || !row.active || Number(row.authenticated_session_version) !== Number(row.session_version)) {
    if (row?.id_hash) await env.DB.prepare("DELETE FROM sessions WHERE id_hash=?").bind(idHash).run();
    return { response: json({ error: "Sessione scaduta o accesso revocato." }, 401, { "set-cookie": sessionCookie("", 0) }) };
  }
  return { user: row, idHash, purpose: row.purpose || "NORMAL" };
}
async function me(request, env) {
  const session = await requireSession(request, env);
  return session.response || json({ user: publicUser(session.user, session.purpose) });
}
async function login(request, env) {
  const body = await request.json();
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const rate = await throttleStatus(env, "LOGIN", `${username}:${request.headers.get("cf-connecting-ip") || "unknown"}`);
  if (rate.blocked) return json({ error: "Troppi tentativi. Attendi alcuni minuti e riprova." }, 429);
  const row = await env.DB.prepare(userSelect("WHERE u.username=?")).bind(username).first();
  if (!row || !row.active || !(await verifyPassword(password, row))) { await throttleFailure(env, "LOGIN", rate.keyHash); return json({ error: "Credenziali non corrette o utente bloccato." }, 401); }
  const now = new Date();
  let purpose = "NORMAL", sessionMs = SESSION_DAYS * 86400000;
  if (row.must_change_password) {
    if (!row.temporary_password_expires_at || row.temporary_password_expires_at <= now.toISOString() || row.temporary_password_used_at) { await throttleFailure(env, "LOGIN", rate.keyHash); return json({ error: "Credenziali non corrette o utente bloccato." }, 401); }
    const consumed = await env.DB.prepare("UPDATE users SET temporary_password_used_at=?,updated_at=? WHERE id=? AND temporary_password_used_at IS NULL AND temporary_password_expires_at>?").bind(now.toISOString(), now.toISOString(), row.id, now.toISOString()).run();
    if (Number(consumed.meta?.changes || 0) !== 1) return json({ error: "Credenziali non corrette o utente bloccato." }, 401);
    row.temporary_password_used_at = now.toISOString(); purpose = "PASSWORD_CHANGE"; sessionMs = PASSWORD_CHANGE_SESSION_MS;
  }
  await throttleClear(env, "LOGIN", rate.keyHash);
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const expires = new Date(now.getTime() + sessionMs);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now.toISOString()),
    env.DB.prepare("INSERT INTO sessions (id_hash,user_id,expires_at,created_at,session_version,purpose) VALUES (?,?,?,?,?,?)").bind(await sha256(token), row.id, expires.toISOString(), now.toISOString(), row.session_version, purpose)
  ]);
  return json({ user: publicUser(row, purpose) }, 200, { "set-cookie": sessionCookie(token, Math.floor(sessionMs / 1000)) });
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
  if (session.purpose !== "PASSWORD_CHANGE" && !currentPassword) return json({ error: "Inserisci la password attuale." }, 400);
  if (newPassword !== confirmPassword) return json({ error: "La conferma non coincide con la nuova password." }, 400);
  if (!validPassword(newPassword)) return json({ error: "La nuova password deve contenere almeno 10 caratteri." }, 400);
  if (session.purpose !== "PASSWORD_CHANGE" && !(await verifyPassword(currentPassword, session.user))) return json({ error: "Password attuale non corretta." }, 400);
  if (session.purpose !== "PASSWORD_CHANGE" && currentPassword === newPassword) return json({ error: "La nuova password deve essere diversa da quella attuale." }, 400);
  const secret = await makePassword(newPassword);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=0,temporary_password_expires_at=NULL,temporary_password_used_at=NULL,password_reset_at=NULL,session_version=session_version+1,updated_at=? WHERE id=?").bind(secret.hash, secret.salt, secret.iterations, new Date().toISOString(), session.user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(session.user.id)
  ]);
  return json({ ok: true, requireLogin: true, message: "Password modificata. Accedi nuovamente con la password personale." }, 200, { "set-cookie": sessionCookie("", 0) });
}
function requireAdmin(user) { return effectiveRole(user) === "ADMIN" ? null : json({ error: "Funzione riservata all’amministratore." }, 403); }
function requireUserManager(user) { return ["ADMIN", "USER_MANAGER"].includes(effectiveRole(user)) ? null : json({ error: "Funzione riservata alla gestione utenti." }, 403); }
function isPrimaryAdmin(user) { return effectiveRole(user) === "ADMIN" && Boolean(user?.is_primary_admin); }
function normalTarget(user) { return effectiveRole(user) === "ISTRUTTORE" && !user?.is_primary_admin; }
function manageableTarget(actor, target) { return normalTarget(target) || (isPrimaryAdmin(actor) && target?.id !== actor.id && !target?.is_primary_admin); }
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
  if (!strictBody(body, ["username", "name", "password", "role", "employmentType", "employmentEffectiveFrom"])) return json({ error: "La richiesta contiene campi non consentiti." }, 400);
  const username = normalizeUsername(body.username), name = String(body.name || "").trim(), password = String(body.password || "");
  const role = AUTHORIZATION_ROLES.includes(body.role) ? body.role : "ISTRUTTORE";
  if (role !== "ISTRUTTORE" && !isPrimaryAdmin(admin)) return json({ error: "Configura e utilizza l’amministratore principale per creare utenti privilegiati." }, 403);
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
      env.DB.prepare("INSERT INTO users (id,username,name,role,authorization_role,password_hash,password_salt,password_iterations,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(id, username, name, role === "USER_MANAGER" ? "ISTRUTTORE" : role, role, secret.hash, secret.salt, secret.iterations, 1, now, now),
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
  if (!normalTarget(target) && !isPrimaryAdmin(admin)) return json({ error: "Solo l’amministratore principale può gestire utenti privilegiati." }, 403);
  if (target.is_primary_admin && target.id !== admin.id) return json({ error: "L’amministratore principale è protetto." }, 403);
  const body = await request.json(), updates = [], values = [];
  if (!strictBody(body, ["name", "active", "employmentType", "employmentEffectiveFrom"])) return json({ error: Object.hasOwn(body, "password") ? "Usa la funzione Password provvisoria." : "La richiesta contiene campi non consentiti." }, 400);
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
  if (body.active === false) await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
  const row = await env.DB.prepare(userSelect("WHERE u.id=?")).bind(id).first();
  return json({ user: publicUser(row) });
}
async function revokeUser(env, admin, id) {
  const denied = requireAdmin(admin); if (denied) return denied;
  if (id === admin.id) return json({ error: "Non puoi revocare il tuo stesso account." }, 400);
  const found = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  if (!found) return json({ error: "Utente non trovato." }, 404);
  if (!normalTarget(found) && !isPrimaryAdmin(admin)) return json({ error: "Solo l’amministratore principale può revocare utenti privilegiati." }, 403);
  if (found.is_primary_admin) return json({ error: "L’amministratore principale non può essere revocato." }, 400);
  await env.DB.batch([env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id), env.DB.prepare("DELETE FROM users WHERE id=?").bind(id)]);
  return json({ ok: true });
}
async function managerListUsers(env, actor) {
  const denied = requireUserManager(actor); if (denied) return denied;
  const where = effectiveRole(actor) === "USER_MANAGER" ? "WHERE COALESCE(u.authorization_role,u.role)='ISTRUTTORE' ORDER BY u.name COLLATE NOCASE" : "ORDER BY u.name COLLATE NOCASE";
  const result = await env.DB.prepare(userSelect(where)).all();
  return json({ users: result.results.map(row => publicUser(row)) });
}
async function principalAudit(url, env, actor) {
  if (!isPrimaryAdmin(actor)) return json({ error: "Funzione riservata all’amministratore principale." }, 403);
  const requestedLimit = Number(url.searchParams.get("limit") || 50);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  const result = await env.DB.prepare(`SELECT occurred_at,actor_user_id,target_user_id,action,outcome,reason_code,request_id
    FROM user_management_audit ORDER BY occurred_at DESC LIMIT ?`).bind(limit).all();
  return json({ events: result.results });
}
async function managerCreateUser(request, env, actor) {
  const denied = requireUserManager(actor); if (denied) return denied;
  const body = await request.json(), allowed = ["name", "username", "employmentType", "employmentEffectiveFrom", "operatorPassword"];
  if (!strictBody(body, allowed)) return json({ error: "La richiesta contiene campi non consentiti." }, 400);
  const operatorPassword = String(body.operatorPassword || ""), rate = await throttleStatus(env, "OPERATOR_CONFIRM", actor.id);
  if (rate.blocked) return json({ error: "Troppi tentativi. Attendi alcuni minuti e riprova." }, 429);
  if (!(await verifyPassword(operatorPassword, actor))) { await throttleFailure(env, "OPERATOR_CONFIRM", rate.keyHash); await audit(env, request, actor.id, null, "CREATE_USER", "DENIED", "OPERATOR_PASSWORD_INVALID"); return json({ error: "Conferma dell’operatore non valida." }, 403); }
  await throttleClear(env, "OPERATOR_CONFIRM", rate.keyHash);
  const username = normalizeUsername(body.username), name = String(body.name || "").trim(), employmentType = normalizeEmploymentType(body.employmentType), requested = normalizeDate(body.employmentEffectiveFrom), effectiveFrom = mondayOf(requested);
  if (!validUsername(username) || !name || name.length > 100 || !employmentType || !requested || effectiveFrom < mondayOf(today())) return json({ error: "Dati del nuovo utente non validi." }, 400);
  const temporaryPassword = randomTemporaryPassword(), secret = await makePassword(temporaryPassword), now = new Date(), id = crypto.randomUUID(), expires = new Date(now.getTime() + TEMPORARY_PASSWORD_MS).toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users(id,username,name,role,authorization_role,password_hash,password_salt,password_iterations,active,created_at,updated_at,must_change_password,temporary_password_expires_at,password_reset_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,username,name,"ISTRUTTORE","ISTRUTTORE",secret.hash,secret.salt,secret.iterations,1,now.toISOString(),now.toISOString(),1,expires,now.toISOString()),
      env.DB.prepare("INSERT INTO user_employment_periods(id,user_id,employment_type,effective_from,created_at,created_by) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),id,employmentType,effectiveFrom,now.toISOString(),actor.id)
    ]);
    await audit(env, request, actor.id, id, "CREATE_USER", "SUCCESS", "CREATED_WITH_TEMPORARY_PASSWORD");
  } catch (error) { if (String(error).toLowerCase().includes("unique")) return json({ error: "Questo username è già utilizzato." }, 409); throw error; }
  return json({ user: publicUser(await env.DB.prepare(userSelect("WHERE u.id=?")).bind(id).first()), temporaryPassword, temporaryPasswordExpiresAt: expires }, 201);
}
async function managerSetStatus(request, env, actor, id) {
  const denied = requireUserManager(actor); if (denied) return denied;
  const body = await request.json(); if (!strictBody(body, ["active"]) || typeof body.active !== "boolean") return json({ error: "La richiesta contiene campi non consentiti." }, 400);
  const target = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  if (!target || !manageableTarget(actor, target)) { await audit(env, request, actor.id, target?.id || null, "SET_STATUS", "DENIED", "TARGET_NOT_MANAGEABLE"); return json({ error: "Utente non disponibile per questa operazione." }, 404); }
  if (!body.active && effectiveRole(target) === "ADMIN") {
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE active=1 AND COALESCE(authorization_role,role)='ADMIN'").first();
    if (Number(count?.total || 0) <= 1) return json({ error: "Non è possibile bloccare l’ultimo amministratore abilitato." }, 400);
  }
  const now = new Date().toISOString(), statements = [env.DB.prepare("UPDATE users SET active=?,session_version=session_version+1,updated_at=? WHERE id=?").bind(body.active?1:0,now,id)];
  if (!body.active) statements.push(env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id));
  await env.DB.batch(statements); await audit(env, request, actor.id, id, body.active?"ENABLE_USER":"BLOCK_USER", "SUCCESS", "STATUS_CHANGED");
  return json({ ok: true });
}
async function managerTemporaryPassword(request, env, actor, id) {
  const denied = requireUserManager(actor); if (denied) return denied;
  const body = await request.json(); if (!strictBody(body, ["operatorPassword"])) return json({ error: "La richiesta contiene campi non consentiti." }, 400);
  const target = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  if (!target || !manageableTarget(actor, target)) { await audit(env, request, actor.id, target?.id || null, "TEMPORARY_PASSWORD", "DENIED", "TARGET_NOT_MANAGEABLE"); return json({ error: "Utente non disponibile per questa operazione." }, 404); }
  const rate = await throttleStatus(env, "PASSWORD_RESET", `${actor.id}:${id}`);
  if (rate.blocked) return json({ error: "Troppi tentativi. Attendi alcuni minuti e riprova." }, 429);
  if (!(await verifyPassword(String(body.operatorPassword || ""), actor))) { await throttleFailure(env, "PASSWORD_RESET", rate.keyHash); await audit(env, request, actor.id, id, "TEMPORARY_PASSWORD", "DENIED", "OPERATOR_PASSWORD_INVALID"); return json({ error: "Conferma dell’operatore non valida." }, 403); }
  await throttleClear(env, "PASSWORD_RESET", rate.keyHash);
  const temporaryPassword = randomTemporaryPassword(), secret = await makePassword(temporaryPassword), now = new Date(), expires = new Date(now.getTime() + TEMPORARY_PASSWORD_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=1,temporary_password_expires_at=?,temporary_password_used_at=NULL,password_reset_at=?,session_version=session_version+1,updated_at=? WHERE id=?").bind(secret.hash,secret.salt,secret.iterations,expires,now.toISOString(),now.toISOString(),id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id)
  ]);
  await audit(env, request, actor.id, id, "TEMPORARY_PASSWORD", "SUCCESS", "TEMPORARY_PASSWORD_ISSUED");
  return json({ temporaryPassword, temporaryPasswordExpiresAt: expires });
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
    env.DB.prepare("INSERT INTO users (id,username,name,role,authorization_role,is_primary_admin,password_hash,password_salt,password_iterations,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, username, name, "ADMIN", "ADMIN", 1, secret.hash, secret.salt, secret.iterations, 1, now, now),
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
  requireAdmin,
  requireUserManager,
  effectiveRole,
  capabilitiesFor,
  strictBody,
  normalTarget,
  manageableTarget,
  randomTemporaryPassword,
  verifyPassword,
  sameOrigin
};
