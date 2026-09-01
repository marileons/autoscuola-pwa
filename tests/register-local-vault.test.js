"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const {
  createVault,
  createMemoryStorageFactory
} = require("../register-local-vault.js");

function fixture(options = {}) {
  const storageFactory = createMemoryStorageFactory();
  let clearCount = 0;
  const vault = createVault({
    cryptoApi: webcrypto,
    storageFactory,
    clearSensitive: () => { clearCount += 1; },
    kdfIterations: 1000,
    ...options
  });
  return { vault, storageFactory, clearCount: () => clearCount };
}

function fakeClock() {
  let current = 1000000;
  let sequence = 0;
  const timers = new Map();
  return {
    now: () => current,
    setTimer(handler, delay) {
      const id = ++sequence;
      timers.set(id, { handler, at: current + delay });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    async advance(milliseconds) {
      current += milliseconds;
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= current);
      for (const [id, timer] of due) {
        timers.delete(id);
        await timer.handler();
      }
    }
  };
}

async function openNew(vault, accountId, pin = "1234") {
  const active = await vault.activate(accountId);
  const setup = await vault.setupPin(pin, pin);
  return { ...active, recoveryCode: setup.recoveryCode };
}

async function fiveWrongPins(vault) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(() => vault.unlock("9999"), /PIN/);
  }
  return vault.pinLockStatus();
}

test("ogni ID account genera un database locale distinto e opaco", async () => {
  const { vault, storageFactory } = fixture();
  const first = await vault.activate("account-fittizio-A");
  await vault.lock();
  const second = await vault.activate("account-fittizio-B");
  assert.notEqual(first.databaseName, second.databaseName);
  assert.match(first.databaseName, /^agenda-register-v1-[A-Za-z0-9_-]{32}$/);
  assert.ok(!first.databaseName.includes("account-fittizio-A"));
  assert.deepEqual(storageFactory.names().sort(), [first.databaseName, second.databaseName].sort());
});

test("due account nello stesso dispositivo non vedono i rispettivi record", async () => {
  const { vault } = fixture();
  await openNew(vault, "account-fittizio-A", "1111");
  await vault.putRecord("giorno-1", { date: "2099-01-05", minutes: 120, note: "DATO SEGRETO A" });
  assert.equal((await vault.getRecord("giorno-1")).note, "DATO SEGRETO A");
  await openNew(vault, "account-fittizio-B", "2222");
  assert.equal(await vault.getRecord("giorno-1"), null);
  await vault.putRecord("giorno-1", { date: "2099-01-05", minutes: 30, note: "DATO SEGRETO B" });
  assert.equal((await vault.getRecord("giorno-1")).note, "DATO SEGRETO B");
  await vault.activate("account-fittizio-A");
  await vault.unlock("1111");
  assert.equal((await vault.getRecord("giorno-1")).note, "DATO SEGRETO A");
});

test("i record sono cifrati AES-GCM e il testo non compare nell'archivio", async () => {
  const { vault, storageFactory } = fixture();
  const active = await openNew(vault, "account-fittizio-A");
  await vault.putRecord("registro-1", {
    category: "LG/A",
    minutes: 75,
    compensationCents: 1234,
    note: "CONTENUTO ECONOMICO RISERVATO"
  });
  const stored = storageFactory.inspect(active.databaseName, "records");
  assert.equal(stored.length, 1);
  assert.equal(stored[0].version, 1);
  assert.equal(Buffer.from(stored[0].iv, "base64").length, 12);
  assert.ok(stored[0].ciphertext.length > 20);
  const serialized = JSON.stringify(stored);
  assert.ok(!serialized.includes("CONTENUTO ECONOMICO RISERVATO"));
  assert.ok(!serialized.includes("compensationCents"));
  assert.ok(!serialized.includes("1234"));
});

test("ogni account usa una DEK casuale avvolta dal proprio PIN", async () => {
  const { vault, storageFactory } = fixture();
  const first = await openNew(vault, "account-fittizio-A", "1111");
  const firstMeta = storageFactory.inspect(first.databaseName, "meta");
  await openNew(vault, "account-fittizio-B", "2222");
  const second = vault.status();
  const secondMeta = storageFactory.inspect(second.databaseName, "meta");
  const firstSecurity = firstMeta.find((item) => item?.pinWrappedDek);
  const secondSecurity = secondMeta.find((item) => item?.pinWrappedDek);
  assert.notEqual(firstSecurity.pinWrappedDek.ciphertext, secondSecurity.pinWrappedDek.ciphertext);
  assert.ok(!JSON.stringify(firstMeta).includes("1111"));
  assert.ok(!JSON.stringify(secondMeta).includes("2222"));
});

