const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const app=fs.readFileSync("app.js","utf8"),html=fs.readFileSync("index.html","utf8"),css=fs.readFileSync("style.css","utf8");

test("scheda allievo e guida conservano la provenienza senza ricaricare la pagina",()=>{
  assert.match(html,/id="backStudent"[^>]*>Indietro</);assert.match(app,/function studentListOrigin\(view\)/);
  assert.match(app,/openStudent\(s\.id,studentListOrigin\("categoryHub"\)\)/);assert.match(app,/openStudent\(s\.id,studentListOrigin\("studentArchive"\)\)/);
  assert.match(app,/function backFromStudent\(\)/);assert.match(app,/state\.lessonReturn=\{lessonsExpanded:state\.lessonsExpanded,scrollY:window\.scrollY\}/);
  assert.match(app,/openStudent\(state\.studentId,null,\{preserveLessons:true\}\)/);assert.doesNotMatch(app,/function backFromStudent[\s\S]*?location\.(?:reload|replace)/);
});

test("attività didattiche sono raggruppate senza cambiare persistenza o ordine completo",()=>{
  for(const title of ["Parte iniziale: controlli, preparazione e comandi","Autostrada","Manovre in via delle Genziane","Manovre in via Bobbio","Circolazione, sopraelevata ed extraurbana","Altre attività"])assert.ok(app.includes(title),title);
  assert.match(app,/items\.forEach\(\(item,index\)=>\{const groupIndex=activityGroupIndex/);assert.match(app,/sort\(\(a,b\)=>a\[1\]\.first-b\[1\]\.first\)/);
  assert.match(app,/if\(expanded\)\{renderActivityRows\(items\.map\(\(item,index\)=>\(\{item,index\}\)\),root\);return\}/);assert.match(app,/all\[index\]\.status=next/);
  assert.match(app,/dataset\.items=JSON\.stringify\(all\)/);assert.match(html,/VISUALIZZA TUTTA L’ATTIVITÀ DIDATTICA/);assert.match(css,/\.activity-section/);
});

test("solo i nuovi allievi vengono salvati in maiuscolo preservando gli altri campi",()=>{
  assert.match(app,/first=state\.editingStudent\?enteredFirst:enteredFirst\.toLocaleUpperCase\("it-IT"\)/);assert.match(app,/last=state\.editingStudent\?enteredLast:enteredLast\.toLocaleUpperCase\("it-IT"\)/);
  assert.doesNotMatch(app,/studentNotes[^\n]*toLocaleUpperCase/);assert.equal("èlia d'angelo-rossi".toLocaleUpperCase("it-IT"),"ÈLIA D'ANGELO-ROSSI");
});

test("ordine comandi mantiene Nuova guida e colloca archivio e PDF prima di Elimina",()=>{
  const student=html.match(/<section id="student"[\s\S]*?<\/section>/)[0],positions=["newLesson","archiveStudent","exportStudentPdf","deleteStudent"].map(id=>student.indexOf(`id="${id}"`));
  assert.ok(positions.every(value=>value>=0));assert.ok(positions[0]<positions[1]&&positions[1]<positions[2]&&positions[2]<positions[3]);
});

test("ricerca mobile compatta la schermata senza perdere focus o introdurre reload",()=>{
  assert.match(app,/addEventListener\("focus",\(\)=>setStudentSearchFocused\(true\)\)/);assert.match(app,/addEventListener\("blur",\(\)=>setStudentSearchFocused\(false\)\)/);
  assert.match(app,/visualViewport\?\.addEventListener\("resize"/);assert.match(css,/#categoryHub\.student-search-focused/);const focusFunction=app.match(/function setStudentSearchFocused\([^\n]+/)[0];assert.doesNotMatch(focusFunction,/location\./);
});

test("un risultato resta selezionabile con tastiera mobile attiva e conserva la ricerca al ritorno",()=>{
  const render=app.match(/function renderStudents\(\)[\s\S]*?\nfunction renderArchivedStudents/)?.[0]||"";
  assert.match(render,/studentResultPointerActive=true/);
  assert.match(render,/pointerup/);assert.match(render,/event\.pointerType==="touch"/);assert.match(render,/event\.preventDefault\(\);activate\(\)/);
  assert.match(render,/openStudent\(s\.id,studentListOrigin\("categoryHub"\)\)/);
  assert.match(app,/if\(!focused&&state\.studentResultPointerActive\)return/);
  assert.match(app,/\$\("search"\)\.value=origin\.query\|\|""/);
  assert.match(app,/state\.studentListMode=origin\.mode/);
  assert.match(app,/searchFocused:view==="categoryHub"/);
  assert.match(app,/focus\(\{preventScroll:true\}\)/);
  assert.match(app,/scrollTo\(0,origin\.scrollY\|\|0\)/);
});

test("CERCA ALLIEVO include gli archiviati della categoria con badge non interattivo",()=>{
  const render=app.match(/function renderStudents\(\)[\s\S]*?\nfunction renderArchivedStudents/)?.[0]||"";
  assert.match(render,/includeArchived=state\.studentListMode==="search"/);
  assert.match(render,/studentsForCategorySearch\(state\.students,state\.filter,includeArchived\)/);
  assert.match(render,/student-archive-badge/);assert.match(render,/>ARCHIVIATO</);
  assert.match(css,/\.student-archive-badge\{[^}]*pointer-events:none/);
});

test("campo ricerca mantiene margine moderato e stabile nella modalità tastiera",()=>{
  assert.match(css,/\.category-hub #studentSearchPanel\{margin-top:10px\}/);
  assert.match(css,/#categoryHub\.student-search-focused #studentSearchPanel\{margin-top:10px;scroll-margin-top:/);
  assert.match(css,/#categoryHub\.student-search-focused #studentResults\{margin-top:8px\}/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/\.category-hub #search\{font-size:16px\}/);
});

test("Altre funzioni usa simbolo locale e condivisione usa righe checkbox coerenti",()=>{
  assert.match(html,/id="openOtherFunctions"[\s\S]*?<svg class="other-functions-symbol"[^>]*aria-hidden="true"/);assert.doesNotMatch(html.match(/id="openOtherFunctions"[^\n]*/)[0],/https?:\/\//);
  const share=app.match(/function openStudentMultiShare\(\)[\s\S]*?\n}/)[0];assert.match(share,/controlId=`share-student-/);assert.match(share,/label\.className="detail-row multi-student-option"/);assert.match(share,/label\.htmlFor=controlId/);assert.match(share,/input\.id=controlId/);
});

test("report PDF continua a leggere checklist salvate senza raggruppamenti UI",()=>{
  const report=fs.readFileSync("r10-features.js","utf8");assert.match(report,/Storico guide/);assert.doesNotMatch(report,/ACTIVITY_GROUPS|activityGroupIndex/);
});

test("report PDF apre direttamente un documento locale con controlli collegati senza document.write",()=>{
  const report=fs.readFileSync("r10-features.js","utf8"),fn=report.match(/function exportStudentPdf\(\)[\s\S]*?\n  }/)?.[0]||"";
  assert.match(fn,/new Blob\(\[html\],\{type:"text\/html;charset=utf-8"\}\)/);
  assert.match(fn,/window\.open\(url,"_blank"\)/);assert.match(report,/URL\.revokeObjectURL/);
  assert.doesNotMatch(fn,/document\.write|window\.open\("","_blank"\)|await\s/);
  assert.match(report,/id="studentReportPrint"/);assert.match(report,/printScript/);
  assert.match(report,/StudentReportPrint/);
});

test("popup PDF bloccato espone un nuovo gesto diretto senza revoca anticipata",()=>{
  const report=fs.readFileSync("r10-features.js","utf8"),html=fs.readFileSync("index.html","utf8");
  assert.match(html,/id="openStudentPdfFallback"[^>]*target="_blank"[^>]*>APRI PDF<\/a>/);
  assert.match(html,/id="studentPdfFallbackMessage"[^>]*role="status"/);
  assert.match(report,/try\{reportWindow=window\.open\(url,"_blank"\)\}catch\{\}/);
  assert.match(report,/showStudentPdfFallback\(url\)/);
  assert.match(report,/link\.href=url;link\.classList\.remove\("hidden"\)/);
  assert.doesNotMatch(report,/if\(!reportWindow\)\{URL\.revokeObjectURL\(url\)/);
  assert.match(report,/openStudentPdfFallback"\)\.addEventListener\("click"/);
  assert.doesNotMatch(report,/300000/);
});

test("controller stampa caricato prima del report e fallback descrive correttamente HTML stampabile",()=>{
  const auth=fs.readFileSync("auth-client.js","utf8"),report=fs.readFileSync("r10-features.js","utf8");
  assert.ok(auth.indexOf("student-report-print.js")<auth.indexOf("r10-features.js"));
  assert.match(report,/SCARICA REPORT STAMPABILE/);
  assert.match(report,/HTML stampabile/);
  assert.match(report,/Content-Security-Policy/);
});
