// Archivio locale e indipendente dedicato ai documenti dell'istruttore.
(()=>{
  "use strict";

  const DB_NAME="agenda_istruttori_documents";
  const DB_VERSION=1;
  const STORE_NAME="documents";
  const VIDEO_TYPES=new Set(["video/mp4","video/quicktime","video/webm"]);
  const ACCEPTED_TYPES=new Set(["application/pdf","image/jpeg","image/png",...VIDEO_TYPES]);
  const MAX_VIDEO_SIZE=100*1024*1024;
  const COMMON_SECTION="common";
  const DOCUMENT_SECTIONS=[
    ["auto","Auto"],["moto","Moto"],["guida-accompagnata","Guida Accompagnata"],
    ["quad-leggero","Quadriciclo leggero AM"],["quad-pesante","Quadriciclo pesante B1"],
    ["corso-moto","Corso moto ad accesso graduale A2 e A"],["perfezionamento","Perfezionamento"],
    ["esame-revisione","Revisioni"],["esame-esperimento","Esperimenti"],
    [COMMON_SECTION,"Varie / Comuni"]
  ];
  const SECTION_LABELS=new Map(DOCUMENT_SECTIONS);
  const byId=id=>document.getElementById(id);
  let databasePromise=null;
  let documents=[];
  let allDocuments=[];
  let currentSection=null;
  const selectedDocumentIds=new Set();

  function openDatabase(){
    if(databasePromise)return databasePromise;
    databasePromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE_NAME)){
          const store=db.createObjectStore(STORE_NAME,{keyPath:"id"});
          store.createIndex("createdAt","createdAt");
        }
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error("Archivio documenti temporaneamente bloccato."));
    });
    return databasePromise;
  }

  async function runStore(mode,operation){
    const db=await openDatabase();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(STORE_NAME,mode);
      const request=operation(transaction.objectStore(STORE_NAME));
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      transaction.onabort=()=>reject(transaction.error||request.error);
    });
  }

  const getDocuments=()=>runStore("readonly",store=>store.getAll());
  const putDocument=documentRecord=>runStore("readwrite",store=>store.put(documentRecord));

  async function removeDocuments(ids){
    const db=await openDatabase();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(STORE_NAME,"readwrite");
      const store=transaction.objectStore(STORE_NAME);
      ids.forEach(id=>store.delete(id));
      transaction.oncomplete=resolve;
      transaction.onerror=()=>reject(transaction.error);
      transaction.onabort=()=>reject(transaction.error);
    });
  }

  function showView(id){
    document.querySelectorAll(".view").forEach(view=>view.classList.remove("active"));
    byId(id).classList.add("active");
    window.scrollTo(0,0);
  }

  function showMessage(text,isError=false){
    const message=byId("documentsMessage");
    message.textContent=text;
    message.classList.remove("hidden","documents-error","documents-success");
    message.classList.add(isError?"documents-error":"documents-success");
  }

  function clearMessage(){
    byId("documentsMessage").classList.add("hidden");
  }

  function normalizedSection(record){
    return SECTION_LABELS.has(record&&record.section)?record.section:COMMON_SECTION;
  }

  function renderDocumentSections(){
    const counts=new Map(DOCUMENT_SECTIONS.map(([id])=>[id,0]));
    allDocuments.forEach(record=>counts.set(normalizedSection(record),(counts.get(normalizedSection(record))||0)+1));
    const buttons=DOCUMENT_SECTIONS.map(([id,label])=>{
      const button=makeButton(`${label} (${counts.get(id)||0})`,"secondary document-section-button",()=>openDocumentSection(id));
      button.dataset.section=id;
      return button;
    });
    byId("documentSections").replaceChildren(...buttons);
  }

  function showDocumentCategories(){
    currentSection=null;
    selectedDocumentIds.clear();
    byId("documentSectionContent").classList.add("hidden");
    byId("documentSections").closest(".documents-heading").classList.remove("hidden");
    clearMessage();
    refreshDocuments();
  }

  function openDocumentSection(section){
    currentSection=SECTION_LABELS.has(section)?section:COMMON_SECTION;
    selectedDocumentIds.clear();
    byId("documentSectionTitle").textContent=SECTION_LABELS.get(currentSection);
    byId("documentSections").closest(".documents-heading").classList.add("hidden");
    byId("documentSectionContent").classList.remove("hidden");
    renderCurrentSection();
    window.scrollTo(0,0);
  }

  function formatBytes(bytes){
    if(!bytes)return "0 B";
    const units=["B","KB","MB","GB"];
    const unit=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),units.length-1);
    const value=bytes/Math.pow(1024,unit);
    return `${value.toLocaleString("it-IT",{maximumFractionDigits:unit?1:0})} ${units[unit]}`;
  }

  function documentKind(type){
    if(type==="application/pdf")return "PDF";
    if(type.startsWith("image/"))return "Immagine";
    if(VIDEO_TYPES.has(type))return "Video";
    return "Documento";
  }

  function isVideo(type){return VIDEO_TYPES.has(type)}

  function makeButton(label,className,handler){
    const button=document.createElement("button");
    button.type="button";
    button.textContent=label;
    if(className)button.className=className;
    button.addEventListener("click",handler);
    return button;
  }

  function requestDocumentTitle(initialTitle){
    return new Promise(resolve=>{
      const modal=byId("documentTitleModal");
      const form=byId("documentTitleForm");
      const input=byId("documentTitleInput");
      const finish=value=>{
        modal.classList.add("hidden");
        form.onsubmit=null;
        byId("cancelDocumentTitle").onclick=null;
        resolve(value);
      };
      input.value=initialTitle;
      modal.classList.remove("hidden");
      window.setTimeout(()=>{input.focus();input.select()},0);
      form.onsubmit=event=>{
        event.preventDefault();
        const title=input.value.trim();
        if(title)finish(title);
      };
      byId("cancelDocumentTitle").onclick=()=>finish(null);
    });
  }

  function openDocument(record){
    try{
      const url=URL.createObjectURL(record.blob);
      const opened=window.open(url,"_blank");
      if(!opened){
        const link=document.createElement("a");
        link.href=url;
        link.target="_blank";
        link.rel="noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      // Mantiene il Blob URL video disponibile per riproduzione e ricerca, poi lo revoca.
      window.setTimeout(()=>URL.revokeObjectURL(url),isVideo(record.mimeType)?3600000:300000);
    }catch(error){
      showMessage("Non è stato possibile aprire il documento.",true);
    }
  }

  function downloadDocument(record){
    const url=URL.createObjectURL(record.blob);
    const link=document.createElement("a");
    link.href=url;
    link.download=record.originalName||record.title;
    link.style.display="none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),60000);
  }

  function saveDocument(record){
    try{
      downloadDocument(record);
      showMessage("Download o salvataggio avviato.");
    }catch(error){
      showMessage("Non è stato possibile scaricare il documento.",true);
    }
  }

  function printDocument(record){
    try{
      const url=URL.createObjectURL(record.blob);
      const printWindow=window.open(record.mimeType==="application/pdf"?url:"","_blank");
      if(!printWindow){
        URL.revokeObjectURL(url);
        showMessage("Il browser ha bloccato la finestra di stampa. Consenti i popup e riprova.",true);
        return;
      }
      let printRequested=false;
      const releaseUrl=()=>URL.revokeObjectURL(url);
      const requestPrint=()=>{
        if(printRequested)return;
        printRequested=true;
        try{printWindow.focus();printWindow.print()}catch(error){
          showMessage("Usa il comando Stampa o Condividi della finestra aperta.");
        }
      };
      try{printWindow.addEventListener("afterprint",releaseUrl,{once:true})}catch(error){}
      if(record.mimeType==="application/pdf"){
        try{printWindow.addEventListener("load",()=>window.setTimeout(requestPrint,500),{once:true})}catch(error){}
        window.setTimeout(requestPrint,1500);
      }else{
        const image=printWindow.document.createElement("img");
        image.alt=record.title;
        image.src=url;
        image.style.cssText="display:block;max-width:100%;height:auto;margin:auto";
        image.onload=()=>window.setTimeout(requestPrint,100);
        printWindow.document.title=record.title;
        printWindow.document.body.style.margin="0";
        printWindow.document.body.appendChild(image);
      }
      window.setTimeout(releaseUrl,300000);
    }catch(error){
      showMessage("Non è stato possibile preparare il documento per la stampa.",true);
    }
  }

  async function shareDocument(record){
    try{
      const file=new File([record.blob],record.originalName,{type:record.mimeType,lastModified:record.createdAt});
      if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
        try{
          await navigator.share({title:record.title,files:[file]});
          return;
        }catch(error){
          if(error&&error.name==="AbortError")return;
        }
      }
      downloadDocument(record);
    }catch(error){
      try{downloadDocument(record)}catch(downloadError){
        showMessage("Non è stato possibile condividere o salvare il documento.",true);
      }
    }
  }

  async function renameDocument(record){
    const title=await requestDocumentTitle(record.title);
    if(title===null)return;
    try{
      record.title=title;
      await putDocument(record);
      await refreshDocuments();
    }catch(error){
      showMessage("Non è stato possibile modificare il titolo.",true);
    }
  }

  async function deleteSelectedDocuments(){
    const ids=[...selectedDocumentIds];
    if(!ids.length){showMessage("Seleziona prima almeno un documento.",true);return}
    const count=ids.length;
    const question=count===1?"Eliminare questo documento?":`Eliminare definitivamente i ${count} documenti selezionati?`;
    if(!confirm(question))return;
    try{
      await removeDocuments(ids);
      selectedDocumentIds.clear();
      showMessage(count===1?"Documento eliminato.":`${count} documenti eliminati.`);
      await refreshDocuments(false);
    }catch(error){
      await refreshDocuments(false);
      showMessage("Non è stato possibile completare l'eliminazione. L'elenco è stato riallineato con l'archivio.",true);
    }
  }

  function createDocumentCard(record){
    const card=document.createElement("article");
    const selected=selectedDocumentIds.has(record.id);
    card.className=`card document-card${selected?" selected":""}`;
    const header=document.createElement("div");
    header.className="document-card-header";
    const checkbox=document.createElement("input");
    checkbox.type="checkbox";
    checkbox.className="document-select";
    checkbox.checked=selected;
    checkbox.setAttribute("aria-label",`Seleziona ${record.title}`);
    checkbox.addEventListener("click",event=>event.stopPropagation());
    checkbox.addEventListener("change",()=>toggleDocumentSelection(record.id,checkbox.checked));
    const information=document.createElement("div");
    const title=document.createElement("h3");
    title.textContent=`${isVideo(record.mimeType)?"🎬":record.mimeType.startsWith("image/")?"🖼️":"📄"} ${record.title}`;
    const details=document.createElement("div");
    details.className="muted";
    details.textContent=`${documentKind(record.mimeType)} · ${formatBytes(record.size)} · ${new Date(record.createdAt).toLocaleDateString("it-IT")}`;
    const original=document.createElement("div");
    original.className="muted";
    original.textContent=`File: ${record.originalName}`;
    information.append(title,details,original);
    header.append(checkbox,information);
    card.append(header);
    card.addEventListener("click",()=>toggleDocumentSelection(record.id,!selectedDocumentIds.has(record.id)));
    return card;
  }

  function selectedDocuments(){
    return documents.filter(record=>selectedDocumentIds.has(record.id));
  }

  function updateCommandPanel(){
    const selected=selectedDocuments(),count=selected.length,single=count===1;
    byId("selectedDocumentLabel").textContent=!count?"Seleziona prima un documento":single?`Documento selezionato: ${selected[0].title}`:`${count} documenti selezionati`;
    ["documentOpen","documentShare","documentDownload","documentRename"].forEach(id=>{byId(id).disabled=!single});
    byId("documentMove").disabled=!count;
    byId("documentPrint").disabled=!single||isVideo(selected[0]&&selected[0].mimeType);
    const deleteButton=byId("documentDelete");
    deleteButton.disabled=!count;
    deleteButton.textContent=count>1?`🗑️ Elimina ${count} documenti`:"🗑️ Elimina";
  }

  function renderDocumentList(){
    byId("documentsList").replaceChildren(...documents.map(createDocumentCard));
    updateCommandPanel();
  }

  function renderCurrentSection(){
    documents=currentSection===null?[]:allDocuments.filter(record=>normalizedSection(record)===currentSection);
    [...selectedDocumentIds].forEach(id=>{if(!documents.some(record=>record.id===id))selectedDocumentIds.delete(id)});
    renderDocumentList();
    byId("emptyDocuments").classList.toggle("hidden",documents.length>0);
    byId("documentsCount").textContent=`${documents.length} ${documents.length===1?"documento":"documenti"}`;
    byId("documentsSize").textContent=`Spazio occupato: ${formatBytes(documents.reduce((sum,item)=>sum+(item.size||0),0))}`;
  }

  function toggleDocumentSelection(id,selected){
    if(selected&&documents.some(record=>record.id===id))selectedDocumentIds.add(id);else selectedDocumentIds.delete(id);
    renderDocumentList();
    if(selectedDocumentIds.size)clearMessage();
  }

  function runSingleDocumentAction(action){
    const selected=selectedDocuments();
    if(selected.length!==1){
      showMessage(selected.length?"Questo comando richiede un solo documento selezionato.":"Seleziona prima un documento.",true);
      return;
    }
    return action(selected[0]);
  }

  async function updateStorageEstimate(){
    const label=byId("deviceStorage");
    if(!navigator.storage||!navigator.storage.estimate){
      label.classList.add("hidden");
      return;
    }
    try{
      const estimate=await navigator.storage.estimate();
      if(typeof estimate.usage==="number"&&typeof estimate.quota==="number"){
        label.textContent=`Archivio dispositivo: ${formatBytes(estimate.usage)} usati su ${formatBytes(estimate.quota)}`;
        label.classList.remove("hidden");
      }
    }catch(error){
      label.classList.add("hidden");
    }
  }

  async function refreshDocuments(clearStatus=true){
    if(clearStatus)clearMessage();
    const list=byId("documentsList");
    try{
      allDocuments=await getDocuments();
      allDocuments.sort((a,b)=>b.createdAt-a.createdAt);
      renderDocumentSections();
      if(currentSection!==null)renderCurrentSection();
      updateStorageEstimate();
    }catch(error){
      list.replaceChildren();
      showMessage("Non è stato possibile aprire l'archivio dei documenti.",true);
    }
  }

  function inferredMimeType(file){
    const declared=String(file.type||"").toLowerCase();
    if(ACCEPTED_TYPES.has(declared))return declared;
    const extension=file.name.split(".").pop().toLowerCase();
    return extension==="pdf"?"application/pdf":extension==="png"?"image/png":extension==="jpg"||extension==="jpeg"?"image/jpeg":extension==="mp4"?"video/mp4":extension==="mov"?"video/quicktime":extension==="webm"?"video/webm":"";
  }

  async function hasStorageCapacity(bytes){
    if(!navigator.storage||!navigator.storage.estimate)return true;
    try{
      const estimate=await navigator.storage.estimate();
      return typeof estimate.usage!=="number"||typeof estimate.quota!=="number"||estimate.quota-estimate.usage>=bytes;
    }catch(error){return true}
  }

  async function addSelectedDocument(file){
    const mimeType=inferredMimeType(file);
    if(!ACCEPTED_TYPES.has(mimeType)){
      showMessage("Formato non supportato. Seleziona un file PDF, JPG, JPEG, PNG, MP4, MOV o WebM.",true);
      return;
    }
    if(isVideo(mimeType)&&file.size>MAX_VIDEO_SIZE){
      showMessage("Video troppo grande. Dimensione massima consentita: 100 MB.",true);
      return;
    }
    if(isVideo(mimeType)&&!await hasStorageCapacity(file.size)){
      showMessage("Spazio insufficiente sul dispositivo. Libera spazio e riprova.",true);
      return;
    }
    const defaultTitle=file.name.replace(/\.[^.]+$/u,"");
    const enteredTitle=await requestDocumentTitle(defaultTitle);
    if(enteredTitle===null)return;
    const title=enteredTitle||defaultTitle||file.name;
    const record={
      id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}_${Math.random()}`,
      originalName:file.name,
      title,
      mimeType,
      size:file.size,
      createdAt:Date.now(),
      section:currentSection||COMMON_SECTION,
      blob:file.slice(0,file.size,mimeType)
    };
    try{
      await putDocument(record);
      showMessage("Documento salvato sul dispositivo.");
      await refreshDocuments(false);
    }catch(error){
      const quotaError=error&&(error.name==="QuotaExceededError"||String(error).includes("QuotaExceeded"));
      showMessage(quotaError?"Spazio insufficiente sul dispositivo. Libera spazio e riprova.":"Non è stato possibile salvare il documento.",true);
    }
  }

  function requestMoveDestination(){
    return new Promise(resolve=>{
      const modal=byId("documentMoveModal"),form=byId("documentMoveForm"),select=byId("documentMoveSection");
      select.replaceChildren(...DOCUMENT_SECTIONS.map(([id,label])=>{
        const option=document.createElement("option");
        option.value=id;
        option.textContent=label;
        return option;
      }));
      select.value=currentSection===COMMON_SECTION?"auto":COMMON_SECTION;
      const finish=value=>{
        modal.classList.add("hidden");
        form.onsubmit=null;
        byId("cancelDocumentMove").onclick=null;
        resolve(value);
      };
      form.onsubmit=event=>{event.preventDefault();finish(select.value)};
      byId("cancelDocumentMove").onclick=()=>finish(null);
      modal.classList.remove("hidden");
    });
  }

  async function moveSelectedDocuments(){
    const selected=selectedDocuments();
    if(!selected.length){showMessage("Seleziona prima almeno un documento.",true);return}
    const destination=await requestMoveDestination();
    if(destination===null)return;
    try{
      for(const record of selected){
        // Mantiene lo stesso ID e lo stesso Blob: cambia soltanto la classificazione.
        record.section=destination;
        await putDocument(record);
      }
      const count=selected.length;
      selectedDocumentIds.clear();
      showMessage(count===1?"Documento spostato.":`${count} documenti spostati.`);
      await refreshDocuments(false);
    }catch(error){
      showMessage("Non è stato possibile spostare il documento.",true);
    }
  }

  byId("openDocuments").addEventListener("click",()=>{
    showView("documentsView");
    showDocumentCategories();
  });
  byId("backDocuments").addEventListener("click",()=>showView("home"));
  byId("backDocumentSection").addEventListener("click",showDocumentCategories);
  byId("addDocument").addEventListener("click",()=>byId("documentFile").click());
  byId("documentFile").addEventListener("change",async event=>{
    const file=event.target.files[0];
    event.target.value="";
    if(file)await addSelectedDocument(file);
  });
  byId("documentOpen").addEventListener("click",()=>runSingleDocumentAction(openDocument));
  byId("documentShare").addEventListener("click",()=>runSingleDocumentAction(shareDocument));
  byId("documentPrint").addEventListener("click",()=>runSingleDocumentAction(printDocument));
  byId("documentDownload").addEventListener("click",()=>runSingleDocumentAction(saveDocument));
  byId("documentRename").addEventListener("click",()=>runSingleDocumentAction(renameDocument));
  byId("documentMove").addEventListener("click",moveSelectedDocuments);
  byId("documentDelete").addEventListener("click",deleteSelectedDocuments);
})();
