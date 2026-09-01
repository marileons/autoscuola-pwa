"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const { createVault, createMemoryStorageFactory } = require("../register-local-vault.js");
const { createBackupService, FORMAT, VERSION } = require("../register-backup.js");

const PASSWORD = "Password-Fittizia-Backup-2026";
const ACCOUNT_A = "account-fittizio-stabile-A";
const ACCOUNT_B = "account-fittizio-stabile-B";
const backupSource = fs.readFileSync(path.join(__dirname, "..", "register-backup.js"), "utf8");

function newVault(storageFactory = createMemoryStorageFactory()) {
  return {
    storageFactory,
    vault: createVault({ cryptoApi: webcrypto, storageFactory, clearSensitive() {}, kdfIterations: 1000 })
  };
}
async function open(vault, accountId, pin) {
  const state = await vault.activate(accountId);
  if (state.requiresPinSetup) await vault.setupPin(pin, pin);
  else await vault.unlock(pin);
}
function rates() {
  return { categories: { "LG/A": 1200, "LG/M": 1300, "M/SE": 1450, GOLD: 1800, EX: 1500, VARIE: 1100 }, overtime: 1600 };
}
function day() {
  return {
    kind: "day", schemaVersion: 1, id: "day-demo-1", date: "2099-01-05",
    employmentType: "FULL_TIME", employmentEffectiveFrom: "2099-01-05",
    note: "Nota economica esclusivamente fittizia",
    blocks: [{ id: "block-demo-1", order: 1, category: "LG/A", minutes: 420, rateVersionId: "rate-demo-1", rateSnapshot: rates() }],
    revision: 1, createdAt: "2099-01-05T18:00:00.000Z", updatedAt: "2099-01-05T18:00:00.000Z"
  };
}
function rateVersion() {
  return { kind: "rateVersion", schemaVersion: 1, id: "rate-demo-1", effectiveFrom: "2099-01-05", rates: rates(), createdAt: "2099-01-01T10:00:00.000Z" };
}
async function populate(vault) {
  const savedDay = day();
  await vault.putRecord("rate:rate-demo-1", rateVersion());
  await vault.putRecord("day:2099-01-05", savedDay);
  await vault.appendRevision(savedDay.id, `${savedDay.id}:1`, {
    kind: "dayRevision", schemaVersion: 1, dayId: savedDay.id, date: savedDay.date,
    revision: 1, reason: "CREAZIONE FITTIZIA", createdAt: savedDay.createdAt, snapshot: savedDay
  });
}
function service(vault) {
  return createBackupService({ vault, cryptoApi: webcrypto, kdfIterations: 1000, now: () => "2099-01-06T09:30:00.000Z" });
}

test("backup cifrato contiene formato/versione ma non dati, account o segreti locali", async () => {
  const source = newVault(); await open(source.vault, ACCOUNT_A, "1234"); await populate(source.vault);
  const exported = await service(source.vault).exportBackup(ACCOUNT_A, PASSWORD);
  const container = JSON.parse(exported.content);
  assert.equal(container.format, FORMAT); assert.equal(container.version, VERSION);
  assert.equal(container.crypto.algorithm, "AES-256-GCM"); assert.equal(container.crypto.kdf, "PBKDF2-SHA-256");
  assert.match(exported.filename, /^agenda-registro-backup-2099-01-06\.airb$/);
  for (const forbidden of [ACCOUNT_A, PASSWORD, "1234", "Nota economica", "LG/A", "rate-demo-1", "pinWrappedDek", "recoveryCode", "session"]) {
    assert.ok(!exported.content.includes(forbidden), `dato non cifrato trovato: ${forbidden}`);
  }
});

