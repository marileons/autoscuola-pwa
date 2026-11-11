(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RegisterCategories = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const WORK_CATEGORIES = Object.freeze(["LG/A", "LG/M", "M/SE", "GOLD AUTO", "GOLD MOTO", "EXA", "EXM", "LAV", "VARIE"]);
  const OPTIONAL_RATE_CATEGORIES = Object.freeze(["EXM", "LAV"]);
  const REQUIRED_RATE_CATEGORIES = Object.freeze(WORK_CATEGORIES.filter(code => !OPTIONAL_RATE_CATEGORIES.includes(code)));
  const PAYSLIP_CATEGORY = "BP";
  const DESCRIPTIONS = Object.freeze({ EXA: "ESAMI AUTO", EXM: "ESAMI MOTO", LAV: "LAVAGGIO AUTO" });
  function normalizeCategory(code) { return code === "EX" ? "EXA" : code === "GOLD" ? "GOLD AUTO" : code; }
  function label(code) { const normalized = normalizeCategory(code); if (normalized === PAYSLIP_CATEGORY) return "BP · Busta paga"; return DESCRIPTIONS[normalized] ? `${normalized} — ${DESCRIPTIONS[normalized]}` : normalized; }
  function rateValue(categories, code) {
    if (code === "EXA") {
      if (categories.EXA !== undefined && categories.EX !== undefined && categories.EXA !== categories.EX) throw new TypeError("Tariffe EX ed EXA discordanti: verificare il file o la configurazione.");
      return categories.EXA ?? categories.EX;
    }
    return code === "GOLD AUTO" || code === "GOLD MOTO" ? categories[code] ?? categories.GOLD : categories[code];
  }
  function requireRate(rates, category) {
    const code = normalizeCategory(category);
    if (OPTIONAL_RATE_CATEGORIES.includes(code) && !Number.isSafeInteger(rates?.categories?.[code])) throw new RangeError(`Tariffa ${label(code)} non configurata per questa decorrenza. Inseriscila manualmente in TARIFFE PERSONALI.`);
  }
  return Object.freeze({ WORK_CATEGORIES, PAYSLIP_CATEGORY, OPTIONAL_RATE_CATEGORIES, REQUIRED_RATE_CATEGORIES, DESCRIPTIONS, normalizeCategory, label, rateValue, requireRate });
});
