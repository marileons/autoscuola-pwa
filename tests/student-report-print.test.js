"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { installReportControls, documentScript } = require("../student-report-print.js");
test("report esaminatore riusa il controller reale senza handler inline e conserva il contenuto",()=>{
  const {prepareExaminerDocument}=require("../student-report-print.js"),vm=require("node:vm");
  const content='<h1>ESAMINATORE FITTIZIO</h1><p>Report completo del percorso sintetico.</p>';
  const html=prepareExaminerDocument('<html><head></head><body><button onclick="window.print()">STAMPA / SALVA PDF</button>'+content+'</body></html>');
  assert.ok(html.includes(content));assert.doesNotMatch(html,/onclick=/);assert.match(html,/TORNA ALL’APP/);assert.match(html,/report-esaminatore\.html/);
  const f=fixture();delete f.doc.__agendaStudentReportPrint;f.win.setTimeout=handler=>f.timers.push(handler);
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{window:f.win,document:f.doc});
  f.elements.studentReportPrint.click();f.elements.studentReportPrint.click();assert.equal(f.printCalls(),1);
  f.advance(1300);for(const timer of f.timers.splice(0))timer();f.elements.studentReportPrint.click();assert.equal(f.printCalls(),2);
  f.elements.studentReportClose.click();assert.equal(f.closeCalls(),1);
});

function element() {
  const listeners = {};
  return {
    disabled: false, hidden: true, href: "", textContent: "",
    classList: { toggle() {} },
    addEventListener(type, handler) { listeners[type] = handler; },
    click(event) { return listeners.click?.(event); },
    listeners
  };
}

function fixture(options = {}) {
  const ids = ["studentReportPrint", "studentReportClose", "studentReportPrintStatus", "studentReportPrintAlternatives", "studentReportOpenAgain", "studentReportDownloadHtml"];
  const elements = Object.fromEntries(ids.map(id => [id, element()]));
  let printCalls = 0, closeCalls = 0, now = 100;
  const windowListeners = {};
  const win = {
    performance: { now: () => now, timeOrigin: 1700000000000 },
    location: { href: "blob:https://locale.test/id-opaco" },
    print() { printCalls += 1; if (options.printError) throw new Error("print failed"); },
    close() { closeCalls += 1; },
    addEventListener(type, handler) { windowListeners[type] = handler; },
    setTimeout(handler) { if (options.runTimers) handler(); }
  };
  const timers = [];
  const doc = { getElementById: id => elements[id] };
  const api = installReportControls(win, doc, handler => timers.push(handler));
  return { elements, win, doc, timers, api, windowListeners, advance: ms => { now += ms; }, printCalls: () => printCalls, closeCalls: () => closeCalls };
}

test("il click reale invoca una sola stampa e collega il listener al documento", () => {
  const f = fixture();
  assert.equal(typeof f.elements.studentReportPrint.listeners.click, "function");
  f.elements.studentReportPrint.click();
  assert.equal(f.printCalls(), 1);
  assert.equal(f.elements.studentReportPrintAlternatives.hidden, false);
  assert.match(f.elements.studentReportPrintStatus.textContent, /Se il pannello non compare/);
});

test("il doppio tocco non apre due pannelli di stampa", () => {
  const f = fixture();
  f.elements.studentReportPrint.click();
  f.elements.studentReportPrint.click();
  assert.equal(f.printCalls(), 1);
  f.advance(1200);
  f.timers[0]();
  f.elements.studentReportPrint.click();
  assert.equal(f.printCalls(), 2);
});

test("un'eccezione di stampa mostra fallback e messaggio italiano", () => {
  const f = fixture({ printError: true });
  assert.doesNotThrow(() => f.elements.studentReportPrint.click());
  assert.equal(f.printCalls(), 1);
  assert.equal(f.elements.studentReportPrintAlternatives.hidden, false);
  assert.match(f.elements.studentReportPrintStatus.textContent, /Impossibile aprire la stampa/);
  assert.equal(f.elements.studentReportOpenAgain.href, f.win.location.href);
  assert.equal(f.elements.studentReportDownloadHtml.href, f.win.location.href);
  f.advance(1200);f.timers[0]();f.elements.studentReportPrint.click();
  assert.equal(f.printCalls(),2,"un errore non blocca definitivamente il comando");
});

test("eventi accodati, touch/click e timer anticipati non aggirano il blocco",()=>{
 const f=fixture(),button=f.elements.studentReportPrint;
 button.click({timeStamp:100});f.advance(900);f.api.releasePrintButton();
 button.disabled=false;button.click({timeStamp:1000});assert.equal(f.printCalls(),1,"oltre i vecchi 800 ms il blocco è ancora attivo");
 f.advance(300);f.timers[0]();
 button.click({timeStamp:1000});button.click({timeStamp:1700000001000});assert.equal(f.printCalls(),1,"eventi vecchi, anche epoch Safari, rifiutati dopo lo sblocco");
 button.click({timeStamp:1300});assert.equal(f.printCalls(),2,"nuovo gesto volontario ammesso");
 f.timers[0]();button.click({timeStamp:1301});assert.equal(f.printCalls(),2,"timer precedente non sblocca la nuova stampa");
});

test("inizializzazione ripetuta e rientro sincrono in print sono idempotenti",()=>{
 const f=fixture(),button=f.elements.studentReportPrint,handler=button.listeners.click;
 assert.equal(installReportControls(f.win,f.doc),f.api);assert.equal(button.listeners.click,handler);
 let calls=0;f.win.print=()=>{calls++;button.click();};button.click();assert.equal(calls,1);
});

test("il blocco copre anche eventi accodati durante un dialogo nativo lungo",()=>{
 const f=fixture();let calls=0;f.win.print=()=>{calls++;f.advance(10000)};
 f.elements.studentReportPrint.click();f.advance(1200);f.timers[0]();
 f.elements.studentReportPrint.click({timeStamp:5000});assert.equal(calls,1);
 f.elements.studentReportPrint.click();assert.equal(calls,2);
});

test("lo script incorporato è locale e non contiene chiamate di rete", () => {
  const script = documentScript();
  assert.match(script, /addEventListener/);
  assert.match(script, /win\.print\(\)/);
  assert.doesNotMatch(script, /fetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//);
});

test("report riapribile possiede il suo Blob e non lo revoca prima dell'uscita effettiva",()=>{
 const nodes=Object.fromEntries(["studentReportPrint","studentReportClose","studentReportPrintStatus","studentReportPrintAlternatives","studentReportOpenAgain","studentReportDownloadHtml"].map(id=>[id,element()])),events={},revoked=[];let removed=false;
 const doc={documentElement:{dataset:{},cloneNode:()=>({removeAttribute:name=>{assert.equal(name,"data-print-controls");removed=true},outerHTML:"<html>REPORT FITTIZIO</html>"})},getElementById:id=>nodes[id]};
 const win={Blob,URL:{createObjectURL:()=>"blob:report-proprio",revokeObjectURL:url=>revoked.push(url)},location:{href:"blob:origine"},addEventListener:(name,fn)=>events[name]=fn,setTimeout(){},print(){}};
 installReportControls(win,doc);assert.equal(removed,true);assert.equal(nodes.studentReportOpenAgain.href,"blob:report-proprio");assert.deepEqual(revoked,[]);events.pagehide({persisted:true});assert.deepEqual(revoked,[]);events.pagehide({persisted:false});assert.deepEqual(revoked,["blob:report-proprio"]);
});
