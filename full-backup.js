// Backup completo e separato: dati applicativi in localStorage e documenti in IndexedDB.
(()=>{
  "use strict";
  if(window.__agendaFullBackupInitialized)return;
  window.__agendaFullBackupInitialized=true;

  const FORMAT="AgendaIstruttoriFullBackup";
  const FORMAT_VERSION=4;
  const SUPPORTED_FORMAT_VERSIONS=new Set([1,2,3,4]);
  const APP_VERSION="1.21.0";
  const BACKUP_EXTENSION="agendabackup";
  const DATA_KEYS={
    students:"autoscuola_v3_completa",
    checklists:"autoscuola_v3_checklists_v2",
    examiners:"autoscuola_v3_examiners",
    exams:"autoscuola_v3_exam_sessions",
    examLocations:"autoscuola_v3_exam_locations"
  };
  const DOCUMENT_DB="agenda_istruttori_documents";
  const DOCUMENT_DB_VERSION=1;
  const DOCUMENT_STORE="documents";
  const SAFETY_DB="agenda_istruttori_full_backup_safety";
  const SAFETY_STORE="snapshots";
  const SAFETY_DOCUMENT_STORE="documents";
  const SAFETY_KEY="beforeRestore";
  const STAGING_DB="agenda_istruttori_full_backup_staging";
  const STAGING_DOCUMENT_STORE="documents";
  const STAGING_CHUNK_STORE="documentChunks";
  const INTERRUPTED_RESTORE_KEY="agenda_istruttori_full_restore_reading";
  const PENDING_RESTORE_KEY="agenda_istruttori_full_restore_pending";
  const RESTORE_RESULT_KEY="agenda_istruttori_full_restore_result";
  const byId=id=>document.getElementById(id);
  let restoreInProgress=false,restoreReloadScheduled=false,restoreAbortController=null;
  localStorage.removeItem("agenda_istruttori_full_backup_diagnostic_v1");

  function showMessage(text,isError=false){
    const message=byId("fullBackupMessage");
    message.textContent=text;
    message.classList.remove("hidden","full-backup-error","full-backup-success");
    message.classList.add(isError?"full-backup-error":"full-backup-success");
  }

  function clearMessage(){
    byId("fullBackupMessage").classList.add("hidden");
  }

  function showProgress(phase,loaded=0,total=0){
    const box=byId("fullBackupProgress"),bar=byId("fullBackupProgressBar"),text=byId("fullBackupProgressText");
    box.classList.remove("hidden");
    const percent=total>0?Math.min(100,Math.round(loaded/total*100)):0;
    bar.value=percent;text.textContent=`${phase}${total>0?` · ${percent}%`:""}`;
  }
  function hideProgress(){byId("fullBackupProgress")?.classList.add("hidden")}
  function idlePause(){return new Promise(resolve=>setTimeout(resolve,0))}

  function formatBytes(bytes){
    if(!bytes)return "0 B";
    const units=["B","KB","MB","GB"];
    const unit=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),units.length-1);
    return `${(bytes/Math.pow(1024,unit)).toLocaleString("it-IT",{maximumFractionDigits:unit?1:0})} ${units[unit]}`;
  }

  function parsedStorageValue(key,fallback){
    const raw=localStorage.getItem(key);
    if(raw===null)return fallback;
    return JSON.parse(raw);
  }

  function studentsWithoutDrivingLicenses(students){
    return (Array.isArray(students)?students:[]).map(student=>{const clean={...student};delete clean.drivingLicense;return clean});
  }

  function drivingLicenseRecords(students){
    return (Array.isArray(students)?students:[]).filter(student=>student&&Object.hasOwn(student,"drivingLicense")&&student.drivingLicense).map(student=>({studentId:String(student.id),...window.StudentLicense.normalize(student.drivingLicense,{strict:true})}));
  }

  async function storedStudentsWithDrivingLicenses(){
    const students=parsedStorageValue(DATA_KEYS.students,[]);
    return window.AgendaStudentLicenseStore?window.AgendaStudentLicenseStore.attachStudents(students):students;
  }

  function validateAppData(appData){
    if(!appData||typeof appData!=="object")throw new Error("Dati applicativi mancanti.");
    if(!Array.isArray(appData.students))throw new Error("Archivio allievi non valido.");
    if(!appData.checklists||typeof appData.checklists!=="object"||Array.isArray(appData.checklists))throw new Error("Checklist non valide.");
    if(!Array.isArray(appData.examiners))throw new Error("Archivio esaminatori non valido.");
    if(appData.exams!==undefined)window.AgendaExams.normalizeExams(appData.exams,{strict:true});
    if(appData.examLocations!==undefined&&!Array.isArray(appData.examLocations))throw new Error("Località esami non valide.");
    const studentIds=new Set();
    for(const student of appData.students){
      if(!student||typeof student!=="object"||typeof student.id!=="string"||!student.id||studentIds.has(student.id))throw new Error("Il backup contiene allievi duplicati o non validi.");
      if(!Array.isArray(student.lessons)||!Array.isArray(student.checklist))throw new Error("Scheda allievo incompleta nel backup.");
      if(Object.hasOwn(student,"drivingLicense"))window.StudentLicense.normalize(student.drivingLicense,{strict:true});
      const lessonIds=new Set();
      for(const lesson of student.lessons){if(!lesson||typeof lesson!=="object"||typeof lesson.id!=="string"||!lesson.id||lessonIds.has(lesson.id)||!Array.isArray(lesson.route)||!Array.isArray(lesson.checklist)||!Array.isArray(lesson.errors||[]))throw new Error("Guida duplicata o non valida nel backup.");lessonIds.add(lesson.id)}
      studentIds.add(student.id);
    }
    const examinerIds=new Set();
    for(const examiner of appData.examiners){if(!examiner||typeof examiner!=="object"||typeof examiner.id!=="string"||!examiner.id||examinerIds.has(examiner.id)||!Array.isArray(examiner.habits))throw new Error("Esaminatore duplicato o non valido nel backup.");examinerIds.add(examiner.id)}
    for(const value of Object.values(appData.checklists))if(!Array.isArray(value))throw new Error("Checklist non valida nel backup.");
  }

  function openDocumentDatabase(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DOCUMENT_DB,DOCUMENT_DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(DOCUMENT_STORE)){
          const store=db.createObjectStore(DOCUMENT_STORE,{keyPath:"id"});
          store.createIndex("createdAt","createdAt");
        }
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error("Archivio documenti temporaneamente bloccato."));
    });
  }

  async function readDocumentKeys(){
    const db=await openDocumentDatabase();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(DOCUMENT_STORE,"readonly");
      const request=transaction.objectStore(DOCUMENT_STORE).getAllKeys();
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      transaction.oncomplete=()=>db.close();
      transaction.onabort=()=>{db.close();reject(transaction.error||request.error)};
    });
  }

  async function readDocumentByKey(key){
    const db=await openDocumentDatabase();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(DOCUMENT_STORE,"readonly");
      const request=transaction.objectStore(DOCUMENT_STORE).get(key);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      transaction.oncomplete=()=>db.close();
      transaction.onabort=()=>{db.close();reject(transaction.error||request.error)};
    });
  }

  function openSafetyDatabase(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(SAFETY_DB,2);
      request.onupgradeneeded=()=>{
        if(!request.result.objectStoreNames.contains(SAFETY_STORE))request.result.createObjectStore(SAFETY_STORE,{keyPath:"id"});
        if(!request.result.objectStoreNames.contains(SAFETY_DOCUMENT_STORE))request.result.createObjectStore(SAFETY_DOCUMENT_STORE,{keyPath:"id"});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error("Archivio di sicurezza temporaneamente bloccato."));
    });
  }

  function openStagingDatabase(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(STAGING_DB,2);
      request.onupgradeneeded=()=>{
        if(!request.result.objectStoreNames.contains(STAGING_DOCUMENT_STORE))request.result.createObjectStore(STAGING_DOCUMENT_STORE,{keyPath:"id"});
        if(!request.result.objectStoreNames.contains(STAGING_CHUNK_STORE)){
          const chunks=request.result.createObjectStore(STAGING_CHUNK_STORE,{keyPath:"key"});
          chunks.createIndex("documentId","documentId");
        }
      };
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error("Area temporanea del ripristino bloccata."));
    });
  }
  async function clearStaging(){
    const db=await openStagingDatabase();
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction([STAGING_DOCUMENT_STORE,STAGING_CHUNK_STORE],"readwrite");
      transaction.objectStore(STAGING_DOCUMENT_STORE).clear();
      transaction.objectStore(STAGING_CHUNK_STORE).clear();
      transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
    });
    db.close();
  }
  async function putStagingChunk(documentId,index,bytes){
    const db=await openStagingDatabase();
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction(STAGING_CHUNK_STORE,"readwrite");
      transaction.objectStore(STAGING_CHUNK_STORE).put({key:`${documentId}:${String(index).padStart(8,"0")}`,documentId,index,blob:new Blob([bytes])});
      transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
    });
    db.close();
  }
  async function finishStagingDocument(metadata){
    const db=await openStagingDatabase();
    const chunks=await new Promise((resolve,reject)=>{
      const transaction=db.transaction(STAGING_CHUNK_STORE,"readonly"),request=transaction.objectStore(STAGING_CHUNK_STORE).index("documentId").getAll(metadata.id);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);transaction.onabort=()=>reject(transaction.error||request.error);
    });
    chunks.sort((a,b)=>a.index-b.index);
    const blob=new Blob(chunks.map(item=>item.blob),{type:metadata.mimeType});
    if(blob.size!==metadata.size){db.close();throw new Error(`Dimensione temporanea non valida per ${metadata.originalName}.`)}
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction([STAGING_DOCUMENT_STORE,STAGING_CHUNK_STORE],"readwrite"),chunkStore=transaction.objectStore(STAGING_CHUNK_STORE);
      transaction.objectStore(STAGING_DOCUMENT_STORE).put({...metadata,blob});
      const range=IDBKeyRange.only(metadata.id),request=chunkStore.index("documentId").openKeyCursor(range);
      request.onsuccess=()=>{const cursor=request.result;if(cursor){chunkStore.delete(cursor.primaryKey);cursor.continue()}};
      transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
    });
    db.close();
  }
  async function clearStore(openDatabase,storeName){const db=await openDatabase();await new Promise((resolve,reject)=>{const transaction=db.transaction(storeName,"readwrite");transaction.objectStore(storeName).clear();transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error)});db.close()}
  async function putStoreRecord(openDatabase,storeName,record){const db=await openDatabase();await new Promise((resolve,reject)=>{const transaction=db.transaction(storeName,"readwrite");transaction.objectStore(storeName).put(record);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error)});db.close()}
  async function readStoreKeys(openDatabase,storeName){const db=await openDatabase(),keys=await new Promise((resolve,reject)=>{const transaction=db.transaction(storeName,"readonly"),request=transaction.objectStore(storeName).getAllKeys();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});db.close();return keys}
  async function readStoreRecord(openDatabase,storeName,key){const db=await openDatabase(),record=await new Promise((resolve,reject)=>{const transaction=db.transaction(storeName,"readonly"),request=transaction.objectStore(storeName).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});db.close();return record}
  async function replaceDocumentsFromStore(openSource,sourceStore,onProgress){
    const keys=await readStoreKeys(openSource,sourceStore),target=await openDocumentDatabase();
    await new Promise((resolve,reject)=>{const transaction=target.transaction(DOCUMENT_STORE,"readwrite");transaction.objectStore(DOCUMENT_STORE).clear();transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error)});
    target.close();
    for(let index=0;index<keys.length;index++){const record=await readStoreRecord(openSource,sourceStore,keys[index]);if(!record)throw new Error("Documento temporaneo mancante.");const db=await openDocumentDatabase();await new Promise((resolve,reject)=>{const transaction=db.transaction(DOCUMENT_STORE,"readwrite");transaction.objectStore(DOCUMENT_STORE).put(record);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error)});db.close();onProgress?.(index+1,keys.length);await idlePause()}
  }

  async function writeSafetyCopy(payload){
    const db=await openSafetyDatabase();
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction([SAFETY_STORE,SAFETY_DOCUMENT_STORE],"readwrite");
      transaction.objectStore(SAFETY_DOCUMENT_STORE).clear();
      transaction.objectStore(SAFETY_STORE).put({id:SAFETY_KEY,createdAt:Date.now(),payload});
      transaction.oncomplete=resolve;
      transaction.onerror=()=>reject(transaction.error);
      transaction.onabort=()=>reject(transaction.error);
    });
    const saved=await new Promise((resolve,reject)=>{
      const transaction=db.transaction(SAFETY_STORE,"readonly");
      const request=transaction.objectStore(SAFETY_STORE).get(SAFETY_KEY);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    db.close();
    if(!saved||!saved.payload||saved.payload.version!==1)throw new Error("Copia di sicurezza non verificabile.");
    const keys=await readDocumentKeys();
    for(let index=0;index<keys.length;index++){const record=await readDocumentByKey(keys[index]);await putStoreRecord(openSafetyDatabase,SAFETY_DOCUMENT_STORE,record);showProgress("Copia di sicurezza",index+1,keys.length);await idlePause()}
    return saved.payload;
  }

  async function readSafetyCopy(){
    const db=await openSafetyDatabase();
    const saved=await new Promise((resolve,reject)=>{
      const transaction=db.transaction(SAFETY_STORE,"readonly");
      const request=transaction.objectStore(SAFETY_STORE).get(SAFETY_KEY);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      transaction.onabort=()=>reject(transaction.error||request.error);
    });
    db.close();
    if(!saved||!saved.payload)throw new Error("Copia di sicurezza preventiva non disponibile.");
    return saved.payload;
  }

  async function createSafetySnapshot(){
    const examData=await window.AgendaExamStore.snapshot();
    const appData={students:await storedStudentsWithDrivingLicenses(),checklists:parsedStorageValue(DATA_KEYS.checklists,{}),examiners:parsedStorageValue(DATA_KEYS.examiners,[]),exams:examData.exams,examLocations:examData.locations};
    validateAppData(appData);
    const accountId=String(window.AgendaAuth?.currentUser?.()?.id||"");
    return{version:1,appData,examinerRoutes:window.ExaminerRoutesUI?.snapshot?.(accountId)||null,drivingErrorCatalog:window.DrivingErrors.createCatalogStore(localStorage).snapshot(accountId)};
  }
  async function restoreSafetySnapshot(snapshot){
    if(!snapshot||snapshot.version!==1)throw new Error("Copia di sicurezza locale non valida.");
    validateAppData(snapshot.appData);
    await replaceDocumentsFromStore(openSafetyDatabase,SAFETY_DOCUMENT_STORE,(done,total)=>showProgress("Rollback documenti",done,total));
    await writeAppData(snapshot.appData);
    const accountId=String(window.AgendaAuth?.currentUser?.()?.id||"");
    if(snapshot.examinerRoutes)window.ExaminerRoutesUI.restore(accountId,{...snapshot.examinerRoutes,accountId});
    window.DrivingErrors.createCatalogStore(localStorage).restore(accountId,snapshot.drivingErrorCatalog||window.DrivingErrors.defaultCatalog());
  }

  function arrayBufferToBase64(buffer){
    const bytes=new Uint8Array(buffer);
    let binary="";
    const block=0x8000;
    for(let index=0;index<bytes.length;index+=block)binary+=String.fromCharCode(...bytes.subarray(index,index+block));
    return btoa(binary);
  }

  async function arrayBufferToBase64Incremental(buffer){
    const bytes=new Uint8Array(buffer),block=3*8192;
    let result="";
    for(let index=0;index<bytes.length;index+=block){
      result+=btoa(String.fromCharCode(...bytes.subarray(index,Math.min(index+block,bytes.length))));
      if(index&&index%(block*32)===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    return result;
  }

  function base64ToBytes(value){
    try{
      const binary=atob(value);
      const bytes=new Uint8Array(binary.length);
      for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
      return bytes;
    }catch(error){
      throw new Error("Contenuto di un documento corrotto.");
    }
  }

  async function sha256Fallback(buffer){
    const bytes=new Uint8Array(buffer),constants=new Uint32Array([
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ]),hash=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),words=new Uint32Array(64);
    const paddedLength=Math.ceil((bytes.length+9)/64)*64,bitLengthLow=(bytes.length<<3)>>>0,bitLengthHigh=Math.floor(bytes.length/0x20000000)>>>0,rotate=(value,count)=>(value>>>count)|(value<<(32-count));
    for(let offset=0;offset<paddedLength;offset+=64){
      for(let index=0;index<16;index++){
        let word=0;
        for(let part=0;part<4;part++){
          const position=offset+index*4+part;
          const value=position<bytes.length?bytes[position]:position===bytes.length?0x80:position>=paddedLength-8?(position<paddedLength-4?bitLengthHigh>>>((paddedLength-5-position)*8):bitLengthLow>>>((paddedLength-1-position)*8))&255:0;
          word=(word<<8)|value;
        }
        words[index]=word>>>0;
      }
      for(let index=16;index<64;index++){
        const x=words[index-15],y=words[index-2],s0=rotate(x,7)^rotate(x,18)^(x>>>3),s1=rotate(y,17)^rotate(y,19)^(y>>>10);
        words[index]=(words[index-16]+s0+words[index-7]+s1)>>>0;
      }
      let [a,b,c,d,e,f,g,h]=hash;
      for(let index=0;index<64;index++){
        const sum1=rotate(e,6)^rotate(e,11)^rotate(e,25),choice=(e&f)^(~e&g),temp1=(h+sum1+choice+constants[index]+words[index])>>>0,sum0=rotate(a,2)^rotate(a,13)^rotate(a,22),majority=(a&b)^(a&c)^(b&c),temp2=(sum0+majority)>>>0;
        h=g;g=f;f=e;e=(d+temp1)>>>0;d=c;c=b;b=a;a=(temp1+temp2)>>>0;
      }
      hash[0]=(hash[0]+a)>>>0;hash[1]=(hash[1]+b)>>>0;hash[2]=(hash[2]+c)>>>0;hash[3]=(hash[3]+d)>>>0;
      hash[4]=(hash[4]+e)>>>0;hash[5]=(hash[5]+f)>>>0;hash[6]=(hash[6]+g)>>>0;hash[7]=(hash[7]+h)>>>0;
      if(offset&&offset%(64*2048)===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    return Array.from(hash,value=>value.toString(16).padStart(8,"0")).join("");
  }

  async function sha256(buffer){
    const webCrypto=globalThis.crypto&&globalThis.crypto.subtle;
    if(webCrypto&&typeof webCrypto.digest==="function"){
      const digest=await webCrypto.digest("SHA-256",buffer);
      return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
    }
    return sha256Fallback(buffer);
  }

  async function sha256Blob(blob){
    if(!(blob instanceof Blob))throw new Error("Documento non leggibile.");
    const hasher=window.AgendaFullBackupStream?.createSha256?.();
    if(!hasher)throw new Error("Modulo checksum progressivo non disponibile.");
    const block=1024*1024;
    for(let offset=0;offset<blob.size;offset+=block){
      const bytes=new Uint8Array(await blob.slice(offset,Math.min(blob.size,offset+block)).arrayBuffer());
      hasher.update(bytes);
      await idlePause();
    }
    return hasher.hex();
  }

  async function selfTestDocument(originalBuffer,dataBase64,originalHash,fileName){
    const originalBytes=new Uint8Array(originalBuffer);
    const reconstructedBytes=base64ToBytes(dataBase64);
    if(reconstructedBytes.byteLength!==originalBytes.byteLength)throw new Error(`Self-test fallito per ${fileName}: dimensione diversa.`);
    for(let index=0;index<originalBytes.length;index++){
      if(originalBytes[index]!==reconstructedBytes[index])throw new Error(`Self-test fallito per ${fileName}: contenuto binario diverso.`);
    }
    const reconstructedHash=await sha256(reconstructedBytes.buffer);
    if(reconstructedHash!==originalHash)throw new Error(`Self-test SHA-256 fallito per ${fileName}.`);
  }

  async function selfTestSerializedDocuments(documents){
    for(const documentRecord of documents){
      const bytes=base64ToBytes(documentRecord.dataBase64);
      if(bytes.byteLength!==documentRecord.size)throw new Error(`Self-test fallito per ${documentRecord.originalName}: dimensione diversa.`);
      const hash=await sha256(bytes.buffer);
      if(hash!==documentRecord.sha256)throw new Error(`Self-test SHA-256 fallito per ${documentRecord.originalName}.`);
    }
  }

  async function serializeDocument(record){
    if(!(record&&record.blob instanceof Blob))throw new Error("Documento non leggibile durante il backup.");
    let buffer=await record.blob.arrayBuffer();
    const fileName=String(record.originalName||"documento");
    const hash=await sha256(buffer);
    const dataBase64=await arrayBufferToBase64Incremental(buffer);
    const size=buffer.byteLength;
    buffer=null;
    const serialized={
      id:String(record.id),
      originalName:fileName,
      title:String(record.title||record.originalName||"Documento"),
      mimeType:String(record.mimeType||record.blob.type||"application/octet-stream"),
      size,
      createdAt:Number(record.createdAt||Date.now()),
      section:String(record.section||"common"),
      sha256:hash,
      dataBase64
    };
    return serialized;
  }

  function backupJsonParts(payload){
    const header={...payload};delete header.documents;
    const headerJson=JSON.stringify(header);
    const parts=[headerJson.slice(0,-1),',"documents":['];
    payload.documents.forEach((documentRecord,index)=>{
      if(index)parts.push(",");
      const metadata={...documentRecord};delete metadata.dataBase64;
      const metadataJson=JSON.stringify(metadata);
      parts.push(metadataJson.slice(0,-1),',"dataBase64":"',documentRecord.dataBase64,'"}');
    });
    parts.push("]}");
    return parts;
  }

  function createBackupFile(payload,fileName){
    let file;
    for(let attempt=0;attempt<3;attempt++){
      file=new File(backupJsonParts(payload),fileName,{type:"application/json"});
      if(payload.metadata.approximateBytes===file.size)break;
      payload.metadata.approximateBytes=file.size;
    }
    return file;
  }

  async function deserializeDocument(serialized){
    if(!serialized||typeof serialized!=="object"||typeof serialized.dataBase64!=="string")throw new Error("Documento del backup non valido.");
    if(typeof serialized.id!=="string"||!serialized.id||typeof serialized.originalName!=="string"||typeof serialized.title!=="string")throw new Error("Metadati documento non validi.");
    if(typeof serialized.mimeType!=="string"||!Number.isFinite(serialized.size)||serialized.size<0||!Number.isFinite(serialized.createdAt))throw new Error("Metadati documento non validi.");
    const bytes=base64ToBytes(serialized.dataBase64);
    if(bytes.byteLength!==serialized.size)throw new Error(`Dimensione non valida per ${serialized.originalName}.`);
    if(typeof serialized.sha256!=="string"||!/^[a-f0-9]{64}$/i.test(serialized.sha256))throw new Error(`Checksum mancante o non valido per ${serialized.originalName}.`);
    if(await sha256(bytes.buffer)!==serialized.sha256)throw new Error(`Controllo integrità fallito per ${serialized.originalName}.`);
    return {
      id:serialized.id,
      originalName:serialized.originalName,
      title:serialized.title,
      mimeType:serialized.mimeType,
      size:serialized.size,
      createdAt:serialized.createdAt,
      section:typeof serialized.section==="string"&&serialized.section?serialized.section:"common",
      blob:new Blob([bytes],{type:serialized.mimeType})
    };
  }

  function validateDocumentMetadata(metadata){
    if(!metadata||typeof metadata!=="object"||typeof metadata.id!=="string"||!metadata.id||typeof metadata.originalName!=="string"||typeof metadata.title!=="string")throw new Error("Metadati documento non validi.");
    if(typeof metadata.mimeType!=="string"||!Number.isFinite(metadata.size)||metadata.size<0||!Number.isFinite(metadata.createdAt))throw new Error("Metadati documento non validi.");
    if(typeof metadata.sha256!=="string"||!/^[a-f0-9]{64}$/i.test(metadata.sha256))throw new Error(`Checksum mancante o non valido per ${metadata.originalName}.`);
    return {
      id:metadata.id,originalName:metadata.originalName,title:metadata.title,mimeType:metadata.mimeType,size:metadata.size,
      createdAt:metadata.createdAt,section:typeof metadata.section==="string"&&metadata.section?metadata.section:"common",sha256:metadata.sha256.toLowerCase()
    };
  }

  async function createBackupPayload(){
    const appData={
      students:await storedStudentsWithDrivingLicenses(),
      checklists:parsedStorageValue(DATA_KEYS.checklists,{}),
      examiners:parsedStorageValue(DATA_KEYS.examiners,[])
    };
    const examData=await window.AgendaExamStore.snapshot();
    appData.exams=examData.exams;appData.examLocations=examData.locations;
    validateAppData(appData);
    const documentKeys=await readDocumentKeys();
    const documents=[];
    for(let index=0;index<documentKeys.length;index++){
      const record=await readDocumentByKey(documentKeys[index]);
      if(!record)throw new Error(`Documento ${index+1} non disponibile durante il backup.`);
      documents.push(await serializeDocument(record));
      record.blob=null;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(documents.length!==documentKeys.length)throw new Error("Conteggio documenti non coerente durante la creazione del backup.");
    const accountId=String(window.AgendaAuth?.currentUser?.()?.id||"");
    const payload={
      format:FORMAT,
      formatVersion:FORMAT_VERSION,
      app:"Agenda Istruttori",
      appVersion:APP_VERSION,
      createdAt:new Date().toISOString(),
      metadata:{students:appData.students.length,documents:documents.length,approximateBytes:0},
      appData,
      examinerRoutes:window.ExaminerRoutesUI?.snapshot?.(accountId)||null,
      drivingErrorCatalog:window.DrivingErrors?.createCatalogStore?.(localStorage).snapshot(accountId)||null,
      documents
    };
    return payload;
  }

  async function validateBackupPayload(payload){
    if(!payload||payload.format!==FORMAT)throw new Error("Il file non è un backup completo di Agenda Istruttori.");
    if(!SUPPORTED_FORMAT_VERSIONS.has(payload.formatVersion))throw new Error("Versione del backup non supportata.");
    if(typeof payload.createdAt!=="string"||!Number.isFinite(Date.parse(payload.createdAt)))throw new Error("Data del backup non valida.");
    validateAppData(payload.appData);
    if(payload.formatVersion>=3&&(!payload.examinerRoutes||typeof payload.examinerRoutes!=="object"))throw new Error("Archivio percorsi esaminatori non valido.");
    if(payload.formatVersion>=4)window.DrivingErrors.normalizeCatalog(payload.drivingErrorCatalog,{strict:true});
    if(!Array.isArray(payload.documents))throw new Error("Sezione documenti non valida.");
    if(!payload.metadata||payload.metadata.students!==payload.appData.students.length||payload.metadata.documents!==payload.documents.length)throw new Error("Conteggi del backup non coerenti con il contenuto.");
    const restoredDocuments=[];
    const ids=new Set();
    for(const item of payload.documents){
      const record=await deserializeDocument(item);
      if(ids.has(record.id))throw new Error("Il backup contiene documenti duplicati.");
      ids.add(record.id);
      restoredDocuments.push(record);
    }
    return {payload,restoredDocuments,students:payload.appData.students.length,documents:restoredDocuments.length};
  }

  function validateBackupHeader(payload){
    if(!payload||payload.format!==FORMAT)throw new Error("Il file non è un backup completo di Agenda Istruttori.");
    if(!SUPPORTED_FORMAT_VERSIONS.has(payload.formatVersion))throw new Error("Versione del backup non supportata.");
    if(typeof payload.createdAt!=="string"||!Number.isFinite(Date.parse(payload.createdAt)))throw new Error("Data del backup non valida.");
    validateAppData(payload.appData);
    if(payload.formatVersion>=3&&(!payload.examinerRoutes||typeof payload.examinerRoutes!=="object"))throw new Error("Archivio percorsi esaminatori non valido.");
    if(payload.formatVersion>=4)window.DrivingErrors.normalizeCatalog(payload.drivingErrorCatalog,{strict:true});
    if(!payload.metadata||payload.metadata.students!==payload.appData.students.length||!Number.isInteger(payload.metadata.documents)||payload.metadata.documents<0)throw new Error("Conteggi del backup non coerenti con il contenuto.");
  }

  function modalChoice(title,body,buttons){
    return new Promise(resolve=>{
      const modal=byId("fullBackupModal");
      byId("fullBackupModalTitle").textContent=title;
      const content=byId("fullBackupModalBody");
      content.replaceChildren();
      if(typeof body==="string"){
        const paragraph=document.createElement("p");
        paragraph.textContent=body;
        content.appendChild(paragraph);
      }else content.appendChild(body);
      const actions=byId("fullBackupModalButtons");
      actions.replaceChildren();
      buttons.forEach(option=>{
        const button=document.createElement("button");
        button.type="button";
        button.textContent=option.label;
        if(option.className)button.className=option.className;
        button.onclick=()=>{modal.classList.add("hidden");resolve(option.value)};
        actions.appendChild(button);
      });
      modal.classList.remove("hidden");
    });
  }

  function restorePreview(validated){
    const summary=document.createElement("div");
    summary.className="full-backup-summary";
    const rows=[
      ["Creato",new Date(validated.payload.createdAt).toLocaleString("it-IT")],
      ["Allievi",String(validated.students)],
      ["Documenti",String(validated.documents)],
      ["Dimensione",formatBytes(validated.fileSize||validated.payload.metadata&&validated.payload.metadata.approximateBytes||0)],
      ["Formato",`Agenda Istruttori ${validated.payload.formatVersion}`],
      ["Spazio stimato",validated.capacity?.supported?`${formatBytes(validated.capacity.requiredBytes)} necessari · ${formatBytes(validated.capacity.availableBytes)} disponibili`:"API spazio non disponibile; saranno gestiti eventuali errori reali di quota"]
    ];
    rows.forEach(([label,value])=>{
      const row=document.createElement("div");
      const strong=document.createElement("strong");
      strong.textContent=`${label}: `;
      row.append(strong,document.createTextNode(value));
      summary.appendChild(row);
    });
    const warning=document.createElement("p");
    warning.className="full-backup-warning";
    warning.textContent="Il ripristino sostituirà i dati dell'app presenti su questo dispositivo.";
    summary.appendChild(warning);
    return summary;
  }

  function downloadFile(file){
    const url=URL.createObjectURL(file);
    const link=document.createElement("a");
    link.href=url;
    link.download=file.name;
    link.style.display="none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),60000);
  }

  function presentPreparedBackup(file){
    const modal=byId("fullBackupModal"),content=byId("fullBackupModalBody"),actions=byId("fullBackupModalButtons");
    byId("fullBackupModalTitle").textContent="Backup completo pronto";
    content.replaceChildren();actions.replaceChildren();
    const paragraph=document.createElement("p");
    paragraph.textContent="Premi il pulsante seguente per condividere o salvare il file sul dispositivo.";
    content.appendChild(paragraph);
    const cancel=document.createElement("button");cancel.type="button";cancel.className="secondary";cancel.textContent="Chiudi";cancel.onclick=()=>modal.classList.add("hidden");
    const save=document.createElement("button");save.type="button";save.textContent="Condividi / Salva backup";
    save.onclick=async()=>{
      save.disabled=true;
      try{
        const shareAvailable=typeof navigator.share==="function",canShareAvailable=typeof navigator.canShare==="function";
        let nativeShare=false;
        try{nativeShare=!!(shareAvailable&&canShareAvailable&&navigator.canShare({files:[file]}))}catch(error){}
        if(nativeShare)await navigator.share({title:"Backup completo Agenda Istruttori",files:[file]});
        else downloadFile(file);
        modal.classList.add("hidden");
      }catch(error){
        if(!error||error.name!=="AbortError"){
          downloadFile(file);
          modal.classList.add("hidden");
        }
      }finally{save.disabled=false}
    };
    actions.append(cancel,save);modal.classList.remove("hidden");
  }

  async function exportFullBackup(){
    clearMessage();
    byId("exportFullBackup").disabled=true;
    try{
      const payload=await createBackupPayload();
      const timestamp=new Date().toISOString().replace(/[:.]/g,"-");
      const file=createBackupFile(payload,`AgendaIstruttori_BackupCompleto_${timestamp}.${BACKUP_EXTENSION}`);
      showMessage(`Backup pronto: ${payload.metadata.students} allievi, ${payload.metadata.documents} documenti, circa ${formatBytes(file.size)}.`);
      presentPreparedBackup(file);
    }catch(error){
      showMessage(error&&error.message?error.message:"Non è stato possibile creare il backup completo.",true);
    }finally{
      byId("exportFullBackup").disabled=false;
    }
  }

  async function readBackupFile(file){
    if(!file||!Number.isFinite(file.size)||file.size<=0)throw new Error("File backup vuoto o non leggibile.");
    if(!window.AgendaFullBackupStream)throw new Error("Modulo di lettura progressiva non disponibile.");
    const currentKeys=await readDocumentKeys();let currentBytes=0;
    for(const key of currentKeys){const record=await readDocumentByKey(key);currentBytes+=Number(record?.size||record?.blob?.size||0)}
    const capacity=await window.AgendaFullBackupStream.estimateCapacity(file.size,currentBytes,navigator.storage);
    if(capacity.supported&&!capacity.sufficient)throw new Error(`Spazio fisico insufficiente sul dispositivo: servono circa ${formatBytes(capacity.requiredBytes)}, sono disponibili ${formatBytes(capacity.availableBytes)}.`);
    await clearStaging();
    const ids=new Set(),documentManifest=[];
    let payload=null,currentDocument=null,currentChunk=0;
    try{
      const parsed=await window.AgendaFullBackupStream.parseLegacyBackup(file,{
        signal:restoreAbortController?.signal,
        onHeader:header=>{validateBackupHeader(header);payload=header;showProgress("Lettura e validazione",0,file.size)},
        onProgress:progress=>showProgress(progress.phase==="reading"?"Lettura file":"Validazione documenti",progress.loaded,progress.total),
        onDocumentStart:async item=>{currentDocument=validateDocumentMetadata(item);currentChunk=0;if(ids.has(currentDocument.id))throw new Error("Il backup contiene documenti duplicati.");ids.add(currentDocument.id)},
        onDocumentChunk:async(item,bytes)=>{if(!currentDocument||item.id!==currentDocument.id)throw new Error("Sequenza documento non valida.");await putStagingChunk(currentDocument.id,currentChunk++,bytes)},
        onDocumentEnd:async(item,result)=>{if(!currentDocument||item.id!==currentDocument.id||result.sha256!==currentDocument.sha256)throw new Error("Checksum documento non coerente.");await finishStagingDocument(currentDocument);documentManifest.push({id:currentDocument.id,originalName:currentDocument.originalName,mimeType:currentDocument.mimeType,size:currentDocument.size,sha256:currentDocument.sha256});currentDocument=null}
      });
      if(!payload||parsed.count!==payload.metadata.documents)throw new Error(`Conteggio documenti non coerente: attesi ${payload?.metadata?.documents??0}, trovati ${parsed.count}.`);
      return{payload,documentManifest,students:payload.appData.students.length,documents:parsed.count,fileSize:file.size,capacity};
    }catch(error){await clearStaging();if(error?.name==="AbortError")throw error;if(error?.name==="QuotaExceededError")throw new Error("Spazio fisico insufficiente durante lo staging. I dati esistenti sono rimasti invariati.");throw error}
  }

  async function writeAppData(appData){
    const examArchive=window.AgendaExams.canonicalArchive(appData.exams||[],appData.examLocations||[],{strict:true}),exams=examArchive.exams,examLocations=examArchive.locations;
    const previousStudents=parsedStorageValue(DATA_KEYS.students,[]),previousChecklists=parsedStorageValue(DATA_KEYS.checklists,{}),previousExaminers=parsedStorageValue(DATA_KEYS.examiners,[]),previousLicenses=window.AgendaStudentLicenseStore?await window.AgendaStudentLicenseStore.snapshot():[],previousExamArchive=await window.AgendaExamStore.snapshot();
    await window.AgendaExamStore.replaceAll(exams,examLocations);
    try{
      localStorage.setItem(DATA_KEYS.students,JSON.stringify(studentsWithoutDrivingLicenses(appData.students)));
      localStorage.setItem(DATA_KEYS.checklists,JSON.stringify(appData.checklists));
      localStorage.setItem(DATA_KEYS.examiners,JSON.stringify(appData.examiners));
      if(window.AgendaStudentLicenseStore)await window.AgendaStudentLicenseStore.replaceAll(drivingLicenseRecords(appData.students));
    }catch(error){
      try{localStorage.setItem(DATA_KEYS.students,JSON.stringify(previousStudents));localStorage.setItem(DATA_KEYS.checklists,JSON.stringify(previousChecklists));localStorage.setItem(DATA_KEYS.examiners,JSON.stringify(previousExaminers));if(window.AgendaStudentLicenseStore)await window.AgendaStudentLicenseStore.replaceAll(previousLicenses);await window.AgendaExamStore.replaceAll(previousExamArchive.exams,previousExamArchive.locations)}catch{}
      throw error;
    }
  }

  function canonicalAppData(appData,checklistKeys=null){
    const cleanItems=items=>(Array.isArray(items)?items:[]).map(item=>({label:String(item&&item.label||""),status:String(item&&item.status?item.status:item&&item.done?"good":"none")})).filter(item=>item.status!=="none");
    const cleanRoute=route=>(Array.isArray(route)?route:[]).map(point=>({
      lat:Number(point&&point.lat),lng:Number(point&&point.lng),accuracy:Number(point&&point.accuracy),time:Number(point&&point.time),breakBefore:point&&point.breakBefore===true
    }));
    const students=(Array.isArray(appData.students)?appData.students:[]).map(student=>{
      const canonicalStudent={
        id:String(student&&student.id||""),category:String(student&&student.category||""),firstName:String(student&&student.firstName||""),lastName:String(student&&student.lastName||""),phone:String(student&&student.phone||""),license:String(student&&student.license||""),pinkSlipIssueDate:String(student&&student.pinkSlipIssueDate||""),notes:String(student&&student.notes||student&&student.studentNotes||""),archived:student&&student.archived===true,
        checklist:cleanItems(student&&student.checklist),
        lessons:(Array.isArray(student&&student.lessons)?student.lessons:[]).map(lesson=>{
          const canonicalLesson={id:String(lesson&&lesson.id||""),createdAt:Number(lesson&&lesson.createdAt||0),notes:String(lesson&&lesson.notes||""),route:cleanRoute(lesson&&lesson.route),checklist:cleanItems(lesson&&lesson.checklist),errors:window.DrivingErrors.normalizeErrors(lesson&&lesson.errors)};
          if(typeof lesson?.duration==="string"&&lesson.duration.trim())canonicalLesson.duration=lesson.duration.trim();
          return canonicalLesson;
        })
      };
      if(typeof student?.photo==="string"&&/^data:image\/(?:jpeg|png|webp);base64,/i.test(student.photo))canonicalStudent.photo=student.photo;
      const drivingLicense=Object.hasOwn(student||{},"drivingLicense")?window.StudentLicense.normalize(student.drivingLicense,{strict:true}):null;if(drivingLicense)canonicalStudent.drivingLicense=drivingLicense;
      return canonicalStudent;
    });
    const checklistSource=appData.checklists&&typeof appData.checklists==="object"&&!Array.isArray(appData.checklists)?appData.checklists:{};
    const checklists={};
    const includedChecklistKeys=Array.isArray(checklistKeys)?checklistKeys:Object.keys(checklistSource);
    includedChecklistKeys.sort().forEach(key=>{checklists[key]=Array.isArray(checklistSource[key])?checklistSource[key].map(String):[]});
    const examiners=(Array.isArray(appData.examiners)?appData.examiners:[]).map(examiner=>({id:String(examiner&&examiner.id||""),firstName:String(examiner&&examiner.firstName||""),lastName:String(examiner&&examiner.lastName||""),notes:String(examiner&&examiner.notes||""),habits:Array.isArray(examiner&&examiner.habits)?examiner.habits.map(String):[]}));
    const examArchive=window.AgendaExams.canonicalArchive(appData.exams||[],appData.examLocations||[],{strict:true}),exams=examArchive.exams,examLocations=examArchive.locations;
    return {students,checklists,examiners,exams,examLocations};
  }

  async function textSha256(value){
    const bytes=new TextEncoder().encode(value);
    return sha256(bytes.buffer);
  }

  async function createRestoreManifest(validated){
    const checklistKeys=Object.keys(validated.payload.appData.checklists).sort();
    const canonical=canonicalAppData(validated.payload.appData,checklistKeys);
    const currentAccount=String(window.AgendaAuth?.currentUser?.()?.id||"");
    const examinerRoutes=validated.payload.examinerRoutes?{...validated.payload.examinerRoutes,accountId:currentAccount}:null;
    const drivingErrorCatalog=validated.payload.formatVersion>=4?window.DrivingErrors.normalizeCatalog(validated.payload.drivingErrorCatalog,{strict:true}):window.DrivingErrors.createCatalogStore(localStorage).snapshot(currentAccount);
    return {
      version:2,
      students:canonical.students.length,
      lessons:canonical.students.reduce((total,student)=>total+student.lessons.length,0),
      examiners:canonical.examiners.length,
      checklistKeys,
      appDataSha256:await textSha256(JSON.stringify(canonical)),
      examinerRoutesSha256:examinerRoutes?await textSha256(JSON.stringify(examinerRoutes)):null,
      drivingErrorCatalogSha256:await textSha256(JSON.stringify(drivingErrorCatalog)),
      documents:validated.documentManifest.map(documentRecord=>({...documentRecord}))
    };
  }

  async function verifyRestoreManifest(manifest){
    if(!manifest||![1,2].includes(manifest.version)||!Array.isArray(manifest.documents)||!Array.isArray(manifest.checklistKeys))throw new Error("Manifest di verifica non valido.");
    const appData={
      students:await storedStudentsWithDrivingLicenses(),
      checklists:parsedStorageValue(DATA_KEYS.checklists,{}),
      examiners:parsedStorageValue(DATA_KEYS.examiners,[])
    };
    const examData=await window.AgendaExamStore.snapshot();appData.exams=examData.exams;appData.examLocations=examData.locations;
    validateAppData(appData);
    const canonical=canonicalAppData(appData,manifest.checklistKeys);
    if(canonical.students.length!==manifest.students)throw new Error(`Verifica post-riavvio allievi fallita: attesi ${manifest.students}, trovati ${canonical.students.length}.`);
    const lessons=canonical.students.reduce((total,student)=>total+student.lessons.length,0);
    if(lessons!==manifest.lessons)throw new Error(`Verifica post-riavvio guide fallita: attese ${manifest.lessons}, trovate ${lessons}.`);
    if(canonical.examiners.length!==manifest.examiners)throw new Error(`Verifica post-riavvio esaminatori fallita: attesi ${manifest.examiners}, trovati ${canonical.examiners.length}.`);
    if(await textSha256(JSON.stringify(canonical))!==manifest.appDataSha256)throw new Error("Verifica post-riavvio dei dati applicativi fallita.");
    if(manifest.examinerRoutesSha256){const currentAccount=String(window.AgendaAuth?.currentUser?.()?.id||""),examinerRoutes=window.ExaminerRoutesUI.snapshot(currentAccount);if(await textSha256(JSON.stringify(examinerRoutes))!==manifest.examinerRoutesSha256)throw new Error("Verifica post-riavvio dei percorsi esaminatori fallita.")}
    if(manifest.drivingErrorCatalogSha256){const currentAccount=String(window.AgendaAuth?.currentUser?.()?.id||""),catalog=window.DrivingErrors.createCatalogStore(localStorage).snapshot(currentAccount);if(await textSha256(JSON.stringify(catalog))!==manifest.drivingErrorCatalogSha256)throw new Error("Verifica post-riavvio delle classificazioni errori fallita.")}
    const documentKeys=await readDocumentKeys();
    if(documentKeys.length!==manifest.documents.length)throw new Error(`Verifica post-riavvio documenti fallita: attesi ${manifest.documents.length}, trovati ${documentKeys.length}.`);
    for(const expected of manifest.documents){
      const actual=await readDocumentByKey(expected.id);
      if(!actual)throw new Error(`Documento mancante dopo il riavvio: ${expected.originalName}.`);
      if(actual.size!==expected.size||actual.mimeType!==expected.mimeType||actual.blob.size!==expected.size||actual.blob.type!==expected.mimeType)throw new Error(`Dimensione o MIME non valido dopo il riavvio: ${expected.originalName}.`);
      if(await sha256Blob(actual.blob)!==expected.sha256)throw new Error(`SHA-256 non valido dopo il riavvio: ${expected.originalName}.`);
    }
  }

  async function verifyRestoredData(validated){
    const currentStudents=await storedStudentsWithDrivingLicenses();
    const currentChecklists=parsedStorageValue(DATA_KEYS.checklists,{});
    const currentExaminers=parsedStorageValue(DATA_KEYS.examiners,[]),examData=await window.AgendaExamStore.snapshot(),currentExams=examData.exams,currentExamLocations=examData.locations;
    const currentCanonical=canonicalAppData({students:currentStudents,checklists:currentChecklists,examiners:currentExaminers,exams:currentExams,examLocations:currentExamLocations}),expectedCanonical=canonicalAppData(validated.payload.appData);
    if(JSON.stringify(currentCanonical)!==JSON.stringify(expectedCanonical))throw new Error("Verifica dei dati applicativi non riuscita.");
    if(validated.payload.examinerRoutes){const currentAccount=String(window.AgendaAuth?.currentUser?.()?.id||""),expected={...validated.payload.examinerRoutes,accountId:currentAccount},actual=window.ExaminerRoutesUI.snapshot(currentAccount);if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error("Verifica dei percorsi esaminatori non riuscita.")}
    if(validated.payload.formatVersion>=4){const currentAccount=String(window.AgendaAuth?.currentUser?.()?.id||""),expected=window.DrivingErrors.normalizeCatalog(validated.payload.drivingErrorCatalog,{strict:true}),actual=window.DrivingErrors.createCatalogStore(localStorage).snapshot(currentAccount);if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error("Verifica delle classificazioni errori non riuscita.")}
    const documentKeys=await readDocumentKeys();
    if(documentKeys.length!==validated.documentManifest.length)throw new Error("Verifica dei documenti non riuscita.");
    for(const expected of validated.documentManifest){
      const actual=await readDocumentByKey(expected.id);
      if(!actual||actual.size!==expected.size||actual.mimeType!==expected.mimeType)throw new Error("Verifica dei documenti non riuscita.");
      if(await sha256Blob(actual.blob)!==expected.sha256)throw new Error(`Verifica del documento ${expected.originalName} non riuscita.`);
      await idlePause();
    }
  }

  async function applyValidatedBackup(validated){
    const safetySnapshot=await createSafetySnapshot();
    await writeSafetyCopy(safetySnapshot);
    try{
      await replaceDocumentsFromStore(openStagingDatabase,STAGING_DOCUMENT_STORE,(done,total)=>showProgress("Applicazione documenti",done,total));
      await writeAppData(validated.payload.appData);
      if(validated.payload.formatVersion>=3){const currentAccount=String(window.AgendaAuth?.currentUser?.()?.id||"");window.ExaminerRoutesUI.restore(currentAccount,{...validated.payload.examinerRoutes,accountId:currentAccount})}
      if(validated.payload.formatVersion>=4){const currentAccount=String(window.AgendaAuth?.currentUser?.()?.id||"");window.DrivingErrors.createCatalogStore(localStorage).restore(currentAccount,validated.payload.drivingErrorCatalog)}
      await verifyRestoredData(validated);
      const manifest=await createRestoreManifest(validated);
      localStorage.setItem(PENDING_RESTORE_KEY,JSON.stringify(manifest));
      await clearStaging();
    }catch(error){
      try{
        await restoreSafetySnapshot(safetySnapshot);
      }catch(rollbackError){
        await clearStaging();
        throw new Error("Ripristino fallito e rollback non completato. La copia preventiva resta nell'archivio di sicurezza locale.");
      }
      await clearStaging();
      throw new Error(`Ripristino annullato: ${error&&error.message?error.message:"errore imprevisto"}. I dati precedenti sono stati ripristinati.`);
    }
  }

  async function restoreSelectedBackup(file){
    if(restoreInProgress){showMessage("Un ripristino è già in corso. Attendi il completamento.",true);return}
    restoreInProgress=true;
    restoreAbortController=new AbortController();
    clearMessage();
    hideProgress();
    byId("restoreFullBackup").disabled=true;
    byId("cancelFullBackupRestore").classList.remove("hidden");
    localStorage.setItem(INTERRUPTED_RESTORE_KEY,JSON.stringify({startedAt:Date.now(),size:file.size}));
    try{
      const validated=await readBackupFile(file);
      localStorage.removeItem(INTERRUPTED_RESTORE_KEY);
      const preview=await modalChoice("Backup completo Agenda Istruttori",restorePreview(validated),[
        {label:"Annulla",value:"cancel",className:"secondary"},
        {label:"Continua",value:"continue"}
      ]);
      if(preview!=="continue"){await clearStaging();return}
      const confirmation=await modalChoice("ATTENZIONE","Il ripristino completo sostituirà i dati di Agenda Istruttori presenti su questo dispositivo. Prima dell'operazione verrà creata una copia di sicurezza. Continuare?",[
        {label:"ANNULLA",value:"cancel",className:"secondary"},
        {label:"RIPRISTINA",value:"restore",className:"danger"}
      ]);
      if(confirmation!=="restore"){await clearStaging();return}
      byId("cancelFullBackupRestore").classList.add("hidden");
      showMessage("Creazione copia di sicurezza e ripristino in corso…");
      await applyValidatedBackup(validated);
      restoreReloadScheduled=true;
      location.replace(location.href);
    }catch(error){
      localStorage.removeItem(INTERRUPTED_RESTORE_KEY);
      showMessage(error?.name==="AbortError"?"Ripristino annullato. I dati esistenti non sono stati modificati.":error&&error.message?error.message:"Non è stato possibile ripristinare il backup completo.",true);
    }finally{
      restoreAbortController=null;
      byId("cancelFullBackupRestore").classList.add("hidden");
      if(!restoreReloadScheduled){restoreInProgress=false;byId("restoreFullBackup").disabled=false;hideProgress()}
    }
  }

  async function refreshFullBackupSummary(){
    const summary=byId("fullBackupSummary");
    try{
      const students=parsedStorageValue(DATA_KEYS.students,[]);
      const documentKeys=await readDocumentKeys();
      summary.textContent=`Dati attuali: ${Array.isArray(students)?students.length:0} allievi, ${documentKeys.length} documenti.`;
    }catch(error){
      summary.textContent="Conteggio dati non disponibile.";
    }
  }

  function displayRestoreResult(text,isError){
    const appShell=byId("appShell");
    if(appShell&&!appShell.classList.contains("hidden"))byId("openSettings").click();
    showMessage(text,isError);
  }

  async function completePendingRestore(){
    const interruptedRead=localStorage.getItem(INTERRUPTED_RESTORE_KEY);
    if(interruptedRead){
      localStorage.removeItem(INTERRUPTED_RESTORE_KEY);
      try{await clearStaging()}catch{}
      displayRestoreResult("La lettura del backup è stata interrotta dal browser prima dell’anteprima. I dati esistenti non sono stati modificati.",true);
    }
    const storedResult=localStorage.getItem(RESTORE_RESULT_KEY);
    if(storedResult){
      localStorage.removeItem(RESTORE_RESULT_KEY);
      try{
        const result=JSON.parse(storedResult);
        displayRestoreResult(result.message,!!result.isError);
      }catch(error){
        displayRestoreResult("Il risultato del ripristino non è leggibile.",true);
      }
      return;
    }
    const storedManifest=localStorage.getItem(PENDING_RESTORE_KEY);
    if(!storedManifest)return;
    try{
      const manifest=JSON.parse(storedManifest);
      await verifyRestoreManifest(manifest);
      localStorage.removeItem(PENDING_RESTORE_KEY);
      displayRestoreResult(`Ripristino completo verificato dopo il riavvio: ${manifest.students} allievi, ${manifest.documents.length} documenti.`,false);
    }catch(error){
      try{
        const safetySnapshot=await readSafetyCopy();
        await restoreSafetySnapshot(safetySnapshot);
        localStorage.removeItem(PENDING_RESTORE_KEY);
        localStorage.setItem(RESTORE_RESULT_KEY,JSON.stringify({isError:true,message:`Verifica post-riavvio fallita: ${error&&error.message?error.message:"errore imprevisto"}. È stato ripristinato lo stato precedente.`}));
        location.replace(location.href);
      }catch(rollbackError){
        localStorage.removeItem(PENDING_RESTORE_KEY);
        displayRestoreResult("Verifica post-riavvio fallita e rollback non completato. La copia preventiva resta nell'archivio di sicurezza locale.",true);
      }
    }
  }

  byId("exportFullBackup").addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
    exportFullBackup();
  });
  byId("restoreFullBackup").addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
    if(restoreInProgress){showMessage("Un ripristino è già in corso. Attendi il completamento.",true);return}
    byId("fullBackupFile").click();
  });
  byId("cancelFullBackupRestore").addEventListener("click",()=>{if(restoreAbortController&&!restoreAbortController.signal.aborted){restoreAbortController.abort();showMessage("Annullamento richiesto: conclusione del blocco in corso…")}});
  byId("fullBackupFile").addEventListener("change",async event=>{
    const file=event.target.files[0];
    event.target.value="";
    if(file)await restoreSelectedBackup(file);
  });
  byId("openSettings").addEventListener("click",refreshFullBackupSummary);
  refreshFullBackupSummary();
  completePendingRestore();
})();
