(function registerReportModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RegisterReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createModule() {
  "use strict";

  const DAY_MS = 86400000;
  const WORK_CATEGORIES = ["LG/A", "LG/M", "M/SE", "GOLD", "EX", "VARIE"];
  const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  const COMPONENT_LABELS = Object.freeze({
    CATEGORY_WORK: "Attività per categoria", ORDINARY_BASE: "Base ordinaria LG/A",
    CATEGORY_PREMIUM: "Maggiorazione categoria", OVERTIME: "Straordinario",
    PAID_ABSENCE: "Permesso/Ferie valorizzato"
  });

  function parseIso(value) { return new Date(`${value}T00:00:00Z`); }
  function isoDate(value) { return value.toISOString().slice(0, 10); }
  function addDays(value, amount) { return isoDate(new Date(parseIso(value).getTime() + amount * DAY_MS)); }
  function mondayOf(value) {
    const date = parseIso(value), weekday = date.getUTCDay();
    return addDays(value, -(weekday === 0 ? 6 : weekday - 1));
  }
  function monthEnd(value) {
    const date = parseIso(`${value.slice(0, 7)}-01`); date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCDate(0); return isoDate(date);
  }
  function formatDate(value, options = { day: "2-digit", month: "2-digit", year: "numeric" }) {
    return new Intl.DateTimeFormat("it-IT", { ...options, timeZone: "UTC" }).format(parseIso(value));
  }
  function formatMinutes(minutes) { return `${Math.floor((minutes || 0) / 60)} h ${String((minutes || 0) % 60).padStart(2, "0")} min`; }
  function formatMoney(cents) { return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format((cents || 0) / 100); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
  function rangeFor(mode, cursor) {
    if (mode === "week") { const start = mondayOf(cursor); return { start, end: addDays(start, 6), label: `${formatDate(start)} – ${formatDate(addDays(start, 6))}` }; }
    if (mode !== "month") throw new Error("Tipo prospetto non valido");
    const start = `${cursor.slice(0, 7)}-01`, date = parseIso(start);
    return { start, end: monthEnd(start), label: `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` };
  }
  function minutesByCategory(days) {
    const result = Object.fromEntries([...WORK_CATEGORIES, "P", "F"].map((category) => [category, 0]));
    days.flatMap((day) => day.blocks).forEach((block) => { result[block.category] = (result[block.category] || 0) + block.minutes; });
    return result;
  }
  function aggregateComponents(components) {
    const buckets = new Map();
    for (const item of components) {
      const key = [item.category, item.component, item.rateCentsPerHour].join("|");
      if (!buckets.has(key)) buckets.set(key, { category: item.category, component: item.component, rateCentsPerHour: item.rateCentsPerHour, minutes: 0, amountCents: 0 });
      const bucket = buckets.get(key); bucket.minutes += item.minutes; bucket.amountCents += item.amountCents;
    }
    return [...buckets.values()].sort((a, b) => a.component.localeCompare(b.component) || a.category.localeCompare(b.category) || a.rateCentsPerHour - b.rateCentsPerHour);
  }
  function employmentFor(periods, date) { return [...periods].filter((period) => period.effectiveFrom <= date).at(-1); }

  function createReportService({ ledger, employmentPeriods, now = () => new Date().toISOString() }) {
    if (!ledger?.listDays || !ledger?.calculateWeek || !ledger?.listDayRevisions) throw new Error("Registro locale non compatibile");
    if (!Array.isArray(employmentPeriods) || !employmentPeriods.length) throw new Error("Cronologia tipo lavorativo mancante");
    async function build({ mode, cursor, account }) {
      const period = rangeFor(mode, cursor);
      const allDays = await ledger.listDays();
      const visibleDays = allDays.filter((day) => day.date >= period.start && day.date <= period.end);
      const weeks = [...new Set(visibleDays.map((day) => mondayOf(day.date)))].sort();
      const weeklyResults = [];
      for (const weekStart of weeks) weeklyResults.push({ weekStart, result: await ledger.calculateWeek(weekStart) });
      const components = weeklyResults.flatMap(({ result }) => result.components)
        .filter((item) => item.date >= period.start && item.date <= period.end);
      const classified = weeklyResults.flatMap(({ result }) => result.classifiedBlocks || [])
        .filter((item) => item.date >= period.start && item.date <= period.end);
      const classification = new Map(classified.map((block) => [`${block.date}|${block.order}`, block]));
      const days = [];
      for (const day of visibleDays) {
        const revisions = await ledger.listDayRevisions(day.date);
        days.push({
          date: day.date, note: day.note, employmentType: day.employmentType,
          revision: day.revision, revisionCount: revisions.length,
          blocks: day.blocks.map((block) => {
            const computed = classification.get(`${day.date}|${block.order}`) || {};
            const isAbsence = block.category === "P" || block.category === "F";
            return {
              order: block.order, category: block.category, minutes: block.minutes,
              rateVersionId: block.rateVersionId, rateSnapshot: block.rateSnapshot,
              ordinaryMinutes: isAbsence ? 0 : (day.employmentType === "PART_TIME" ? block.minutes : computed.ordinaryMinutes || 0),
              overtimeMinutes: computed.overtimeMinutes || 0,
              paidAbsenceMinutes: computed.paidMinutes || 0,
              unpaidAbsenceMinutes: computed.unpaidMinutes || 0
            };
          })
        });
      }
      const categories = minutesByCategory(days);
      const flatBlocks = days.flatMap((day) => day.blocks);
      const workMinutes = WORK_CATEGORIES.reduce((sum, category) => sum + categories[category], 0);
      const absenceRecordedMinutes = categories.P + categories.F;
      const absencePaidMinutes = flatBlocks.reduce((sum, block) => sum + block.paidAbsenceMinutes, 0);
      const ordinaryWorkMinutes = flatBlocks.reduce((sum, block) => sum + block.ordinaryMinutes, 0);
      const overtimeMinutes = flatBlocks.reduce((sum, block) => sum + block.overtimeMinutes, 0);
      const groupedComponents = aggregateComponents(components);
      const employments = [...new Set(days.map((day) => day.employmentType))];
      if (!employments.length) {
        const employment = employmentFor(employmentPeriods, period.start);
        if (employment) employments.push(employment.employmentType);
      }
      return {
        schemaVersion: 1, kind: mode === "week" ? "weekly" : "monthly", period,
        account: { name: String(account?.name || ""), username: String(account?.username || "") },
        employmentTypes: employments,
        issuedAt: now(), weeksCalculated: weeks,
        days, categories, components: groupedComponents,
        totals: {
          dayCount: days.length, workMinutes, ordinaryWorkMinutes, overtimeMinutes,
          absenceRecordedMinutes, absencePaidMinutes,
          absenceUnpaidMinutes: absenceRecordedMinutes - absencePaidMinutes,
          categoryPremiumCents: groupedComponents.filter((item) => item.component === "CATEGORY_PREMIUM").reduce((sum, item) => sum + item.amountCents, 0),
          overtimeAmountCents: groupedComponents.filter((item) => item.component === "OVERTIME").reduce((sum, item) => sum + item.amountCents, 0),
          totalAmountCents: groupedComponents.reduce((sum, item) => sum + item.amountCents, 0)
        }
      };
    }
    return Object.freeze({ build });
  }

  function table(headers, rows, className = "") {
    return `<div class="report-table-wrap"><table class="${className}"><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }
  function renderHtml(report) {
    const categoryRows = [...WORK_CATEGORIES, "P", "F"].filter((category) => report.categories[category] > 0)
      .map((category) => `<tr><td>${escapeHtml(category)}</td><td>${escapeHtml(formatMinutes(report.categories[category]))}</td></tr>`);
    const componentRows = report.components.map((item) => `<tr><td>${escapeHtml(COMPONENT_LABELS[item.component] || item.component)}</td><td>${escapeHtml(item.category)}</td><td>${escapeHtml(formatMinutes(item.minutes))}</td><td>${escapeHtml(formatMoney(item.rateCentsPerHour))}/h</td><td>${escapeHtml(formatMoney(item.amountCents))}</td></tr>`);
    const dayRows = report.days.map((day) => `<tr><td>${escapeHtml(formatDate(day.date))}</td><td>${escapeHtml(day.blocks.map((block) => `${block.category} ${formatMinutes(block.minutes)}`).join(" · "))}</td><td>${escapeHtml(day.note || "—")}</td><td>Rev. ${escapeHtml(day.revision)} / ${escapeHtml(day.revisionCount)}</td></tr>`);
    const componentCards = report.components.map((item) => `<div class="report-mobile-card"><strong>${escapeHtml(COMPONENT_LABELS[item.component] || item.component)}</strong><span>${escapeHtml(item.category)} · ${escapeHtml(formatMinutes(item.minutes))}</span><span>${escapeHtml(formatMoney(item.rateCentsPerHour))}/h</span><b>${escapeHtml(formatMoney(item.amountCents))}</b></div>`).join("");
    const dayCards = report.days.map((day) => `<div class="report-mobile-card"><strong>${escapeHtml(formatDate(day.date))}</strong><span>${escapeHtml(day.blocks.map((block) => `${block.category} ${formatMinutes(block.minutes)}`).join(" · "))}</span><span>${escapeHtml(day.note || "Nessuna nota")}</span><b>Rev. ${escapeHtml(day.revision)} / ${escapeHtml(day.revisionCount)}</b></div>`).join("");
    const employment = report.employmentTypes.map((item) => item.replace("_", " ")).join(" / ") || "Non disponibile";
    return `<article class="register-print-document">
      <header class="report-header"><div><p>AGENDA ISTRUTTORI v1.21</p><h2>Prospetto ${report.kind === "weekly" ? "settimanale" : "mensile"}</h2></div><strong>${escapeHtml(report.period.label)}</strong></header>
      <section class="report-identity"><div><span>Utente</span><strong>${escapeHtml(report.account.name)}</strong><small>${escapeHtml(report.account.username)}</small></div><div><span>Tipo lavorativo</span><strong>${escapeHtml(employment)}</strong></div><div><span>Emissione</span><strong>${escapeHtml(new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(report.issuedAt)))}</strong></div></section>
      <section><h3>Riepilogo ore e assenze</h3><div class="report-kpis">
        <div><span>Ore lavorate</span><strong>${escapeHtml(formatMinutes(report.totals.workMinutes))}</strong></div><div><span>Ordinarie lavorate</span><strong>${escapeHtml(formatMinutes(report.totals.ordinaryWorkMinutes))}</strong></div><div><span>Straordinarie</span><strong>${escapeHtml(formatMinutes(report.totals.overtimeMinutes))}</strong></div>
        <div><span>P/F registrati</span><strong>${escapeHtml(formatMinutes(report.totals.absenceRecordedMinutes))}</strong></div><div><span>P/F valorizzati</span><strong>${escapeHtml(formatMinutes(report.totals.absencePaidMinutes))}</strong></div><div><span>P/F non valorizzati</span><strong>${escapeHtml(formatMinutes(report.totals.absenceUnpaidMinutes))}</strong></div>
      </div></section>
      <section><h3>Attività per categoria</h3>${categoryRows.length ? table(["Categoria", "Durata"], categoryRows) : "<p>Nessuna attività nel periodo.</p>"}</section>
      <section><h3>Compensi e tariffe applicate</h3>${componentRows.length ? `<div class="report-wide">${table(["Componente", "Categoria", "Durata", "Tariffa", "Importo"], componentRows)}</div><div class="report-mobile-only">${componentCards}</div>` : "<p>Nessun compenso nel periodo.</p>"}<div class="report-totals"><span>Maggiorazioni categoria: <strong>${escapeHtml(formatMoney(report.totals.categoryPremiumCents))}</strong></span><span>Straordinario: <strong>${escapeHtml(formatMoney(report.totals.overtimeAmountCents))}</strong></span><span>Totale: <strong>${escapeHtml(formatMoney(report.totals.totalAmountCents))}</strong></span></div></section>
      <section><h3>Giornate, note e revisioni</h3>${dayRows.length ? `<div class="report-wide">${table(["Data", "Attività", "Note", "Prospetto"], dayRows, "report-days")}</div><div class="report-mobile-only">${dayCards}</div>` : "<p>Nessuna giornata nel periodo.</p>"}</section>
      <footer><p>Prospetto generato localmente. Nessun dato economico è stato inviato o archiviato su server.</p><p>Settimane di calcolo: ${escapeHtml(report.weeksCalculated.join(", ") || "nessuna")}</p></footer>
    </article>`;
  }

  return Object.freeze({ createReportService, renderHtml, rangeFor, formatMinutes, formatMoney, WORK_CATEGORIES, COMPONENT_LABELS });
});
