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
  let disposed=false,mode='course',follow=true,heading=null,screenAngle=0,known=false,position=null,lastGeneration,reliable=false,moving=false,rotationTarget=null;
  const node=document.createElement('div');node.className='gps-heading-glyph';node.innerHTML='<svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gps-car-paint-v3" x1="0" y1="0" x2="1" y2=".15"><stop stop-color="#b98212"/><stop offset=".19" stop-color="#f3bd25"/><stop offset=".43" stop-color="#ffdc54"/><stop offset=".65" stop-color="#f7c82f"/><stop offset=".88" stop-color="#dfa517"/><stop offset="1" stop-color="#ad7510"/></linearGradient><linearGradient id="gps-car-glass-v3" x1=".15" y1="0" x2=".8" y2="1"><stop stop-color="#294e61"/><stop offset=".45" stop-color="#102c3c"/><stop offset="1" stop-color="#071b28"/></linearGradient><linearGradient id="gps-car-roof-v3" x1="0" y1="0" x2="1" y2=".2"><stop stop-color="#e4aa1a"/><stop offset=".45" stop-color="#ffdf65"/><stop offset="1" stop-color="#eab323"/></linearGradient></defs><circle class="gps-heading-unknown" cx="24" cy="24" r="10"/><g class="gps-heading-car"><g fill="#18252c"><rect x="11.8" y="10" width="3.5" height="8" rx="1.5"/><rect x="32.7" y="10" width="3.5" height="8" rx="1.5"/><rect x="11.8" y="32" width="3.5" height="8" rx="1.5"/><rect x="32.7" y="32" width="3.5" height="8" rx="1.5"/></g><path d="M17 3C20 1.4 28 1.4 31 3C34 4.5 35 8 35 12L34.5 18 35 35C35 41 33 45 30 46H18C15 45 13 41 13 35L13.5 18 13 12C13 8 14 4.5 17 3Z" fill="url(#gps-car-paint-v3)" stroke="#fff8de" stroke-width="3" stroke-linejoin="round"/><path d="M17 3C20 1.4 28 1.4 31 3C34 4.5 35 8 35 12L34.5 18 35 35C35 41 33 45 30 46H18C15 45 13 41 13 35L13.5 18 13 12C13 8 14 4.5 17 3Z" fill="none" stroke="#493c20" stroke-width=".8"/><path d="M17 5.5Q24 3.5 31 5.5L30 13Q24 11.5 18 13Z" fill="#ffdf62" opacity=".58"/><path d="M18 6.8 17 11.7M30 6.8 31 11.7" fill="none" stroke="#bd8c19" stroke-width=".65" opacity=".65"/><path d="M15.7 14Q24 10.7 32.3 14L30.8 21.5Q24 22.3 17.2 21.5Z" fill="url(#gps-car-glass-v3)" stroke="#58491e" stroke-width=".85"/><path d="M17 14.5Q22 12.7 27.7 13.5L18.1 20Z" fill="#88a6b4" opacity=".21"/><path d="M14.8 18 16.7 22.8 17 33.7 14.8 35.3Z M33.2 18 31.3 22.8 31 33.7 33.2 35.3Z" fill="#102b39"/><path d="M17.7 22.8Q24 21.7 30.3 22.8L30 34.8Q24 36 18 34.8Z" fill="url(#gps-car-roof-v3)"/><path d="M18 36Q24 37.2 30 36L31.2 40.6Q24 43 16.8 40.6Z" fill="url(#gps-car-glass-v3)" stroke="#65501c" stroke-width=".8"/><path d="M18.6 37 27.4 37.5 18.6 40Z" fill="#88a6b4" opacity=".16"/><path d="M14.5 20.3 11.3 19.9Q9.5 20.5 10.3 22.3L14.5 23Z M33.5 20.3 36.7 19.9Q38.5 20.5 37.7 22.3L33.5 23Z" fill="#e9b829" stroke="#58491e" stroke-width=".8"/><path d="M14.6 6.8Q16 4.9 18.7 5.3L17.9 8.6 14 11Z M33.4 6.8Q32 4.9 29.3 5.3L30.1 8.6 34 11Z" fill="#f8f4db" stroke="#8a762d" stroke-width=".65"/><path d="M19.7 3.6Q24 2.9 28.3 3.6" fill="none" stroke="#534728" stroke-width="1.1" stroke-linecap="round"/><path d="M14.7 40.2Q16.3 42 19 42.4L19.1 44.3Q16.1 44 15.2 42.6Z M33.3 40.2Q31.7 42 29 42.4L28.9 44.3Q31.9 44 32.8 42.6Z" fill="#a82f32" stroke="#69252b" stroke-width=".6"/><svg x="18.1" y="23" width="11.8" height="11.5" viewBox="80 100 370 345"><g fill="#07505b"><path d="M104 278V112h35l72 85 72-85h35v236h-38V174l-69 81-69-81v104z"/><path d="M290 112h65c55 0 80 25 80 68 0 34-18 55-49 64l59 104h-46l-65-116v-24h19c29 0 43-9 43-28 0-21-14-30-43-30h-63z"/><path d="M87 432c-9-74 39-123 182-158-105 45-135 93-126 158z"/></g><path d="M154 432c-20-76 17-121 115-158-73 45-84 97-40 158z" fill="#FFF6E5"/><path d="M191 423c-20-61-7-98 63-140" fill="none" stroke="#035364" stroke-width="7" stroke-dasharray="21 13"/></svg><path d="M19.5 44Q24 44.8 28.5 44" fill="none" stroke="#6b5822" stroke-width="1" stroke-linecap="round"/></g></svg>';
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
  function stopRotation(){if(canRotate)map.stopHeadingUp();rotationTarget=null}
  // Reuse the extension's single time-based RAF loop; retarget without queuing.
  // 4 degrees of target hysteresis ignore small bearing oscillations; easing
  // reaches about 90% in 620 ms at 60 Hz, using the shortest angular path.
  function orient(){if(!canRotate)return;if(mode==='north'){stopRotation();if(map.getBearing()!==0)map.setBearing(0);return}if(!follow||!reliable||!moving){stopRotation();return}if(heading!==null&&(rotationTarget===null||Math.abs(delta(rotationTarget,heading))>=4||!map.getHeadingUp())){rotationTarget=heading;map.setHeading(heading,{ease:.06,deadzone:.2})}}
  function toggle(){if(disposed||!canRotate)return;mode=mode==='course'?'north':'course';text(label,mode==='course'?'DIREZIONE DI MARCIA':'NORD IN ALTO');button.setAttribute('aria-pressed',String(mode==='course'));button.title=mode==='course'?'Passa a Nord in alto':'Passa a direzione di marcia';if(mode==='north'){stopRotation();map.setBearing(0)}orient();paint()}
  control.onAdd=()=>{const box=L.DomUtil.create('div','leaflet-control gps-orientation-control');box.append(button);L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);L.DomEvent.on(button,'click',toggle);button.disabled=!canRotate;return box};
  control.onRemove=()=>{L.DomEvent.off(button,'click',toggle)};control.addTo(map);
  map.on('rotate',paint);map.on('unload',dispose);
  function reset(){engine.reset();heading=null;position=null;known=false;node.classList.remove('gps-heading-known');stopRotation();if(canRotate)map.setBearing(0);paint()}
  function dispose(){if(disposed)return;disposed=true;stopRotation();map.off('rotate',paint);map.off('unload',dispose);control.remove();marker.remove()}
  paint();
  return{marker,reset,dispose,toggle,getMode:()=>mode,getHeading:()=>heading,update(input){if(disposed)return;if(input.generation!==lastGeneration){lastGeneration=input.generation;reset()}
   follow=input.follow!==false;reliable=!!input.healthy&&!!input.point&&Number.isFinite(input.point.accuracy)&&input.point.accuracy<=20&&now()-input.point.time<=5000;moving=!Number.isFinite(input.speedKmh)||input.speedKmh>=3;const previous=heading;heading=engine.update(input);
   const p=input.point;if(p){if(!position||p.lat!==position.lat||p.lng!==position.lng){marker.setLatLng([p.lat,p.lng]);position={lat:p.lat,lng:p.lng}}marker.setOpacity(1)}else marker.setOpacity(0);
   if(!reliable||!moving||heading!==previous||!follow||mode==='north'||(canRotate&&follow&&!map.getHeadingUp()))orient();paint();
  }};
 }
 return{direction,attach,options,supported};
});
