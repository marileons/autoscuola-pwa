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

 // Account presentation only: no persistence or requests. Values come solely
 // from the authenticated profile; these are glyphs, never name mappings.
 const GLYPHS={"A":[8,"M0 10 3.1 0H4.9L8 10H6.25L5.55 7.8H2.45L1.75 10ZM3 6.2H5L4 2.6Z"],"B":[7,"M0 10V0H4.6Q6.9 0 6.9 2.2V3.1Q6.9 4.3 5.8 4.9Q7 5.4 7 6.8V7.8Q7 10 4.6 10ZM1.6 1.6V4.1H4.4Q5.3 4.1 5.3 3.2V2.4Q5.3 1.6 4.4 1.6ZM1.6 5.7V8.4H4.4Q5.4 8.4 5.4 7.5V6.7Q5.4 5.7 4.4 5.7Z"],"C":[6.8,"M6.8 1.15 5.65 2.3Q5.05 1.6 4.2 1.6H2.6Q1.6 1.6 1.6 2.6V7.4Q1.6 8.4 2.6 8.4H4.2Q5.05 8.4 5.65 7.7L6.8 8.85Q5.8 10 4.2 10H2.5Q0 10 0 7.5V2.5Q0 0 2.5 0H4.2Q5.8 0 6.8 1.15Z"],"D":[7,"M0 0H3.9Q7 0 7 3.2V6.8Q7 10 3.9 10H0ZM1.6 1.6V8.4H3.8Q5.4 8.4 5.4 6.7V3.3Q5.4 1.6 3.8 1.6Z"],"E":[6.3,"M0 0H6.3V1.6H1.6V4.1H5.5V5.7H1.6V8.4H6.3V10H0Z"],"F":[6.3,"M0 10V0H6.3V1.6H1.6V4.3H5.5V5.9H1.6V10Z"],"G":[7,"M6.8 1.15 5.65 2.3Q5.05 1.6 4.2 1.6H2.6Q1.6 1.6 1.6 2.6V7.4Q1.6 8.4 2.6 8.4H4.5Q5.4 8.4 5.4 7.5V6.1H3.6V4.5H7V7.6Q7 10 4.5 10H2.5Q0 10 0 7.5V2.5Q0 0 2.5 0H4.2Q5.8 0 6.8 1.15Z"],"H":[7,"M0 0H1.6V4.1H5.4V0H7V10H5.4V5.7H1.6V10H0Z"],"I":[4.6,"M0 0H4.6V1.6H3.1V8.4H4.6V10H0V8.4H1.5V1.6H0Z"],"J":[6.3,"M1.2 0H6.3V7.5Q6.3 10 3.8 10H2.5Q0 10 0 7.5V6.7H1.6V7.4Q1.6 8.4 2.6 8.4H3.7Q4.7 8.4 4.7 7.4V1.6H1.2Z"],"K":[7.2,"M0 0H1.6V4.5L5.25 0H7.2L3.4 4.7 7.2 10H5.25L2.25 6 1.6 6.8V10H0Z"],"L":[6.1,"M0 0H1.6V8.4H6.1V10H0Z"],"M":[7.8,"M0 10V0H1.5L3.9 3.6 6.3 0H7.8V10H6.2V2.7L3.9 6.1 1.6 2.7V10Z"],"N":[7.1,"M0 10V0H1.6L5.5 7V0H7.1V10H5.5L1.6 3V10Z"],"O":[7.2,"M2.5 0H4.7Q7.2 0 7.2 2.5V7.5Q7.2 10 4.7 10H2.5Q0 10 0 7.5V2.5Q0 0 2.5 0ZM2.6 1.6Q1.6 1.6 1.6 2.6V7.4Q1.6 8.4 2.6 8.4H4.6Q5.6 8.4 5.6 7.4V2.6Q5.6 1.6 4.6 1.6Z"],"P":[6.8,"M0 10V0H3.9Q6.8 0 6.8 2.9Q6.8 5.8 3.9 5.8H1.6V10ZM1.6 1.6V4.2H3.8Q5.2 4.2 5.2 2.9Q5.2 1.6 3.8 1.6Z"],"Q":[7.6,"M2.5 0H4.7Q7.2 0 7.2 2.5V7.5Q7.2 8.4 6.8 9L7.6 10H5.6L5.4 9.8Q5.05 10 4.7 10H2.5Q0 10 0 7.5V2.5Q0 0 2.5 0ZM2.6 1.6Q1.6 1.6 1.6 2.6V7.4Q1.6 8.4 2.6 8.4H4.3L3.2 7H5.2L5.6 7.5V2.6Q5.6 1.6 4.6 1.6Z"],"R":[7,"M0 10V0H3.9Q6.8 0 6.8 2.9Q6.8 5.1 4.8 5.65L7 10H5.15L2.95 5.8H1.6V10ZM1.6 1.6V4.2H3.8Q5.2 4.2 5.2 2.9Q5.2 1.6 3.8 1.6Z"],"S":[6.8,"M6.6 1.05 5.5 2.2Q4.9 1.6 4 1.6H2.55Q1.6 1.6 1.6 2.55Q1.6 3.35 2.45 3.65L4.8 4.5Q6.8 5.2 6.8 7.3Q6.8 10 4.2 10H2.5Q.9 10 0 8.9L1.15 7.75Q1.8 8.4 2.65 8.4H4.15Q5.2 8.4 5.2 7.4Q5.2 6.45 4.3 6.1L2 5.25Q0 4.55 0 2.5Q0 0 2.6 0H4Q5.6 0 6.6 1.05Z"],"T":[7.2,"M0 0H7.2V1.6H4.4V10H2.8V1.6H0Z"],"U":[7.1,"M0 0H1.6V7.4Q1.6 8.4 2.6 8.4H4.5Q5.5 8.4 5.5 7.4V0H7.1V7.5Q7.1 10 4.6 10H2.5Q0 10 0 7.5Z"],"V":[7.5,"M0 0H1.75L3.75 7.3 5.75 0H7.5L4.65 10H2.85Z"],"W":[7.8,"M0 0H1.6L2.6 7.1 3.15 3.5H4.65L5.2 7.1 6.2 0H7.8L6.25 10H4.65L3.9 6 3.15 10H1.55Z"],"X":[7.4,"M0 0H1.9L3.7 3.5 5.5 0H7.4L4.65 5 7.4 10H5.5L3.7 6.5 1.9 10H0L2.75 5Z"],"Y":[7.5,"M0 0H1.85L3.75 4.2 5.65 0H7.5L4.55 6V10H2.95V6Z"],"Z":[6.8,"M0 0H6.8V1.6L1.95 8.4H6.8V10H0V8.4L4.85 1.6H0Z"]},PAIR_GAPS={"PG":0.85,"GL":1.05,"EN":0.9,"CR":0.85},profileListeners=new Set();
 const MARKER_SVG=`<svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
 <defs>
  <linearGradient id="GPS_ID-paint" x1="0" y1="0" x2="1" y2=".2">
   <stop class="car-paint-edge"/><stop class="car-paint-light" offset=".38"/><stop class="car-paint-mid" offset=".72"/><stop class="car-paint-edge" offset="1"/>
  </linearGradient>
  <linearGradient id="GPS_ID-glass" x1=".1" y1="0" x2=".8" y2="1"><stop stop-color="#2c4751"/><stop offset="1" stop-color="#101d25"/></linearGradient>
  <linearGradient id="GPS_ID-roof" x1="0" y1="0" x2="1" y2=".2">
   <stop class="car-roof-edge"/><stop class="car-roof-light" offset=".44"/><stop class="car-roof-edge" offset="1"/>
  </linearGradient>
 </defs>
 <circle class="gps-heading-unknown" cx="24" cy="24" r="10"/>
 <g class="gps-heading-car" stroke-linecap="round" stroke-linejoin="round">
  <g fill="#152127"><rect x="10.8" y="9" width="4.5" height="9" rx="1.5"/><rect x="32.7" y="9" width="4.5" height="9" rx="1.5"/><rect x="10.8" y="33" width="4.5" height="8" rx="1.5"/><rect x="32.7" y="33" width="4.5" height="8" rx="1.5"/></g>
  <g class="car-rounded">
   <path d="M16.7 3.7Q24 .4 31.3 3.7C34.5 5.6 36 9.3 36 14l-.5 8 .5 13c0 6.1-2.1 9.5-6 11H18c-3.9-1.5-6-4.9-6-11l.5-13-.5-8c0-4.7 1.5-8.4 4.7-10.3Z" fill="url(#GPS_ID-paint)" stroke="#fff6e3" stroke-width="2.2"/>
   <path d="M17.2 5.1Q24 2.6 30.8 5.1M15 8q-2 4-2 10m20-10q2 4 2 10M18.5 44.3q5.5 1.2 11 0" fill="none" class="car-trim" stroke-width=".7"/>
  </g>
  <g class="car-panda">
   <path d="M15 3Q24 1.1 33 3c3 .7 4.7 3.8 4.8 7.4l-.4 27.9c-.2 4.8-2.5 7.1-6.5 7.7H17.1c-4-.6-6.3-2.9-6.5-7.7l-.4-27.9C10.3 6.8 12 3.7 15 3Z" fill="url(#GPS_ID-paint)" stroke="#fff6e3" stroke-width="2.2"/>
   <path d="M14.7 5.1Q24 2.9 33.3 5.1m-15 38.8q5.7.9 11.4 0" fill="none" class="car-trim" stroke-width=".8"/>
   <g class="car-stripes">
    <path fill="#2acbff" d="M25.5 4h2.5l-4 7.9h-2.5Zm3.2.2 1.4.2-3.8 7.5h-1.5ZM11.4 27.8l3.5 5.2v4.1l-3.6-5.6Zm25.2 0-3.5 5.2v4.1l3.6-5.6Z"/>
    <path fill="#151d25" d="m31 4.5.9.2-3.7 7.2h-.9ZM11.3 16l3.8 5.4v1.6l-3.8-5.2Zm0 3 3.8 5.3v1.6l-3.8-5.2Zm25.4-3-3.8 5.4v1.6l3.8-5.2Zm0 3-3.8 5.3v1.6l3.8-5.2ZM11.4 34.6l3.7 5.2.5 2.1-4.1-5.5Zm25.2 0-3.7 5.2-.5 2.1 4.1-5.5Z"/>
   </g>
  </g>
  <path d="M14.8 16.6 17 21.5v12.3L14.7 37Zm18.4 0L31 21.5v12.3l2.3 3.2Z" fill="#15262c"/>
  <path d="M15.7 13.2Q24 10 32.3 13.2L31 20.3Q24 19.1 17 20.3Z" fill="url(#GPS_ID-glass)" stroke="#0d181e" stroke-width=".85"/>
  <path d="M17.1 13.8q5-1.6 10.6-1L19 18.8h-1.2Z" fill="#89a0aa" opacity=".26"/>
  <path d="M17 21.3Q24 19.8 31 21.3L33 35.9Q24 37.5 15 35.9Z" fill="url(#GPS_ID-roof)" class="car-roof" stroke-width=".65"/>
  <path d="M16.5 37.4Q24 38.1 31.5 37.4l1 3.3Q24 43.6 15.5 40.7Z" fill="url(#GPS_ID-glass)" stroke="#0d181e" stroke-width=".75"/>
  <path d="m18 38.2 9 .2-5.6 2.4-4-.5Z" fill="#89a0aa" opacity=".19"/>
  <path d="M12.7 17.2 9.3 17q-2.5.9-1.4 2.8l4.8.5Zm22.6 0 3.4-.2q2.5.9 1.4 2.8l-4.8.5Z" class="car-mirrors" stroke="#fff6e3" stroke-width="1.1"/>
  <path d="M12.9 7.4q1.8-2.5 5-2.1l-1.3 3.4-4.5 2.1Zm22.2 0q-1.8-2.5-5-2.1l1.3 3.4 4.5 2.1Z" fill="#fff2cc" stroke="#18262e" stroke-width=".7"/>
  <path d="M13.1 39.7q1.9 2.6 4.8 3l.1 1.7q-3.8-.2-5.1-3Zm21.8 0q-1.9 2.6-4.8 3l-.1 1.7q3.8-.2 5.1-3Z" fill="#ff5a59" stroke="#781f28" stroke-width=".55"/>
  <g class="initials" fill="#fff" display="none"><g class="mr-original" transform="translate(17.85 22.9) scale(0.0360704) translate(-104 -112)" display="none"><path d="M104 278V112h35l72 85 72-85h35v236h-38V174l-69 81-69-81v104z"/><path d="M290 112h65c55 0 80 25 80 68 0 34-18 55-49 64l59 104h-46l-65-116v-24h19c29 0 43-9 43-28 0-21-14-30-43-30h-63z"/></g><g class="letter-pair" transform="translate(17.8500 24.9952) scale(0.780952)" display="none"><path class="glyph-first" fill-rule="evenodd" d="M0 10V0H1.5L3.9 3.6 6.3 0H7.8V10H6.2V2.7L3.9 6.1 1.6 2.7V10Z"/><path class="glyph-second" fill-rule="evenodd" transform="translate(8.75 0)" d="M0 10V0H3.9Q6.8 0 6.8 2.9Q6.8 5.1 4.8 5.65L7 10H5.15L2.95 5.8H1.6V10ZM1.6 1.6V4.2H3.8Q5.2 4.2 5.2 2.9Q5.2 1.6 3.8 1.6Z"/></g></g><path class="neutral" d="M21.5 27h5" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M15.4 31.8h17.2l1 3.8q.2.8-.9.8H15.3q-1.1 0-.9-.8Z" fill="#fff1d8" stroke="#39352e" stroke-width=".55"/>
  <text x="24" y="35.05" text-anchor="middle" textLength="17" lengthAdjust="spacingAndGlyphs" fill="#141817" font-family="Arial Rounded MT Bold,Arial,sans-serif" font-weight="900" font-size="3.35">SCUOLA GUIDA</text>
 </g>
</svg>`;
 let markerSequence=0,profileId=null,profileInitials=null,profileStyle="dark";
 const cleanInitials=value=>typeof value==='string'&&/^[A-Za-z]{2}$/.test(value.trim())?value.trim().toUpperCase():null;
 function setProfile(user){const id=typeof user?.id==='string'&&user.id?user.id:null,value=id?cleanInitials(user.gpsMarkerInitials):null;
  const style=id&&["rose","panda-yellow","panda-striped"].includes(user.gpsMarkerStyle)?user.gpsMarkerStyle:"dark";
  if(id===profileId&&value===profileInitials&&style===profileStyle)return;
  profileId=id;profileInitials=value;profileStyle=style;for(const notify of profileListeners)notify();
 }
 function setInitials(node,value){const pair=cleanInitials(value),group=node.querySelector('.initials'),original=node.querySelector('.mr-original'),letters=node.querySelector('.letter-pair'),neutral=node.querySelector('.neutral');
  const display=(element,visible)=>{const next=visible?'inline':'none';if(element.getAttribute('display')!==next)element.setAttribute('display',next)};
  display(group,!!pair);display(neutral,!pair);display(original,pair==='MR');display(letters,!!pair&&pair!=='MR');
  if(!pair||pair==='MR'){for(const path of letters.querySelectorAll('path'))if(path.getAttribute('d'))path.setAttribute('d','');return;}
  const a=GLYPHS[pair[0]],b=GLYPHS[pair[1]],gap=PAIR_GAPS[pair]??.95,width=a[0]+gap+b[0],scale=Math.min(.85,12.3/width);
  const set=(element,key,value)=>{if(element.getAttribute(key)!==value)element.setAttribute(key,value)};
  set(letters,'transform',`translate(${24-width*scale/2} ${27.15-10*scale/2}) scale(${scale})`);
  set(letters.querySelector('.glyph-first'),'d',a[1]);set(letters.querySelector('.glyph-second'),'d',b[1]);set(letters.querySelector('.glyph-second'),'transform',`translate(${a[0]+gap} 0)`);
 }
 function attach({L,map,now=()=>Date.now()}={}){
  if(!L||!map)return null;
  const engine=direction({now}),canRotate=supported(L)&&map.options.rotate===true;
  let disposed=false,mode='course',follow=true,heading=null,screenAngle=0,known=false,position=null,lastGeneration,reliable=false,moving=false,rotationTarget=null;
  const node=document.createElement('div');
  node.className='gps-heading-glyph';
  node.innerHTML=MARKER_SVG.replaceAll('GPS_ID','gps-car-'+(++markerSequence));
  const syncProfile=()=>{
   node.dataset.markerStyle=profileStyle;
   setInitials(node,profileInitials);
  };syncProfile();profileListeners.add(syncProfile);
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
  function dispose(){if(disposed)return;disposed=true;profileListeners.delete(syncProfile);stopRotation();map.off('rotate',paint);map.off('unload',dispose);control.remove();marker.remove()}
  paint();
  return{marker,reset,dispose,toggle,getMode:()=>mode,getHeading:()=>heading,update(input){if(disposed)return;if(input.generation!==lastGeneration){lastGeneration=input.generation;reset()}
   follow=input.follow!==false;reliable=!!input.healthy&&!!input.point&&Number.isFinite(input.point.accuracy)&&input.point.accuracy<=20&&now()-input.point.time<=5000;moving=!Number.isFinite(input.speedKmh)||input.speedKmh>=3;const previous=heading;heading=engine.update(input);
   const p=input.point;if(p){if(!position||p.lat!==position.lat||p.lng!==position.lng){marker.setLatLng([p.lat,p.lng]);position={lat:p.lat,lng:p.lng}}marker.setOpacity(1)}else marker.setOpacity(0);
   if(!reliable||!moving||heading!==previous||!follow||mode==='north'||(canRotate&&follow&&!map.getHeadingUp()))orient();paint();
  }};
 }
 setProfile(globalThis.AgendaAuth?.gpsMarkerProfile?globalThis.AgendaAuth.gpsMarkerProfile():globalThis.AgendaAuth?.currentUser?.());
 return{direction,attach,options,supported,setProfile};
});
