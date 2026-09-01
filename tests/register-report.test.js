"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const { createVault, createMemoryStorageFactory } = require("../register-local-vault.js");
const { createLedger } = require("../register-ledger.js");
const { createReportService, renderHtml, formatMoney, formatMinutes } = require("../register-report.js");

const reportSource = fs.readFileSync(path.join(__dirname, "..", "register-report.js"), "utf8");
const PERIODS = [{ employmentType: "FULL_TIME", effectiveFrom: "2026-01-05" }];
const RATES = { categories: { "LG/A": 1200, "LG/M": 1400, "M/SE": 1500, GOLD: 1900, EX: 1600, VARIE: 1100 }, overtime: 1600 };

async function fixture(periods = PERIODS) {
  const vault = createVault({ cryptoApi: webcrypto, storageFactory: createMemoryStorageFactory(), clearSensitive() {}, kdfIterations: 1000 });
  await vault.activate("account-report-fittizio"); await vault.setupPin("1234", "1234");
  let sequence = 0;
  const ledger = createLedger({ vault, employmentPeriods: periods, now: () => "2026-02-03T10:30:00.000Z", idFactory: () => `fake-${++sequence}` });
  await ledger.createRateVersion({ id: "tariffa-fittizia", effectiveFrom: "2026-01-05", rates: RATES });
  const reports = createReportService({ ledger, employmentPeriods: periods, now: () => "2026-02-03T12:00:00.000Z" });
  return { vault, ledger, reports };
}
async function save(ledger, date, minutes, category = "LG/A", note = "") {
  return ledger.saveDay({ date, note, blocks: [{ order: 1, category, minutes }], revisionReason: "TEST FITTIZIO" });
}

test("prospetto settimanale espone ore, P/F, componenti, note e revisioni", async () => {
  const { ledger, reports } = await fixture();
  await save(ledger, "2026-01-05", 420, "LG/M", "Nota fittizia settimana");
  await save(ledger, "2026-01-06", 240, "P");
  await save(ledger, "2026-01-05", 480, "LG/M", "Nota corretta fittizia");
  const report = await reports.build({ mode: "week", cursor: "2026-01-07", account: { name: "Mario Demo", username: "mario.demo" } });
  assert.equal(report.kind, "weekly"); assert.deepEqual(report.period, { start: "2026-01-05", end: "2026-01-11", label: "05/01/2026 – 11/01/2026" });
  assert.equal(report.totals.workMinutes, 480); assert.equal(report.totals.absenceRecordedMinutes, 240); assert.equal(report.totals.absencePaidMinutes, 240);
  assert.equal(report.days[0].revision, 2); assert.equal(report.days[0].revisionCount, 2); assert.equal(report.days[0].note, "Nota corretta fittizia");
  assert.ok(report.components.some((item) => item.component === "ORDINARY_BASE"));
  assert.ok(report.components.some((item) => item.component === "CATEGORY_PREMIUM"));
  assert.ok(report.components.some((item) => item.component === "PAID_ABSENCE"));
});

test("mensile include solo date del mese ma calcola integralmente la settimana a cavallo", async () => {
  const { ledger, reports } = await fixture();
  for (const date of ["2026-01-26", "2026-01-27", "2026-01-28", "2026-01-29", "2026-01-30"]) await save(ledger, date, 468);
  await save(ledger, "2026-02-01", 60, "LG/A", "Ora domenicale fittizia");
  const february = await reports.build({ mode: "month", cursor: "2026-02-15", account: { name: "Demo", username: "demo" } });
  assert.deepEqual(february.weeksCalculated, ["2026-01-26"]);
  assert.deepEqual(february.days.map((day) => day.date), ["2026-02-01"]);
  assert.equal(february.totals.workMinutes, 60);
  assert.equal(february.totals.ordinaryWorkMinutes, 0);
  assert.equal(february.totals.overtimeMinutes, 60);
  assert.equal(february.totals.totalAmountCents, 1600);
  assert.deepEqual(february.components.map((item) => item.component), ["OVERTIME"]);
  const january = await reports.build({ mode: "month", cursor: "2026-01-15", account: { name: "Demo", username: "demo" } });
  assert.equal(january.totals.workMinutes, 2340); assert.equal(january.totals.ordinaryWorkMinutes, 2340); assert.equal(january.totals.overtimeMinutes, 0);
  assert.equal(january.totals.totalAmountCents, 46800);
});

test("caso definitivo 40 ore più 4 P resta coerente anche nel prospetto", async () => {
  const { ledger, reports } = await fixture();
  for (const date of ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"]) await save(ledger, date, 480);
  await save(ledger, "2026-01-10", 240, "P");
  const report = await reports.build({ mode: "week", cursor: "2026-01-05", account: { name: "Demo", username: "demo" } });
  assert.equal(report.totals.workMinutes, 2400); assert.equal(report.totals.ordinaryWorkMinutes, 2340); assert.equal(report.totals.overtimeMinutes, 60);
  assert.equal(report.totals.absenceRecordedMinutes, 240); assert.equal(report.totals.absencePaidMinutes, 0); assert.equal(report.totals.absenceUnpaidMinutes, 240);
});

test("PART TIME espone tutto il lavoro come ordinario e non mostra P/F", async () => {
  const periods = [{ employmentType: "PART_TIME", effectiveFrom: "2026-01-05" }];
  const { ledger, reports } = await fixture(periods);
  await save(ledger, "2026-01-05", 180, "GOLD");
  const report = await reports.build({ mode: "week", cursor: "2026-01-05", account: { name: "Demo", username: "demo" } });
  assert.deepEqual(report.employmentTypes, ["PART_TIME"]); assert.equal(report.totals.ordinaryWorkMinutes, 180); assert.equal(report.totals.overtimeMinutes, 0); assert.equal(report.totals.absenceRecordedMinutes, 0);
});

test("anteprima usa esattamente i valori del modello condiviso con la UI", async () => {
  const { ledger, reports } = await fixture(); await save(ledger, "2026-01-05", 120, "LG/A", "<nota fittizia>");
  const report = await reports.build({ mode: "week", cursor: "2026-01-05", account: { name: "Demo <script>", username: "demo" } });
  const html = renderHtml(report);
  assert.ok(html.includes(formatMinutes(report.totals.workMinutes)));
  assert.ok(html.includes(formatMoney(report.totals.totalAmountCents)));
  assert.ok(html.includes("Rev. 1 / 1"));
  assert.ok(!html.includes("<script>")); assert.ok(html.includes("&lt;nota fittizia&gt;"));
});

test("il modulo prospetti non usa rete, servizi PDF o persistenza", () => {
  assert.doesNotMatch(reportSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|putRecord|appendRevision|replaceSnapshot|pdfmake|jspdf/i);
});
