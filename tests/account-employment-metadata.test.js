"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = path.resolve(__dirname, "..");

async function loadWorker() {
  const source = fs.readFileSync(path.join(root, "worker.js"), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

function fakeUser(id, username, role = "ISTRUTTORE") {
  return [
    id, username, username.toUpperCase(), role, "hash", "salt", 100000, 1,
    "2026-08-31T10:00:00.000Z", "2026-08-31T10:00:00.000Z"
  ];
}

test("la migrazione inizializza tutti gli account esistenti come PART TIME", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(root, "migrations", "0001_auth.sql"), "utf8"));
  const insert = db.prepare(`INSERT INTO users
    (id,username,name,role,password_hash,password_salt,password_iterations,active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  insert.run(...fakeUser("admin-id", "admin", "ADMIN"));
  insert.run(...fakeUser("istruttore-1", "istruttore1"));
  insert.run(...fakeUser("istruttore-2", "istruttore2"));
  db.exec(fs.readFileSync(path.join(root, "migrations", "0002_user_employment_periods.sql"), "utf8"));
  const rows = db.prepare(`SELECT user_id,employment_type,effective_from
    FROM user_employment_periods ORDER BY user_id`).all();
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.employment_type === "PART_TIME"));
  assert.ok(rows.every((row) => row.effective_from === "2026-08-31"));
  db.close();
});

test("lo schema accetta solo PART_TIME/FULL_TIME e decorrenze di lunedì", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(root, "migrations", "0001_auth.sql"), "utf8"));
  db.exec(fs.readFileSync(path.join(root, "migrations", "0002_user_employment_periods.sql"), "utf8"));
  db.prepare(`INSERT INTO users
    (id,username,name,role,password_hash,password_salt,password_iterations,active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(...fakeUser("user-id", "utente"));
  const insert = db.prepare(`INSERT INTO user_employment_periods
    (id,user_id,employment_type,effective_from,created_at,created_by) VALUES (?,?,?,?,?,?)`);
  assert.throws(() => insert.run("p1", "user-id", "ALTRO", "2026-09-07", "now", "admin"));
  assert.throws(() => insert.run("p2", "user-id", "FULL_TIME", "2026-09-08", "now", "admin"));
  insert.run("p3", "user-id", "FULL_TIME", "2026-09-07", "now", "admin");
  assert.throws(() => insert.run("p4", "user-id", "PART_TIME", "2026-09-07", "now", "admin"));
  db.close();
});

test("una decorrenza futura già programmata può essere corretta senza duplicarla", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(root, "migrations", "0001_auth.sql"), "utf8"));
  db.exec(fs.readFileSync(path.join(root, "migrations", "0002_user_employment_periods.sql"), "utf8"));
  db.prepare(`INSERT INTO users
    (id,username,name,role,password_hash,password_salt,password_iterations,active,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(...fakeUser("user-id", "utente"));
  const upsert = db.prepare(`INSERT INTO user_employment_periods
    (id,user_id,employment_type,effective_from,created_at,created_by) VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id,effective_from) DO UPDATE SET
      employment_type=excluded.employment_type,
      created_at=excluded.created_at,
      created_by=excluded.created_by`);
  upsert.run("first", "user-id", "FULL_TIME", "2099-01-05", "first", "admin");
  upsert.run("second", "user-id", "PART_TIME", "2099-01-05", "second", "admin");
  const rows = db.prepare(`SELECT employment_type,created_at
    FROM user_employment_periods WHERE user_id=? AND effective_from=?`).all("user-id", "2099-01-05");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].employment_type, "PART_TIME");
  assert.equal(rows[0].created_at, "second");
  db.close();
});

test("la tabella server non contiene campi economici del Registro", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(root, "migrations", "0001_auth.sql"), "utf8"));
  db.exec(fs.readFileSync(path.join(root, "migrations", "0002_user_employment_periods.sql"), "utf8"));
  const columns = db.prepare("PRAGMA table_info(user_employment_periods)").all().map((row) => row.name);
  assert.deepEqual(columns, ["id", "user_id", "employment_type", "effective_from", "created_at", "created_by"]);
  db.close();
});

test("normalizzazione data applica sempre il lunedì della settimana", async () => {
  const { mondayOf, normalizeEmploymentType, normalizeDate } = await loadWorker();
  assert.equal(mondayOf("2026-09-01"), "2026-08-31");
  assert.equal(mondayOf("2026-09-06"), "2026-08-31");
  assert.equal(mondayOf("2026-09-07"), "2026-09-07");
  assert.equal(normalizeEmploymentType("PART_TIME"), "PART_TIME");
  assert.equal(normalizeEmploymentType("FULL_TIME"), "FULL_TIME");
  assert.equal(normalizeEmploymentType("ALTRO"), "");
  assert.equal(normalizeDate("2026-02-30"), "");
});

test("solo ADMIN supera l'autorizzazione di Gestione utenti", async () => {
  const { requireAdmin } = await loadWorker();
  assert.equal(requireAdmin({ role: "ADMIN" }), null);
  const denied = requireAdmin({ role: "ISTRUTTORE" });
  assert.equal(denied.status, 403);
});

test("sessione e cronologia espongono soltanto metadati account consentiti", async () => {
  const { publicUser, publicEmploymentPeriods } = await loadWorker();
  const user = publicUser({
    id: "user-id", username: "utente", name: "Utente Fittizio", role: "ISTRUTTORE",
    active: 1, created_at: "created", updated_at: "updated",
    employment_type: "PART_TIME", employment_effective_from: "2026-08-31",
    scheduled_employment_type: "FULL_TIME", scheduled_employment_effective_from: "2026-09-07"
  });
  assert.deepEqual(Object.keys(user).sort(), [
    "active", "createdAt", "employmentEffectiveFrom", "employmentType", "id", "name", "role",
    "scheduledEmploymentEffectiveFrom", "scheduledEmploymentType", "updatedAt", "username"
  ]);
  assert.deepEqual(publicEmploymentPeriods([
    { employment_type: "PART_TIME", effective_from: "2026-08-31" },
    { employment_type: "FULL_TIME", effective_from: "2026-09-07" }
  ]), [
    { employmentType: "PART_TIME", effectiveFrom: "2026-08-31" },
    { employmentType: "FULL_TIME", effectiveFrom: "2026-09-07" }
  ]);
});

test("Gestione utenti richiede tipo e decorrenza per i nuovi account", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const client = fs.readFileSync(path.join(root, "auth-client.js"), "utf8");
  assert.match(html, /id="newUserEmploymentType"[^>]*required/);
  assert.match(html, /id="newUserEmploymentEffectiveFrom"[^>]*required/);
  assert.match(client, /employmentType:\s*document\.getElementById\("newUserEmploymentType"\)\.value/);
  assert.match(client, /employmentEffectiveFrom:\s*document\.getElementById\("newUserEmploymentEffectiveFrom"\)\.value/);
});

test("la modifica del tipo lavorativo usa scelte touch e conserva il payload API", () => {
  const client = fs.readFileSync(path.join(root, "auth-client.js"), "utf8");
  const start = client.indexOf("async function changeEmployment");
  const end = client.indexOf("function userRow", start);
  const body = client.slice(start, end);
  assert.match(body, /window\.chooseAction/);
  assert.match(body, /label: "PART TIME", value: "PART_TIME"/);
  assert.match(body, /label: "FULL TIME", value: "FULL_TIME"/);
  assert.match(body, /label: "ANNULLA", value: ""/);
  assert.doesNotMatch(body, /prompt\("Tipo lavorativo/);
  assert.match(body, /if \(!employmentType\) return;/);
  assert.match(body, /prompt\("Decorrenza \(YYYY-MM-DD\)/);
  assert.match(body, /update\(user\.id, \{ employmentType, employmentEffectiveFrom \}\)/);
});

test("le API utenti applicano il controllo ADMIN prima delle modifiche", () => {
  const worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");
  for (const functionName of ["createUser", "updateUser", "listUsers"]) {
    const start = worker.indexOf(`async function ${functionName}`);
    const body = worker.slice(start, start + 300);
    assert.match(body, /requireAdmin\(admin\)/);
  }
});
