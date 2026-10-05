"use strict";
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.LessonGps=api;})(typeof window!=="undefined"?window:globalThis,function(){
 function distance(a,b){const r=Math.PI/180,x=(b.lat-a.lat)*r,y=(b.lng-a.lng)*r,h=Math.sin(x/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(y/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
 // Metres/seconds: accuracy <=40m, 65m/s absolute ceiling. Error radii
 // absorb stationary drift; uncertain movement requires two consistent fixes.
 function create(){let candidate=null,previous=null,smoothed=null,ready=false,accepted=null,beforeAccepted=null,interrupted=false,lastVelocity=null;
  return {observe(point,speed){
   const valid=Number.isFinite(point.lat)&&Math.abs(point.lat)<=90&&Number.isFinite(point.lng)&&Math.abs(point.lng)<=180&&Number.isFinite(point.accuracy)&&point.accuracy>=0&&point.accuracy<=40&&Number.isFinite(point.time);
   if(!valid){previous=null;candidate=null;smoothed=null;interrupted=!!accepted;return {ready:false,accept:false,speed:null};}
   if(!ready){const dt=candidate?(point.time-candidate.time)/1000:0;ready=point.accuracy<=15||!!(candidate&&dt>=1&&dt<=10&&distance(candidate,point)/dt<45);candidate=point;}
   let measured=null;
   if(point.accuracy<=35&&typeof speed==="number"&&Number.isFinite(speed)&&speed>=0&&speed<=65)measured=speed*3.6;
   else if(previous&&point.accuracy<=25&&previous.accuracy<=25){const dt=(point.time-previous.time)/1000,d=distance(previous,point),noise=Math.max(3,(previous.accuracy+point.accuracy)/2);if(dt>=1&&dt<=10&&d/dt<=65)measured=d<=noise?0:d/dt*3.6;}
   if(previous&&point.time<=previous.time)return {ready:false,accept:false,speed:null};
   let accept=ready,breakBefore=false;
   if(accepted){
    const dt=(point.time-accepted.time)/1000,d=distance(accepted,point),noise=Math.max(3,(accepted.accuracy+point.accuracy)/2),velocity=d/dt;
    if(dt<=0)return {ready:false,accept:false,speed:null};
    if(d<=noise){previous={...point};candidate=null;return {ready:true,accept:false,speed:0};}
    const direct=typeof speed==="number"&&Number.isFinite(speed)&&speed>=0&&speed<=65;
    // A poorly located reversal is not a reliable turn: ask for confirmation.
    // Precise fixes preserve genuine corners, without geometric smoothing.
    const a=beforeAccepted&&{x:accepted.lng-beforeAccepted.lng,y:accepted.lat-beforeAccepted.lat},b={x:point.lng-accepted.lng,y:point.lat-accepted.lat};
    const cosine=a?(a.x*b.x+a.y*b.y)/(Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y)):1;
    const uncertainTurn=!interrupted&&point.accuracy>15&&d>noise&&cosine<-.5;
    const inconsistent=uncertainTurn||velocity>65||(direct&&d>speed*dt+noise*2+8)||(lastVelocity!==null&&dt<5&&Math.abs(velocity-lastVelocity)>8*dt+noise/dt);
    if(inconsistent){interrupted=true;candidate=null;previous={...point};smoothed=null;return {ready:false,accept:false,speed:null};}
    if(interrupted||dt>60){
     const elapsed=candidate?(point.time-candidate.time)/1000:0;
     if(!candidate||elapsed<=0||elapsed>10||distance(candidate,point)>65*elapsed){candidate={...point};previous={...point};return {ready:false,accept:false,speed:null};}
     breakBefore=true;interrupted=false;candidate=null;
    }
    lastVelocity=velocity;
   }
   if(accept){beforeAccepted=breakBefore?null:accepted;accepted={...point};}
   previous={...point};smoothed=measured===null?null:measured===0?0:smoothed===null?measured:.6*smoothed+.4*measured;
   return {ready,accept,breakBefore,point:accept?{...point,breakBefore}:null,speed:smoothed===null?null:Math.round(smoothed)};
  }};
 }
 return {create,distance};
});
