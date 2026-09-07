"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const css=fs.readFileSync(path.join(root,"style.css"),"utf8");

test("ogni errore specifico associa label e checkbox con ID univoco",()=>{
  const render=app.match(/function renderDrivingErrorSpecificChoices[\s\S]*?\nfunction renderDrivingErrors/)?.[0]||"";
  assert.match(render,/controlId=`driving-error-specific-\$\{encodeURIComponent\(item\.id\)\}-\$\{encodeURIComponent\(entry\.id\)\}`/);
  assert.match(render,/label\.htmlFor=controlId/);
  assert.match(render,/input\.id=controlId/);
  assert.match(render,/label\.append\(input,text\)/);
});

test("ogni allievo associa il nome soltanto alla propria checkbox stabile",()=>{
  const render=app.match(/function openStudentMultiAction[\s\S]*?\nfunction executeStudentMultiAction/)?.[0]||"";
  assert.match(render,/controlId=`multi-student-\$\{encodeURIComponent\(item\.id\)\}`/);
  assert.match(render,/label\.htmlFor=controlId/);
  assert.match(render,/input\.id=controlId/);
  assert.match(render,/input\.value=item\.id/);
  assert.match(render,/label\.append\(input,text\)/);
});

test("righe touch mantengono checkbox a sinistra e testo lungo ordinato",()=>{
  assert.match(css,/\.multi-student-option\{[^}]*display:grid[^}]*grid-template-columns:24px minmax\(0,1fr\)[^}]*align-items:start[^}]*column-gap:8px/);
  assert.match(css,/\.multi-student-option span\{[^}]*display:block[^}]*min-width:0[^}]*margin:0[^}]*padding:0[^}]*overflow-wrap:anywhere/);
  assert.match(css,/\.driving-error-card \.driving-error-specific-option\{[^}]*display:grid[^}]*grid-template-columns:22px minmax\(0,1fr\)[^}]*align-items:start[^}]*column-gap:8px/);
  assert.match(css,/\.driving-error-card \.driving-error-specific-option span\{[^}]*display:block[^}]*min-width:0[^}]*margin:0[^}]*padding:0[^}]*overflow-wrap:anywhere/);
});

test("le checkbox non possono occupare la larghezza della riga",()=>{
  assert.match(css,/\.multi-student-option input\[type="checkbox"\]\{[^}]*appearance:auto[^}]*align-self:start[^}]*height:22px[^}]*min-height:0[^}]*padding:0!important[^}]*margin:\.05em 0 0!important/);
  assert.match(css,/\.driving-error-card \.driving-error-specific-option input\[type="checkbox"\]\{[^}]*appearance:auto[^}]*align-self:start[^}]*height:22px[^}]*min-height:0[^}]*padding:0!important[^}]*margin:\.05em 0 0!important/);
});
