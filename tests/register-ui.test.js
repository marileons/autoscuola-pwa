"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const uiSource = fs.readFileSync(path.join(root, "register-ui.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "register-ui.css"), "utf8");
const htmlSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const authSource = fs.readFileSync(path.join(root, "auth-client.js"), "utf8");
const { createController } = require("../register-ui.js");

function createUiHarness(vaultOverrides = {}, options = {}) {
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
  const ledger = options.ledger || { listDays: async () => [] };
  const controller = createController({
    document,
    vault,
    auth: { currentUser: () => ({ id: "account-background", name: "Utente Test" }), lockRegisterVault: async () => {} },
    fetch: async () => ({ ok: true, json: async () => ({ periods: [{ employmentType: "FULL_TIME", effectiveFrom: "2026-08-31" }] }) }),
    ledgerApi: { createLedger: () => ledger },
    reportApi: { createReportService: () => ({ build: options.reportBuild || (async () => ({ employmentTypes: ["FULL_TIME"], totals: { workMinutes: 0, absenceRecordedMinutes: 0, overtimeMinutes: 0, overtimeAmountCents: 0, totalAmountCents: 0, dayCount: 0 } })) }) },
    backupApi: { createBackupService: () => ({}) },
    deletionApi: { createDeletionService: () => ({}) },
    now: options.now
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
  assert.deepEqual(controller.helpers.splitMinutes(210), { hours: 3, minutes: 30 });
  assert.equal(controller.helpers.durationToMinutes("0", "45"), 45);
  assert.equal(controller.helpers.durationToMinutes("1", "30"), 90);
  assert.equal(controller.helpers.durationToMinutes("7", "0"), 420);
  assert.equal(controller.helpers.durationToMinutes("0", "59"), 59);
  for (const values of [["0", "60"], ["-1", "0"], ["0", "-1"], ["1.5", "0"], ["0", "1.5"], ["0", "0"], [String(Number.MAX_SAFE_INTEGER), "0"]]) {
    assert.throws(() => controller.helpers.durationToMinutes(...values));
  }
});

test("una nuova giornata propone sempre la data locale odierna, indipendente dal periodo visualizzato", async () => {
  let current = new Date(2026, 8, 3, 9, 15);
  const harness = createUiHarness({}, { now: () => current });

  harness.document.getElementById("registerAddDay").onclick();
  assert.equal(harness.document.getElementById("registerDayDate").value, "2026-09-03");
  assert.equal(harness.document.getElementById("registerDayDate").disabled, false);

  harness.document.getElementById("registerDayDate").value = "2026-09-05";
  assert.equal(harness.document.getElementById("registerDayDate").value, "2026-09-05");
  harness.document.getElementById("registerCancelDay").onclick();

  harness.document.getElementById("registerPreviousPeriod").onclick();
  harness.document.getElementById("registerAddDay").onclick();
  assert.equal(harness.document.getElementById("registerDayDate").value, "2026-09-03");
  harness.document.getElementById("registerCancelDay").onclick();

  harness.document.getElementById("registerMonthTab").onclick();
  harness.document.getElementById("registerPreviousPeriod").onclick();
  harness.document.getElementById("registerAddDay").onclick();
  assert.equal(harness.document.getElementById("registerDayDate").value, "2026-09-03");
  harness.document.getElementById("registerCancelDay").onclick();

  current = new Date(2026, 8, 4, 0, 1);
  harness.document.getElementById("registerAddDay").onclick();
  assert.equal(harness.document.getElementById("registerDayDate").value, "2026-09-04");
});

test("la data locale resta corretta vicino a mezzanotte e con l'ora legale Europe/Rome", () => {
  const modulePath = path.join(root, "register-ui.js");
  const script = `const {createController}=require(${JSON.stringify(modulePath)});const h=createController({document:{}}).helpers;console.log(h.localDateInput(new Date(process.argv[1])))`;
  function inRome(instant) {
    const result = spawnSync(process.execPath, ["-e", script, instant], { encoding: "utf8", env: { ...process.env, TZ: "Europe/Rome" } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  assert.equal(inRome("2026-09-02T22:30:00.000Z"), "2026-09-03");
  assert.equal(inRome("2026-07-01T22:30:00.000Z"), "2026-07-02");
  assert.equal(inRome("2026-01-03T23:30:00.000Z"), "2026-01-04");
});

test("la modifica conserva la data originale della giornata", async () => {
  const existing = { date: "2026-09-02", note: "esistente", blocks: [{ id: "b1", order: 1, category: "LG/A", minutes: 180 }] };
  const harness = createUiHarness({}, {
    now: () => new Date(2026, 8, 3, 10, 0),
    ledger: { listDays: async () => [existing] }
  });
  await harness.controller.open();
  harness.document.getElementById("registerUnlockPin").value = "1234";
  await harness.document.getElementById("registerPinUnlockForm").onsubmit({ preventDefault() {} });
  const card = harness.document.getElementById("registerDayCards").children[0];
  const edit = card.children[1].children.at(-1);
  edit.onclick();
  assert.equal(harness.document.getElementById("registerDayDate").value, "2026-09-02");
  assert.equal(harness.document.getElementById("registerDayDate").disabled, true);
});

test("l'editor converte ore e minuti mantenendo minutes come formato interno", () => {
  assert.match(uiSource, /className = "register-block-hours"/);
  assert.match(uiSource, /className = "register-block-minute-part"/);
  assert.match(uiSource, /hours\.inputMode = "numeric"/);
  assert.match(uiSource, /minutes\.max = "59"/);
  assert.match(uiSource, /const parts = splitMinutes\(block\.minutes \|\| 60\)/);
  assert.match(uiSource, /minutes: durationToMinutes\(row\.querySelector\("\.register-block-hours"\)\.value, row\.querySelector\("\.register-block-minute-part"\)\.value\)/);
  assert.doesNotMatch(uiSource, /aria-label", "Durata in minuti"/);
  assert.match(cssSource, /\.register-block-duration\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(cssSource, /@media\(max-width:700px\)[^\n]*\.register-block-editor\{grid-template-columns:minmax\(0,1fr\) 42px 42px 42px\}/);
  assert.match(cssSource, /\.register-block-editor input\{font-size:16px\}/);
});

test("il riepilogo mostra lo straordinario del report solo per FULL TIME", async () => {
  async function summaryRows(employmentType, overtimeMinutes, overtimeAmountCents) {
    const harness = createUiHarness({}, {
      reportBuild: async () => ({
        employmentTypes: [employmentType],
        totals: {
          workMinutes: employmentType === "FULL_TIME" ? 2400 : 180,
          absenceRecordedMinutes: employmentType === "FULL_TIME" ? 420 : 0,
          overtimeMinutes,
          overtimeAmountCents,
          totalAmountCents: employmentType === "FULL_TIME" ? 81000 : 6000,
          dayCount: 5
        }
      })
    });
    await harness.controller.open();
    harness.document.getElementById("registerUnlockPin").value = "1234";
    await harness.document.getElementById("registerPinUnlockForm").onsubmit({ preventDefault() {} });
    return harness.document.getElementById("registerSummary").children
      .map((row) => row.children.map((child) => child.textContent));
  }

  const withOvertime = await summaryRows("FULL_TIME", 60, 3000);
  assert.deepEqual(withOvertime.find(([label]) => label === "Straordinario"), ["Straordinario", "1 h 00 min — 30,00 €"]);

  const withoutOvertime = await summaryRows("FULL_TIME", 0, 0);
  assert.deepEqual(withoutOvertime.find(([label]) => label === "Straordinario"), ["Straordinario", "0 h 00 min — 0,00 €"]);

  const partTime = await summaryRows("PART_TIME", 0, 0);
  assert.equal(partTime.some(([label]) => label === "Straordinario"), false);
  assert.match(uiSource, /overtimeMinutes: currentReport\.totals\.overtimeMinutes/);
  assert.match(uiSource, /overtimeAmountCents: currentReport\.totals\.overtimeAmountCents/);
  assert.doesNotMatch(uiSource, /39\s*\*\s*60|2340/);
});

test("un dato legacy non valido mostra riepilogo non disponibile e il motivo reale", async () => {
  const harness = createUiHarness({}, {
    reportBuild: async () => { throw new RangeError("P/F oltre limite giornaliero"); }
  });
  await harness.controller.open();
  harness.document.getElementById("registerUnlockPin").value = "1234";
  await harness.document.getElementById("registerPinUnlockForm").onsubmit({ preventDefault() {} });

  const message = harness.document.getElementById("registerMessage").textContent;
  const rows = harness.document.getElementById("registerSummary").children;
  assert.equal(message, "P/F oltre limite giornaliero");
  assert.deepEqual(rows.map((row) => row.children.map((child) => child.textContent)), [
    ["Riepilogo", "Non disponibile"],
    ["Motivo", "P/F oltre limite giornaliero"]
  ]);
  assert.doesNotMatch(rows.flatMap((row) => row.children).map((child) => child.textContent).join(" "), /0 h|0,00|^0$/);
});

test("un errore di riepilogo dopo il salvataggio non viene sostituito dal messaggio di successo", async () => {
  const ledger = {
    listDays: async () => [],
    saveDay: async () => ({ date: "2026-09-11" })
  };
  const harness = createUiHarness({}, {
    ledger,
    reportBuild: async () => { throw new RangeError("P/F oltre limite giornaliero"); }
  });
  await harness.controller.open();
  harness.document.getElementById("registerUnlockPin").value = "1234";
  await harness.document.getElementById("registerPinUnlockForm").onsubmit({ preventDefault() {} });
  harness.document.getElementById("registerDayDate").value = "2026-09-11";
  harness.document.getElementById("registerBlocks").children = [{
    dataset: { blockId: "" },
    querySelector(selector) {
      if (selector === "select") return { value: "LG/A" };
      if (selector === ".register-block-hours") return { value: "1" };
      return { value: "0" };
    }
  }];
  await harness.document.getElementById("registerDayForm").onsubmit({ preventDefault() {} });

  assert.equal(harness.document.getElementById("registerMessage").textContent, "P/F oltre limite giornaliero");
  assert.notEqual(harness.document.getElementById("registerMessage").textContent, "Giornata salvata nel dispositivo.");
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