test("backup e ripristino funzionano su un vault nuovo dello stesso account", async () => {
  const source = newVault(); await open(source.vault, ACCOUNT_A, "1234"); await populate(source.vault);
  const exported = await service(source.vault).exportBackup(ACCOUNT_A, PASSWORD);
  const destination = newVault(); await open(destination.vault, ACCOUNT_A, "9876");
  await destination.vault.putRecord("day:vecchio", { kind: "placeholder" });
  const restored = await service(destination.vault).restoreBackup(ACCOUNT_A, PASSWORD, exported.content);
  assert.deepEqual(restored, { records: 2, revisions: 1, createdAt: "2099-01-06T09:30:00.000Z" });
  assert.equal((await destination.vault.listRecords()).length, 2);
  assert.equal((await destination.vault.getRecord("day:2099-01-05")).note, "Nota economica esclusivamente fittizia");
  assert.equal((await destination.vault.listRevisions("day-demo-1")).length, 1);
  assert.equal(await destination.vault.getRecord("day:vecchio"), null);
  await destination.vault.lock(); await destination.vault.activate(ACCOUNT_A); await destination.vault.unlock("9876");
  assert.equal((await destination.vault.getRecord("day:2099-01-05")).blocks[0].minutes, 420);
});

test("password errata rifiuta il file senza modificare il Registro esistente", async () => {
  const source = newVault(); await open(source.vault, ACCOUNT_A, "1234"); await populate(source.vault);
  const exported = await service(source.vault).exportBackup(ACCOUNT_A, PASSWORD);
  const target = newVault(); await open(target.vault, ACCOUNT_A, "9876"); await target.vault.putRecord("preserva", { value: "INTATTO" });
  await assert.rejects(() => service(target.vault).restoreBackup(ACCOUNT_A, "Password-Sbagliata-000", exported.content), /Password errata oppure file alterato/);
  assert.deepEqual(await target.vault.getRecord("preserva"), { value: "INTATTO" });
});

test("file cifrato manomesso viene rifiutato prima della sostituzione", async () => {
  const source = newVault(); await open(source.vault, ACCOUNT_A, "1234"); await populate(source.vault);
  const exported = await service(source.vault).exportBackup(ACCOUNT_A, PASSWORD);
  const container = JSON.parse(exported.content);
  const index = Math.floor(container.ciphertext.length / 2);
  container.ciphertext = container.ciphertext.slice(0, index) + (container.ciphertext[index] === "A" ? "B" : "A") + container.ciphertext.slice(index + 1);
  const target = newVault(); await open(target.vault, ACCOUNT_A, "9876"); await target.vault.putRecord("preserva", { value: "INTATTO" });
  await assert.rejects(() => service(target.vault).restoreBackup(ACCOUNT_A, PASSWORD, JSON.stringify(container)), /Password errata oppure file alterato/);
  assert.deepEqual(await target.vault.getRecord("preserva"), { value: "INTATTO" });
});

test("backup di un account differente non può essere importato", async () => {
  const source = newVault(); await open(source.vault, ACCOUNT_A, "1234"); await populate(source.vault);
  const exported = await service(source.vault).exportBackup(ACCOUNT_A, PASSWORD);
  const target = newVault(); await open(target.vault, ACCOUNT_B, "9876"); await target.vault.putRecord("preserva", { value: "ACCOUNT B" });
  await assert.rejects(() => service(target.vault).restoreBackup(ACCOUNT_B, PASSWORD, exported.content), /altro account/);
  assert.deepEqual(await target.vault.getRecord("preserva"), { value: "ACCOUNT B" });
});

test("validazione completa precede l'unica operazione atomica di sostituzione", async () => {
  let replaceCalls = 0;
  const vault = {
    async exportSnapshot() { return { schemaVersion: 1, records: [], revisions: [] }; },
    async replaceSnapshot() { replaceCalls += 1; return { records: 0, revisions: 0 }; }
  };
  const valid = await service(vault).exportBackup(ACCOUNT_A, PASSWORD);
  await assert.rejects(() => service(vault).restoreBackup(ACCOUNT_A, "Password-Sbagliata-000", valid.content));
  assert.equal(replaceCalls, 0);
  await service(vault).restoreBackup(ACCOUNT_A, PASSWORD, valid.content);
  assert.equal(replaceCalls, 1);
});

test("il modulo backup non usa rete, D1, localStorage o segreti del PIN", () => {
  assert.doesNotMatch(backupSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|\bD1\b/);
  assert.doesNotMatch(backupSource, /pinSecurity|pinWrappedDek|recoveryWrappedDek|deviceWrappingKey|sessionToken/);
});