test("revisioni cifrate restano associate al record corretto", async () => {
  const { vault, storageFactory } = fixture();
  const active = await openNew(vault, "account-fittizio-A");
  await vault.appendRevision("giorno-1", "rev-1", { revision: 1, minutes: 60, reason: "Prima versione" });
  await vault.appendRevision("giorno-1", "rev-2", { revision: 2, minutes: 90, reason: "Correzione fittizia" });
  await vault.appendRevision("giorno-2", "rev-3", { revision: 1, minutes: 30 });
  assert.deepEqual((await vault.listRevisions("giorno-1")).map((item) => item.minutes), [60, 90]);
  const raw = JSON.stringify(storageFactory.inspect(active.databaseName, "revisions"));
  assert.ok(!raw.includes("Correzione fittizia"));
  assert.ok(!raw.includes("giorno-1"));
});

test("snapshot sostituisce record e revisioni insieme mantenendoli cifrati", async () => {
  const { vault, storageFactory } = fixture();
  const active = await openNew(vault, "account-fittizio-snapshot");
  await vault.putRecord("precedente", { note: "DA SOSTITUIRE" });
  await vault.replaceSnapshot({
    schemaVersion: 1,
    records: [{ recordId: "nuovo", payload: { note: "NUOVO CONTENUTO" } }],
    revisions: [{ recordId: "nuovo", revisionId: "nuovo:1", revision: { reason: "REVISIONE NUOVA" } }]
  });
  assert.equal(await vault.getRecord("precedente"), null);
  assert.deepEqual(await vault.getRecord("nuovo"), { note: "NUOVO CONTENUTO" });
  assert.deepEqual(await vault.listRevisions("nuovo"), [{ reason: "REVISIONE NUOVA" }]);
  const raw = JSON.stringify({
    records: storageFactory.inspect(active.databaseName, "records"),
    revisions: storageFactory.inspect(active.databaseName, "revisions")
  });
  assert.ok(!raw.includes("NUOVO CONTENUTO"));
  assert.ok(!raw.includes("REVISIONE NUOVA"));
});

test("cancellazione completa elimina dati e sicurezza solo dal vault attivo", async () => {
  const { vault, storageFactory } = fixture();
  const first = await openNew(vault, "account-fittizio-cancella-A", "1111");
  const recoveryA = first.recoveryCode;
  await vault.putRecord("giorno-a", { owner: "A" });
  await vault.appendRevision("giorno-a", "giorno-a:1", { owner: "A", revision: 1 });
  await openNew(vault, "account-fittizio-cancella-B", "2222");
  await vault.putRecord("giorno-b", { owner: "B" });
  await vault.activate("account-fittizio-cancella-A"); await vault.unlock("1111");
  await vault.destroyAll("1111");
  assert.equal(vault.status().active, false); assert.equal(vault.status().unlocked, false);
  const reopened = await vault.activate("account-fittizio-cancella-A");
  assert.equal(reopened.requiresPinSetup, true);
  await assert.rejects(() => vault.recover(recoveryA, "3333", "3333"), /PIN non disponibile|PIN/);
  assert.deepEqual(storageFactory.inspect(reopened.databaseName, "meta"), []);
  assert.deepEqual(storageFactory.inspect(reopened.databaseName, "records"), []);
  assert.deepEqual(storageFactory.inspect(reopened.databaseName, "revisions"), []);
  await vault.activate("account-fittizio-cancella-B"); await vault.unlock("2222");
  assert.deepEqual(await vault.getRecord("giorno-b"), { owner: "B" });
});

test("PIN errato non cancella alcun dato del vault", async () => {
  const { vault } = fixture(); await openNew(vault, "account-fittizio-cancella", "1111");
  await vault.putRecord("preserva", { value: "INTATTO" });
  await assert.rejects(() => vault.destroyAll("9999"), /PIN/);
  assert.deepEqual(await vault.getRecord("preserva"), { value: "INTATTO" });
  assert.equal(vault.status().unlocked, true);
});

