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
