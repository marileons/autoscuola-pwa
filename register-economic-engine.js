(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RegisterEconomicEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const WEEK_MINUTES = 39 * 60;
  const WORK_CATEGORIES = Object.freeze(["LG/A", "LG/M", "M/SE", "GOLD", "EX", "VARIE"]);
  const ABSENCE_CATEGORIES = Object.freeze(["P", "F"]);
  const DAY_MS = 86400000;
  function assertInteger(value, label, minimum = 0) {
    if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${label}: intero >= ${minimum} richiesto`);
  }
  function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError("Data non valida");
    const parsed = new Date(value + "T00:00:00Z");
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new TypeError("Data non valida");
    return parsed;
  }
  function mondayOf(value) {
    const parsed = parseDate(value), weekday = parsed.getUTCDay();
    return new Date(parsed.getTime() - (weekday === 0 ? 6 : weekday - 1) * DAY_MS).toISOString().slice(0, 10);
  }
  function roundRationalCents(numerator, denominator = 60) {
    assertInteger(numerator, "Numeratore"); assertInteger(denominator, "Denominatore", 1);
    return Math.floor(numerator / denominator) + (numerator % denominator * 2 >= denominator ? 1 : 0);
  }
  function compareBlocks(a, b) { return a.date.localeCompare(b.date) || a.order - b.order || a.inputIndex - b.inputIndex; }
  function normalizeRates(source, employmentType, label = "") {
    if (!source?.categories) throw new TypeError(`Tariffe mancanti ${label}`.trim());
    const categories = {};
    for (const category of WORK_CATEGORIES) {
      assertInteger(source.categories[category], `Tariffa ${category} ${label}`.trim());
      categories[category] = source.categories[category];
    }
    if (employmentType === "FULL_TIME") assertInteger(source.overtime, `Tariffa straordinario ${label}`.trim());
    return { categories, overtime: source.overtime || 0 };
  }
  function normalizeInput(input) {
    if (!input || !["PART_TIME", "FULL_TIME"].includes(input.employmentType)) throw new TypeError("Tipo lavorativo non valido");
    if (!Array.isArray(input.blocks) || !input.rates?.categories) throw new TypeError("Input economico incompleto");
    const defaultRates = normalizeRates(input.rates, input.employmentType);
    let weekStart = null;
    const blocks = input.blocks.map((source, inputIndex) => {
      const blockWeek = mondayOf(source.date);
      if (weekStart === null) weekStart = blockWeek;
      if (blockWeek !== weekStart) throw new RangeError("Blocchi di settimane diverse");
      assertInteger(source.order, "Ordine"); assertInteger(source.minutes, "Durata", 1);
      if (!WORK_CATEGORIES.includes(source.category) && !ABSENCE_CATEGORIES.includes(source.category)) throw new TypeError("Categoria non valida");
      if (input.employmentType === "PART_TIME" && ABSENCE_CATEGORIES.includes(source.category)) throw new TypeError("P/F solo FULL_TIME");
      const blockRates = source.rates
        ? normalizeRates(source.rates, input.employmentType, `blocco ${inputIndex + 1}`)
        : defaultRates;
      return {
        date: source.date, order: source.order, minutes: source.minutes,
        category: source.category, rates: blockRates, inputIndex
      };
    }).sort(compareBlocks);
    const orders = new Set(), absenceByDay = new Map();
    for (const block of blocks) {
      const orderKey = block.date + "|" + block.order;
      if (orders.has(orderKey)) throw new RangeError("Ordine duplicato");
      orders.add(orderKey);
      if (!ABSENCE_CATEGORIES.includes(block.category)) continue;
      const total = (absenceByDay.get(block.date) || 0) + block.minutes;
      absenceByDay.set(block.date, total);
      const weekday = parseDate(block.date).getUTCDay(), limit = weekday === 0 ? 0 : weekday === 6 ? 240 : 420;
      if (total > limit) throw new RangeError("P/F oltre limite giornaliero");
    }
    return { employmentType: input.employmentType, weekStart, rates: defaultRates, blocks };
  }
  function addComponent(map, block, component, minutes, rate) {
    if (minutes <= 0 || rate <= 0) return;
    const key = [block.date, block.category, component, rate].join("|");
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { date: block.date, category: block.category, component, rateCentsPerHour: rate, minutes: 0, exactNumerator: 0 };
      map.set(key, bucket);
    }
    bucket.minutes += minutes;
    bucket.exactNumerator += minutes * rate;
  }
  function finalizeComponents(map) {
    return [...map.values()].map((bucket) => ({
      ...bucket, amountCents: roundRationalCents(bucket.exactNumerator)
    })).sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category) || a.component.localeCompare(b.component));
  }
  function buildResult(model, components, totals, classifiedBlocks = []) {
    return {
      employmentType: model.employmentType, weekStart: model.weekStart,
      totals: { ...totals, totalAmountCents: components.reduce((sum, item) => sum + item.amountCents, 0) },
      components, classifiedBlocks
    };
  }
  function calculatePartTime(model) {
    const components = new Map();
    let workMinutes = 0;
    for (const block of model.blocks) {
      workMinutes += block.minutes;
      addComponent(components, block, "CATEGORY_WORK", block.minutes, block.rates.categories[block.category]);
    }
    return buildResult(model, finalizeComponents(components), {
      workMinutes, ordinaryWorkMinutes: workMinutes, overtimeMinutes: 0,
      absenceRecordedMinutes: 0, absencePaidMinutes: 0, absenceUnpaidMinutes: 0,
      recognizedOrdinaryMinutes: workMinutes
    });
  }
  function calculateFullTime(model) {
    const work = model.blocks.filter((block) => WORK_CATEGORIES.includes(block.category));
    const absence = model.blocks.filter((block) => ABSENCE_CATEGORIES.includes(block.category));
    const workMinutes = work.reduce((sum, block) => sum + block.minutes, 0);
    const ordinaryWorkMinutes = Math.min(workMinutes, WEEK_MINUTES);
    const overtimeMinutes = Math.max(workMinutes - WEEK_MINUTES, 0);
    const components = new Map(), classifiedBlocks = [];
    let ordinaryRemaining = ordinaryWorkMinutes;
    let absenceQuota = Math.max(WEEK_MINUTES - workMinutes, 0);
    let absencePaidMinutes = 0;
    for (const block of work) {
      const baseRate = block.rates.categories["LG/A"];
      const ordinaryMinutes = Math.min(block.minutes, ordinaryRemaining);
      const blockOvertime = block.minutes - ordinaryMinutes;
      ordinaryRemaining -= ordinaryMinutes;
      addComponent(components, block, "ORDINARY_BASE", ordinaryMinutes, baseRate);
      addComponent(components, block, "CATEGORY_PREMIUM", ordinaryMinutes,
        Math.max(block.rates.categories[block.category] - baseRate, 0));
      addComponent(components, block, "OVERTIME", blockOvertime, block.rates.overtime);
      classifiedBlocks.push({ ...block, ordinaryMinutes, overtimeMinutes: blockOvertime });
    }
    for (const block of absence) {
      const baseRate = block.rates.categories["LG/A"];
      const paidMinutes = Math.min(block.minutes, absenceQuota);
      const unpaidMinutes = block.minutes - paidMinutes;
      absenceQuota -= paidMinutes;
      absencePaidMinutes += paidMinutes;
      addComponent(components, block, "PAID_ABSENCE", paidMinutes, baseRate);
      classifiedBlocks.push({ ...block, paidMinutes, unpaidMinutes });
    }
    classifiedBlocks.sort(compareBlocks);
    const absenceRecordedMinutes = absence.reduce((sum, block) => sum + block.minutes, 0);
    return buildResult(model, finalizeComponents(components), {
      workMinutes, ordinaryWorkMinutes, overtimeMinutes, absenceRecordedMinutes,
      absencePaidMinutes, absenceUnpaidMinutes: absenceRecordedMinutes - absencePaidMinutes,
      recognizedOrdinaryMinutes: ordinaryWorkMinutes + absencePaidMinutes
    }, classifiedBlocks);
  }
  function calculateWeek(input) {
    const model = normalizeInput(input);
    return model.employmentType === "PART_TIME" ? calculatePartTime(model) : calculateFullTime(model);
  }
  return Object.freeze({
    WEEK_MINUTES, WORK_CATEGORIES, ABSENCE_CATEGORIES, roundRationalCents, calculateWeek
  });
});