test("logout o cambio identità elimina la chiave runtime e blocca l'accesso", async () => {
  const state = fixture();
  await openNew(state.vault, "account-fittizio-A", "1111");
  await state.vault.putRecord("giorno-1", { minutes: 60 });
  const clearsBeforeLock = state.clearCount();
  await state.vault.lock();
  assert.equal(state.vault.status().unlocked, false);
  assert.equal(state.clearCount(), clearsBeforeLock + 1);
  await assert.rejects(() => state.vault.getRecord("giorno-1"), /chiuso/);
  await state.vault.activate("account-fittizio-A");
  await state.vault.unlock("1111");
  assert.deepEqual(await state.vault.getRecord("giorno-1"), { minutes: 60 });
  const clearsBeforeSwitch = state.clearCount();
  await openNew(state.vault, "account-fittizio-B", "2222");
  assert.ok(state.clearCount() > clearsBeforeSwitch);
  assert.equal(await state.vault.getRecord("giorno-1"), null);
});

test("attivazioni concorrenti non possono riaprire l'identità precedente", async () => {
  const memory = createMemoryStorageFactory();
  let openCount = 0;
  const delayedStorage = {
    async open(name) {
      openCount += 1;
      const backend = await memory.open(name);
      if (openCount === 1) await new Promise((resolve) => setTimeout(resolve, 25));
      return backend;
    }
  };
  const vault = createVault({
    cryptoApi: webcrypto, storageFactory: delayedStorage, clearSensitive() {}, kdfIterations: 1000
  });
  const first = vault.activate("account-fittizio-A");
  await new Promise((resolve) => setTimeout(resolve, 1));
  const second = vault.activate("account-fittizio-B");
  const [firstResult, secondResult] = await Promise.allSettled([first, second]);
  assert.equal(firstResult.status, "rejected");
  assert.equal(secondResult.status, "fulfilled");
  assert.equal(vault.status().databaseName, secondResult.value.databaseName);
  await vault.setupPin("2222", "2222");
  await vault.putRecord("solo-b", { owner: "B" });
  assert.deepEqual(await vault.getRecord("solo-b"), { owner: "B" });
});

test("prima apertura richiede PIN confermato e mostra recovery una sola volta", async () => {
  const { vault, storageFactory } = fixture();
  const active = await vault.activate("account-fittizio-PIN");
  assert.equal(active.requiresPinSetup, true);
  assert.equal(vault.status().unlocked, false);
  await assert.rejects(() => vault.setupPin("1234", "4321"), /conferma/);
  const setup = await vault.setupPin("1234", "1234");
  assert.match(setup.recoveryCode, /^(?:[0-9A-F]{8}-){7}[0-9A-F]{8}$/);
  await assert.rejects(() => vault.setupPin("1234", "1234"), /già configurato/);
  const rawMeta = JSON.stringify(storageFactory.inspect(active.databaseName, "meta"));
  assert.ok(!rawMeta.includes("1234"));
  assert.ok(!rawMeta.includes(setup.recoveryCode));
  assert.ok(!rawMeta.includes(setup.recoveryCode.replaceAll("-", "")));
});

test("cambio PIN richiede quello corrente e invalida il precedente", async () => {
  const { vault } = fixture();
  await openNew(vault, "account-fittizio-A", "1234");
  await vault.putRecord("record", { value: "conservato" });
  await assert.rejects(() => vault.changePin("9999", "5678", "5678"), /PIN/);
  await vault.changePin("1234", "5678", "5678");
  await vault.lock();
  await vault.activate("account-fittizio-A");
  await assert.rejects(() => vault.unlock("1234"), /PIN/);
  await vault.unlock("5678");
  assert.deepEqual(await vault.getRecord("record"), { value: "conservato" });
});

test("recovery code sblocca la DEK e permette un nuovo PIN", async () => {
  const { vault } = fixture();
  const setup = await openNew(vault, "account-fittizio-A", "1234");
  await vault.putRecord("record", { value: "dato fittizio" });
  await vault.lock();
  await vault.activate("account-fittizio-A");
  await assert.rejects(() => vault.recover("CODICE-ERRATO", "5678", "5678"), /recupero/);
  await vault.recover(setup.recoveryCode, "5678", "5678");
  assert.deepEqual(await vault.getRecord("record"), { value: "dato fittizio" });
  await vault.lock();
  await vault.activate("account-fittizio-A");
  await vault.unlock("5678");
});

