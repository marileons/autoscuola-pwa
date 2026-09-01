"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const { createVault, createMemoryStorageFactory } = require("../register-local-vault.js");
const { createLedger } = require("../register-ledger.js");

const baseRates = {
  categories: { "LG/A": 1000, "LG/M": 1200, "M/SE": 1300, GOLD: 1500, EX: 1400, VARIE: 900 },
  overtime: 1500
};

async function fixture(employmentPeriods) {
  const storageFactory = createMemoryStorageFactory();
  const vault = createVault({
    cryptoApi: webcrypto,
    storageFactory,
    clearSensitive() {},
    kdfIterations: 1000
  });
  await vault.activate("account-ledger-fittizio");
  await vault.setupPin("1234", "1234");
  let sequence = 0;
  const ledger = createLedger({
    vault,
    employmentPeriods,
    now: () => "2099-01-01T12:00:00.000Z",
    idFactory: () => `id-${++sequence}`
  });
  return { vault, ledger, storageFactory };
}

const partTime = [{ employmentType: "PART_TIME", effectiveFrom: "2099-01-05" }];
const fullTime = [{ employmentType: "FULL_TIME", effectiveFrom: "2099-01-05" }];

test("giornata locale conserva blocchi ordinati, note e fotografia tariffaria", async () => {
  const { ledger } = await fixture(partTime);
  const rate = await ledger.createRateVersion({ effectiveFrom: "2099-01-05", rates: baseRates });
  const day = await ledger.saveDay({
    date: "2099-01-05",
    note: "  Nota fittizia  ",
    blocks: [
      { id: "blocco-2", order: 2, category: "GOLD", minutes: 30 },
      { id: "blocco-1", order: 1, category: "LG/A", minutes: 60 }
    ]
  });
  assert.equal(day.note, "Nota fittizia");
  assert.deepEqual(day.blocks.map((block) => block.id), ["blocco-1", "blocco-2"]);
  assert.ok(day.blocks.every((block) => block.rateVersionId === rate.id));
  assert.deepEqual(day.blocks[0].rateSnapshot, baseRates);
  assert.equal(day.employmentType, "PART_TIME");
  assert.equal(day.employmentEffectiveFrom, "2099-01-05");
});

test("non è possibile inserire giornate precedenti alla prima decorrenza", async () => {
  const { ledger } = await fixture(partTime);
  await ledger.createRateVersion({ effectiveFrom: "2099-01-01", rates: baseRates });
  await assert.rejects(() => ledger.saveDay({
    date: "2099-01-04",
    blocks: [{ category: "LG/A", minutes: 60, order: 1 }]
  }), /precede la prima decorrenza/);
});

test("PART TIME ammette le categorie lavoro e rifiuta P/F", async () => {
  const { ledger } = await fixture(partTime);
  await ledger.createRateVersion({ effectiveFrom: "2099-01-05", rates: baseRates });
  await ledger.saveDay({
    date: "2099-01-05",
    blocks: [
      { order: 1, category: "LG/A", minutes: 60 },
      { order: 2, category: "LG/M", minutes: 60 },
      { order: 3, category: "M/SE", minutes: 60 },
      { order: 4, category: "GOLD", minutes: 60 },
      { order: 5, category: "EX", minutes: 60 },
      { order: 6, category: "VARIE", minutes: 60 }
    ]
  });
  await assert.rejects(() => ledger.saveDay({
    date: "2099-01-06",
    blocks: [{ order: 1, category: "P", minutes: 60 }]
  }), /soltanto per FULL TIME/);
});

test("FULL TIME applica P/F e la regola definitiva 40 lavoro più 4 P", async () => {
  const { ledger } = await fixture(fullTime);
  await ledger.createRateVersion({ effectiveFrom: "2099-01-05", rates: baseRates });
  for (let offset = 0; offset < 5; offset += 1) {
    const date = new Date(Date.UTC(2099, 0, 5 + offset)).toISOString().slice(0, 10);
    await ledger.saveDay({
      date,
      blocks: [{ id: `lavoro-${offset}`, order: 1, category: "LG/A", minutes: 8 * 60 }]
    });
  }
  await ledger.saveDay({
    date: "2099-01-10",
    blocks: [{ id: "permesso", order: 1, category: "P", minutes: 4 * 60 }]
  });
  const result = await ledger.calculateWeek("2099-01-05");
  assert.deepEqual([
    result.totals.ordinaryWorkMinutes,
    result.totals.overtimeMinutes,
    result.totals.absenceRecordedMinutes,
    result.totals.absencePaidMinutes,
    result.totals.totalAmountCents
  ], [2340, 60, 240, 0, 40500]);
});

