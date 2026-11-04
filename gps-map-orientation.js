/* View-only orientation. No geolocation, storage, network, route or lesson writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.GpsMapOrientation=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 if(globalThis.L?.Map)globalThis.L.Map.mergeOptions({preventPageGestures:false});
 const norm=n=>(n%360+360)%360,delta=(a,b)=>((b-a+540)%360)-180;
 const distance=(a,b)=>{const r=Math.PI/180,h=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(h)))};
 const bearing=(a,b)=>{const r=Math.PI/180,y=Math.sin((b.lng-a.lng)*r)*Math.cos(b.lat*r),x=Math.cos(a.lat*r)*Math.sin(b.lat*r)-Math.sin(a.lat*r)*Math.cos(b.lat*r)*Math.cos((b.lng-a.lng)*r);return norm(Math.atan2(y,x)/r)};
 function direction({now=()=>Date.now()}={}){
  let points=[],heading=null,lastTime=null,generation;
  function reset(){points=[];heading=null;lastTime=null}
  return{reset,read(){return heading},update(input){
   if(input.generation!==generation){generation=input.generation;reset()}
   const p=input.point;
   if(!input.healthy||!p||!Number.isFinite(p.time)||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||!Number.isFinite(p.accuracy)||p.accuracy<0||p.accuracy>20||now()-p.time>5000||p.time-now()>2000){points=[];return heading}
   if(input.speedKmh===0||(Number.isFinite(input.speedKmh)&&input.speedKmh<3)){points=[];lastTime=p.time;return heading}
   if(lastTime===p.time)return heading;
   if(lastTime!==null&&(p.time<lastTime||p.time-lastTime>6000)||input.breakBefore)points=[];
   lastTime=p.time;
   const previous=points.at(-1);
   if(previous&&distance(previous,p)>65*((p.time-previous.time)/1000)+previous.accuracy+p.accuracy){points=[];return heading}
   points.push({lat:p.lat,lng:p.lng,accuracy:p.accuracy,time:p.time});
   while(points.length>20||p.time-points[0].time>12000)points.shift();
   // Nearest sufficiently long three-position window; never a two-fix jitter bearing.
   for(let start=points.length-3;start>=0;start--){const slice=points.slice(start),a=slice[0],z=slice.at(-1),threshold=Math.max(12,3*Math.max(...slice.map(x=>x.accuracy)));if(distance(a,z)<threshold)continue;
    const midpoint=(a.time+z.time)/2,b=slice.slice(1,-1).reduce((best,q)=>Math.abs(q.time-midpoint)<Math.abs(best.time-midpoint)?q:best,slice[1]);
    if(distance(a,b)<Math.max(3,a.accuracy,b.accuracy)||distance(b,z)<Math.max(3,b.accuracy,z.accuracy))return heading;
    if(Math.abs(delta(bearing(a,b),bearing(b,z)))>35)return heading;
    const next=bearing(a,z);if(heading===null||Math.abs(delta(heading,next))>=3)heading=next;return heading;
   }
   return heading;
  }};
 }
 const supported=L=>typeof L?.Map?.prototype?.setBearing==='function'&&typeof L.Map.prototype.setHeading==='function';
 const options=L=>({rotate:supported(L),bearing:0,rotateControl:false,dragRotate:false,touchRotate:false,shiftKeyRotate:false,preventPageGestures:false});
 function attach({L,map,now=()=>Date.now()}={}){
  if(!L||!map)return null;
  const engine=direction({now}),canRotate=supported(L)&&map.options.rotate===true;
  let disposed=false,mode='course',follow=true,heading=null,screenAngle=0,known=false,position=null,lastGeneration,reliable=false;
  const node=document.createElement('div');node.className='gps-heading-glyph';node.innerHTML='<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="gps-heading-unknown" cx="24" cy="24" r="10"/><path class="gps-heading-arrow" d="M24 4 40 39 24 31 8 39Z"/><circle class="gps-heading-core" cx="24" cy="25" r="3"/></svg>';
  const marker=L.marker(map.getCenter(),{icon:L.divIcon({html:node,className:'gps-heading-marker',iconSize:[48,48],iconAnchor:[24,24]}),opacity:0,interactive:false,keyboard:false,zIndexOffset:1000}).addTo(map);
  const svg=node.querySelector('svg'),control=L.control({position:'topright'});
  const button=document.createElement('button'),label=document.createTextNode('DIREZIONE DI MARCIA'),hint=document.createElement('small');
  button.type='button';button.className='gps-orientation-toggle';button.append(label,hint);button.setAttribute('aria-pressed','true');
  function text(node,value){if(node.nodeValue!==value)node.nodeValue=value}
  function paint(){if(disposed)return;const target=heading===null?0:mode==='course'&&follow&&canRotate?0:norm(heading+(canRotate?map.getBearing():0));screenAngle+=delta(norm(screenAngle),target);const transform='rotate('+screenAngle+'deg)';if(svg.style.transform!==transform)svg.style.transform=transform;
   const value=heading!==null;if(value!==known){known=value;node.classList.toggle('gps-heading-known',known)}
   const status=!canRotate?'Solo Nord: rotazione non disponibile':!follow?'Esplorazione manuale':heading===null?'Nord · direzione non disponibile':!reliable?'Ultimo orientamento · in attesa GPS':'Orientamento da movimento GPS';
   if(hint.textContent!==status)hint.textContent=status;
   const title=known?'Posizione corrente; direzione stimata dal movimento':'Posizione corrente; direzione non disponibile';if(node.title!==title)node.title=title;
  }
  function orient(){if(!canRotate)return;if(!follow){map.stopHeadingUp();return}if(mode==='north'){map.stopHeadingUp();if(map.getBearing()!==0)map.setBearing(0)}else if(heading!==null)map.setHeading(heading,{ease:.2,deadzone:.5})}
  function toggle(){if(disposed||!canRotate)return;mode=mode==='course'?'north':'course';text(label,mode==='course'?'DIREZIONE DI MARCIA':'NORD IN ALTO');button.setAttribute('aria-pressed',String(mode==='course'));button.title=mode==='course'?'Passa a Nord in alto':'Passa a direzione di marcia';if(mode==='north'){map.stopHeadingUp();map.setBearing(0)}orient();paint()}
  control.onAdd=()=>{const box=L.DomUtil.create('div','leaflet-control gps-orientation-control');box.append(button);L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);L.DomEvent.on(button,'click',toggle);button.disabled=!canRotate;return box};
  control.onRemove=()=>{L.DomEvent.off(button,'click',toggle)};control.addTo(map);
  map.on('rotate',paint);map.on('unload',dispose);
  function reset(){engine.reset();heading=null;position=null;known=false;node.classList.remove('gps-heading-known');if(canRotate){map.stopHeadingUp();map.setBearing(0)}paint()}
  function dispose(){if(disposed)return;disposed=true;if(canRotate)map.stopHeadingUp();map.off('rotate',paint);map.off('unload',dispose);control.remove();marker.remove()}
  paint();
  return{marker,reset,dispose,toggle,getMode:()=>mode,getHeading:()=>heading,update(input){if(disposed)return;if(input.generation!==lastGeneration){lastGeneration=input.generation;reset()}
   follow=input.follow!==false;reliable=!!input.healthy&&!!input.point&&Number.isFinite(input.point.accuracy)&&input.point.accuracy<=20&&now()-input.point.time<=5000;const previous=heading;heading=engine.update(input);
   const p=input.point;if(p){if(!position||p.lat!==position.lat||p.lng!==position.lng){marker.setLatLng([p.lat,p.lng]);position={lat:p.lat,lng:p.lng}}marker.setOpacity(1)}else marker.setOpacity(0);
   if(!reliable&&canRotate)map.stopHeadingUp();else if(heading!==previous||!follow||mode==='north'||(canRotate&&follow&&!map.getHeadingUp()))orient();paint();
  }};
 }
 return{direction,attach,options,supported};
});
