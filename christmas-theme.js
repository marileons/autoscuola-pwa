/* Seasonal presentation only: local preference, no account or lesson data. */
(function(root){
 "use strict";
 const KEY="agenda-mr-christmas-theme-v1",MODES=["auto","on","off"],rome=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"});
 const day=value=>rome.format(new Date(value));
 function isSeason(value=Date.now()){const date=day(value),month=Number(date.slice(5,7)),d=Number(date.slice(8));return(month===12&&d>=8)||(month===1&&d<=6)}
 function isActive(mode,value=Date.now()){return mode==="on"||(mode!=="off"&&isSeason(value))}
 function nextDayDelay(now=Date.now()){const today=day(now);let a=now,b=now+27*3600000;while(b-a>10){const middle=Math.floor((a+b)/2);if(day(middle)===today)a=middle;else b=middle}return Math.max(20,b-now+20)}
 if(typeof module==="object"&&module.exports)module.exports={isSeason,isActive,nextDayDelay,day};
 if(!root.document)return;
 let mode="auto",timer=null,queued=false;
 const $=id=>document.getElementById(id);
 function read(){try{const saved=localStorage.getItem(KEY);mode=MODES.includes(saved)?saved:"auto"}catch{mode="auto"}}
 function allowed(){return root.AgendaAuth?.reservedAreaUnlocked?.()===true}
 function text(node,value){if(node&&node.textContent!==value)node.textContent=value}
 function syncAccess(){
 const access=allowed(),card=$("christmasPreferences"),select=$("christmasThemeMode"),tools=$("reservedAreaTools"),entry=$("openChristmasTheme");
 if(tools)tools.hidden=!access;
 if(entry){entry.hidden=!access;entry.disabled=!access}
 if(card){if(!access&&card.open)card.close();card.hidden=!access}
 if(select){select.disabled=!access;if(select.value!==mode)select.value=mode}
}
 function markMonth(node,month){node?.classList.toggle("christmas-december",Number(month)===12)}
 function update(){
  document.documentElement.classList.toggle("christmas-theme",isActive(mode));
  syncAccess();
  text($("christmasThemeState"),isActive(mode)?"Tema natalizio visibile.":"Tema abituale visibile.");
  clearTimeout(timer);timer=null;if(!document.hidden)timer=setTimeout(update,nextDayDelay());
 }
 function image(id,src,parent,before=null){if($(id)||!parent)return;const node=document.createElement("img");node.id=id;node.className=id;node.src=src;node.alt="";node.setAttribute("aria-hidden","true");node.draggable=false;parent.insertBefore(node,before)}
 function decorate(){
  const home=$("home"),menu=$("otherFunctions");
  image("christmasHomeArt","assets/christmas-home.svg",home,home?.querySelector(".categories"));
  image("christmasLoginRoad","assets/christmas-road-tree.svg",document.querySelector(".auth-card"),document.querySelector(".auth-card>h1"));
  image("christmasMenuRoad","assets/christmas-road-tree.svg",menu);
  const header=menu?.querySelector(".side-menu-heading");
  if(header&&!$("christmasMenuLogo")){const badge=document.createElement("span");badge.id="christmasMenuLogo";badge.setAttribute("aria-hidden","true");const logo=document.createElement("img");logo.src="assets/home-petrol/logo-192.png?v=1";logo.alt="";badge.append(logo);header.prepend(badge)}
  if($("reservedCalendarActions")&&!$("christmasPreferences")){
   const card=document.createElement("dialog");card.id="christmasPreferences";card.className="christmas-preferences";card.hidden=true;card.setAttribute("aria-labelledby","christmasThemeTitle");
   card.innerHTML='<h3 id="christmasThemeTitle">Tema natalizio</h3><label for="christmasThemeMode">VISUALIZZAZIONE<select id="christmasThemeMode"><option value="auto">Automatico</option><option value="on">Attivo</option><option value="off">Disattivo</option></select></label><p>Automatico: dall’8 dicembre al 6 gennaio compresi, ogni anno. Data Europe/Rome.</p><p><strong>Solo questo dispositivo/browser.</strong> La scelta vale per gli accessi su questo browser; non viene sincronizzata tra dispositivi o salvata negli account.</p><p id="christmasThemeState"></p><p id="christmasThemeMessage" role="status" aria-live="polite"></p>';
   const close=document.createElement("button");close.type="button";close.className="secondary christmas-preferences-close";close.textContent="CHIUDI";close.onclick=()=>card.close();card.append(close);
   document.body.append(card);
   $("openChristmasTheme").onclick=()=>{if(!allowed())return;update();card.showModal()};

   $("christmasThemeMode").onchange=()=>{
    const select=$("christmasThemeMode"),value=select.value;
    if(!allowed()||!MODES.includes(value)){select.value=mode;text($("christmasThemeMessage"),"Sblocca l’Area riservata per modificare la scelta.");return}
    try{localStorage.setItem(KEY,value);if(localStorage.getItem(KEY)!==value)throw Error();mode=value;update();text($("christmasThemeMessage"),"Scelta salvata su questo dispositivo.")}
    catch{select.value=mode;text($("christmasThemeMessage"),"Scelta non salvata: memoria locale non disponibile. Il tema precedente è conservato.")}
   };
  }
  for(const node of document.querySelectorAll("#drivingErrorsSaveStatus,#userManagementMessage,#accountPasswordMessage,#registerMessage,.save-status,.shared-calendar [role=status]")){
   const value=node.textContent||"";
   node.classList.toggle("christmas-saved",/salvat|aggiornat|registrat|importat/i.test(value)&&!/(non |nessun|impossibil|fallit|negat|attesa|corso|errore (?:durante|di)|errore:)/i.test(value));
  }
  syncAccess();
 }
 function refresh(){read();update();decorate()}
 function boot(){
  read();update();decorate();
  const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorate()})});
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  document.addEventListener("visibilitychange",()=>{if(document.hidden){clearTimeout(timer);timer=null}else refresh()});
  root.addEventListener("focus",refresh);root.addEventListener("pageshow",refresh);
  root.addEventListener("pagehide",()=>{clearTimeout(timer);timer=null});
  root.addEventListener("storage",event=>{if(event.key===KEY||event.key===null)refresh()});
 }
 root.ChristmasTheme={isSeason,isActive,nextDayDelay,refresh,syncAccess,markMonth,mode:()=>mode};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})(typeof window!=="undefined"?window:globalThis);
