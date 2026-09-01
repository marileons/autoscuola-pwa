"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const uiSource = fs.readFileSync(path.join(root, "register-ui.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "register-ui.css"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const authSource = fs.readFileSync(path.join(root, "auth-client.js"), "utf8");
const { createController } = require("../register-ui.js");

function createUiHarness(vaultOverrides = {}) {
  const elements = new Map();
  function element(id = "") {
    const classes = new Set();
    return {
      id, value: "", textContent: "", tagName: "DIV", children: [], dataset: {}, disabled: false,
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        toggle: (name, force) => force === undefined ? (classes.has(name) ? classes.delete(name) : classes.add(name)) : (force ? classes.add(name) : classes.delete(name)),
        contains: (name) => classes.has(name)
      },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      querySelectorAll() { return []; },
      setAttribute() {},
      reset() { this.resetCalled = true; }
    };
  }
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
    createElement(tag) { const item = element(); item.tagName = tag.toUpperCase(); return item; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  let active = true;
  const calls = [];
  const vault = {
    status: () => ({ active, unlocked: false }),
    activate: async (accountId) => { calls.push(["activate", accountId]); active = true; return { requiresPinSetup: false }; },
    unlock: async (pin) => { calls.push(["unlock", pin]); },
    pinLockStatus: async () => ({ locked: false, remainingMs: 0 }),
    touch() {},
    ...vaultOverrides
  };
  const ledger = { listDays: async () => [] };
  const controller = createController({
    document,
    vault,
    auth: { currentUser: () => ({ id: "account-background", name: "Utente Test" }), lockRegisterVault: async () => {} },
    fetch: async () => ({ ok: true, json: async () => ({ periods: [{ employmentType: "FULL_TIME", effectiveFrom: "2026-08-31" }] }) }),
    ledgerApi: { createLedger: () => ledger },
    reportApi: { createReportService: () => ({ build: async () => ({ totals: { workMinutes: 0, absenceRecordedMinutes: 0, totalAmountCents: 0, dayCount: 0 } }) }) },
    backupApi: { createBackupService: () => ({}) },
    deletionApi: { createDeletionService: () => ({}) }
  });
  controller.bind({ show() {} });
  return { controller, document, calls, setActive(value) { active = value; } };
}

test("gli helper UI gestiscono settimane, durate e centesimi in modo deterministico", () => {
  const controller = createController({ document: {} });
  assert.equal(controller.helpers.mondayOf("2026-09-03"), "2026-08-31");
  assert.equal(controller.helpers.addDays("2026-08-31", 6), "2026-09-06");
  assert.equal(controller.helpers.centsFromInput("12,34"), 1234);
  assert.equal(controller.helpers.formatMinutes(125), "2 h 05 min");
});

test("la nuova UI espone tutte le schermate richieste", () => {
  for (const id of [
    "openRegister", "registerView", "registerPinSetup", "registerPinUnlock",
    "registerRecoveryPanel", "registerWorkspace", "registerWeekTab", "registerMonthTab",
    "registerDayEditor", "registerRatesPanel", "registerSecurityPanel", "registerBackupPanel",
    "registerExportBackupForm", "registerImportBackupForm", "registerPrintPanel",
    "registerPrintPreview", "registerPrintNow", "registerDeletionPanel",
    "registerDeletionPeriodForm", "registerDeleteAllForm", "registerSummary"
  ]) assert.match(htmlSource, new RegExp(`id=["']${id}["']`));
});

test("backup, stampa e cancellazione locale sono collegati", () => {
  assert.match(htmlSource, /id="registerOpenBackup"[\s\S]*?>BACKUP \/ RIPRISTINO REGISTRO/);
  assert.match(htmlSource, /id="registerExportPassword"[^>]*minlength="12"/);
  assert.match(htmlSource, /id="registerImportPassword"[^>]*minlength="12"/);
  assert.match(htmlSource, /id="registerImportReplaceConfirm"[^>]*required/);
  assert.match(htmlSource, /id="registerOpenPrint"[\s\S]*?>ANTEPRIMA \/ STAMPA PDF/);
  assert.match(htmlSource, /id="registerPrintNow"[\s\S]*?>STAMPA \/ SALVA PDF/);
  assert.match(htmlSource, /id="registerOpenDeletion"[\s\S]*?>CANCELLAZIONE DATI REGISTRO/);
  assert.match(htmlSource, /id="registerDeletePeriodNow"[\s\S]*?>CANCELLA DATI DEL PERIODO/);
  assert.match(htmlSource, /id="registerDeleteAllPhrase"[^>]*placeholder="CANCELLA TUTTO IL REGISTRO"/);
  assert.match(htmlSource, /id="registerDeleteAllPin"[^>]*pattern="\[0-9\]\{4\}"/);
  assert.match(uiSource, /backupService\.exportBackup/);
  assert.match(uiSource, /backupService\.inspectBackup/);
  assert.match(uiSource, /backupService\.restoreBackup/);
  assert.match(uiSource, /root\.print/);
  assert.match(uiSource, /deletionService\.deleteAll/);
  assert.match(uiSource, /deletionService\.deletePeriod/);
  assert.doesNotMatch(uiSource, /generatePdf|jsPDF|pdfmake/i);
});

