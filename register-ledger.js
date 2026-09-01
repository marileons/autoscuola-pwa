(function registerLedgerModule(root, factory) {
  const engine = typeof module === "object" && module.exports
    ? require("./register-economic-engine.js")
    : root?.RegisterEconomicEngine;
  const api = factory(engine);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RegisterLedger = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createModule(defaultEngine) {
  "use strict";

  const WORK_CATEGORIES = Object.freeze(["LG/A", "LG/M", "M/SE", "GOLD", "EX", "VARIE"]);
  const ABSENCE_CATEGORIES = Object.freeze(["P", "F"]);
  const EMPLOYMENT_TYPES = Object.freeze(["PART_TIME", "FULL_TIME"]);
  const DAY_MS = 86400000;

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + "T00:00:00Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  function mondayOf(value) {
    if (!validDate(value)) throw new TypeError("Data non valida");
    const parsed = new Date(value + "T00:00:00Z");
    const weekday = parsed.getUTCDay();
    return new Date(parsed.getTime() - (weekday === 0 ? 6 : weekday - 1) * DAY_MS)
      .toISOString().slice(0, 10);
  }
  function assertInteger(value, label, minimum = 0) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new TypeError(`${label} deve essere un intero sicuro >= ${minimum}`);
    }
  }
  function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }
  function normalizePeriods(periods) {
    if (!Array.isArray(periods) || periods.length === 0) {
      throw new TypeError("Cronologia tipo lavorativo mancante");
    }
    const normalized = periods.map((period) => {
      if (!EMPLOYMENT_TYPES.includes(period.employmentType) || !validDate(period.effectiveFrom)) {
        throw new TypeError("Decorrenza lavorativa non valida");
      }
      if (mondayOf(period.effectiveFrom) !== period.effectiveFrom) {
        throw new TypeError("La decorrenza lavorativa deve essere un lunedì");
      }
      return { employmentType: period.employmentType, effectiveFrom: period.effectiveFrom };
    }).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    const dates = new Set(normalized.map((period) => period.effectiveFrom));
    if (dates.size !== normalized.length) throw new RangeError("Decorrenza lavorativa duplicata");
    return normalized;
  }
  function normalizeRates(input) {
    if (!input?.categories) throw new TypeError("Tariffe mancanti");
    const categories = {};
    for (const category of WORK_CATEGORIES) {
      assertInteger(input.categories[category], `Tariffa ${category}`);
      categories[category] = input.categories[category];
    }
    assertInteger(input.overtime || 0, "Tariffa straordinario");
    return { categories, overtime: input.overtime || 0 };
  }

  function createLedger({
    vault,
    employmentPeriods,
    economicEngine = defaultEngine,
    now = () => new Date().toISOString(),
    idFactory = () => crypto.randomUUID()
  }) {
    if (!vault?.putRecord || !vault?.appendRevision) throw new TypeError("Vault locale mancante");
    if (!economicEngine?.calculateWeek) throw new TypeError("Motore economico mancante");
    let periods = normalizePeriods(employmentPeriods);

    function setEmploymentPeriods(nextPeriods) {
      periods = normalizePeriods(nextPeriods);
    }
    function employmentForDate(date) {
      if (!validDate(date)) throw new TypeError("Data non valida");
      const applicable = periods.filter((period) => period.effectiveFrom <= date).at(-1);
      if (!applicable) throw new RangeError("La data precede la prima decorrenza lavorativa");
      return applicable;
    }
    async function allRecords() {
      return vault.listRecords();
    }
    async function listRateVersions() {
      return (await allRecords())
        .filter((record) => record?.kind === "rateVersion")
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    }
    async function rateForDate(date) {
      const version = (await listRateVersions())
        .filter((rate) => rate.effectiveFrom <= date)
        .at(-1);
      if (!version) throw new RangeError("Nessuna tariffa valida per la data");
      return version;
    }
    async function createRateVersion(input) {
      if (!validDate(input?.effectiveFrom)) throw new TypeError("Decorrenza tariffaria non valida");
      const existing = await listRateVersions();
      if (existing.some((rate) => rate.effectiveFrom === input.effectiveFrom)) {
        throw new RangeError("Esiste già una versione tariffaria con questa decorrenza");
      }
      const timestamp = now();
      const version = {
        kind: "rateVersion",
        schemaVersion: 1,
        id: String(input.id || idFactory()),
        effectiveFrom: input.effectiveFrom,
        rates: normalizeRates(input.rates),
        createdAt: timestamp
      };
      await vault.putRecord(`rate:${version.id}`, version);
      return clone(version);
    }
    async function getDay(date) {
      if (!validDate(date)) throw new TypeError("Data non valida");
      const record = await vault.getRecord(`day:${date}`);
      return record?.kind === "day" ? record : null;
    }
    async function listDays() {
      return (await allRecords())
        .filter((record) => record?.kind === "day")
        .sort((a, b) => a.date.localeCompare(b.date));
    }

    async function normalizeBlocks(inputBlocks, employment, date, existingDay) {
      if (!Array.isArray(inputBlocks)) throw new TypeError("Blocchi attività mancanti");
      const selectedRate = await rateForDate(date);
      const previousById = new Map((existingDay?.blocks || []).map((block) => [block.id, block]));
      const orders = new Set();
      const blocks = inputBlocks.map((input, index) => {
        const order = input.order ?? index + 1;
        assertInteger(order, "Ordine blocco", 1);
        if (orders.has(order)) throw new RangeError("Ordine blocco duplicato");
        orders.add(order);
        const category = String(input.category || "");
        if (!WORK_CATEGORIES.includes(category) && !ABSENCE_CATEGORIES.includes(category)) {
          throw new TypeError("Categoria attività non valida");
        }
        if (employment.employmentType === "PART_TIME" && ABSENCE_CATEGORIES.includes(category)) {
          throw new RangeError("P/F sono disponibili soltanto per FULL TIME");
        }
        assertInteger(input.minutes, "Durata blocco", 1);
        const id = String(input.id || idFactory());
        const previous = previousById.get(id);
        const rateVersionId = previous?.rateVersionId || selectedRate.id;
        const rateSnapshot = previous?.rateSnapshot || selectedRate.rates;
        return {
          id,
          order,
          category,
          minutes: input.minutes,
          rateVersionId,
          rateSnapshot: clone(rateSnapshot)
        };
      });
      return blocks.sort((a, b) => a.order - b.order);
    }

    async function saveDay(input) {
      if (!validDate(input?.date)) throw new TypeError("Data giornata non valida");
      const employment = employmentForDate(input.date);
      const existing = await getDay(input.date);
      const blocks = await normalizeBlocks(input.blocks, employment, input.date, existing);
      const absenceMinutes = blocks
        .filter((block) => ABSENCE_CATEGORIES.includes(block.category))
        .reduce((sum, block) => sum + block.minutes, 0);
      const weekday = new Date(`${input.date}T00:00:00Z`).getUTCDay();
      const absenceLimit = weekday === 0 ? 0 : weekday === 6 ? 240 : 420;
      if (absenceMinutes > absenceLimit) throw new RangeError("P/F oltre limite giornaliero");
      const timestamp = now();
      const revision = (existing?.revision || 0) + 1;
      const day = {
        kind: "day",
        schemaVersion: 1,
        id: existing?.id || String(input.id || idFactory()),
        date: input.date,
        employmentType: employment.employmentType,
        employmentEffectiveFrom: employment.effectiveFrom,
        note: String(input.note || "").trim().slice(0, 4000),
        blocks,
        revision,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp
      };
      const reason = String(input.revisionReason || (existing ? "CORREZIONE" : "CREAZIONE")).trim();
      const revisionRecord = {
        kind: "dayRevision",
        schemaVersion: 1,
        dayId: day.id,
        date: day.date,
        revision,
        reason,
        createdAt: timestamp,
        snapshot: clone(day)
      };
      await vault.appendRevision(day.id, `${day.id}:${revision}`, revisionRecord);
      await vault.putRecord(`day:${day.date}`, day);
      return clone(day);
    }

    async function listDayRevisions(date) {
      const day = await getDay(date);
      if (!day) return [];
      return (await vault.listRevisions(day.id))
        .filter((revision) => revision?.kind === "dayRevision")
        .sort((a, b) => a.revision - b.revision);
    }

    async function calculateWeek(weekStart) {
      if (!validDate(weekStart) || mondayOf(weekStart) !== weekStart) {
        throw new TypeError("La settimana deve iniziare di lunedì");
      }
      const weekEnd = new Date(new Date(weekStart + "T00:00:00Z").getTime() + 6 * DAY_MS)
        .toISOString().slice(0, 10);
      const employment = employmentForDate(weekStart);
      const days = (await listDays()).filter((day) => day.date >= weekStart && day.date <= weekEnd);
      if (days.some((day) => day.employmentType !== employment.employmentType)) {
        throw new RangeError("La settimana contiene tipi lavorativi incoerenti");
      }
      const blocks = days.flatMap((day) => day.blocks.map((block) => ({
        date: day.date,
        order: block.order,
        category: block.category,
        minutes: block.minutes,
        rates: clone(block.rateSnapshot)
      })));
      const fallback = blocks[0]?.rates || (await rateForDate(weekStart)).rates;
      return economicEngine.calculateWeek({
        employmentType: employment.employmentType,
        rates: clone(fallback),
        blocks
      });
    }

    return Object.freeze({
      setEmploymentPeriods,
      employmentForDate,
      createRateVersion,
      listRateVersions,
      rateForDate,
      saveDay,
      getDay,
      listDays,
      listDayRevisions,
      calculateWeek
    });
  }

  return Object.freeze({
    WORK_CATEGORIES,
    ABSENCE_CATEGORIES,
    EMPLOYMENT_TYPES,
    createLedger
  });
});
