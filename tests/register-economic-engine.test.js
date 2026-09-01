"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateWeek, roundRationalCents } = require("../register-economic-engine.js");
const rates = {
  categories: { "LG/A": 1000, "LG/M": 1200, "M/SE": 1300, GOLD: 1500, EX: 1400, VARIE: 900 },
  overtime: 1500
};
const b = (date, order, category, hours, extra = 0) => ({ date, order, category, minutes: hours * 60 + extra });
const full = (blocks, customRates = rates) => calculateWeek({ employmentType: "FULL_TIME", rates: customRates, blocks });
const amount = (result, component) => result.components
  .filter((item) => item.component === component)
  .reduce((sum, item) => sum + item.amountCents, 0);

test("PART TIME usa le tariffe proprie delle categorie", () => {
  const result = calculateWeek({ employmentType: "PART_TIME", rates, blocks: [
    b("2026-08-31", 1, "LG/A", 2), b("2026-08-31", 2, "LG/M", 1, 30)
  ] });
  assert.equal(result.totals.workMinutes, 210);
  assert.equal(result.totals.totalAmountCents, 3800);
});
test("40 lavoro + 4 P: 39 ordinarie, 1 straordinaria, P non pagato", () => {
  const result = full([
    b("2026-08-31", 1, "LG/A", 8), b("2026-09-01", 1, "LG/A", 8),
    b("2026-09-02", 1, "LG/A", 8), b("2026-09-03", 1, "LG/A", 8),
    b("2026-09-04", 1, "LG/A", 8), b("2026-09-05", 1, "P", 4)
  ]);
  assert.deepEqual([result.totals.ordinaryWorkMinutes, result.totals.overtimeMinutes, result.totals.absencePaidMinutes], [2340, 60, 0]);
  assert.equal(result.totals.totalAmountCents, 40500);
});
test("35 lavoro + 4 P completa 39 senza straordinario", () => {
  const result = full([
    b("2026-08-31", 1, "LG/A", 7), b("2026-09-01", 1, "LG/A", 7),
    b("2026-09-02", 1, "LG/A", 7), b("2026-09-03", 1, "LG/A", 7),
    b("2026-09-04", 1, "LG/A", 7), b("2026-09-05", 1, "P", 4)
  ]);
  assert.deepEqual([result.totals.recognizedOrdinaryMinutes, result.totals.overtimeMinutes, result.totals.absencePaidMinutes], [2340, 0, 240]);
  assert.equal(result.totals.totalAmountCents, 39000);
});
test("P/F usa la quota disponibile in ordine cronologico", () => {
  const result = full([
    b("2026-08-31", 1, "LG/A", 7), b("2026-09-01", 1, "P", 3),
    b("2026-09-02", 1, "F", 1), b("2026-09-03", 1, "LG/A", 30)
  ]);
  const permission = result.classifiedBlocks.find((item) => item.category === "P");
  const holiday = result.classifiedBlocks.find((item) => item.category === "F");
  assert.deepEqual([permission.paidMinutes, permission.unpaidMinutes, holiday.paidMinutes, holiday.unpaidMinutes], [120, 60, 0, 60]);
});
test("settimana sotto 39 ore non viene completata automaticamente", () => {
  const result = full([b("2026-08-31", 1, "LG/A", 20), b("2026-09-01", 1, "P", 4)]);
  assert.equal(result.totals.recognizedOrdinaryMinutes, 1440);
  assert.equal(result.totals.totalAmountCents, 24000);
});
test("39 ore F entro i limiti sono interamente valorizzate", () => {
  const result = full([
    b("2026-08-31", 1, "F", 7), b("2026-09-01", 1, "F", 7), b("2026-09-02", 1, "F", 7),
    b("2026-09-03", 1, "F", 7), b("2026-09-04", 1, "F", 7), b("2026-09-05", 1, "F", 4)
  ]);
  assert.equal(result.totals.absencePaidMinutes, 2340);
  assert.equal(result.totals.totalAmountCents, 39000);
});
test("FULL TIME applica base LG/A e sola maggiorazione positiva", () => {
  const result = full([b("2026-08-31", 1, "LG/A", 20), b("2026-09-01", 1, "LG/M", 19)]);
  assert.deepEqual([amount(result, "ORDINARY_BASE"), amount(result, "CATEGORY_PREMIUM"), result.totals.totalAmountCents], [39000, 3800, 42800]);
});
test("straordinario è uniforme e indipendente dalla categoria", () => {
  const result = full([b("2026-08-31", 1, "LG/A", 20), b("2026-09-01", 1, "LG/M", 21)]);
  assert.deepEqual([
    amount(result, "ORDINARY_BASE"), amount(result, "CATEGORY_PREMIUM"),
    amount(result, "OVERTIME"), result.totals.totalAmountCents
  ], [39000, 3800, 3000, 45800]);
});
test("blocco a cavallo della soglia viene diviso", () => {
  const result = full([b("2026-08-31", 1, "LG/A", 38), b("2026-09-01", 1, "GOLD", 2)]);
  const crossing = result.classifiedBlocks.find((item) => item.category === "GOLD");
  assert.deepEqual([crossing.ordinaryMinutes, crossing.overtimeMinutes], [60, 60]);
  assert.equal(amount(result, "CATEGORY_PREMIUM"), 500);
  assert.equal(amount(result, "OVERTIME"), 1500);
});
test("categoria sotto LG/A non genera penalizzazione", () => {
  const result = full([b("2026-08-31", 1, "VARIE", 1)]);
  assert.equal(amount(result, "CATEGORY_PREMIUM"), 0);
  assert.equal(result.totals.totalAmountCents, 1000);
});
test("limiti P/F: 7 ore feriali, 4 sabato, zero domenica", () => {
  assert.throws(() => full([b("2026-08-31", 1, "P", 7, 1)]), /limite giornaliero/);
  assert.throws(() => full([b("2026-09-05", 1, "F", 4, 1)]), /limite giornaliero/);
  assert.throws(() => full([b("2026-09-06", 1, "P", 1)]), /limite giornaliero/);
});
test("PART TIME rifiuta P/F", () => {
  assert.throws(() => calculateWeek({
    employmentType: "PART_TIME", rates, blocks: [b("2026-08-31", 1, "P", 1)]
  }), /solo FULL_TIME/);
});
test("ordine cronologico e manuale determina il superamento soglia", () => {
  const result = full([
    b("2026-09-01", 2, "GOLD", 2), b("2026-08-31", 1, "LG/A", 38), b("2026-09-01", 1, "LG/M", 1)
  ]);
  const lgm = result.classifiedBlocks.find((item) => item.category === "LG/M");
  const gold = result.classifiedBlocks.find((item) => item.category === "GOLD");
  assert.deepEqual([lgm.ordinaryMinutes, lgm.overtimeMinutes, gold.ordinaryMinutes, gold.overtimeMinutes], [60, 0, 0, 120]);
});
test("mezzo centesimo sale e l'aggregazione precede l'arrotondamento", () => {
  assert.equal(roundRationalCents(30), 1);
  assert.equal(roundRationalCents(29), 0);
  const lowRates = {
    categories: { "LG/A": 10, "LG/M": 10, "M/SE": 10, GOLD: 10, EX: 10, VARIE: 10 },
    overtime: 10
  };
  const result = calculateWeek({ employmentType: "PART_TIME", rates: lowRates, blocks: [
    b("2026-08-31", 1, "LG/A", 0, 2), b("2026-08-31", 2, "LG/A", 0, 1)
  ] });
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].minutes, 3);
  assert.equal(result.totals.totalAmountCents, 1);
});
test("settimane diverse e ordini duplicati vengono rifiutati", () => {
  assert.throws(() => full([
    b("2026-08-31", 1, "LG/A", 1), b("2026-09-07", 1, "LG/A", 1)
  ]), /stessa settimana|settimane diverse/);
  assert.throws(() => full([
    b("2026-08-31", 1, "LG/A", 1), b("2026-08-31", 1, "LG/M", 1)
  ]), /Ordine duplicato/);
});

test("ogni blocco conserva e usa la propria versione tariffaria", () => {
  const oldRates = {
    categories: { "LG/A": 1000, "LG/M": 1200, "M/SE": 1300, GOLD: 1500, EX: 1400, VARIE: 900 },
    overtime: 1500
  };
  const newRates = {
    categories: { "LG/A": 1100, "LG/M": 1400, "M/SE": 1500, GOLD: 1700, EX: 1600, VARIE: 950 },
    overtime: 1800
  };
  const first = { ...b("2026-08-31", 1, "LG/M", 1), rates: oldRates };
  const second = { ...b("2026-09-01", 1, "LG/M", 1), rates: newRates };
  const result = calculateWeek({ employmentType: "PART_TIME", rates: oldRates, blocks: [first, second] });
  assert.equal(result.totals.totalAmountCents, 2600);
  assert.deepEqual(result.components.map((item) => item.rateCentsPerHour), [1200, 1400]);
});
