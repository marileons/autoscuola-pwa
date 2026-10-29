// Internal Worker module. Existing DB binding and authentication only.
const PATHS = Object.freeze(['auto','moto','quad-leggero','quad-pesante','corso-moto','guida-accompagnata','perfezionamento','esame-revisione','esame-esperimento']);
const valid = paths => Array.isArray(paths) && paths.length<=PATHS.length && paths.every(p=>PATHS.includes(p)) && new Set(paths).size===paths.length;
const ordered = paths => PATHS.filter(p=>paths.includes(p));
const reply = (body,status=200,headers={}) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
export async function handleHomeSections(request,env,session,role,primary,roleOf) {
 if(session.purpose!=='NORMAL'||!['ADMIN','ISTRUTTORE','SEGRETERIA'].includes(role))return reply({error:'Accesso non consentito.'},403);
 const route=new URL(request.url).pathname;
 if(route!=='/api/home-sections')return handlePersonal(request,env,session,role,primary,roleOf,route);
 if(!['GET','POST'].includes(request.method))return reply({error:'Operazione non consentita.'},405,{Allow:'GET, POST'});
 if(request.method==='POST'&&!primary)return reply({error:'Funzione riservata all’Amministratore principale.'},403);
 try {
  if(request.method==='GET'){
   const row=await env.DB.prepare('SELECT enabled_paths,version FROM app_home_sections WHERE id=1').first();
   if(!row)return reply({enabled:['auto','moto'],version:0,configured:false});
   const paths=JSON.parse(row.enabled_paths);
   if(!valid(paths)||!Number.isSafeInteger(row.version)||row.version<1)throw Error('Invalid stored configuration');
   return reply({enabled:ordered(paths),version:row.version,configured:true});
  }
  const text=await request.text();let body;
  try{if(text.length>2048)throw Error();body=JSON.parse(text)}catch{return reply({error:'Impostazioni non valide.'},400)}
  if(!body||typeof body!=='object'||Object.keys(body).sort().join(',')!=='enabled,version'||!valid(body.enabled)||!Number.isSafeInteger(body.version)||body.version<0||body.version>=Number.MAX_SAFE_INTEGER)return reply({error:'Impostazioni non valide.'},400);
  const paths=ordered(body.enabled),now=new Date().toISOString();
  // Compare-and-set: concurrent editors cannot silently overwrite each other.
  const statement=body.version===0
   ?env.DB.prepare('INSERT OR IGNORE INTO app_home_sections(id,enabled_paths,version,updated_by,updated_at) VALUES(1,?,1,?,?)').bind(JSON.stringify(paths),session.user.id,now)
   :env.DB.prepare('UPDATE app_home_sections SET enabled_paths=?,version=version+1,updated_by=?,updated_at=? WHERE id=1 AND version=?').bind(JSON.stringify(paths),session.user.id,now,body.version);
  const result=await statement.run();
  if(result.meta.changes!==1)return reply({error:'Impostazioni cambiate da un’altra sessione. Riapri GESTISCI SEZIONI prima di salvare.',code:'HOME_SECTIONS_CONFLICT'},409);
  return reply({enabled:paths,version:body.version+1,configured:true});
 }catch{
  // A missing table, malformed stored value or DB failure is NEVER an absent configuration.
  return reply({error:'Impostazioni delle sezioni non disponibili. Riprova; se il problema persiste contatta l’amministratore.',code:'HOME_SECTIONS_STORAGE_UNAVAILABLE'},503);
 }
}

