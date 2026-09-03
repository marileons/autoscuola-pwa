"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");

test("la UI espone percorsi, bozze, report, esportazione, importazione e PDF esaminatore",()=>{
  const html=read("index.html"),ui=read("examiner-routes-ui.js");
  for(const id of ["examinerRoutesSection","newExaminerRoute","examinerDrafts","examinerRoutesList","examinerRouteView","generateExaminerRoadReport","resumeExaminerRoadReport","retryExaminerRoadReport","stopExaminerRoadReport","shareExaminer","chooseExaminerFile","exportExaminerPdf"])assert.match(html,new RegExp(`id=["']${id}["']`));
  assert.match(ui,/formatVersion:1/);assert.match(ui,/type:"examiner"/);assert.match(ui,/UNISCI CONTROLLANDO I PERCORSI/);assert.match(ui,/CREA NUOVA SCHEDA/);assert.match(ui,/STAMPA \/ SALVA PDF/);
  assert.match(ui,/generateExaminerRoadReport"\)\.onclick=\(\)=>generateReport\(\)/);assert.match(ui,/retryExaminerRoadReport"\)\.onclick=retryUnidentified/);
  assert.match(ui,/function persistDraftMeta\(\)/);assert.match(ui,/examinerRouteTitleInput"\)\.addEventListener\("input",persistDraftMeta\)/);assert.match(ui,/examinerRouteNote"\)\.addEventListener\("input",persistDraftMeta\)/);
  assert.match(html,/examinerRoutesCount[^>]*>0 di 15</);assert.match(html,/Limite di 15 percorsi raggiunto/);assert.match(ui,/items\.length>=core\.MAX_ROUTES/);assert.match(ui,/mergeRoutes\(existing,incoming,examinerId\)/);
});

test("caricamento protetto rispetta l'ordine core, app e UI",()=>{
  const auth=read("auth-client.js"),core=auth.indexOf('"examiner-routes.js'),app=auth.indexOf('"app.js'),ui=auth.indexOf('"examiner-routes-ui.js');
  assert.ok(core>=0&&app>core&&ui>app);assert.match(auth,/ExaminerRoutesUI\?\.stopAll/);
});

test("configurazione Worker è solo un kill switch pubblico e non un proxy di coordinate",()=>{
  const worker=read("worker.js");
  assert.match(worker,/\/api\/public-config\/road-report/);assert.match(worker,/ROAD_REPORT_ENABLED/);assert.match(worker,/nominatim\.openstreetmap\.org\/reverse/);
  assert.doesNotMatch(worker,/api\/(?:examiner-routes|road-report\/reverse)/);assert.doesNotMatch(worker,/lat.*env\.|lng.*env\./s);
});

test("il report usa solo Nominatim gratuito, consenso, stop e limite dichiarato di 40",()=>{
  const ui=read("examiner-routes-ui.js"),core=read("examiner-routes.js");
  assert.match(ui,/confirm\("Per identificare le vie/);assert.match(ui,/endpoint!=="https:\/\/nominatim\.openstreetmap\.org\/reverse"/);assert.match(ui,/reportAbort\?\.abort/);
  assert.match(core,/MAX_NETWORK_REQUESTS=40/);assert.match(core,/REQUEST_INTERVAL_MS=1250/);assert.doesNotMatch(ui+core,/googleapis|mapbox|here\.com|bingmaps|api[_-]?key/i);
});

test("backup generale include archivio e bozze dei percorsi esaminatori con rollback",()=>{
  const backup=read("full-backup.js");
  assert.match(backup,/FORMAT_VERSION=3/);assert.match(backup,/examinerRoutes:window\.ExaminerRoutesUI\?\.snapshot/);assert.match(backup,/ExaminerRoutesUI(?:\.|\?\.)restore/);assert.match(backup,/examinerRoutesSha256/);
});

test("integrazione elimina percorsi solo con conferma e impedisce GPS concorrenti",()=>{
  const app=read("app.js"),ui=read("examiner-routes-ui.js"),r10=read("r10-features.js");
  assert.match(app,/beforeDeleteExaminer/);assert.match(ui,/AgendaGpsCoordinator\.acquire\("examiner"\)/);assert.match(ui,/AgendaRoadReportCoordinator\.acquire\("examiner"\)/);assert.match(r10,/AgendaRoadReportCoordinator\.acquire\("lesson"\)/);assert.match(r10,/gpsRecordingActive/);
});

test("campi touch dei percorsi restano a 16px e layout mobile evita overflow",()=>{
  const css=read("style.css");
  assert.match(css,/\.examiner-route-view[^}]*max-width:\s*100%/s);assert.match(css,/\.examiner-route-view[^}]*overflow-x:\s*hidden/s);assert.match(css,/\.examiner-route-view[^}]*input[^}]*font-size:\s*16px/s);assert.match(css,/@media\s*\(max-width:\s*520px\)/);
});