test("ricalcolo PART TIME usa il motore economico condiviso", async () => {
  const { ledger } = await fixture(partTime);
  await ledger.createRateVersion({ effectiveFrom: "2099-01-05", rates: baseRates });
  await ledger.saveDay({
    date: "2099-01-05",
    blocks: [
      { order: 1, category: "LG/A", minutes: 120 },
      { order: 2, category: "LG/M", minutes: 90 }
    ]
  });
  const result = await ledger.calculateWeek("2099-01-05");
  assert.equal(result.employmentType, "PART_TIME");
  assert.equal(result.totals.workMinutes, 210);
  assert.equal(result.totals.totalAmountCents, 3800);
});

test("versioni tariffarie si applicano per data senza reinterpretare blocchi salvati", async () => {
  const { ledger } = await fixture(partTime);
  const oldVersion = await ledger.createRateVersion({ effectiveFrom: "2099-01-05", rates: baseRates });
  await ledger.saveDay({
    date: "2099-01-05",
    blocks: [{ id: "vecchio", order: 1, category: "LG/M", minutes: 60 }]
  });
  const newRates = {
    categories: { "LG/A": 1100, "LG/M": 1400, "M/SE": 1500, GOLD: 1700, EX: 1600, VARIE: 950 },
    overtime: 1800
  };
  const newVersion = await ledger.createRateVersion({ effectiveFrom: "2099-01-07", rates: newRates });
  await ledger.saveDay({
    date: "2099-01-07",
    blocks: [{ id: "nuovo", order: 1, category: "LG/M", minutes: 60 }]
  });
  const monday = await ledger.getDay("2099-01-05");
  const wednesday = await ledger.getDay("2099-01-07");
  assert.equal(monday.blocks[0].rateVersionId, oldVersion.id);
  assert.equal(wednesday.blocks[0].rateVersionId, newVersion.id);
  assert.equal((await ledger.calculateWeek("2099-01-05")).totals.totalAmountCents, 2600);
});

test("ogni correzione crea una revisione locale completa e non silenziosa", async () => {
  const { ledger } = await fixture(partTime);
  await ledger.createRateVersion({ effectiveFrom: "2099-01-05", rates: baseRates });
  const first = await ledger.saveDay({
    date: "2099-01-05",
    note: "Prima versione",
    blocks: [{ id: "blocco", order: 1, category: "LG/A", minutes: 60 }]
  });
  const second = await ledger.saveDay({
    date: "2099-01-05",
    note: "Versione corretta",
    revisionReason: "Correzione durata fittizia",
    blocks: [{ id: "blocco", order: 1, category: "LG/A", minutes: 90 }]
  });
  assert.equal(first.revision, 1);
  assert.equal(second.revision, 2);
  const revisions = await ledger.listDayRevisions("2099-01-05");
  assert.deepEqual(revisions.map((revision) => revision.revision), [1, 2]);
  assert.deepEqual(revisions.map((revision) => revision.snapshot.blocks[0].minutes), [60, 90]);
  assert.equal(revisions[1].reason, "Correzione durata fittizia");
  assert.equal(second.blocks[0].rateVersionId, first.blocks[0].rateVersionId);
});

test("il cambio PART TIME/FULL TIME vale solo dalla nuova settimana", async () => {
  const periods = [
    { employmentType: "PART_TIME", effectiveFrom: "2099-01-05" },
    { employmentType: "FULL_TIME", effectiveFrom: "2099-01-12" }
  ];
  const { ledger } = await fixture(periods);
  await ledger.createRateVersion({ effectiveFrom: "2099-01-05", rates: baseRates });
  await assert.rejects(() => ledger.saveDay({
    date: "2099-01-11",
    blocks: [{ order: 1, category: "F", minutes: 60 }]
  }), /FULL TIME/);
  const fullDay = await ledger.saveDay({
    date: "2099-01-12",
    blocks: [{ order: 1, category: "F", minutes: 7 * 60 }]
  });
  assert.equal(fullDay.employmentType, "FULL_TIME");
  assert.equal((await ledger.calculateWeek("2099-01-12")).totals.absencePaidMinutes, 420);
});

test("ordine duplicato, tariffa mancante e decorrenza tariffaria duplicata sono rifiutati", async () => {
  const { ledger } = await fixture(partTime);
  await assert.rejects(() => ledger.saveDay({
    date: "2099-01-05",
    blocks: [{ order: 1, category: "LG/A", minutes: 60 }]
  }), /Nessuna tariffa/);
  await ledger.createRateVersion({ effectiveFrom: "2099-01-05", rates: baseRates });
  await assert.rejects(() => ledger.createRateVersion({
    effectiveFrom: "2099-01-05", rates: baseRates
  }), /già una versione/);
  await assert.rejects(() => ledger.saveDay({
    date: "2099-01-05",
    blocks: [
      { order: 1, category: "LG/A", minutes: 60 },
      { order: 1, category: "LG/M", minutes: 60 }
    ]
  }), /Ordine blocco duplicato/);
});

test("servizio Registro non usa rete né storage esterni al vault", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "register-ledger.js"), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /\/api\//);
});
