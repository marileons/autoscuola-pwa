"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

test("la guida espone pulsante rapido, conferma accessibile e pannello errori",()=>{
  const html=read("index.html"),css=read("style.css");
  for(const id of ["signalDrivingError","drivingErrorConfirmation","drivingErrorCount","drivingErrorsPanel","drivingErrorsList"])assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(html,/drivingErrorConfirmation[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(css,/\.signal-driving-error\{[^}]*min-height:(?:58|60)px/);
  assert.match(css,/\.driving-error-card select,\.driving-error-card textarea\{[^}]*font-size:16px/);
});

test("il flusso applicativo salva errori, bozze, marcatori e non interrompe il GPS",()=>{
  const source=read("app.js"),signal=source.match(/function signalDrivingError\(\)\{[\s\S]*?\}\nasync function leaveLesson/)?.[0]||"";
  assert.match(source,/errors:DRIVING_ERRORS\.normalizeErrors\(l\.errors\)/);
  assert.match(source,/errors:DRIVING_ERRORS\.normalizeErrors\(state\.tempErrors\)/);
  assert.match(source,/createDraftStore\(localStorage\)/);
  assert.match(source,/drawDrivingErrorMarkers\(state\.savedMap/);
  assert.match(source,/lastGpsFix=\{\.\.\.p,routeIndex:state\.tempRoute\.length-1\}/);
  assert.doesNotMatch(signal,/stopGps\s*\(/);
});

test("gli asset sono caricati nell'ordine corretto e con versione dedicata",()=>{
  const source=read("auth-client.js"),moduleIndex=source.indexOf('driving-errors.js?v=1.21-driving-errors-v1'),appIndex=source.indexOf('app.js?v=1.21-exam-routes-v1');
  assert.ok(moduleIndex>=0&&appIndex>moduleIndex);
  assert.match(source,/full-backup\.js\?v=1\.21-exam-routes-v1/);
  assert.match(source,/r10-features\.js\?v=1\.21-driving-errors-v1/);
});

test("backup corrente include gli errori e mantiene l'importazione dei formati precedenti",()=>{
  const source=read("full-backup.js");
  assert.match(source,/FORMAT_VERSION=3/);
  assert.match(source,/SUPPORTED_FORMAT_VERSIONS=new Set\(\[1,2,3\]\)/);
  assert.match(source,/errors:window\.DrivingErrors\.normalizeErrors/);
});

test("il report allievo include la sezione errori senza ricalcoli GPS",()=>{
  const source=read("r10-features.js");
  assert.match(source,/function drivingErrorsReportHtml/);
  assert.match(source,/Errori segnalati/);
  assert.match(source,/drivingErrorsReportHtml\(item\)/);
});

test("i moduli della funzione non introducono richieste di rete",()=>{
  for(const name of ["driving-errors.js"]){
    const source=read(name);
    assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i);
  }
});