test("il selettore backup usa un gesto sincrono compatibile con iOS", () => {
  assert.match(htmlSource, /id="registerChooseImportFile"[^>]*type="button"[^>]*>SCEGLI FILE<\/button>/);
  assert.match(htmlSource, /id="registerImportFile"[^>]*type="file"/);
  assert.doesNotMatch(htmlSource, /id="registerImportFile"[^>]*disabled/);
  assert.match(htmlSource, /id="registerImportFile"[^>]*accept="[^"]*\.airb[^"]*application\/octet-stream[^"]*\*\/\*"/);
  const pickerHandler = uiSource.match(/byId\("registerChooseImportFile"\)\.onclick\s*=\s*\(\)\s*=>\s*byId\("registerImportFile"\)\.click\(\);/)?.[0] || "";
  assert.ok(pickerHandler);
  assert.doesNotMatch(pickerHandler, /async|await|Promise|queueMicrotask|setTimeout/);
  assert.match(uiSource, /byId\("registerImportFile"\)\.onchange/);
  assert.match(uiSource, /registerImportFileName[\s\S]*?files\?\.\[0\]\?\.name/);
  assert.match(uiSource, /const file = byId\("registerImportFile"\)\.files\?\.\[0\]/);
  assert.match(uiSource, /backupService\.inspectBackup[\s\S]*?backupService\.restoreBackup/);
});

test("i campi P e F sono aggiunti solo per un periodo FULL_TIME", () => {
  assert.match(uiSource, /employment\?\.employmentType === "FULL_TIME" \? \[\.\.\.CATEGORIES, "P", "F"\] : CATEGORIES/);
});

test("l'interfaccia usa card espandibili e layout responsive smartphone/tablet", () => {
  assert.match(htmlSource, /registerDayCards/);
  assert.match(uiSource, /createElement\("details"\)/);
  assert.match(cssSource, /@media\(max-width:700px\)/);
  assert.match(cssSource, /@media\(min-width:701px\) and \(max-width:1000px\)/);
  assert.match(cssSource, /register-day-cards\{grid-template-columns:1fr\}/);
  assert.match(cssSource, /register-layout main\{margin:0;max-width:none;padding:0;width:100%\}/);
  assert.match(cssSource, /min-height:46px/);
});

test("i controlli del Registro evitano auto-zoom iOS senza disabilitare lo zoom manuale", () => {
  assert.match(cssSource, /\.register-form input:not\(\[type="checkbox"\]\),\.register-form select,\.register-form textarea,\.register-block-editor select,\.register-block-editor input\{font-size:16px\}/);
  assert.doesNotMatch(cssSource, /\.register-form input\{[^}]*font-size:16px/);
  const viewport = htmlSource.match(/<meta name="viewport" content="([^"]+)">/)?.[1] || "";
  assert.match(viewport, /width=device-width/);
  assert.match(viewport, /initial-scale=1/);
  assert.doesNotMatch(viewport, /maximum-scale/i);
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*no/i);
  assert.match(cssSource, /@media\(max-width:420px\)/);
  assert.match(cssSource, /\.register-layout main\{margin:0;max-width:none;padding:0;width:100%\}/);
});

test("HOME e INDIETRO mantengono le destinazioni concordate", () => {
  assert.match(uiSource, /registerHome[\s\S]*?show\("home"\)/);
  assert.match(uiSource, /registerBack[\s\S]*?show\("otherFunctions"\)/);
  assert.match(appSource, /openRegister[\s\S]*?RegisterUI\.open/);
});

test("uscita e blocco ripuliscono la UI sensibile e chiudono il vault", () => {
  assert.match(appSource, /previous==="registerView"&&id!=="registerView"[\s\S]*?RegisterUI\?\.leave/);
  assert.match(authSource, /RegisterUI\?\.handleVaultLock/);
  assert.match(uiSource, /querySelectorAll\("#registerView \[data-register-sensitive\]"\)/);
  assert.match(uiSource, /lockRegisterVault/);
});

test("il modulo Registro non trasmette dati economici al server", () => {
  const fetchCalls = [...uiSource.matchAll(/fetchApi\(([^\n;]+)/g)].map((match) => match[1]);
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0], /\/api\/account\/employment/);
  assert.match(fetchCalls[0], /method: "GET"/);
  assert.doesNotMatch(uiSource, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(uiSource, /\/api\/(?:register|ledger|rates|days|economic)/i);
});