// The legacy endpoint remains the global default. Effective settings never intersect it.
async function globalSettings(env){
 const row=await env.DB.prepare('SELECT enabled_paths,version FROM app_home_sections WHERE id=1').first();
 if(!row)return{enabled:['auto','moto'],version:0,configured:false};
 const enabled=JSON.parse(row.enabled_paths);
 if(!valid(enabled)||!Number.isSafeInteger(row.version)||row.version<1)throw Error('invalid_configuration');
 return{enabled:ordered(enabled),version:row.version,configured:true};
}
async function effectiveSettings(env,id){
 const global=await globalSettings(env);
 const row=await env.DB.prepare('SELECT enabled_paths,version FROM app_home_sections_users WHERE user_id=?').bind(id).first();
 if(row&&(!Number.isSafeInteger(row.version)||row.version<1))throw Error('invalid_configuration');
 const personal=row?.enabled_paths==null?null:JSON.parse(row.enabled_paths);
 if(personal!==null&&!valid(personal))throw Error('invalid_configuration');
 return{enabled:personal===null?global.enabled:ordered(personal),version:personal===null?global.version:row.version,configured:personal===null?global.configured:true,source:personal===null?'default':'personal',personalVersion:row?.version||0,globalVersion:global.version,personal,global};
}
async function handlePersonal(request,env,session,role,primary,roleOf,route){
 const forbidden=()=>reply({error:'Funzione riservata al principale.'},403);
 const unavailable=()=>reply({error:'Impostazioni non disponibili. Nessuna configurazione predefinita sostituisce un errore.',code:'HOME_SECTIONS_STORAGE_UNAVAILABLE'},503);
 if(route==='/api/home-sections/self'){
  if(request.method!=='GET')return forbidden();
  try{const data=await effectiveSettings(env,session.user.id);delete data.personal;delete data.global;return reply(data)}catch{return unavailable()}
 }
 if(!primary||role!=='ADMIN')return forbidden();
 if(!['GET','POST'].includes(request.method))return reply({error:'Operazione non consentita.'},405);
 try{
  if(route==='/api/home-sections/users'){
   if(request.method!=='GET')return reply({error:'Operazione non consentita.'},405);
   const {results=[]}=await env.DB.prepare('SELECT id,name,role,authorization_role,access_profile,is_primary_admin,active FROM users ORDER BY name,id').all();
   return reply({users:results.filter(u=>roleOf(u)).map(u=>({id:u.id,name:u.name,role:roleOf(u),active:Number(u.active)===1}))});
  }
  const suffix=route.slice('/api/home-sections/users/'.length);
  if(!route.startsWith('/api/home-sections/users/')||!suffix||suffix.length>400||suffix.includes('/'))return reply({error:'Risorsa non disponibile.'},404);
  let id;try{id=decodeURIComponent(suffix)}catch{return reply({error:'Utente non valido.'},400)}
  const target=await env.DB.prepare('SELECT id,name,role,authorization_role,access_profile,is_primary_admin,active FROM users WHERE id=?').bind(id).first();
  if(!target)return reply({error:'Utente non disponibile.'},404);
  const targetRole=roleOf(target);
  if(Number(target.active)!==1||!['ADMIN','ISTRUTTORE','SEGRETERIA'].includes(targetRole))return reply({error:'Utente disattivato o profilo senza percorsi didattici.'},409);
  if(request.method==='POST'){
   let body;try{const text=await request.text();if(text.length>2048)throw Error();body=JSON.parse(text)}catch{return reply({error:'Impostazioni non valide.'},400)}
   if(!body||Object.keys(body).sort().join(',')!=='enabled,version'||!(body.enabled===null||valid(body.enabled))||!Number.isSafeInteger(body.version)||body.version<0||body.version>=Number.MAX_SAFE_INTEGER)return reply({error:'Impostazioni non valide.'},400);
   // Verify schema/default integrity before any write, including resets.
   await effectiveSettings(env,id);
   const enabled=body.enabled===null?null:JSON.stringify(ordered(body.enabled));
   const guard='EXISTS (SELECT 1 FROM users WHERE id=? AND active=1 AND role=? AND authorization_role IS ? AND access_profile IS ? AND is_primary_admin IS ?)';
   const check=[id,target.role,target.authorization_role,target.access_profile,target.is_primary_admin];
   const statement=body.version===0
    ?env.DB.prepare('INSERT OR IGNORE INTO app_home_sections_users(user_id,enabled_paths,version,updated_by,updated_at) SELECT ?,?,1,?,? WHERE '+guard).bind(id,enabled,session.user.id,new Date().toISOString(),...check)
    :env.DB.prepare('UPDATE app_home_sections_users SET enabled_paths=?,version=version+1,updated_by=?,updated_at=? WHERE user_id=? AND version=? AND '+guard).bind(enabled,session.user.id,new Date().toISOString(),id,body.version,...check);
   const result=await statement.run();
   if(result.meta.changes!==1)return reply({error:'Assegnazione o utente cambiati. Riapri il pannello prima di salvare.',code:'HOME_SECTIONS_CONFLICT'},409);
  }
  return reply({user:{id:target.id,name:target.name,role:targetRole},...await effectiveSettings(env,id)});
 }catch{return unavailable()}
}
