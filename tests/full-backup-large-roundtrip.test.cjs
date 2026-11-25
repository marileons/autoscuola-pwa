"use strict";
// Single isolated UI round trip; all accounts, students, pictures and documents are synthetic.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const {chromium}=require("C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const {fixture}=require("./shared-calendar-support.js");
const repo=path.resolve(__dirname,".."),leaf=path.resolve("C:/Users/HP/Documents/Codex/2026-10-11/referenced-chatgpt-conversation-this-is-an-2/outputs/gps-heading-preview-2026-11-04");
(async()=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),"agenda-backup-large-")),f=await fixture();
 const browser=await chromium.launch({executablePath:fs.existsSync(chromium.executablePath())?chromium.executablePath():"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
 const errors=[];
 async function session(){
  const context=await browser.newContext({viewport:{width:768,height:1024},isMobile:true,hasTouch:true,acceptDownloads:true}),page=await context.newPage();
  page.setDefaultTimeout(180000);page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/*",async route=>{
   const req=route.request(),u=new URL(req.url()),p=u.pathname;
   if(u.hostname==="unpkg.com"){
    if(p.endsWith("/leaflet.js"))return route.fulfill({path:path.join(leaf,"leaflet-1.9.4.js")});
    if(p.endsWith("/leaflet.css"))return route.fulfill({path:path.join(leaf,"leaflet-1.9.4.css")});
    return route.abort();
   }
   if(u.hostname!=="agenda.local")return route.abort();
   if(p.startsWith("/api/")){
    const headers=new Headers(f.request("principal",p).headers);if(req.method()!=="GET")headers.set("origin","https://calendar.test");
    const res=await f.worker.fetch(new Request("https://calendar.test"+p+u.search,{method:req.method(),headers,...(req.postData()?{body:req.postData()}:{})}),f.env);
    return route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:Buffer.from(await res.arrayBuffer())});
   }
   const file=path.resolve(repo,"."+(p==="/"?"/index.html":p));
   return fs.existsSync(file)?route.fulfill({path:file}):route.abort();
  });
  await page.goto("https://agenda.local");await page.locator("#home.active #homeFullBackup").waitFor();return{context,page};
 }
 async function fingerprints(page){return page.evaluate(async()=>{
  const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,"0")).join("");
  const snapshot=await AgendaStudentArchiveStore.snapshotForBackup(),photos=[];
  for(const student of snapshot.students)photos.push({id:student.id,sha256:await digest(student.photo)});
  const db=await new Promise((ok,no)=>{const r=indexedDB.open("agenda_istruttori_documents",1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
  const docs=await new Promise((ok,no)=>{const r=db.transaction("documents","readonly").objectStore("documents").getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});db.close();
  const documents=[];for(const d of docs)documents.push({id:d.id,size:d.blob.size,sha256:await digest(await d.blob.text())});
  return{archiveSha256:await digest(JSON.stringify(StudentArchiveStore.canonical(snapshot))),photos,documents};
 })}
 async function restoreArchive(archive,original){
  const B=await session(),q=B.page;assert.equal(await q.evaluate(async()=>(await AgendaStudentArchiveStore.snapshot()).length),0);
  await q.locator("#openOtherFunctions").click();await q.locator("#openSettings").click();
  await q.locator("#fullBackupFile").setInputFiles(archive);
  await q.getByRole("heading",{name:"Backup completo Agenda Istruttori",exact:true}).waitFor();
  await q.getByRole("button",{name:"Continua",exact:true}).click();await q.getByRole("heading",{name:"ATTENZIONE",exact:true}).waitFor();
  await q.getByRole("button",{name:"RIPRISTINA",exact:true}).click();
  try{await q.waitForFunction(()=>{const m=document.getElementById("fullBackupMessage");return m?.textContent.includes("Ripristino completo verificato dopo il riavvio")||m?.classList.contains("full-backup-error")&&!m.classList.contains("hidden")},{},{timeout:180000})}
  catch(error){throw Error(error.message+" Stato: "+await q.locator("#fullBackupMessage").textContent()+"; avanzamento: "+await q.locator("#fullBackupProgressText").textContent()+"; errori: "+JSON.stringify(errors))}
  const message=await q.locator("#fullBackupMessage").textContent();console.log("Esito ripristino:",message);assert.match(message,/Ripristino completo verificato dopo il riavvio/);
  assert.deepEqual(await fingerprints(q),original);assert.deepEqual(errors,[]);await B.context.close();
 }
 try{
  if(process.argv[2]){
   const archive=path.resolve(process.argv[2]),data=JSON.parse(fs.readFileSync(archive,"utf8")),hash=text=>crypto.createHash("sha256").update(text).digest("hex"),canonical=require("../student-archive-store.js").canonical;
   const original={archiveSha256:hash(JSON.stringify(canonical({students:data.appData.students,studentTrash:data.appData.studentTrash,studentSites:data.appData.studentSites}))),photos:data.appData.students.map(s=>({id:s.id,sha256:hash(s.photo)})),documents:data.documents.map(d=>({id:d.id,size:d.size,sha256:hash(Buffer.from(d.dataBase64,"base64").toString())}))};
   await restoreArchive(archive,original);console.log("Ripristino e confronto integrale superati sul file già scaricato:",archive);return;
  }
  const A=await session(),p=A.page;
  await p.evaluate(async()=>{
   const canvas=document.createElement("canvas");canvas.width=canvas.height=1024;const ctx=canvas.getContext("2d"),image=ctx.createImageData(1024,1024);let seed=37;const students=[];
   for(let n=0;n<9;n++){
    for(let i=0;i<image.data.length;i+=4){for(let j=0;j<3;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;image.data[i+j]=seed>>>24}image.data[i+3]=255}
    ctx.putImageData(image,0,0);
    students.push(normalizeStudent({id:"backup-fittizio-"+n,firstName:"Allievo",lastName:"Fittizio "+n,category:"auto",photo:canvas.toDataURL("image/png"),notes:"Test integrale: accenti àèìòù e fotografie",checklist:[],lessons:[{id:"guida-fittizia-"+n,createdAt:1795590000000,duration:"1 ora",notes:"Nota conservata",route:[],checklist:[],errors:[]}]}));
   }
   await AgendaStudentArchiveStore.replaceAll(students);
   const db=await new Promise((ok,no)=>{const r=indexedDB.open("agenda_istruttori_documents",1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
   await new Promise((ok,no)=>{const tx=db.transaction("documents","readwrite");tx.objectStore("documents").put({id:"documento-fittizio",originalName:"prova.txt",title:"Documento fittizio",section:"common",createdAt:1795590000000,size:18,mimeType:"text/plain",blob:new Blob(["Documento fittizio"],{type:"text/plain"})});tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close();
  });
  const original=await fingerprints(p);assert.equal(original.photos.length,9);fs.writeFileSync(path.join(output,"originale.json"),JSON.stringify(original));
  assert.equal(await p.evaluate(()=>typeof BackupVoice),"undefined");
  assert.equal(await p.locator("#prepareBackupVoice").count(),0);
  let downloads=0;p.on("download",()=>downloads++);
  await p.locator("#homeFullBackup").click();
  await p.getByRole("heading",{name:"Backup completo pronto",exact:true}).waitFor();
  assert.equal(await p.getByRole("button",{name:"SALVA BACKUP",exact:true}).isVisible(),true);assert.equal(downloads,0);
  const pending=p.waitForEvent("download");await p.getByRole("button",{name:"SALVA BACKUP",exact:true}).click();const download=await pending;
  assert.equal(await download.failure(),null);const archive=path.join(output,"fittizio.agendabackup");await download.saveAs(archive);
  const content=JSON.parse(fs.readFileSync(archive,"utf8")),headerBytes=Buffer.byteLength(JSON.stringify({...content,documents:undefined}));
  assert.ok(headerBytes>32*1024*1024,"La sezione deve superare davvero 32 MiB");assert.ok(headerBytes<256*1024*1024);assert.equal(content.formatVersion,4);
  assert.equal(content.appData.students.length,9);
  console.log("Download verificato:",fs.statSync(archive).size,"byte; avvio ripristino isolato.");
  await restoreArchive(archive,original);
  const result={browser:"Chromium/Edge locale, viewport tablet simulato; non tablet Android reale",fileBytes:fs.statSync(archive).size,headerBytes,students:original.photos.length,photosIdentical:true,archiveIdentical:true,documentsIdentical:true,saveButtonVisible:true,downloadOnlyOnTap:true,restoreVerifiedAfterReload:true,sha256:crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex")};
  fs.writeFileSync(path.join(output,"risultato.json"),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,output},null,2));
  await A.context.close();
 }finally{await browser.close();f.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
