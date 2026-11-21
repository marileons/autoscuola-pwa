/* Global seasonal presentation; only verified server settings are cached locally. */
(function(root){
 "use strict";
 const CACHE="agenda-mr-christmas-global-cache-v1",MODES=["auto","on","off"],rome=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"});
 const day=value=>rome.format(new Date(value));
 function isSeason(value=Date.now()){const date=day(value),month=Number(date.slice(5,7)),d=Number(date.slice(8));return(month===12&&d>=8)||(month===1&&d<=6)}
 function isActive(mode,value=Date.now()){return mode==="on"||(mode!=="off"&&isSeason(value))}
 function nextDayDelay(now=Date.now()){const today=day(now);let a=now,b=now+27*3600000;while(b-a>10){const middle=Math.floor((a+b)/2);if(day(middle)===today)a=middle;else b=middle}return Math.max(20,b-now+20)}

 if(typeof module==="object"&&module.exports)module.exports={isSeason,isActive,nextDayDelay,day};
 if(!root.document)return;
 let mode="auto",version=0,received=false,timer=null,queued=false,pending=null,lastRequest=-Infinity;
 const $=id=>document.getElementById(id);
 const valid=data=>data?.available===true&&MODES.includes(data.mode)&&Number.isSafeInteger(data.version)&&data.version>=0&&typeof data.configured==="boolean"&&(data.configured?data.version>0:data.version===0&&data.mode==="auto");
 function text(node,value){if(node&&node.textContent!==value)node.textContent=value}
 function syncAccess(){const tools=$("reservedAreaTools");if(tools)tools.hidden=root.AgendaAuth?.reservedAreaUnlocked?.()!==true||!$("reservedCalendarActions")?.querySelector("button:not([hidden]),a:not([hidden])")}
 function markMonth(node,month){node?.classList.toggle("christmas-december",Number(month)===12)}
 function update(){document.documentElement.classList.toggle("christmas-theme",isActive(mode));syncAccess();clearTimeout(timer);timer=null;if(!document.hidden)timer=setTimeout(update,nextDayDelay())}
 function readCache(){try{const saved=JSON.parse(localStorage.getItem(CACHE));if(valid(saved)&&(!received||saved.version>=version)){mode=saved.mode;version=saved.version}}catch{}}
 function receive(data){
  if(!valid(data))return false;
  if(received&&data.version<version)return false;
  received=true;mode=data.mode;version=data.version;
  try{localStorage.setItem(CACHE,JSON.stringify(data))}catch{}
  update();return true;
 }
 async function refresh(force=false){
  update();decorate();
  if(pending)return pending;
  if(!force&&Date.now()-lastRequest<5000)return;
  lastRequest=Date.now();
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  pending=(async()=>{try{const response=await fetch("/api/public-config/christmas-theme",{credentials:"same-origin",cache:"no-store",signal:controller.signal});if(!response.ok)return;receive(await response.json())}catch{/* Preserve the last global setting; never revive the legacy local preference. */}finally{clearTimeout(timeout);pending=null}})();
  return pending;
 }
 function image(id,src,parent,before=null){if($(id)||!parent)return;const node=document.createElement("img");node.id=id;node.className=id;node.src=src;node.alt="";node.setAttribute("aria-hidden","true");node.draggable=false;parent.insertBefore(node,before)}
 function decorate(){
  const home=$("home"),menu=$("otherFunctions");
  image("christmasHomeArt","assets/christmas-home.svg",home,home?.querySelector(".categories"));
  image("christmasLoginRoad","assets/christmas-road-tree.svg",document.querySelector(".auth-card"),document.querySelector(".auth-card>h1"));
  image("christmasMenuRoad","assets/christmas-road-tree.svg",menu);
  const header=menu?.querySelector(".side-menu-heading");
  if(header&&!$("christmasMenuLogo")){const badge=document.createElement("span");badge.id="christmasMenuLogo";badge.setAttribute("aria-hidden","true");const logo=document.createElement("img");logo.src="assets/home-petrol/logo-192.png?v=1";logo.alt="";badge.append(logo);header.prepend(badge)}
  for(const node of document.querySelectorAll("#drivingErrorsSaveStatus,#userManagementMessage,#accountPasswordMessage,#registerMessage,.save-status,.shared-calendar [role=status]")){
   const value=node.textContent||"";
   node.classList.toggle("christmas-saved",/salvat|aggiornat|registrat|importat/i.test(value)&&!/(non |nessun|impossibil|fallit|negat|attesa|corso|errore (?:durante|di)|errore:)/i.test(value));
  }
  syncAccess();
 }

 function resume(){update();if(!root.AgendaAuth?.currentUser?.())void refresh(true)}
 function boot(){
  readCache();update();decorate();void refresh();
  const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorate()})});
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  document.addEventListener("visibilitychange",()=>{if(document.hidden){clearTimeout(timer);timer=null}else resume()});
  root.addEventListener("focus",resume);root.addEventListener("pageshow",resume);
  root.addEventListener("online",resume);
  root.addEventListener("pagehide",()=>{clearTimeout(timer);timer=null});
  root.addEventListener("storage",event=>{if(event.key===CACHE){readCache();update()}});
 }
 root.ChristmasTheme={isSeason,isActive,nextDayDelay,refresh,receive,syncAccess,markMonth,mode:()=>mode};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})(typeof window!=="undefined"?window:globalThis);