test("il caricamento protetto rispetta l'ordine di tutti i moduli Registro", () => {
  const engine = authSource.indexOf("register-economic-engine.js");
  const vault = authSource.indexOf("register-local-vault.js");
  const ledger = authSource.indexOf("register-ledger.js");
  const report = authSource.indexOf("register-report.js");
  const backup = authSource.indexOf("register-backup.js");
  const deletion = authSource.indexOf("register-deletion.js");
  const ui = authSource.indexOf("register-ui.js");
  const app = authSource.indexOf("app.js?v=");
  assert.ok(engine >= 0 && engine < vault && vault < ledger && ledger < report && report < backup && backup < deletion && deletion < ui && ui < app);
});

test("la UI backup usa file e Blob locali senza endpoint server", () => {
  assert.match(uiSource, /new Blob\(\[file\.content\]/);
  assert.match(uiSource, /file\.text\(\)/);
  assert.doesNotMatch(uiSource, /fetchApi\(["']\/api\/(?:backup|register|restore|import|export)/i);
});

test("anteprima e stampa usano lo stesso modello locale senza endpoint PDF", () => {
  assert.match(uiSource, /reportService\.build\(\{ mode, cursor, account: getAuth\(\)\.currentUser\(\) \}\)/);
  assert.match(uiSource, /getReportApi\(\)\.renderHtml\(currentReport\)/);
  assert.match(uiSource, /printCurrentReport/);
  assert.doesNotMatch(uiSource, /fetchApi\(["']\/api\/(?:pdf|report|print|prospetto)/i);
  assert.match(cssSource, /@media print/);
  assert.match(cssSource, /#registerPrintPanel,#registerPrintPanel \*/);
  assert.match(cssSource, /report-mobile-only/);
  assert.match(cssSource, /report-wide\{display:block!important\}/);
});

test("cancellazione usa soltanto il vault locale e richiede riepilogo, frase e PIN", () => {
  assert.match(uiSource, /deletionService\.inspectPeriod/);
  assert.match(uiSource, /registerDeletionPeriodConfirm/);
  assert.match(uiSource, /registerDeleteAllPhrase/);
  assert.match(uiSource, /registerDeleteAllPin/);
  assert.match(uiSource, /requiresPinSetup/);
  assert.doesNotMatch(uiSource, /fetchApi\(["']\/api\/(?:delete|deletion|register|vault)/i);
});

test("dopo il background riattiva il vault prima di usare il PIN senza uscire dal Registro", async () => {
  const harness = createUiHarness();
  await harness.controller.open();
  harness.calls.length = 0;
  harness.setActive(false);
  harness.controller.handleVaultLock();
  harness.document.getElementById("registerUnlockPin").value = "2468";
  await harness.document.getElementById("registerPinUnlockForm").onsubmit({ preventDefault() {} });
  assert.deepEqual(harness.calls, [["activate", "account-background"], ["unlock", "2468"]]);
  assert.equal(harness.document.getElementById("registerLockBadge").textContent, "SBLOCCATO");
  assert.equal(harness.document.getElementById("registerWorkspace").classList.contains("hidden"), false);
});

test("PIN errato mantiene il conteggio e mostra il blocco senza riattivazioni superflue", async () => {
  let attempts = 0;
  const error = new Error("PIN non corretto");
  error.lockStatus = { locked: false, remainingMs: 0, failedAttempts: 1 };
  const harness = createUiHarness({ unlock: async () => { attempts += 1; throw error; } });
  await harness.controller.open();
  harness.calls.length = 0;
  harness.document.getElementById("registerUnlockPin").value = "0000";
  await harness.document.getElementById("registerPinUnlockForm").onsubmit({ preventDefault() {} });
  assert.equal(attempts, 1);
  assert.deepEqual(harness.calls, []);
  assert.match(harness.document.getElementById("registerMessage").textContent, /PIN non corretto/);
});

test("errore di riattivazione resta gestito e viene mostrato nella UI", async () => {
  const harness = createUiHarness({
    activate: async () => { throw new Error("Archivio locale non disponibile"); },
    pinLockStatus: async () => { throw new Error("non deve essere chiamato su vault inattivo"); }
  });
  harness.setActive(false);
  harness.controller.handleVaultLock();
  harness.document.getElementById("registerUnlockPin").value = "2468";
  await assert.doesNotReject(() => harness.document.getElementById("registerPinUnlockForm").onsubmit({ preventDefault() {} }));
  assert.match(harness.document.getElementById("registerMessage").textContent, /Archivio locale non disponibile/);
  assert.equal(harness.document.getElementById("registerMessage").classList.contains("hidden"), false);
});