test("senza PIN e recovery non esiste recupero amministrativo locale", async () => {
  const { vault } = fixture();
  await openNew(vault, "account-fittizio-A", "1234");
  await vault.putRecord("record", { value: "irrecuperabile senza segreti" });
  await vault.lock();
  await vault.activate("account-fittizio-A");
  await assert.rejects(() => vault.unlock("0000"), /PIN/);
  await assert.rejects(() => vault.recover("0".repeat(64), "5678", "5678"), /recupero/);
  assert.ok(!Object.keys(vault).some((name) => /admin|reset|bypass/i.test(name)));
  await assert.rejects(() => vault.getRecord("record"), /chiuso/);
});

test("progressione locale PIN: 5 minuti, 15 minuti, poi 30 minuti", async () => {
  const clock = fakeClock();
  const { vault } = fixture({
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer
  });
  await openNew(vault, "account-fittizio-A", "1234");
  await vault.lock();
  await vault.activate("account-fittizio-A");

  let status = await fiveWrongPins(vault);
  assert.equal(status.lockLevel, 1);
  assert.equal(status.remainingMs, 5 * 60 * 1000);
  await assert.rejects(() => vault.unlock("1234"), (error) => error.code === "PIN_LOCKED");
  await clock.advance(5 * 60 * 1000);

  status = await fiveWrongPins(vault);
  assert.equal(status.lockLevel, 2);
  assert.equal(status.remainingMs, 15 * 60 * 1000);
  await clock.advance(15 * 60 * 1000);

  status = await fiveWrongPins(vault);
  assert.equal(status.lockLevel, 3);
  assert.equal(status.remainingMs, 30 * 60 * 1000);
  await clock.advance(30 * 60 * 1000);

  status = await fiveWrongPins(vault);
  assert.equal(status.lockLevel, 3);
  assert.equal(status.remainingMs, 30 * 60 * 1000);
});

test("PIN corretto azzera tentativi e progressione", async () => {
  const clock = fakeClock();
  const { vault } = fixture({
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer
  });
  await openNew(vault, "account-fittizio-A", "1234");
  await vault.lock();
  await vault.activate("account-fittizio-A");
  await fiveWrongPins(vault);
  await clock.advance(5 * 60 * 1000);
  await vault.unlock("1234");
  assert.deepEqual(await vault.pinLockStatus(), {
    locked: false, lockedUntil: 0, remainingMs: 0, failedAttempts: 0, lockLevel: 0
  });
  await vault.lock();
  await vault.activate("account-fittizio-A");
  const status = await fiveWrongPins(vault);
  assert.equal(status.lockLevel, 1);
  assert.equal(status.remainingMs, 5 * 60 * 1000);
});

test("cinque minuti di inattività bloccano e touch riavvia il conteggio", async () => {
  const clock = fakeClock();
  const { vault } = fixture({
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    inactivityMs: 5 * 60 * 1000
  });
  await openNew(vault, "account-fittizio-A", "1234");
  await clock.advance(4 * 60 * 1000);
  assert.equal(vault.status().unlocked, true);
  vault.touch();
  await clock.advance(4 * 60 * 1000);
  assert.equal(vault.status().unlocked, true);
  await clock.advance(60 * 1000);
  assert.equal(vault.status().unlocked, false);
});

test("il modulo locale non usa rete, localStorage o sessionStorage", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "register-local-vault.js"), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test("il client chiude il vault al logout e lo attiva solo con l'ID autenticato", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "auth-client.js"), "utf8");
  assert.match(source, /RegisterLocalVault\.activate\(currentUser\.id\)/);
  assert.match(source, /async function logout[\s\S]*?await lockRegisterVault\(\);[\s\S]*?applyUser\(null\)/);
  assert.match(source, /visibilitychange[\s\S]*?document\.hidden[\s\S]*?lockRegisterVault/);
  assert.match(source, /pagehide[\s\S]*?lockRegisterVault/);
  assert.match(source, /AgendaAuth\s*=\s*\{[\s\S]*?lockRegisterVault/);
  assert.doesNotMatch(source, /RegisterLocalVault\.activate\([^)]*(username|name)/);
});
