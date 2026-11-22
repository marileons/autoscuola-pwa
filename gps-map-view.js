/* Presentation only. Keeps the same Leaflet map, layers and GPS owner. */
(function(root){
 "use strict";
 const entries=new Map();let active=null;
 function routeLine(L,points,options={}){
  const common={weight:5,opacity:1,lineCap:"round",lineJoin:"round",...options,interactive:false};
  const outline=L.polyline(points,{...common,color:"#07382F",weight:common.weight+3});
  const line=L.polyline(points,{...common,color:"#00A86B",interactive:true});
  const group=L.featureGroup([outline,line]);
  group.setLatLngs=value=>{outline.setLatLngs(value);line.setLatLngs(value);return group};
  return group;
 }
 function attach({L,map,isRecording=()=>false,stop=()=>{},reportError=null,closeOverlay=()=>{},readSpeed=()=>null,readStudent=null}){
  if(entries.has(map))return entries.get(map);
  const container=map.getContainer();let dialog=null,placeholder=null,frame=null,previousFocus=null,disposed=false;
  let expandButton,stopButton,errorButton,errorControl,speedBox,speedValue,studentControl,studentBox,studentName,footer=null,footerMoves=[];
  function mountFooter(){
   if(!reportError)return;
   footer=L.DomUtil.create("div","leaflet-control gps-map-footer",container);
   const left=L.DomUtil.create("div","gps-map-footer-left",footer),right=L.DomUtil.create("div","gps-map-footer-right");
   const move=(node,parent)=>{if(!node)return;const mark=document.createComment("map-control-original");node.before(mark);footerMoves.push({node,mark});parent.append(node)};
   move(errorButton,left);move(speedBox,footer);move(stopButton,right);move(container.querySelector(".gps-orientation-toggle"),right);footer.append(right);
   L.DomEvent.disableClickPropagation(footer);L.DomEvent.disableScrollPropagation(footer);L.DomEvent.on(footer,'click',L.DomEvent.stopPropagation);
  }
  function restoreFooter(){for(const {node,mark}of footerMoves)mark.replaceWith(node);footerMoves=[];footer?.remove();footer=null}
  function resize(){
   if(frame!==null)cancelAnimationFrame(frame);
   frame=requestAnimationFrame(()=>{
    frame=null;if(disposed||map.getZoom()===undefined)return;
    const zoomControl=container.querySelector('.leaflet-control-zoom');if(zoomControl)container.style.setProperty('--gps-zoom-height',zoomControl.offsetHeight+'px');
    const center=map.getCenter(),zoom=map.getZoom();
    map.invalidateSize({pan:true,animate:false});
    map.setView(center,zoom,{animate:false,reset:true});
   });
  }
  function sync(){
   const recording=isRecording();
   if(studentBox){const name=String(readStudent()||"").trim();studentBox.hidden=!dialog||!name;if(studentName.textContent!==name)studentName.textContent=name;}
   if(errorButton)errorButton.hidden=!dialog;
   if(speedBox){
    speedBox.hidden=!dialog;
    const value=readSpeed(),label=Number.isFinite(value)&&value>=0?String(Math.round(value)):"\u2014";
    if(speedValue.textContent!==label){speedValue.textContent=label;speedBox.setAttribute("aria-label","Velocità indicativa: "+label+" km/h")}
   }
   stopButton.hidden=!recording;
   stopButton.disabled=!recording;
  }
  function close(){
   if(!dialog)return;
   root.VoiceCommands?.detachMap();
   closeOverlay();restoreFooter();
   const current=dialog;dialog=null;
   placeholder.replaceWith(container);placeholder=null;
   container.classList.remove("gps-map-expanded");
   current.close();current.remove();
   document.body.classList.remove("gps-map-is-expanded");
   active=null;
   expandButton.textContent="\u26f6 Espandi mappa";
   expandButton.setAttribute("aria-label","Espandi mappa");
   expandButton.setAttribute("aria-expanded","false");
   sync();resize();previousFocus?.focus({preventScroll:true});
  }
  function expand(){
   if(disposed||dialog)return;
   active?.close();
   previousFocus=document.activeElement;
   dialog=document.createElement("dialog");dialog.className="gps-map-dialog";
   dialog.setAttribute("aria-label","Mappa GPS espansa");
   document.body.append(dialog);
   placeholder=document.createComment("map-original-position");
   container.before(placeholder);
   container.classList.add("gps-map-expanded");
   dialog.append(container);mountFooter();
   root.VoiceCommands?.attachMap(container);
   const opened=dialog;
   dialog.addEventListener("cancel",event=>{event.preventDefault();close()});
   dialog.addEventListener("close",()=>{if(dialog===opened)close()});
   dialog.showModal();
   document.body.classList.add("gps-map-is-expanded");
   active=api;
   expandButton.textContent="\u00d7";
   expandButton.setAttribute("aria-label","Chiudi mappa espansa");
   expandButton.setAttribute("aria-expanded","true");
   sync();resize();expandButton.focus({preventScroll:true});
  }
  const control=new (L.Control.extend({
   options:{position:"topright"},
   onAdd(){
    const box=L.DomUtil.create("div","leaflet-bar gps-map-view-controls");
    expandButton=L.DomUtil.create("button","gps-map-expand",box);
    expandButton.type="button";expandButton.textContent="\u26f6 Espandi mappa";
    expandButton.setAttribute("aria-label","Espandi mappa");
    expandButton.setAttribute("aria-expanded","false");
    expandButton.onclick=()=>dialog?close():expand();
    stopButton=L.DomUtil.create("button","gps-map-stop",box);
    stopButton.type="button";stopButton.textContent="FERMA GPS";
    stopButton.onclick=()=>{if(isRecording())stop();sync()};
    L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);
    return box;
   }
  }))().addTo(map);
  if(reportError){
   errorControl=L.control({position:"bottomleft"});
   errorControl.onAdd=()=>{
    const box=L.DomUtil.create("div","leaflet-control gps-map-error-controls");
    errorButton=L.DomUtil.create("button","gps-map-signal-error",box);
    errorButton.type="button";errorButton.hidden=true;
    errorButton.innerHTML='<svg class="mr-interior-icon" aria-hidden="true" focusable="false"><use href="ui-icons.svg#mr-error"/></svg><span>SEGNALA ERRORE</span>';
    errorButton.onclick=reportError;
    speedBox=L.DomUtil.create("div","gps-map-speed",box);speedBox.hidden=true;speedBox.setAttribute("role","status");
    speedBox.innerHTML="<strong>&mdash;</strong><span>km/h</span>";speedValue=speedBox.querySelector("strong");
    L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);
    return box;
   };
   errorControl.addTo(map);
  }
  if(readStudent){
   studentControl=L.control({position:"topleft"});
   studentControl.onAdd=()=>{
    studentBox=L.DomUtil.create("div","leaflet-control gps-map-student");studentBox.hidden=true;
    studentBox.innerHTML='<svg class="mr-interior-icon" aria-hidden="true" focusable="false"><use href="ui-icons.svg#mr-student"/></svg><div><small>ALLIEVO IN GUIDA</small><strong></strong></div>';
    studentName=studentBox.querySelector("strong");
    L.DomEvent.disableClickPropagation(studentBox);L.DomEvent.disableScrollPropagation(studentBox);
    return studentBox;
   };
   studentControl.addTo(map);
  }
  // Stop control clicks before Leaflet synthesizes a double-tap zoom.
  const controlContainer=map._controlContainer;
  L.DomEvent.on(controlContainer,"click",L.DomEvent.stopPropagation);
  const observer=new ResizeObserver(resize);observer.observe(container);
  root.addEventListener("orientationchange",resize);root.addEventListener("resize",resize);
  function dispose(){
   if(disposed)return;
   close();disposed=true;
   if(frame!==null)cancelAnimationFrame(frame);
   L.DomEvent.off(controlContainer,"click",L.DomEvent.stopPropagation);
   observer.disconnect();root.removeEventListener("orientationchange",resize);root.removeEventListener("resize",resize);
   studentControl?.remove();errorControl?.remove();control.remove();map.off("unload",dispose);entries.delete(map);
  }
  const api={expand,close,sync,dispose};
  map.on("unload",dispose);entries.set(map,api);sync();return api;
 }
 root.GpsMapView={attach,routeLine,closeAll(){active?.close()},sync(map){entries.get(map)?.sync()}};
})(window);
