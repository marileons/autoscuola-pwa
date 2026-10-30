"use strict";
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.DrivingErrors=api})(typeof window!=="undefined"?window:globalThis,function(){
const MAX_NOTE_LENGTH=500,MAX_PLACE_LENGTH=200,FIX_MAX_AGE_MS=30000,DOUBLE_TAP_GUARD_MS=1000,DRAFT_PREFIX="agenda_driving_error_draft_v1",CATALOG_PREFIX="agenda_driving_error_catalog_v1";
const definitions=[
["precedence","Precedenze e intersezioni",["STOP non rispettato","Arresto incompleto allo STOP","Dare precedenza non rispettato","Precedenza a destra non rispettata","Impegno scorretto dell’intersezione","Mancata precedenza a pedone","Mancata precedenza a ciclista","Mancata precedenza a veicolo di emergenza"]],
["signs","Segnaletica e semafori",["Passaggio con semaforo rosso","Prosecuzione con semaforo giallo quando era possibile arrestarsi in sicurezza","Superamento della linea di arresto","Segnale di STOP non rispettato","Segnale di dare precedenza non rispettato","Divieto di accesso","Direzione obbligatoria non rispettata","Divieto non rispettato","Attraversamento della linea continua","Frecce direzionali sulla carreggiata non rispettate","Altra segnaletica non rispettata"]],
["speed","Velocità e distanze",["Superamento del limite di velocità","Velocità non adeguata a strada, traffico o visibilità","Velocità eccessivamente ridotta o esitazione pericolosa","Distanza di sicurezza insufficiente","Accelerazione brusca","Frenata brusca o tardiva"]],
["positioning","Posizionamento e corsie",["Corsia errata","Scelta errata della corsia prima dell’intersezione","Invasione della corsia opposta","Posizione troppo vicina al centro","Posizione troppo vicina al margine","Distanza insufficiente dai veicoli parcheggiati","Posizione errata in curva","Cambio corsia non sicuro"]],
["roundabout","Rotatoria",["Mancata precedenza in ingresso in presenza dell’apposita segnaletica","Approccio dalla corsia errata","Posizione errata nell’anello","Cambio corsia non sicuro","Uscita dalla corsia errata","Taglio delle corsie","Mancato controllo di specchi o angolo cieco","Mancato indicatore di direzione per il cambio corsia","Mancato indicatore di direzione in uscita","Mancata precedenza ai pedoni in uscita","Velocità non adeguata nella rotatoria"]],
["indicators","Indicatori di direzione",["Indicatore non utilizzato","Indicatore azionato in ritardo","Indicatore errato","Mancato indicatore nella svolta","Mancato indicatore nel cambio corsia","Mancato indicatore durante un sorpasso","Mancato indicatore prima di fermarsi o ripartire","Mancato indicatore in uscita dalla rotatoria"]],
["observation","Osservazione",["Mancato controllo degli specchi","Mancato controllo dell’angolo cieco","Osservazione insufficiente dell’intersezione","Mancato controllo di pedoni","Mancato controllo di ciclisti","Osservazione insufficiente in retromarcia","Mancato controllo prima dell’apertura della portiera"]],
["controls","Uso comandi e controllo del veicolo",["Partenza con freno a mano inserito","Mancato disinserimento del freno di stazionamento","Mancato inserimento del freno di stazionamento","Spegnimento del motore","Uso scorretto della frizione","Marcia errata","Controllo insufficiente dello sterzo","Arretramento nella partenza in salita","Uso errato di luci o tergicristalli","Frenata non controllata"]],
["maneuver","Manovre",["Parcheggio errato","Retromarcia non sicura","Inversione non sicura","Manovra in più tempi non corretta","Partenza in salita non corretta","Contatto con il marciapiede","Apertura o chiusura non sicura della portiera","Partenza o reinserimento nel traffico non sicuro"]],
["safety","Sorpasso e sicurezza",["Sorpasso vietato o non sicuro","Attraversamento della linea continua","Distanza laterale insufficiente da ciclista","Mancato uso della cintura","Utilizzo del telefono o distrazione","Mancata attenzione agli utenti vulnerabili"]],
["attention-behavior", "CONTROLLO, ATTENZIONE E COMPORTAMENTO", ["Problemi nello stacco della frizione", "Piede pesante sul freno", "Piede pesante sull'acceleratore", "Posizione non corretta dei piedi sui pedali", "Scarso utilizzo degli indicatori di direzione", "Confusione tra destra e sinistra", "Mancato controllo degli specchietti", "Mancato controllo prima dello spostamento laterale", "Mancato controllo prima del cambio di corsia", "Attenzione insufficiente", "Comunicazione poco chiara", "Ansia", "Rigidità nei movimenti", "Agitazione", "Altro problema tecnico o comportamentale"]],
["other","Altro",["Altro errore","Voce personalizzata","Da specificare nella nota"]]
];
const LEGACY_LABELS={precedence:"Precedenza",signs:"Segnaletica",speed:"Velocità",positioning:"Posizionamento",maneuver:"Manovra",controls:"Uso comandi",observation:"Osservazione",other:"Altro"};
const text=(value,max=Infinity)=>String(value??"").trim().slice(0,max),finite=value=>{const number=Number(value);return Number.isFinite(number)?number:null},identifier=(value,fallback="")=>text(value,160)||fallback,makeId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`;
const slug=value=>text(value,100).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||makeId();
function safeLabel(value,max=120){const result=text(value,max);if(!result)throw new Error("L’etichetta non può essere vuota.");if(/[<>]/.test(result))throw new Error("L’etichetta non può contenere HTML.");return result}

// Explicit stable-ID associations; labels are never searched to infer a sign.
const SYMBOLS=Object.freeze({generic:"GENERICO",stop:"STOP",yield:"DARE PRECEDENZA",noentry:"SENSO VIETATO",indicators:"INDICATORI",mirror:"OSSERVAZIONE / SPECCHI",clutch:"FRIZIONE",brake:"FRENO",accelerator:"ACCELERATORE",pedals:"PEDALI",distance:"DISTANZA",lanes:"CORSIE",reverse:"RETROMARCIA",parking:"PARCHEGGIO",attention:"ATTENZIONE",speed:"VELOCITÀ",traffic:"SEMAFORO","priorityright":"PRECEDENZA A DESTRA","junction":"INTERSEZIONE","bicycle":"BICICLETTA","emergency":"VEICOLO DI EMERGENZA","stopline":"LINEA DI ARRESTO","solidline":"LINEA CONTINUA","motothrottle":"ACCELERATORE MOTO","braking":"FUNZIONE FRENANTE","lateralclearance":"SPAZIO LATERALE","roundabout":"ANELLO DELLA ROTATORIA","parkingbrake":"FRENO DI STAZIONAMENTO","engine":"MOTORE","motoclutch":"LEVA FRIZIONE MOTO","gearshift":"LEVA CAMBIO AUTO","motoshift":"SELETTORE CAMBIO MOTO","steeringwheel":"VOLANTE AUTO","handlebar":"MANUBRIO MOTO","hillstart":"PARTENZA IN SALITA","uturn":"INVERSIONE DI MARCIA","maneuverpath":"MANOVRA IN PIÙ FASI","curb":"RUOTA E MARCIAPIEDE","door":"PORTIERA","merge":"IMMISSIONE NEL FLUSSO","overtake":"SORPASSO","seatbelt":"CINTURA DI SICUREZZA","communication":"COMUNICAZIONE"});
const SYMBOL_IDS=Object.freeze({
  "precedence-stop-non-rispettato": "stop",
  "precedence-arresto-incompleto-allo-stop": "stop",
  "precedence-dare-precedenza-non-rispettato": "yield",
  "precedence-precedenza-a-destra-non-rispettata": "priorityright",
  "precedence-impegno-scorretto-dell-intersezione": "junction",
  "precedence-mancata-precedenza-a-pedone": "attention",
  "precedence-mancata-precedenza-a-ciclista": "bicycle",
  "precedence-mancata-precedenza-a-veicolo-di-emergenza": "emergency",
  "signs-passaggio-con-semaforo-rosso": "traffic",
  "signs-prosecuzione-con-semaforo-giallo-quando-era-possibile-arrestarsi-in-sicurezza": "traffic",
  "signs-superamento-della-linea-di-arresto": "stopline",
  "signs-segnale-di-stop-non-rispettato": "stop",
  "signs-segnale-di-dare-precedenza-non-rispettato": "yield",
  "signs-divieto-di-accesso": "noentry",
  "signs-direzione-obbligatoria-non-rispettata": "generic",
  "signs-divieto-non-rispettato": "generic",
  "signs-attraversamento-della-linea-continua": "solidline",
  "signs-frecce-direzionali-sulla-carreggiata-non-rispettate": "lanes",
  "signs-altra-segnaletica-non-rispettata": "generic",
  "speed-superamento-del-limite-di-velocita": "speed",
  "speed-velocita-non-adeguata-a-strada-traffico-o-visibilita": "speed",
  "speed-velocita-eccessivamente-ridotta-o-esitazione-pericolosa": "speed",
  "speed-distanza-di-sicurezza-insufficiente": "distance",
  "speed-frenata-brusca-o-tardiva": "braking",
  "positioning-corsia-errata": "lanes",
  "positioning-scelta-errata-della-corsia-prima-dell-intersezione": "lanes",
  "positioning-invasione-della-corsia-opposta": "lanes",
  "positioning-posizione-troppo-vicina-al-centro": "lanes",
  "positioning-posizione-troppo-vicina-al-margine": "lanes",
  "positioning-distanza-insufficiente-dai-veicoli-parcheggiati": "lateralclearance",
  "positioning-posizione-errata-in-curva": "lanes",
  "positioning-cambio-corsia-non-sicuro": "lanes",
  "roundabout-mancata-precedenza-in-ingresso-in-presenza-dell-apposita-segnaletica": "yield",
  "roundabout-approccio-dalla-corsia-errata": "lanes",
  "roundabout-posizione-errata-nell-anello": "roundabout",
  "roundabout-cambio-corsia-non-sicuro": "lanes",
  "roundabout-uscita-dalla-corsia-errata": "lanes",
  "roundabout-taglio-delle-corsie": "lanes",
  "roundabout-mancato-controllo-di-specchi-o-angolo-cieco": "mirror",
  "roundabout-mancato-indicatore-di-direzione-per-il-cambio-corsia": "indicators",
  "roundabout-mancato-indicatore-di-direzione-in-uscita": "indicators",
  "roundabout-mancata-precedenza-ai-pedoni-in-uscita": "attention",
  "roundabout-velocita-non-adeguata-nella-rotatoria": "speed",
  "indicators-indicatore-non-utilizzato": "indicators",
  "indicators-indicatore-azionato-in-ritardo": "indicators",
  "indicators-indicatore-errato": "indicators",
  "indicators-mancato-indicatore-nella-svolta": "indicators",
  "indicators-mancato-indicatore-nel-cambio-corsia": "indicators",
  "indicators-mancato-indicatore-durante-un-sorpasso": "indicators",
  "indicators-mancato-indicatore-prima-di-fermarsi-o-ripartire": "indicators",
  "indicators-mancato-indicatore-in-uscita-dalla-rotatoria": "indicators",
  "observation-mancato-controllo-degli-specchi": "mirror",
  "observation-mancato-controllo-dell-angolo-cieco": "attention",
  "observation-osservazione-insufficiente-dell-intersezione": "attention",
  "observation-mancato-controllo-di-pedoni": "attention",
  "observation-mancato-controllo-di-ciclisti": "bicycle",
  "observation-osservazione-insufficiente-in-retromarcia": "mirror",
  "observation-mancato-controllo-prima-dell-apertura-della-portiera": "attention",
  "controls-partenza-con-freno-a-mano-inserito": "parkingbrake",
  "controls-mancato-disinserimento-del-freno-di-stazionamento": "parkingbrake",
  "controls-mancato-inserimento-del-freno-di-stazionamento": "parkingbrake",
  "controls-spegnimento-del-motore": "engine",
  "controls-arretramento-nella-partenza-in-salita": "hillstart",
  "controls-uso-errato-di-luci-o-tergicristalli": "generic",
  "controls-frenata-non-controllata": "braking",
  "maneuver-parcheggio-errato": "parking",
  "maneuver-retromarcia-non-sicura": "reverse",
  "maneuver-inversione-non-sicura": "uturn",
  "maneuver-manovra-in-piu-tempi-non-corretta": "maneuverpath",
  "maneuver-partenza-in-salita-non-corretta": "hillstart",
  "maneuver-contatto-con-il-marciapiede": "curb",
  "maneuver-apertura-o-chiusura-non-sicura-della-portiera": "door",
  "maneuver-partenza-o-reinserimento-nel-traffico-non-sicuro": "merge",
  "safety-sorpasso-vietato-o-non-sicuro": "overtake",
  "safety-attraversamento-della-linea-continua": "solidline",
  "safety-distanza-laterale-insufficiente-da-ciclista": "lateralclearance",
  "safety-mancato-uso-della-cintura": "seatbelt",
  "safety-utilizzo-del-telefono-o-distrazione": "attention",
  "safety-mancata-attenzione-agli-utenti-vulnerabili": "attention",
  "attention-behavior-piede-pesante-sul-freno": "brake",
  "attention-behavior-piede-pesante-sull-acceleratore": "accelerator",
  "attention-behavior-posizione-non-corretta-dei-piedi-sui-pedali": "pedals",
  "attention-behavior-scarso-utilizzo-degli-indicatori-di-direzione": "indicators",
  "attention-behavior-confusione-tra-destra-e-sinistra": "indicators",
  "attention-behavior-mancato-controllo-degli-specchietti": "mirror",
  "attention-behavior-mancato-controllo-prima-dello-spostamento-laterale": "attention",
  "attention-behavior-mancato-controllo-prima-del-cambio-di-corsia": "attention",
  "attention-behavior-attenzione-insufficiente": "attention",
  "attention-behavior-comunicazione-poco-chiara": "communication",
  "attention-behavior-ansia": "attention",
  "attention-behavior-rigidita-nei-movimenti": "attention",
  "attention-behavior-agitazione": "attention",
  "attention-behavior-altro-problema-tecnico-o-comportamentale": "generic",
  "other-altro-errore": "generic",
  "other-voce-personalizzata": "generic",
  "other-da-specificare-nella-nota": "generic"
});
const CONTEXT_SYMBOL_IDS=Object.freeze({
  "speed-accelerazione-brusca": {
    "auto": "accelerator",
    "moto": "motothrottle"
  },
  "controls-uso-scorretto-della-frizione": {
    "auto": "clutch",
    "moto": "motoclutch"
  },
  "controls-marcia-errata": {
    "auto": "gearshift",
    "moto": "motoshift"
  },
  "controls-controllo-insufficiente-dello-sterzo": {
    "auto": "steeringwheel",
    "moto": "handlebar"
  },
  "attention-behavior-problemi-nello-stacco-della-frizione": {
    "auto": "clutch",
    "moto": "motoclutch"
  }
});
const STANDARD_SYMBOLS=new Map();
for(const [category,,labels] of definitions)for(const label of labels){const id=category+"-"+slug(label);STANDARD_SYMBOLS.set(id,{label,contexts:CONTEXT_SYMBOL_IDS[id],symbol:SYMBOL_IDS[id]||(["indicators"].includes(category)?"indicators":category==="observation"?"mirror":category==="positioning"?"lanes":"generic")})}
function cleanSymbol(value){return typeof value==="string"&&Object.hasOwn(SYMBOLS,value)?value:""}
function symbolFor(entry,category=null){const chosen=cleanSymbol(entry?.symbol);if(chosen)return chosen;const standard=STANDARD_SYMBOLS.get(entry?.id);if(!standard||standard.label!==entry?.label)return"generic";if(standard.contexts){const type=category==="auto"?"auto":["moto","corso-moto"].includes(category)?"moto":null;return type?standard.contexts[type]:"generic"}return standard.symbol}
function symbolMarkup(entry,category=null){return '<svg class="driving-error-symbol" aria-hidden="true" focusable="false" viewBox="0 0 48 48"><use href="ui-icons.svg?v=errors-symbols-3#error-'+symbolFor(entry,category)+'"></use></svg>'}

function defaultCatalog(){return{version:1,categories:definitions.map(([id,label,items],order)=>({id,label,enabled:true,order:order+1,items:items.map((item,itemOrder)=>({id:`${id}-${slug(item)}`,label:item,enabled:true,order:itemOrder+1}))}))}}
// Extend only the new standard category; never replace personal catalogs or historical snapshots.
function withStandardAdditions(catalog){const standard=defaultCatalog().categories.find(c=>c.id==="attention-behavior"),key=value=>String(value).normalize("NFKC").trim().toLocaleLowerCase("it"),existing=catalog.categories.find(c=>c.id===standard.id||key(c.label)===key(standard.label));if(!existing){standard.order=Math.max(0,...catalog.categories.map(c=>c.order))+1;catalog.categories.push(standard)}else if(existing.id!==standard.id){const ids=new Set(existing.items.map(i=>i.id)),labels=new Set(existing.items.map(i=>key(i.label)));let order=Math.max(0,...existing.items.map(i=>i.order));for(const item of standard.items)if(!ids.has(item.id)&&!labels.has(key(item.label))){existing.items.push({...item,order:++order});ids.add(item.id);labels.add(key(item.label))}}return catalog}
function normalizeCatalog(source,{strict=false}={}){const raw=source?.categories;if(!Array.isArray(raw)){if(strict)throw new Error("Catalogo classificazioni non valido.");return defaultCatalog()}const categoryIds=new Set(),categories=[];for(const [index,item]of raw.entries()){try{const id=identifier(item?.id);if(!id||categoryIds.has(id))throw new Error("ID categoria duplicato.");const label=safeLabel(item.label),itemIds=new Set(),labels=new Set(),specific=[];for(const [position,entry]of(Array.isArray(item.items)?item.items:[]).entries()){const entryId=identifier(entry?.id);const entryLabel=safeLabel(entry?.label);const key=entryLabel.toLocaleLowerCase("it");if(!entryId||itemIds.has(entryId)||labels.has(key))throw new Error("Voce duplicata.");itemIds.add(entryId);labels.add(key);specific.push({id:entryId,label:entryLabel,...(cleanSymbol(entry.symbol)?{symbol:cleanSymbol(entry.symbol)}:{}),enabled:entry.enabled!==false,order:Number.isSafeInteger(entry.order)?entry.order:position+1})}categoryIds.add(id);categories.push({id,label,enabled:item.enabled!==false,order:Number.isSafeInteger(item.order)?item.order:index+1,items:specific.sort((a,b)=>a.order-b.order)})}catch(error){if(strict)throw error}}if(!categories.length){if(strict)throw new Error("Catalogo classificazioni vuoto.");return defaultCatalog()}categories.sort((a,b)=>a.order-b.order);return withStandardAdditions({version:1,categories})}
function catalogCategory(catalog,id){return normalizeCatalog(catalog).categories.find(item=>item.id===id)}
const CATEGORIES=Object.freeze(defaultCatalog().categories.map(({id,label})=>Object.freeze({id,label:LEGACY_LABELS[id]||label})));
function categoryLabel(value,catalog,error){return text(error?.categoryLabelSnapshot)||catalogCategory(catalog,value)?.label||LEGACY_LABELS[value]||"Da classificare"}
function normalizeSpecifics(raw,category){const values=Array.isArray(raw)?raw:[],seen=new Set();return values.map(value=>{const id=identifier(typeof value==="string"?value:value?.id);if(!id||seen.has(id))return null;const found=category?.items.find(item=>item.id===id);const label=text(typeof value==="object"?value?.label:"")||found?.label;if(!label)return null;seen.add(id);const symbol=cleanSymbol(typeof value==="object"?value?.symbol:"");return{id,label:text(label,120),...(symbol?{symbol}:{})}}).filter(Boolean)}
function normalizeError(raw,index=0,catalog=null){if(!raw||typeof raw!=="object")return null;const occurredAt=finite(raw.occurredAt)??finite(raw.createdAt)??Date.now(),createdAt=finite(raw.createdAt)??occurredAt,updatedAt=finite(raw.updatedAt)??createdAt,requested=identifier(raw.category,"unclassified"),known=catalogCategory(catalog,requested)||definitions.some(item=>item[0]===requested),historical=text(raw.categoryLabelSnapshot),category=requested==="unclassified"||(!known&&!historical)?"unclassified":requested,categoryInfo=catalogCategory(catalog,category),status=category==="unclassified"?"pending":raw.status==="pending"?"pending":"completed",locationStatus=["available","unavailable","low_accuracy","stale"].includes(raw.locationStatus)?raw.locationStatus:"unavailable",lat=finite(raw.lat),lng=finite(raw.lng),accuracy=finite(raw.accuracy),usableLocation=locationStatus==="available"&&lat!==null&&lng!==null&&accuracy!==null&&accuracy>=0&&accuracy<=100,result={id:identifier(raw.id,`error_${occurredAt}_${index}`),occurredAt,category,status,categoryLabelSnapshot:category==="unclassified"?"":historical||categoryLabel(category,catalog),specificErrors:normalizeSpecifics(raw.specificErrors||raw.specifics,categoryInfo),note:text(raw.note,MAX_NOTE_LENGTH),locationStatus:usableLocation?"available":locationStatus==="low_accuracy"?"low_accuracy":locationStatus==="stale"?"stale":"unavailable",gpsState:identifier(raw.gpsState,"inactive"),createdAt,updatedAt};if(typeof raw.instructorPlace==="string"){const place=text(raw.instructorPlace,MAX_PLACE_LENGTH);if(place)result.instructorPlace=place}if(usableLocation){result.lat=lat;result.lng=lng;result.accuracy=accuracy;const routeIndex=finite(raw.routeIndex),routePointTime=finite(raw.routePointTime);if(routeIndex!==null&&routeIndex>=0)result.routeIndex=Math.floor(routeIndex);if(routePointTime!==null)result.routePointTime=routePointTime}return result}
function normalizeErrors(items,catalog=null){if(!Array.isArray(items))return[];const seen=new Set();return items.map((item,index)=>normalizeError(item,index,catalog)).filter(item=>item&&!seen.has(item.id)&&seen.add(item.id)).sort((a,b)=>a.occurredAt-b.occurredAt||a.createdAt-b.createdAt||a.id.localeCompare(b.id))}
function createError(options={}){const now=finite(options.now)??Date.now(),fix=options.lastAcceptedFix,observation=options.lastObservation,gpsState=identifier(options.gpsState,options.gpsActive?"active":"inactive"),base={id:identifier(options.id,makeId()),occurredAt:now,category:"unclassified",status:"pending",categoryLabelSnapshot:"",specificErrors:[],note:"",locationStatus:"unavailable",gpsState,createdAt:now,updatedAt:now},fixTime=finite(fix?.time),fixAge=fixTime===null?Infinity:now-fixTime;if(options.gpsActive&&fix&&finite(fix.lat)!==null&&finite(fix.lng)!==null&&finite(fix.accuracy)!==null&&fix.accuracy<=100&&fixAge>=0&&fixAge<=FIX_MAX_AGE_MS)return normalizeError({...base,locationStatus:"available",lat:fix.lat,lng:fix.lng,accuracy:fix.accuracy,routeIndex:fix.routeIndex,routePointTime:fix.time});const observationTime=finite(observation?.time),observationAge=observationTime===null?Infinity:now-observationTime;if(options.gpsActive&&observation&&finite(observation.accuracy)>100&&observationAge>=0&&observationAge<=FIX_MAX_AGE_MS)return normalizeError({...base,locationStatus:"low_accuracy"});if(options.gpsActive&&fix&&fixTime!==null&&fixAge>FIX_MAX_AGE_MS)return normalizeError({...base,locationStatus:"stale"});return normalizeError(base)}
const canSignal=(lastSignalAt,now=Date.now())=>!Number.isFinite(lastSignalAt)||now-lastSignalAt>=DOUBLE_TAP_GUARD_MS;
function draftKey(accountId,studentId,lessonContext){return`${DRAFT_PREFIX}:${[accountId,studentId,lessonContext].map(value=>encodeURIComponent(identifier(value,"missing"))).join(":")}`}
function createDraftStore(storage){if(!storage||typeof storage.getItem!=="function"||typeof storage.setItem!=="function"||typeof storage.removeItem!=="function")throw new TypeError("Storage locale non disponibile");return{load(accountId,studentId,lessonContext){try{const parsed=JSON.parse(storage.getItem(draftKey(accountId,studentId,lessonContext))||"null");if(!parsed||parsed.accountId!==String(accountId)||parsed.studentId!==String(studentId)||parsed.lessonContext!==String(lessonContext))return null;return{...parsed,errors:normalizeErrors(parsed.errors)}}catch{return null}},save(accountId,studentId,lessonContext,payload){const draft={version:1,accountId:String(accountId),studentId:String(studentId),lessonContext:String(lessonContext),draftLessonId:identifier(payload?.draftLessonId,makeId()),updatedAt:finite(payload?.updatedAt)??Date.now(),errors:normalizeErrors(payload?.errors)};storage.setItem(draftKey(accountId,studentId,lessonContext),JSON.stringify(draft));return draft},remove(accountId,studentId,lessonContext){storage.removeItem(draftKey(accountId,studentId,lessonContext))},key:draftKey}}
function catalogKey(accountId){return`${CATALOG_PREFIX}:${encodeURIComponent(identifier(accountId,"missing"))}`}
function createCatalogStore(storage){if(!storage?.getItem||!storage?.setItem)throw new TypeError("Storage locale non disponibile");const clone=value=>typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value)),load=accountId=>{try{const raw=storage.getItem(catalogKey(accountId));return raw?normalizeCatalog(JSON.parse(raw),{strict:true}):defaultCatalog()}catch{return defaultCatalog()}},save=(accountId,catalog)=>{const clean=normalizeCatalog(catalog,{strict:true});storage.setItem(catalogKey(accountId),JSON.stringify(clean));return clean},update=(accountId,mutator)=>{const next=clone(load(accountId));mutator(next);next.categories.forEach((category,index)=>{category.order=index+1;category.items.forEach((item,itemIndex)=>item.order=itemIndex+1)});return save(accountId,next)},unique=(items,label,except="")=>{const key=label.toLocaleLowerCase("it");if(items.some(item=>item.id!==except&&item.label.toLocaleLowerCase("it")===key))throw new Error("Esiste già un’etichetta uguale.")};return{load,save,snapshot:load,restore:save,reset(accountId){return save(accountId,defaultCatalog())},addCategory(accountId,label){label=safeLabel(label);return update(accountId,c=>{unique(c.categories,label);c.categories.push({id:`custom-category-${makeId()}`,label,enabled:true,order:c.categories.length+1,items:[]})})},renameCategory(accountId,id,label){label=safeLabel(label);return update(accountId,c=>{unique(c.categories,label,id);const item=c.categories.find(x=>x.id===id);if(!item)throw new Error("Categoria non trovata.");item.label=label})},setCategoryEnabled(accountId,id,enabled){return update(accountId,c=>{const item=c.categories.find(x=>x.id===id);if(!item)throw new Error("Categoria non trovata.");item.enabled=!!enabled})},moveCategory(accountId,id,direction){return update(accountId,c=>{const from=c.categories.findIndex(x=>x.id===id),to=from+direction;if(from<0||to<0||to>=c.categories.length)return;[c.categories[from],c.categories[to]]=[c.categories[to],c.categories[from]]})},addItem(accountId,categoryId,label){label=safeLabel(label);return update(accountId,c=>{const category=c.categories.find(x=>x.id===categoryId);if(!category)throw new Error("Categoria non trovata.");unique(category.items,label);category.items.push({id:`custom-item-${makeId()}`,label,enabled:true,order:category.items.length+1})})},renameItem(accountId,categoryId,id,label){label=safeLabel(label);return update(accountId,c=>{const category=c.categories.find(x=>x.id===categoryId);if(!category)throw new Error("Categoria non trovata.");unique(category.items,label,id);const item=category.items.find(x=>x.id===id);if(!item)throw new Error("Voce non trovata.");item.label=label})},setItemSymbol(accountId,categoryId,id,symbol){if(!cleanSymbol(symbol)&&symbol!=="")throw Error("Simbolo non valido.");return update(accountId,c=>{const item=c.categories.find(x=>x.id===categoryId)?.items.find(x=>x.id===id);if(!item||!id.startsWith("custom-item-"))throw Error("Scelta disponibile per le voci personalizzate.");if(symbol)item.symbol=symbol;else delete item.symbol})},setItemEnabled(accountId,categoryId,id,enabled){return update(accountId,c=>{const item=c.categories.find(x=>x.id===categoryId)?.items.find(x=>x.id===id);if(!item)throw new Error("Voce non trovata.");item.enabled=!!enabled})},moveItem(accountId,categoryId,id,direction){return update(accountId,c=>{const items=c.categories.find(x=>x.id===categoryId)?.items;if(!items)throw new Error("Categoria non trovata.");const from=items.findIndex(x=>x.id===id),to=from+direction;if(from<0||to<0||to>=items.length)return;[items[from],items[to]]=[items[to],items[from]]})}}}
return{SYMBOLS,SYMBOL_IDS,CONTEXT_SYMBOL_IDS,cleanSymbol,symbolFor,symbolMarkup,CATEGORIES,MAX_NOTE_LENGTH,MAX_PLACE_LENGTH,FIX_MAX_AGE_MS,DOUBLE_TAP_GUARD_MS,defaultCatalog,normalizeCatalog,catalogCategory,categoryLabel,normalizeError,normalizeErrors,createError,canSignal,draftKey,createDraftStore,catalogKey,createCatalogStore};
});
