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
 function reset(){epoch++;account=null;enabled=new Set();version=null;known=false;loading=null;loadError='';saving=false;if(dialog()?.open)dialog().close();sync()}
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
 async function api(method,body){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const r=await fetch('/api/home-sections',{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Impostazioni non disponibili.');
   if(!Array.isArray(data.enabled)||data.enabled.some(p=>!ids.includes(p))||new Set(data.enabled).size!==data.enabled.length||!Number.isSafeInteger(data.version)||data.version<0||typeof data.configured!=='boolean'||(data.configured?data.version<1:data.version!==0))throw Error('Risposta delle impostazioni non valida.');
   return data;
  }catch(error){if(navigator.onLine===false)throw Error('Nessuna connessione: impossibile aggiornare le impostazioni globali.');throw error}
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
 async function open(){
  if(!primary()||dialog().open)return;
  dialog().showModal();document.getElementById('homeSectionsSave').disabled=true;message().textContent='Caricamento delle impostazioni globali…';document.getElementById('homeSectionsList').replaceChildren();
  await refresh();if(!dialog().open||!primary())return;
  if(!known||loadError){message().textContent=loadError||'Impostazioni non disponibili.';return}
  const list=document.getElementById('homeSectionsList');
  for(const id of ids){const label=document.createElement('label'),text=document.createElement('span'),input=document.createElement('input'),state=document.createElement('small');text.textContent=document.querySelector('#category option[value="'+id+'"]')?.textContent||id;input.type='checkbox';input.value=id;input.checked=enabled.has(id);input.setAttribute('role','switch');state.textContent=input.checked?'VISIBILE':'NASCOSTO';input.onchange=()=>state.textContent=input.checked?'VISIBILE':'NASCOSTO';label.append(text,input,state);list.append(label)}
  message().textContent='Le scelte valgono per tutti gli istruttori e dispositivi. Nessun dato viene cancellato. Backup e ripristino includono anche i percorsi nascosti.';
  document.getElementById('homeSectionsSave').disabled=false;
 }
 async function save(){
  if(saving||!primary()||!known||loadError)return;
  const button=document.getElementById('homeSectionsSave'),cancel=document.getElementById('homeSectionsCancel'),token=epoch;
  const draft=[...document.querySelectorAll('#homeSectionsList input:checked')].map(n=>n.value);
  saving=true;button.disabled=cancel.disabled=true;for(const input of document.querySelectorAll('#homeSectionsList input'))input.disabled=true;message().textContent='Salvataggio in corso…';
  try{const data=await api('POST',{enabled:draft,version});if(token!==epoch||!primary())return;apply(data);dialog().close()}
  catch(error){if(token===epoch)message().textContent=error.message||'Salvataggio non riuscito. Nessuna conferma ricevuta.'}
  finally{if(token===epoch){saving=false;button.disabled=cancel.disabled=false;for(const input of document.querySelectorAll('#homeSectionsList input'))input.disabled=false}}
 }
 function mount(){const manage=document.getElementById('manageHomeSections');manage.onclick=()=>void open();document.getElementById('homeSectionsSave').onclick=()=>void save();document.getElementById('homeSectionsCancel').onclick=()=>{if(!saving)dialog().close()};dialog().oncancel=event=>{if(saving)event.preventDefault()};sync()}
 function requirePath(id){if(allowed(id))return true;alert(known?'Questo percorso è temporaneamente nascosto. I dati restano conservati.':'Attendi il caricamento delle impostazioni delle sezioni oppure aggiorna la Home.');return false}
 window.HomeSections={mount,refresh,reset,sync,isEnabled:allowed,requirePath};
})();
