// Internal Worker module. Existing DB binding and authentication only.
const PATHS = Object.freeze(['auto','moto','quad-leggero','quad-pesante','corso-moto','guida-accompagnata','perfezionamento','esame-revisione','esame-esperimento']);
const valid = paths => Array.isArray(paths) && paths.length<=PATHS.length && paths.every(p=>PATHS.includes(p)) && new Set(paths).size===paths.length;
const ordered = paths => PATHS.filter(p=>paths.includes(p));
const reply = (body,status=200,headers={}) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
export async function handleHomeSections(request,env,session,role,primary) {
 if(session.purpose!=='NORMAL'||!['ADMIN','ISTRUTTORE','SEGRETERIA'].includes(role))return reply({error:'Accesso non consentito.'},403);
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
