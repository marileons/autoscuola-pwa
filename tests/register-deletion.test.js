"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const { createVault, createMemoryStorageFactory } = require("../register-local-vault.js");
const { createLedger } = require("../register-ledger.js");
const { createBackupService } = require("../register-backup.js");
const { createDeletionService, DELETE_ALL_PHRASE } = require("../register-deletion.js");

const source = fs.readFileSync(path.join(__dirname, "..", "register-deletion.js"), "utf8");
const PERIODS = [{ employmentType: "FULL_TIME", effectiveFrom: "2026-08-31" }];
const RATES = { categories: { "LG/A": 1200, "LG/M": 1400, "M/SE": 1500, GOLD: 1900, EX: 1600, VARIE: 1100 }, overtime: 1600 };
const BACKUP_PASSWORD = "Password-Backup-Fittizia-2026";

function makeVault(storageFactory = createMemoryStorageFactory()) {
  return createVault({ cryptoApi: webcrypto, storageFactory, clearSensitive() {}, kdfIterations: 1000 });
}
async function setup(vault, accountId, pin = "1234") {
  const active = await vault.activate(accountId);
  const configured = active.requiresPinSetup ? await vault.setupPin(pin, pin) : (await vault.unlock(pin), null);
  let sequence = 0;
  const ledger = createLedger({ vault, employmentPeriods: PERIODS, now: () => "2026-09-30T12:00:00.000Z", idFactory: () => `fake-${accountId}-${++sequence}` });
  if (!(await ledger.listRateVersions()).length) await ledger.createRateVersion({ id: `rate-${accountId}`, effectiveFrom: "2026-08-31", rates: RATES });
  return { active, recoveryCode: configured?.recoveryCode, ledger, deletion: createDeletionService({ vault }) };
}
async function day(ledger, date, minutes, note) {
  await ledger.saveDay({ date, note, blocks: [{ order: 1, category: "LG/A", minutes }], revisionReason: "CREAZIONE FITTIZIA" });
}

test("cancellazione periodo rimuove solo giornate e revisioni selezionate", async () => {
  const vault = makeVault(); const state = await setup(vault, "account-periodo");
  await day(state.ledger, "2026-09-01", 60, "Da conservare");
  await day(state.ledger, "2026-09-10", 120, "Da eliminare");
  await state.ledger.saveDay({ date: "2026-09-10", note: "Correzione da eliminare", blocks: [{ order: 1, category: "LG/A", minutes: 180 }], revisionReason: "CORREZIONE FITTIZIA" });
  await day(state.ledger, "2026-09-20", 240, "Da conservare dopo");
  const preview = await state.deletion.inspectPeriod("2026-09-05", "2026-09-15");
  assert.deepEqual(preview, { start: "2026-09-05", end: "2026-09-15", days: 1, blocks: 1, revisions: 2, minutes: 180 });
  const removed = await state.deletion.deletePeriod("2026-09-05", "2026-09-15");
  assert.deepEqual(removed, preview);
  assert.equal(await state.ledger.getDay("2026-09-10"), null);
  assert.ok(await state.ledger.getDay("2026-09-01")); assert.ok(await state.ledger.getDay("2026-09-20"));
  assert.equal((await state.ledger.listRateVersions()).length, 1);
  const snapshot = await vault.exportSnapshot();
  assert.ok(snapshot.revisions.every((revision) => revision.recordId !== `fake-account-periodo-3`));
});

test("errore durante sostituzione non produce una cancellazione parziale", async () => {
  const original = { schemaVersion: 1, records: [{ recordId: "day:2026-09-10", payload: { kind: "day", id: "day-1", date: "2026-09-10", blocks: [{ minutes: 60 }] } }, { recordId: "rate:r1", payload: { kind: "rateVersion", id: "r1" } }], revisions: [{ recordId: "day-1", revisionId: "day-1:1", revision: {} }] };
  let current = structuredClone(original);
  const service = createDeletionService({ vault: {
    async exportSnapshot() { return structuredClone(current); },
    async replaceSnapshot() { throw new Error("Errore transazione simulato"); },
    async destroyAll() {}
  } });
  await assert.rejects(() => service.deletePeriod("2026-09-10", "2026-09-10"), /simulato/);
  assert.deepEqual(current, original);
});

test("cancellazione completa richiede frase e PIN e isola gli account", async () => {
  const storage = createMemoryStorageFactory(), vault = makeVault(storage);
  const accountA = await setup(vault, "account-A", "1111"); await day(accountA.ledger, "2026-09-01", 60, "A");
  const accountB = await setup(vault, "account-B", "2222"); await day(accountB.ledger, "2026-09-02", 90, "B");
  await vault.activate("account-A"); await vault.unlock("1111");
  const deletionA = createDeletionService({ vault });
  await assert.rejects(() => deletionA.deleteAll({ pin: "1111", phrase: "frase errata" }), /Frase/);
  await assert.rejects(() => deletionA.deleteAll({ pin: "9999", phrase: DELETE_ALL_PHRASE }), /PIN/);
  assert.ok((await vault.listRecords()).some((record) => record.kind === "day"));
  await deletionA.deleteAll({ pin: "1111", phrase: DELETE_ALL_PHRASE });
  const freshA = await vault.activate("account-A"); assert.equal(freshA.requiresPinSetup, true);
  await vault.activate("account-B"); await vault.unlock("2222");
  assert.equal((await vault.getRecord("day:2026-09-02")).note, "B");
});

test("vecchio PIN e recovery decadono, ma il backup airb resta ripristinabile", async () => {
  const vault = makeVault(); const before = await setup(vault, "account-backup", "1111");
  await day(before.ledger, "2026-09-01", 120, "Ripristinabile");
  const backup = createBackupService({ vault, cryptoApi: webcrypto, kdfIterations: 1000, now: () => "2026-09-02T10:00:00.000Z" });
  const file = await backup.exportBackup("account-backup", BACKUP_PASSWORD);
  await before.deletion.deleteAll({ pin: "1111", phrase: DELETE_ALL_PHRASE });
  const fresh = await vault.activate("account-backup"); assert.equal(fresh.requiresPinSetup, true);
  await assert.rejects(() => vault.unlock("1111"), /PIN non ancora configurato/);
  await assert.rejects(() => vault.recover(before.recoveryCode, "3333", "3333"), /PIN non disponibile/);
  await vault.setupPin("3333", "3333");
  const restored = await createBackupService({ vault, cryptoApi: webcrypto, kdfIterations: 1000 }).restoreBackup("account-backup", BACKUP_PASSWORD, file.content);
  assert.equal(restored.records, 2); assert.equal((await vault.getRecord("day:2026-09-01")).note, "Ripristinabile");
});

test("il modulo cancellazione non usa rete, D1 o storage esterni al vault", () => {
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|\bD1\b/);
});
