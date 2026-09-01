(function registerUiModule(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) root.RegisterUI = api.createController();
})(typeof globalThis !== "undefined" ? globalThis : this, function createModule(root) {
  "use strict";

  const DAY_MS = 86400000;
  const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  const CATEGORIES = ["LG/A", "LG/M", "M/SE", "GOLD", "EX", "VARIE"];

  function isoDate(value) { return value.toISOString().slice(0, 10); }
  function parseIso(value) { return new Date(`${value}T00:00:00Z`); }
  function mondayOf(value) {
    const date = parseIso(value), weekday = date.getUTCDay();
    return isoDate(new Date(date.getTime() - (weekday === 0 ? 6 : weekday - 1) * DAY_MS));
  }
  function addDays(value, amount) { return isoDate(new Date(parseIso(value).getTime() + amount * DAY_MS)); }
  function monthKey(value) { return value.slice(0, 7); }
  function formatDate(value) { return new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }).format(parseIso(value)); }
  function formatMoney(cents) { return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format((cents || 0) / 100); }
  function formatMinutes(minutes) { return `${Math.floor((minutes || 0) / 60)} h ${String((minutes || 0) % 60).padStart(2, "0")} min`; }
  function centsFromInput(value) {
    const normalized = String(value || "").replace(",", ".");
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Tariffa non valida");
    return Math.round(amount * 100);
  }
  function dateInputToday() { return isoDate(new Date()); }
  function escapeText(value) { return String(value ?? ""); }

  function createController(dependencies = {}) {
    const doc = dependencies.document || root.document;
    const fetchApi = dependencies.fetch || root.fetch?.bind(root);
    const getVault = () => dependencies.vault || root.RegisterLocalVault;
    const getLedgerApi = () => dependencies.ledgerApi || root.RegisterLedger;
    const getReportApi = () => dependencies.reportApi || root.RegisterReport;
    const getBackupApi = () => dependencies.backupApi || root.RegisterBackup;
    const getDeletionApi = () => dependencies.deletionApi || root.RegisterDeletion;
    const getAuth = () => dependencies.auth || root.AgendaAuth;
    let showView = null;
    let ledger = null;
    let backupService = null;
    let reportService = null;
    let deletionService = null;
    let currentReport = null;
    let pendingDeletionPeriod = null;
    let employmentPeriods = [];
    let mode = "week";
    let cursor = mondayOf(dateInputToday());
    let bound = false;
    let activation = 0;

    const byId = (id) => doc.getElementById(id);
    function hide(...ids) { ids.forEach((id) => byId(id)?.classList.add("hidden")); }
    function reveal(...ids) { ids.forEach((id) => byId(id)?.classList.remove("hidden")); }
    function setMessage(text, error = false) {
      const box = byId("registerMessage");
      if (!box) return;
      box.textContent = text || "";
      box.classList.toggle("hidden", !text);
      box.classList.toggle("error", Boolean(error));
    }
    function setLockedUi() {
      ledger = null;
      byId("registerLockBadge").textContent = "BLOCCATO";
      byId("registerLockBadge").classList.remove("unlocked");
      backupService = null;
      reportService = null; deletionService = null; currentReport = null; pendingDeletionPeriod = null;
      hide("registerWorkspace", "registerDayEditor", "registerRatesPanel", "registerSecurityPanel", "registerBackupPanel", "registerPrintPanel", "registerDeletionPanel", "registerRecoveryOnce");
      reveal("registerGate");
      const cards = byId("registerDayCards");
      const summary = byId("registerSummary");
      if (cards) cards.replaceChildren();
      if (summary) summary.replaceChildren();
      byId("registerPrintPreview")?.replaceChildren();
      doc.querySelectorAll("#registerView [data-register-sensitive]").forEach((element) => {
        if ("value" in element) element.value = "";
        if (element.tagName === "OUTPUT") element.textContent = "";
      });
    }
    function setUnlockedUi() {
      hide("registerGate", "registerPinSetup", "registerPinUnlock", "registerRecoveryPanel", "registerRecoveryOnce");
      reveal("registerWorkspace");
      byId("registerLockBadge").textContent = "SBLOCCATO";
      byId("registerLockBadge").classList.add("unlocked");
    }
    function showGate(target) {
      reveal("registerGate", target);
      ["registerPinSetup", "registerPinUnlock", "registerRecoveryPanel", "registerRecoveryOnce"]
        .filter((id) => id !== target).forEach((id) => hide(id));
    }
    async function employmentHistory() {
      const response = await fetchApi("/api/account/employment", { method: "GET", credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Impossibile leggere il tipo lavorativo dell’account");
      const payload = await response.json();
      if (!Array.isArray(payload.periods) || !payload.periods.length) throw new Error("Tipo lavorativo non configurato");
      return payload.periods.map((period) => ({ employmentType: period.employmentType, effectiveFrom: period.effectiveFrom }));
    }
    async function prepareLedger() {
      ledger = getLedgerApi().createLedger({ vault: getVault(), employmentPeriods });
      backupService = getBackupApi().createBackupService({ vault: getVault() });
      reportService = getReportApi().createReportService({ ledger, employmentPeriods });
      deletionService = getDeletionApi().createDeletionService({ vault: getVault() });
      const user = getAuth().currentUser();
      const currentEmployment = [...employmentPeriods].filter((period) => period.effectiveFrom <= dateInputToday()).at(-1) || employmentPeriods[0];
      byId("registerAccountName").textContent = user?.name || user?.username || "Account autenticato";
      byId("registerEmploymentType").textContent = currentEmployment.employmentType.replace("_", " ");
      byId("registerEmploymentSince").textContent = new Intl.DateTimeFormat("it-IT").format(parseIso(currentEmployment.effectiveFrom));
      setUnlockedUi();
      await render();
    }
    async function open() {
      showView?.("registerView");
      setMessage("");
      setLockedUi();
      const user = getAuth()?.currentUser?.();
      if (!user?.id) return setMessage("Sessione non valida. Accedi nuovamente.", true);
      const currentActivation = ++activation;
      try {
        employmentPeriods = await employmentHistory();
        const state = await getVault().activate(user.id);
        if (currentActivation !== activation) return;
        if (state.requiresPinSetup) showGate("registerPinSetup");
        else showGate("registerPinUnlock");
      } catch (error) { setMessage(error.message || "Apertura Registro non riuscita.", true); }
    }
    async function leave() {
      activation += 1;
      setLockedUi();
      await getAuth()?.lockRegisterVault?.();
    }
    function handleVaultLock() {
      if (!byId("registerView")) return;
      setLockedUi();
      if (getAuth()?.currentUser?.()?.id) showGate("registerPinUnlock");
    }

    async function submitSetup(event) {
      event.preventDefault(); setMessage("");
      try {
        const result = await getVault().setupPin(byId("registerNewPin").value, byId("registerConfirmPin").value);
        byId("registerPinSetupForm").reset();
        byId("registerRecoveryOnceCode").textContent = result.recoveryCode;
        showGate("registerRecoveryOnce");
      } catch (error) { setMessage(error.message, true); }
    }
    async function submitUnlock(event) {
      event.preventDefault(); setMessage("");
      try {
        await getVault().unlock(byId("registerUnlockPin").value);
        byId("registerPinUnlockForm").reset();
        await prepareLedger();
      } catch (error) {
        const status = error.lockStatus || await getVault().pinLockStatus();
        const suffix = status?.locked ? ` Riprova fra ${Math.max(1, Math.ceil(status.remainingMs / 60000))} minuti.` : "";
        setMessage((error.message || "PIN non corretto") + suffix, true);
      }
    }
    async function submitRecovery(event) {
      event.preventDefault(); setMessage("");
      try {
        await getVault().recover(byId("registerRecoveryCode").value, byId("registerRecoveryPin").value, byId("registerRecoveryPinConfirm").value);
        byId("registerRecoveryForm").reset();
        await prepareLedger();
        setMessage("Nuovo PIN impostato correttamente.");
      } catch (error) { setMessage(error.message, true); }
    }
    async function submitPinChange(event) {
      event.preventDefault(); setMessage("");
      try {
        await getVault().changePin(byId("registerCurrentPin").value, byId("registerChangedPin").value, byId("registerChangedPinConfirm").value);
        byId("registerChangePinForm").reset(); closeEditors(); setMessage("PIN modificato correttamente.");
      } catch (error) { setMessage(error.message, true); }
    }

    function currentRange() {
      if (mode === "week") return { start: mondayOf(cursor), end: addDays(mondayOf(cursor), 6) };
      const start = `${monthKey(cursor)}-01`;
      const date = parseIso(start); date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCDate(0);
      return { start, end: isoDate(date) };
    }
    function periodLabel() {
      const range = currentRange();
      if (mode === "month") { const d = parseIso(range.start); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
      return `${formatDate(range.start)} — ${formatDate(range.end)}`;
    }
    function employmentFor(date) { return [...employmentPeriods].filter((period) => period.effectiveFrom <= date).at(-1); }
    async function calculateSummary() {
      currentReport = await reportService.build({ mode, cursor, account: getAuth().currentUser() });
      return {
        workMinutes: currentReport.totals.workMinutes,
        absenceMinutes: currentReport.totals.absenceRecordedMinutes,
        amountCents: currentReport.totals.totalAmountCents,
        days: currentReport.totals.dayCount
      };
    }
    function summaryRow(label, value) {
      const row = doc.createElement("div"); row.className = "register-summary-row";
      const name = doc.createElement("span"); name.textContent = label;
      const amount = doc.createElement("strong"); amount.textContent = value;
      row.append(name, amount); return row;
    }
    function dayCard(day) {
      const details = doc.createElement("details"); details.className = "register-day-card";
      const summary = doc.createElement("summary");
      const title = doc.createElement("span"); title.textContent = formatDate(day.date);
      const total = day.blocks.reduce((sum, block) => sum + block.minutes, 0);
      const meta = doc.createElement("strong"); meta.textContent = formatMinutes(total);
      summary.append(title, meta); details.append(summary);
      const body = doc.createElement("div"); body.className = "register-day-body";
      day.blocks.forEach((block) => {
        const row = doc.createElement("div"); row.className = "register-block-row";
        const category = doc.createElement("strong"); category.textContent = `${block.order}. ${block.category}`;
        const duration = doc.createElement("span"); duration.textContent = formatMinutes(block.minutes);
        row.append(category, duration); body.append(row);
      });
      if (day.note) { const note = doc.createElement("p"); note.textContent = day.note; body.append(note); }
      const edit = doc.createElement("button"); edit.type = "button"; edit.className = "secondary full"; edit.textContent = "MODIFICA GIORNATA"; edit.onclick = () => openDayEditor(day);
      body.append(edit); details.append(body); return details;
    }
    async function render() {
      if (!ledger) return;
      getVault().touch();
      byId("registerPeriodLabel").textContent = periodLabel();
      const range = currentRange();
      const allDays = await ledger.listDays();
      const days = allDays.filter((day) => day.date >= range.start && day.date <= range.end);
      byId("registerDayCards").replaceChildren(...days.map(dayCard));
      byId("registerEmptyDays").classList.toggle("hidden", days.length > 0);
      let result = { workMinutes: 0, absenceMinutes: 0, amountCents: 0, days: 0 };
      try { result = await calculateSummary(); } catch (error) {
        if (!String(error.message).includes("Nessuna tariffa")) setMessage(error.message, true);
      }
      byId("registerSummary").replaceChildren(
        summaryRow("Giornate", String(result.days)),
        summaryRow("Ore lavorate", formatMinutes(result.workMinutes)),
        summaryRow("Permessi / ferie", formatMinutes(result.absenceMinutes)),
        summaryRow("Compenso", formatMoney(result.amountCents))
      );
    }
    function closeEditors() { hide("registerDayEditor", "registerRatesPanel", "registerSecurityPanel", "registerBackupPanel", "registerPrintPanel", "registerDeletionPanel"); reveal("registerWorkspace"); }
    function addBlockRow(block = {}) {
      const employment = employmentFor(byId("registerDayDate").value || dateInputToday());
      const row = doc.createElement("div"); row.className = "register-block-editor"; row.dataset.blockId = block.id || "";
      const select = doc.createElement("select"); select.className = "register-block-category"; select.setAttribute("aria-label", "Categoria attività");
      const options = employment?.employmentType === "FULL_TIME" ? [...CATEGORIES, "P", "F"] : CATEGORIES;
      options.forEach((value) => { const option = doc.createElement("option"); option.value = value; option.textContent = value; option.selected = value === block.category; select.append(option); });
      const minutes = doc.createElement("input"); minutes.type = "number"; minutes.min = "1"; minutes.step = "1"; minutes.required = true; minutes.className = "register-block-minutes"; minutes.value = block.minutes || 60; minutes.setAttribute("aria-label", "Durata in minuti");
      const moveUp = doc.createElement("button"); moveUp.type = "button"; moveUp.className = "secondary"; moveUp.textContent = "↑"; moveUp.setAttribute("aria-label", "Sposta prima"); moveUp.onclick = () => row.previousElementSibling && row.parentElement.insertBefore(row, row.previousElementSibling);
      const moveDown = doc.createElement("button"); moveDown.type = "button"; moveDown.className = "secondary"; moveDown.textContent = "↓"; moveDown.setAttribute("aria-label", "Sposta dopo"); moveDown.onclick = () => row.nextElementSibling && row.parentElement.insertBefore(row.nextElementSibling, row);
      const remove = doc.createElement("button"); remove.type = "button"; remove.className = "danger"; remove.textContent = "×"; remove.setAttribute("aria-label", "Rimuovi attività"); remove.onclick = () => row.remove();
      row.append(select, minutes, moveUp, moveDown, remove); byId("registerBlocks").append(row);
    }
    function refreshBlockCategories() {
      const fullTime = employmentFor(byId("registerDayDate").value)?.employmentType === "FULL_TIME";
      byId("registerBlocks").querySelectorAll(".register-block-category").forEach((select) => {
        const selected = select.value;
        const allowed = fullTime ? [...CATEGORIES, "P", "F"] : CATEGORIES;
        select.replaceChildren(...allowed.map((value) => {
          const option = doc.createElement("option"); option.value = value; option.textContent = value;
          option.selected = value === selected || (!allowed.includes(selected) && value === CATEGORIES[0]);
          return option;
        }));
      });
    }
    function openDayEditor(day = null) {
      hide("registerWorkspace", "registerRatesPanel", "registerSecurityPanel"); reveal("registerDayEditor");
      byId("registerDayEditorTitle").textContent = day ? "Modifica giornata" : "Nuova giornata";
      byId("registerDayDate").value = day?.date || (mode === "week" ? currentRange().start : `${monthKey(cursor)}-01`);
      byId("registerDayDate").disabled = Boolean(day);
      byId("registerDayNote").value = day?.note || "";
      byId("registerBlocks").replaceChildren(); (day?.blocks || [{}]).forEach(addBlockRow);
    }
    async function submitDay(event) {
      event.preventDefault(); setMessage("");
      try {
        const date = byId("registerDayDate").value;
        const blocks = [...byId("registerBlocks").children].map((row, index) => ({ id: row.dataset.blockId || undefined, order: index + 1, category: row.querySelector("select").value, minutes: Number(row.querySelector("input").value) }));
        await ledger.saveDay({ date, blocks, note: byId("registerDayNote").value, revisionReason: "MODIFICA DA INTERFACCIA" });
        byId("registerDayDate").disabled = false; closeEditors(); await render(); setMessage("Giornata salvata nel dispositivo.");
      } catch (error) { setMessage(error.message, true); }
    }
    async function openRates() {
      hide("registerWorkspace", "registerDayEditor", "registerSecurityPanel"); reveal("registerRatesPanel");
      byId("registerRatesFrom").value = dateInputToday();
      const versions = await ledger.listRateVersions();
      const list = byId("registerRateVersions"); list.replaceChildren();
      versions.slice().reverse().forEach((version) => {
        const item = doc.createElement("p"); item.className = "register-rate-version";
        item.textContent = `Dal ${new Intl.DateTimeFormat("it-IT").format(parseIso(version.effectiveFrom))} · LG/A ${formatMoney(version.rates.categories["LG/A"])}`;
        list.append(item);
      });
    }
    async function submitRates(event) {
      event.preventDefault(); setMessage("");
      try {
        const categories = {};
        doc.querySelectorAll("[data-register-rate]").forEach((input) => { categories[input.dataset.registerRate] = centsFromInput(input.value); });
        await ledger.createRateVersion({ effectiveFrom: byId("registerRatesFrom").value, rates: { categories, overtime: centsFromInput(byId("registerOvertimeRate").value) } });
        byId("registerRatesForm").reset(); closeEditors(); await render(); setMessage("Nuova versione tariffe salvata nel dispositivo.");
      } catch (error) { setMessage(error.message, true); }
    }
    function downloadBackup(file) {
      if (dependencies.download) return dependencies.download(file);
      const blob = new Blob([file.content], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      const link = doc.createElement("a"); link.href = url; link.download = file.filename; link.hidden = true;
      doc.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    async function submitBackupExport(event) {
      event.preventDefault(); setMessage("");
      const password = byId("registerExportPassword").value;
      if (password !== byId("registerExportPasswordConfirm").value) return setMessage("La conferma della password backup non coincide.", true);
      try {
        const user = getAuth().currentUser();
        const file = await backupService.exportBackup(user.id, password);
        downloadBackup(file); byId("registerExportBackupForm").reset();
        setMessage("Backup Registro cifrato creato. Conservalo insieme alla password dedicata.");
      } catch (error) { setMessage(error.message, true); }
    }
    async function submitBackupImport(event) {
      event.preventDefault(); setMessage("");
      const file = byId("registerImportFile").files?.[0];
      if (!file) return setMessage("Seleziona il file backup del Registro.", true);
      if (file.size > 50 * 1024 * 1024) return setMessage("File backup troppo grande.", true);
      try {
        const user = getAuth().currentUser();
        const content = await file.text();
        const inspected = await backupService.inspectBackup(user.id, byId("registerImportPassword").value, content);
        const confirmation = dependencies.confirm || root.confirm;
        const accepted = confirmation(`Il Registro locale attuale verrà sostituito completamente con il backup del ${new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(inspected.createdAt))}.\n\nRecord: ${inspected.records} · Revisioni: ${inspected.revisions}\n\nContinuare?`);
        if (!accepted) return setMessage("Ripristino annullato. Il Registro locale non è stato modificato.");
        const result = await backupService.restoreBackup(user.id, byId("registerImportPassword").value, content);
        byId("registerImportBackupForm").reset(); closeEditors(); await render();
        setMessage(`Ripristino completato: ${result.records} record e ${result.revisions} revisioni.`);
      } catch (error) { setMessage(error.message, true); }
    }
    async function openPrintPreview() {
      setMessage("");
      try {
        currentReport = await reportService.build({ mode, cursor, account: getAuth().currentUser() });
        byId("registerPrintPreview").innerHTML = getReportApi().renderHtml(currentReport);
        hide("registerWorkspace", "registerDayEditor", "registerRatesPanel", "registerSecurityPanel", "registerBackupPanel");
        reveal("registerPrintPanel"); root.scrollTo?.(0, 0);
      } catch (error) { setMessage(error.message, true); }
    }
    function printCurrentReport() {
      if (!currentReport) return setMessage("Anteprima non disponibile.", true);
      const print = dependencies.print || root.print?.bind(root);
      if (!print) return setMessage("Stampa non disponibile su questo dispositivo.", true);
      print();
    }
    function resetDeletionPeriodPreview() {
      pendingDeletionPeriod = null;
      byId("registerDeletionPeriodSummary").replaceChildren();
      hide("registerDeletionPeriodSummary", "registerDeletionPeriodConfirmLabel", "registerDeletePeriodNow");
      byId("registerDeletionPeriodConfirm").checked = false; byId("registerDeletePeriodNow").disabled = true;
    }
    async function inspectDeletionPeriod(event) {
      event.preventDefault(); setMessage(""); resetDeletionPeriodPreview();
      try {
        const summary = await deletionService.inspectPeriod(byId("registerDeletionStart").value, byId("registerDeletionEnd").value);
        pendingDeletionPeriod = summary;
        const box = byId("registerDeletionPeriodSummary");
        const title = doc.createElement("strong"); title.textContent = summary.days ? "Dati che verranno eliminati" : "Nessun dato nel periodo";
        const details = doc.createElement("span"); details.textContent = `${summary.days} giornate · ${summary.blocks} blocchi · ${summary.revisions} revisioni · ${formatMinutes(summary.minutes)}`;
        const range = doc.createElement("span"); range.textContent = `${new Intl.DateTimeFormat("it-IT").format(parseIso(summary.start))} – ${new Intl.DateTimeFormat("it-IT").format(parseIso(summary.end))}`;
        box.append(title, details, range); reveal("registerDeletionPeriodSummary");
        if (summary.days) reveal("registerDeletionPeriodConfirmLabel", "registerDeletePeriodNow");
      } catch (error) { setMessage(error.message, true); }
    }
    async function deleteSelectedPeriod() {
      if (!pendingDeletionPeriod || !byId("registerDeletionPeriodConfirm").checked) return;
      const confirmation = dependencies.confirm || root.confirm;
      if (!confirmation(`Eliminare definitivamente ${pendingDeletionPeriod.days} giornate e ${pendingDeletionPeriod.revisions} revisioni dal Registro locale?`)) return setMessage("Cancellazione annullata. Nessun dato è stato modificato.");
      try {
        const removed = await deletionService.deletePeriod(pendingDeletionPeriod.start, pendingDeletionPeriod.end);
        byId("registerDeletionPeriodForm").reset(); resetDeletionPeriodPreview(); closeEditors(); await render();
        setMessage(`Cancellazione completata: ${removed.days} giornate e ${removed.revisions} revisioni eliminate.`);
      } catch (error) { setMessage(error.message, true); }
    }
    async function deleteEntireRegister(event) {
      event.preventDefault(); setMessage("");
      const confirmation = dependencies.confirm || root.confirm;
      if (!confirmation("ULTIMA CONFERMA\n\nTutto il Registro locale dell’account corrente, comprese tariffe, revisioni, PIN e recovery code, verrà eliminato definitivamente. Continuare?")) return setMessage("Cancellazione completa annullata. Nessun dato è stato modificato.");
      try {
        const user = getAuth().currentUser();
        await deletionService.deleteAll({ pin: byId("registerDeleteAllPin").value, phrase: byId("registerDeleteAllPhrase").value });
        byId("registerDeleteAllForm").reset(); setLockedUi();
        const state = await getVault().activate(user.id);
        if (!state.requiresPinSetup) throw new Error("Cancellazione locale incompleta");
        showGate("registerPinSetup");
        setMessage("Registro locale cancellato completamente. Configura un nuovo PIN per creare un archivio vuoto.");
      } catch (error) { setMessage(error.message, true); }
    }
    function openDeletionPanel() {
      resetDeletionPeriodPreview(); byId("registerDeleteAllForm").reset();
      const range = currentRange(); byId("registerDeletionStart").value = range.start; byId("registerDeletionEnd").value = range.end;
      hide("registerWorkspace", "registerDayEditor", "registerRatesPanel", "registerSecurityPanel", "registerBackupPanel", "registerPrintPanel"); reveal("registerDeletionPanel");
    }
    function changeMode(next) {
      mode = next; cursor = next === "week" ? mondayOf(cursor) : `${monthKey(cursor)}-01`;
      byId("registerWeekTab").classList.toggle("active", mode === "week"); byId("registerMonthTab").classList.toggle("active", mode === "month");
      byId("registerWeekTab").setAttribute("aria-pressed", String(mode === "week")); byId("registerMonthTab").setAttribute("aria-pressed", String(mode === "month")); void render();
    }
    function movePeriod(direction) {
      if (mode === "week") cursor = addDays(mondayOf(cursor), direction * 7);
      else { const date = parseIso(`${monthKey(cursor)}-01`); date.setUTCMonth(date.getUTCMonth() + direction); cursor = isoDate(date); }
      void render();
    }
    function bind({ show }) {
      showView = show;
      if (bound) return; bound = true;
      byId("registerHome").onclick = () => show("home"); byId("registerBack").onclick = () => show("otherFunctions");
      byId("registerPinSetupForm").onsubmit = submitSetup; byId("registerPinUnlockForm").onsubmit = submitUnlock; byId("registerRecoveryForm").onsubmit = submitRecovery; byId("registerChangePinForm").onsubmit = submitPinChange;
      byId("registerOpenRecovery").onclick = () => showGate("registerRecoveryPanel"); byId("registerCancelRecovery").onclick = () => showGate("registerPinUnlock");
      byId("registerRecoverySaved").onchange = (event) => { byId("registerRecoveryContinue").disabled = !event.currentTarget.checked; };
      byId("registerRecoveryContinue").onclick = async () => { byId("registerRecoveryOnceCode").textContent = ""; await prepareLedger(); };
      byId("registerWeekTab").onclick = () => changeMode("week"); byId("registerMonthTab").onclick = () => changeMode("month");
      byId("registerPreviousPeriod").onclick = () => movePeriod(-1); byId("registerNextPeriod").onclick = () => movePeriod(1);
      byId("registerAddDay").onclick = () => openDayEditor(); byId("registerAddBlock").onclick = () => addBlockRow(); byId("registerDayForm").onsubmit = submitDay; byId("registerCancelDay").onclick = () => { byId("registerDayDate").disabled = false; closeEditors(); };
      byId("registerDayDate").onchange = refreshBlockCategories;
      byId("registerOpenRates").onclick = openRates; byId("registerRatesForm").onsubmit = submitRates; byId("registerCancelRates").onclick = closeEditors;
      byId("registerOpenSecurity").onclick = () => { hide("registerWorkspace", "registerDayEditor", "registerRatesPanel"); reveal("registerSecurityPanel"); }; byId("registerCancelSecurity").onclick = closeEditors;
      byId("registerOpenBackup").onclick = () => { hide("registerWorkspace", "registerDayEditor", "registerRatesPanel", "registerSecurityPanel"); reveal("registerBackupPanel"); };
      byId("registerExportBackupForm").onsubmit = submitBackupExport; byId("registerImportBackupForm").onsubmit = submitBackupImport; byId("registerCancelBackup").onclick = closeEditors;
      byId("registerOpenPrint").onclick = openPrintPreview; byId("registerPrintNow").onclick = printCurrentReport; byId("registerCancelPrint").onclick = closeEditors;
      byId("registerOpenDeletion").onclick = openDeletionPanel; byId("registerDeletionPeriodForm").onsubmit = inspectDeletionPeriod;
      byId("registerDeletionPeriodConfirm").onchange = (event) => { byId("registerDeletePeriodNow").disabled = !event.currentTarget.checked; };
      byId("registerDeletePeriodNow").onclick = deleteSelectedPeriod; byId("registerDeleteAllForm").onsubmit = deleteEntireRegister; byId("registerCancelDeletion").onclick = closeEditors;
      doc.addEventListener("agenda:register-vault-locked", handleVaultLock);
    }
    return Object.freeze({ bind, open, leave, handleVaultLock, helpers: Object.freeze({ mondayOf, addDays, centsFromInput, formatMinutes }) });
  }
  return Object.freeze({ createController });
});
