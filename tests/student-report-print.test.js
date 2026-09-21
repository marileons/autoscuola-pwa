"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { installReportControls, documentScript } = require("../student-report-print.js");

function element() {
  const listeners = {};
  return {
    disabled: false, hidden: true, href: "", textContent: "",
    classList: { toggle() {} },
    addEventListener(type, handler) { listeners[type] = handler; },
    click() { return listeners.click?.(); },
    listeners
  };
}

function fixture(options = {}) {
  const ids = ["studentReportPrint", "studentReportClose", "studentReportPrintStatus", "studentReportPrintAlternatives", "studentReportOpenAgain", "studentReportDownloadHtml"];
  const elements = Object.fromEntries(ids.map(id => [id, element()]));
  let printCalls = 0, closeCalls = 0;
  const windowListeners = {};
  const win = {
    location: { href: "blob:https://locale.test/id-opaco" },
    print() { printCalls += 1; if (options.printError) throw new Error("print failed"); },
    close() { closeCalls += 1; },
    addEventListener(type, handler) { windowListeners[type] = handler; },
    setTimeout(handler) { if (options.runTimers) handler(); }
  };
  const timers = [];
  const api = installReportControls(win, { getElementById: id => elements[id] }, handler => timers.push(handler));
  return { elements, win, timers, api, windowListeners, printCalls: () => printCalls, closeCalls: () => closeCalls };
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
