// Global visibility is presentation, never a replacement for archive authorization.
(()=>{
 'use strict';
 const ids=['auto','moto','quad-leggero','quad-pesante','corso-moto','guida-accompagnata','perfezionamento','esame-revisione','esame-esperimento'];
 let account=null,enabled=new Set(),version=null,known=false,epoch=0,loading=null,loadError='',saving=false;
 const user=()=>window.AgendaAuth?.currentUser?.();
 const primary=()=>user()?.role==='ADMIN'&&user()?.capabilities?.managePrivilegedUsers===true&&!user()?.mustChangePassword;
 const allowed=id=>known&&enabled.has(id);
 const dialog=()=>document.getElementById('homeSectionsDialog');
 const message=()=>document.getElementById('homeSectionsMessage');
 function reset(){epoch++;selectionToken++;management=null;account=null;enabled=new Set();version=null;known=false;loading=null;loadError='';saving=false;if(dialog()?.open)dialog().close();sync()}
 function sync(){
  for(const button of document.querySelectorAll('#home .categories [data-f],#secretaryHome .categories [data-f]'))button.hidden=!allowed(button.dataset.f);
  document.body.classList.toggle('only-two-paths',known&&enabled.size===2&&enabled.has('auto')&&enabled.has('moto'));
  const manage=document.getElementById('manageHomeSections');if(manage)manage.hidden=!primary();if(dialog()?.open&&!primary())dialog().close();
  for(const view of ['home','secretaryHome']){
   let box=document.getElementById(view+'SectionsStatus');const root=document.getElementById(view);if(!root)continue;
   if(!box){box=document.createElement('div');box.id=view+'SectionsStatus';box.className='home-sections-status';const text=document.createElement('p');text.setAttribute('role','status');const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='AGGIORNA SEZIONI';retry.onclick=()=>void refresh();box.append(text,retry);root.querySelector('.categories')?.before(box)}
   box.hidden=known&&enabled.size>0&&!loadError;
   box.querySelector('p').textContent=loadError+(loadError&&known?' Restano visibili le ultime impostazioni verificate in questa sessione.':'')||(!known?'Caricamento delle sezioni…':'Nessun percorso abilitato. Le funzioni comuni e i dati locali restano disponibili.');
   box.querySelector('button').disabled=!!loading;
  }
  // Keep the current path on existing student forms; restrict only new destinations.
  for(const option of document.querySelectorAll('#category option')){const current=document.getElementById('studentForm')?.dataset.existingPath;option.hidden=option.disabled=!allowed(option.value)&&option.value!==current}
  for(const b of document.querySelectorAll('.check-tabs [data-list]'))b.hidden=!allowed(b.dataset.list);
  for(const b of document.querySelectorAll('#documentSections [data-section]'))b.hidden=ids.includes(b.dataset.section)&&!allowed(b.dataset.section);
  for(const option of document.querySelectorAll('#documentMoveSection option'))option.hidden=option.disabled=ids.includes(option.value)&&!allowed(option.value);
 }
 async function api(method,body,path="/api/home-sections/self"){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const r=await fetch(path,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   const data=await r.json();if(!r.ok){const error=Error(data.error||'Impostazioni non disponibili.');error.code=data.code;throw error;}
   if(path==='/api/home-sections/users'){if(!Array.isArray(data.users)||data.users.some(u=>typeof u.id!=='string'||typeof u.name!=='string'||typeof u.active!=='boolean'||!['ADMIN','ISTRUTTORE','SEGRETERIA','USER_MANAGER'].includes(u.role)))throw Error('Elenco utenti non valido.');return data;}
   if(!Array.isArray(data.enabled)||data.enabled.some(p=>!ids.includes(p))||new Set(data.enabled).size!==data.enabled.length||!Number.isSafeInteger(data.version)||data.version<0||typeof data.configured!=='boolean'||(data.configured?data.version<1:data.version!==0))throw Error('Risposta delle impostazioni non valida.');
   return data;
  }catch(error){if(navigator.onLine===false)throw Error('Nessuna connessione: impossibile aggiornare le impostazioni delle sezioni.');throw error}
  finally{clearTimeout(timeout)}
 }
 function apply(data){enabled=new Set(data.enabled);version=data.version;known=true;loadError='';sync()}
 function refresh(){
  const u=user();if(!u?.id||!['ADMIN','ISTRUTTORE','SEGRETERIA'].includes(u.role)||u.mustChangePassword){reset();return Promise.resolve()}
  if(account!==u.id){reset();account=u.id}
  if(loading)return loading;
  const token=epoch;
  loading=api('GET').then(data=>{if(token===epoch&&account===user()?.id)apply(data)}).catch(error=>{if(token===epoch)loadError=error.message||'Impossibile caricare le impostazioni.'}).finally(()=>{if(token===epoch){loading=null;sync()}});
  sync();return loading;
 }
 let management=null,selectionToken=0;
 const el=id=>document.getElementById(id);
 function managementLock(value){for(const node of dialog().querySelectorAll('button,input,select'))node.disabled=value;}
 function validEditor(m){return m&&Number.isSafeInteger(m.personalVersion)&&m.personalVersion>=0&&['default','personal'].includes(m.source)&&Array.isArray(m.global?.enabled)&&m.global.enabled.every(id=>ids.includes(id))&&Number.isSafeInteger(m.global.version)&&m.global.version>=0;}
 function editorRows(){
  const list=el('homeSectionsList');list.replaceChildren();if(!management)return;
  const values=management.reset?management.data.global.enabled:management.draft;
  for(const id of ids){const label=document.createElement('label'),text=document.createElement('span'),input=document.createElement('input'),state=document.createElement('small');text.textContent=document.querySelector('#category option[value="'+id+'"]')?.textContent||id;input.type='checkbox';input.value=id;input.checked=values.includes(id);input.setAttribute('role','switch');state.textContent=input.checked?'VISIBILE':'NASCOSTO';input.onchange=()=>{if(management.reset){management.draft=[...management.data.global.enabled];management.reset=false}management.draft=input.checked?[...new Set([...management.draft,id])]:management.draft.filter(x=>x!==id);state.textContent=input.checked?'VISIBILE':'NASCOSTO';el('homeSectionsSource').textContent=management.global?'PREDEFINITO GLOBALE':'PERSONALE (modifica da salvare)'};label.append(text,input,state);list.append(label)}
  el('homeSectionsSource').textContent=management.global?'PREDEFINITO GLOBALE':management.reset?'PREDEFINITA (ritorno da confermare con SALVA)':management.data.source==='personal'?'PERSONALE':'PREDEFINITA';
 }
 async function selectTarget(){
  if(!primary()||saving)return;
  const token=++selectionToken,owner=epoch,selected=el('homeSectionsUser').value;management=null;el('homeSectionsList').replaceChildren();el('homeSectionsSource').textContent='';el('homeSectionsTarget').textContent='';managementLock(true);message().textContent='Caricamento delle sezioni selezionate.';
  try{
   if(!selected)throw Error('Seleziona un utente.');
   const global=selected==='global:',path=global?'/api/home-sections':'/api/home-sections/users/'+encodeURIComponent(selected.slice(5)),data=await api('GET',null,path);
   if(owner!==epoch||token!==selectionToken||!dialog().open||!primary())return;
   if(!global&&(!validEditor(data)||data.user?.id!==selected.slice(5)))throw Error('Configurazione personale non valida.');
   management={global,id:global?selected:selected.slice(5),data,draft:[...data.enabled],reset:false};
   el('homeSectionsTarget').textContent=global?'Impostazioni predefinite globali':data.user.name+' · '+data.user.role;
   editorRows();message().textContent=global?'Il predefinito cambia solo per gli utenti senza assegnazione personale.':'SALVA modifica solo questo utente. Dati e strumenti comuni restano invariati.';
  }catch(error){if(owner===epoch&&token===selectionToken)message().textContent=error.message||'Caricamento non riuscito.'}
  finally{if(owner===epoch&&token===selectionToken){managementLock(false);el('homeSectionsSave').disabled=!management;el('homeSectionsDefaults').disabled=!management||management.global;}}
 }
 async function open(){
  if(!primary()||dialog().open)return;
  dialog().showModal();management=null;selectionToken++;const owner=epoch,opening=selectionToken;el('homeSectionsList').replaceChildren();el('homeSectionsTarget').textContent='';el('homeSectionsSource').textContent='';el('homeSectionsUser').replaceChildren();managementLock(true);message().textContent='Caricamento utenti.';
  try{
   const data=await api('GET',null,'/api/home-sections/users');if(owner!==epoch||opening!==selectionToken||!dialog().open||!primary())return;
   const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='SELEZIONA UTENTE';el('homeSectionsUser').append(placeholder);
   for(const u of data.users){const option=document.createElement('option');option.value='user:'+u.id;option.textContent=u.name+' · '+u.role+(u.active?'':' · DISATTIVATO');option.disabled=!u.active||u.role==='USER_MANAGER';el('homeSectionsUser').append(option)}
   const defaults=document.createElement('option');defaults.value='global:';defaults.textContent='IMPOSTAZIONI PREDEFINITE GLOBALI';el('homeSectionsUser').append(defaults);message().textContent='Scegli l’utente, amministratore compreso. Solo il principale può modificare le assegnazioni.';
  }catch(error){if(owner===epoch&&opening===selectionToken)message().textContent=error.message||'Elenco non disponibile.'}
  finally{if(owner===epoch&&opening===selectionToken){managementLock(false);el('homeSectionsSave').disabled=true;el('homeSectionsDefaults').disabled=true;}}
 }
 async function save(){
  if(saving||!primary()||!management)return;
  const owner=epoch,m=management;saving=true;managementLock(true);message().textContent='Salvataggio in corso.';
  try{
   const path=m.global?'/api/home-sections':'/api/home-sections/users/'+encodeURIComponent(m.id),body={enabled:m.reset?null:m.draft,version:m.global?m.data.version:m.data.personalVersion};
   await api('POST',body,path);if(owner!==epoch||!primary())return;
   management=null;dialog().close();await refresh();
  }catch(error){if(owner===epoch){message().textContent=error.message||'Salvataggio non riuscito. Nessuna conferma ricevuta.';if(error.code==='HOME_SECTIONS_CONFLICT'){management=null;el('homeSectionsList').replaceChildren();}}}
  finally{if(owner===epoch){saving=false;managementLock(false);el('homeSectionsSave').disabled=!management;el('homeSectionsDefaults').disabled=!management||management.global;}}
 }
 function mount(){el('manageHomeSections').onclick=()=>void open();el('homeSectionsUser').onchange=()=>void selectTarget();el('homeSectionsSave').onclick=()=>void save();el('homeSectionsDefaults').onclick=()=>{if(!management||management.global||saving)return;if(!confirm('Usare le impostazioni predefinite per questo utente? La modifica sarà applicata solo con SALVA. Nessun dato viene cancellato.'))return;management.reset=true;editorRows();message().textContent='Ritorno ai predefiniti preparato. SALVA conferma; ANNULLA conserva l’assegnazione salvata.'};el('homeSectionsCancel').onclick=()=>{if(!saving){selectionToken++;management=null;dialog().close()}};dialog().oncancel=event=>{if(saving)event.preventDefault();else{selectionToken++;management=null}};sync()}
 function requirePath(id){if(allowed(id))return true;alert(known?'Questo percorso è temporaneamente nascosto. I dati restano conservati.':'Attendi il caricamento delle impostazioni delle sezioni oppure aggiorna la Home.');return false}
 window.HomeSections={mount,refresh,reset,sync,isEnabled:allowed,requirePath};
})();
