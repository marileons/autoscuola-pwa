(function registerDeletionModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RegisterDeletion = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createModule() {
  "use strict";

  const DELETE_ALL_PHRASE = "CANCELLA TUTTO IL REGISTRO";
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  function validateRange(start, end) {
    if (!validDate(start) || !validDate(end)) throw new Error("Periodo non valido");
    if (start > end) throw new Error("La data iniziale non può essere successiva alla data finale");
  }
  function clone(value) { return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }

  function createDeletionService({ vault }) {
    if (!vault?.exportSnapshot || !vault?.replaceSnapshot || !vault?.destroyAll) throw new Error("Vault Registro non compatibile");
    async function planPeriod(start, end) {
      validateRange(start, end);
      const snapshot = await vault.exportSnapshot();
      const selectedDays = snapshot.records.filter((item) => item.payload?.kind === "day" && item.payload.date >= start && item.payload.date <= end);
      const selectedDayIds = new Set(selectedDays.map((item) => item.payload.id));
      const selectedRevisions = snapshot.revisions.filter((item) => selectedDayIds.has(item.recordId));
      const blocks = selectedDays.flatMap((item) => item.payload.blocks || []);
      return {
        start, end,
        summary: {
          days: selectedDays.length,
          blocks: blocks.length,
          revisions: selectedRevisions.length,
          minutes: blocks.reduce((sum, block) => sum + (Number.isSafeInteger(block.minutes) ? block.minutes : 0), 0)
        },
        nextSnapshot: {
          schemaVersion: snapshot.schemaVersion,
          records: snapshot.records.filter((item) => !selectedDayIds.has(item.payload?.id)),
          revisions: snapshot.revisions.filter((item) => !selectedDayIds.has(item.recordId))
        }
      };
    }
    async function inspectPeriod(start, end) {
      const plan = await planPeriod(start, end);
      return { start: plan.start, end: plan.end, ...clone(plan.summary) };
    }
    async function deletePeriod(start, end) {
      const plan = await planPeriod(start, end);
      if (plan.summary.days === 0) throw new Error("Nessuna giornata presente nel periodo selezionato");
      await vault.replaceSnapshot(plan.nextSnapshot);
      return { start: plan.start, end: plan.end, ...clone(plan.summary) };
    }
    async function deleteAll({ pin, phrase }) {
      if (String(phrase || "").trim() !== DELETE_ALL_PHRASE) throw new Error("Frase di conferma non corretta");
      await vault.destroyAll(String(pin || ""));
      return true;
    }
    return Object.freeze({ inspectPeriod, deletePeriod, deleteAll });
  }
  return Object.freeze({ DELETE_ALL_PHRASE, createDeletionService });
});
