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
 let profileId=null,profileInitials=null,profileStyle="dark";
 const cleanInitials=value=>typeof value==='string'&&/^[A-Za-z]{2}$/.test(value.trim())?value.trim().toUpperCase():null;
 function setProfile(user){const id=typeof user?.id==='string'&&user.id?user.id:null,value=id?cleanInitials(user.gpsMarkerInitials):null;
  const style=id&&user.gpsMarkerStyle==="rose"?"rose":"dark";
  if(id===profileId&&value===profileInitials&&style===profileStyle)return;
  profileId=id;profileInitials=value;profileStyle=style;for(const notify of profileListeners)notify();
 }
 function setInitials(node,value){const pair=cleanInitials(value),group=node.querySelector('.initials'),original=node.querySelector('.mr-original'),letters=node.querySelector('.letter-pair'),neutral=node.querySelector('.neutral');
  const display=(element,visible)=>{const next=visible?'inline':'none';if(element.getAttribute('display')!==next)element.setAttribute('display',next)};
  display(group,!!pair);display(neutral,!pair);display(original,pair==='MR');display(letters,!!pair&&pair!=='MR');
  if(!pair||pair==='MR'){for(const path of letters.querySelectorAll('path'))if(path.getAttribute('d'))path.setAttribute('d','');return;}
  const a=GLYPHS[pair[0]],b=GLYPHS[pair[1]],gap=PAIR_GAPS[pair]??.95,width=a[0]+gap+b[0],scale=Math.min(.85,12.3/width);
  const set=(element,key,value)=>{if(element.getAttribute(key)!==value)element.setAttribute(key,value)};
  set(letters,'transform',`translate(${24-width*scale/2} ${28.9-10*scale/2}) scale(${scale})`);
  set(letters.querySelector('.glyph-first'),'d',a[1]);set(letters.querySelector('.glyph-second'),'d',b[1]);set(letters.querySelector('.glyph-second'),'transform',`translate(${a[0]+gap} 0)`);
 }
 function attach({L,map,now=()=>Date.now()}={}){
  if(!L||!map)return null;
  const engine=direction({now}),canRotate=supported(L)&&map.options.rotate===true;
  let disposed=false,mode='course',follow=true,heading=null,screenAngle=0,known=false,position=null,lastGeneration,reliable=false,moving=false,rotationTarget=null;
  const node=document.createElement('div');node.className='gps-heading-glyph';node.innerHTML="<svg width=\"48\" height=\"48\" viewBox=\"0 0 48 48\" aria-hidden=\"true\" xmlns=\"http://www.w3.org/2000/svg\">\n <defs>\n  <linearGradient id=\"gps-car-paint-v3\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\".15\"><stop stop-color=\"#083c99\"/><stop offset=\".19\" stop-color=\"#1269ed\"/><stop offset=\".43\" stop-color=\"#65b8ff\"/><stop offset=\".65\" stop-color=\"#2487ff\"/><stop offset=\".88\" stop-color=\"#0956cf\"/><stop offset=\"1\" stop-color=\"#062d78\"/></linearGradient>\n  <linearGradient id=\"gps-car-glass-v3\" x1=\".15\" y1=\"0\" x2=\".8\" y2=\"1\"><stop stop-color=\"#294e61\"/><stop offset=\".45\" stop-color=\"#102c3c\"/><stop offset=\"1\" stop-color=\"#071b28\"/></linearGradient>\n  <linearGradient id=\"gps-car-roof-v3\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\".2\"><stop stop-color=\"#0b1e30\"/><stop offset=\".45\" stop-color=\"#233d53\"/><stop offset=\"1\" stop-color=\"#0a1b2b\"/></linearGradient>\n </defs>\n\n <circle class=\"gps-heading-unknown\" cx=\"24\" cy=\"24\" r=\"10\"/><g class=\"gps-heading-car\">\n  <g fill=\"#18252c\"><rect x=\"11.8\" y=\"10\" width=\"3.5\" height=\"8\" rx=\"1.5\"/><rect x=\"32.7\" y=\"10\" width=\"3.5\" height=\"8\" rx=\"1.5\"/><rect x=\"11.8\" y=\"32\" width=\"3.5\" height=\"8\" rx=\"1.5\"/><rect x=\"32.7\" y=\"32\" width=\"3.5\" height=\"8\" rx=\"1.5\"/></g>\n  <path d=\"M17 3C20 1.4 28 1.4 31 3C34 4.5 35 8 35 12L34.5 18 35 35C35 41 33 45 30 46H18C15 45 13 41 13 35L13.5 18 13 12C13 8 14 4.5 17 3Z\" fill=\"url(#gps-car-paint-v3)\" stroke=\"#f1f7fc\" stroke-width=\"3\" stroke-linejoin=\"round\"/>\n  <path d=\"M17 3C20 1.4 28 1.4 31 3C34 4.5 35 8 35 12L34.5 18 35 35C35 41 33 45 30 46H18C15 45 13 41 13 35L13.5 18 13 12C13 8 14 4.5 17 3Z\" fill=\"none\" stroke=\"#102c45\" stroke-width=\".8\"/>\n  <path d=\"M17 5.5Q24 3.5 31 5.5L30 13Q24 11.5 18 13Z\" fill=\"#7ccaff\" opacity=\".58\"/>\n  <path d=\"M18 6.8 17 11.7M30 6.8 31 11.7\" fill=\"none\" stroke=\"#1463ad\" stroke-width=\".65\" opacity=\".65\"/>\n  <path d=\"M15.7 14Q24 10.7 32.3 14L30.8 21.5Q24 22.3 17.2 21.5Z\" fill=\"url(#gps-car-glass-v3)\" stroke=\"#14334a\" stroke-width=\".85\"/>\n  <path d=\"M17 14.5Q22 12.7 27.7 13.5L18.1 20Z\" fill=\"#88a6b4\" opacity=\".21\"/>\n  <path d=\"M14.8 18 16.7 22.8 17 33.7 14.8 35.3Z M33.2 18 31.3 22.8 31 33.7 33.2 35.3Z\" fill=\"#102b39\"/>\n  <path d=\"M17.1 22.8Q24 21.7 30.9 22.8L30.6 34.8Q24 36 17.4 34.8Z\" fill=\"url(#gps-car-roof-v3)\"/>\n  <path d=\"M18 36Q24 37.2 30 36L31.2 40.6Q24 43 16.8 40.6Z\" fill=\"url(#gps-car-glass-v3)\" stroke=\"#14334a\" stroke-width=\".8\"/>\n  <path d=\"M18.6 37 27.4 37.5 18.6 40Z\" fill=\"#88a6b4\" opacity=\".16\"/>\n  <path d=\"M14.5 20.3 11.3 19.9Q9.5 20.5 10.3 22.3L14.5 23Z M33.5 20.3 36.7 19.9Q38.5 20.5 37.7 22.3L33.5 23Z\" fill=\"#2586f3\" stroke=\"#14334a\" stroke-width=\".8\"/>\n  <path d=\"M14.6 6.8Q16 4.9 18.7 5.3L17.9 8.6 14 11Z M33.4 6.8Q32 4.9 29.3 5.3L30.1 8.6 34 11Z\" fill=\"#f8f4db\" stroke=\"#4d6e8a\" stroke-width=\".65\"/>\n  <path d=\"M19.7 3.6Q24 2.9 28.3 3.6\" fill=\"none\" stroke=\"#102e4d\" stroke-width=\"1.1\" stroke-linecap=\"round\"/>\n  <path d=\"M14.7 40.2Q16.3 42 19 42.4L19.1 44.3Q16.1 44 15.2 42.6Z M33.3 40.2Q31.7 42 29 42.4L28.9 44.3Q31.9 44 32.8 42.6Z\" fill=\"#a82f32\" stroke=\"#69252b\" stroke-width=\".6\"/>\n  <g class=\"initials\" fill=\"#fff\" display=\"none\"><g class=\"mr-original\" transform=\"translate(17.85 24.6437) scale(0.0360704) translate(-104 -112)\" display=\"none\"><path d=\"M104 278V112h35l72 85 72-85h35v236h-38V174l-69 81-69-81v104z\"/><path d=\"M290 112h65c55 0 80 25 80 68 0 34-18 55-49 64l59 104h-46l-65-116v-24h19c29 0 43-9 43-28 0-21-14-30-43-30h-63z\"/></g><g class=\"letter-pair\" transform=\"translate(17.8500 24.9952) scale(0.780952)\" display=\"none\"><path class=\"glyph-first\" fill-rule=\"evenodd\" d=\"M0 10V0H1.5L3.9 3.6 6.3 0H7.8V10H6.2V2.7L3.9 6.1 1.6 2.7V10Z\"/><path class=\"glyph-second\" fill-rule=\"evenodd\" transform=\"translate(8.75 0)\" d=\"M0 10V0H3.9Q6.8 0 6.8 2.9Q6.8 5.1 4.8 5.65L7 10H5.15L2.95 5.8H1.6V10ZM1.6 1.6V4.2H3.8Q5.2 4.2 5.2 2.9Q5.2 1.6 3.8 1.6Z\"/></g></g><path class=\"neutral\" d=\"M21.5 28.8h5\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>\n <path d=\"M19.5 44Q24 44.8 28.5 44\" fill=\"none\" stroke=\"#0d355b\" stroke-width=\"1\" stroke-linecap=\"round\"/>\n </g>\n</svg>";
  const syncProfile=()=>{
   node.classList.toggle('gps-heading-rose',profileStyle==='rose');
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
