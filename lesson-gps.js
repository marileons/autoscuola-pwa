"use strict";
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.LessonGps=api;})(typeof window!=="undefined"?window:globalThis,function(){
 function distance(a,b){const r=Math.PI/180,x=(b.lat-a.lat)*r,y=(b.lng-a.lng)*r,h=Math.sin(x/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(y/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
 // Accuracy is uncertainty, not absence of signal. Preserve raw coordinates;
 // heading, acceleration and sensor speed do not veto plausible track points.
 function create(){let previous=null,accepted=null,candidate=null,pending=null,pendingCount=0,ready=false,interrupted=false,smoothed=null;
  const coherent=(a,b)=>{const seconds=(b.time-a.time)/1000;return seconds>0&&seconds<=60&&distance(a,b)<=65*seconds+Math.min(100,a.accuracy+b.accuracy)};
  return {observe(point,speed){
   const valid=point&&Number.isFinite(point.lat)&&Math.abs(point.lat)<=90&&Number.isFinite(point.lng)&&Math.abs(point.lng)<=180&&Number.isFinite(point.accuracy)&&point.accuracy>=0&&Number.isFinite(point.time);
   if(!valid){previous=null;candidate=null;pending=null;pendingCount=0;smoothed=null;interrupted=!!accepted;return{ready:false,accept:false,speed:null};}
   if((previous&&point.time<=previous.time)||(accepted&&point.time<=accepted.time))return{ready,accept:false,speed:null};
   const last=previous;previous={...point};
   if(last&&point.time-last.time>60000){interrupted=!!accepted;candidate=null;}
   // Existing tachometer measurement and smoothing stay separate from recording.
   let measured=null;
   if(point.accuracy<=35&&typeof speed==="number"&&Number.isFinite(speed)&&speed>=0&&speed<=65)measured=speed*3.6;
   else if(last&&point.accuracy<=25&&last.accuracy<=25){const dt=(point.time-last.time)/1000,d=distance(last,point),noise=Math.max(3,(last.accuracy+point.accuracy)/2);if(dt>=1&&dt<=10&&d/dt<=65)measured=d<=noise?0:d/dt*3.6;}
   if(!ready){ready=point.accuracy<=15||!!(candidate&&coherent(candidate,point));candidate={...point};if(!ready)return{ready:false,accept:false,speed:null};candidate=null;}
   let breakBefore=false;
   if(interrupted){
    if(!candidate||!coherent(candidate,point)){candidate={...point};return{ready:false,accept:false,speed:null};}
    breakBefore=true;interrupted=false;candidate=null;pending=null;pendingCount=0;
   }else if(accepted){
    const dt=(point.time-accepted.time)/1000,d=distance(accepted,point),uncertainty=Math.min(100,accepted.accuracy+point.accuracy);
    if(d>65*dt+uncertainty){
     pendingCount=pending&&coherent(pending,point)?pendingCount+1:1;pending={...point};
     if(pendingCount<3)return{ready:true,accept:false,speed:null,reason:"pending"};
     // Sustained recovery from a displaced fix starts a separate segment.
     breakBefore=true;pending=null;pendingCount=0;
    }else{
     pending=null;pendingCount=0;
     const moving=typeof speed==="number"&&Number.isFinite(speed)&&speed>1&&speed<=65;
     const noise=moving?3:Math.max(3,Math.min(100,(accepted.accuracy+point.accuracy)/2));
     if(d<=noise)return{ready:true,accept:false,speed:0};
    }
   }
   accepted={...point};smoothed=measured===null?null:measured===0?0:smoothed===null?measured:.6*smoothed+.4*measured;
   return{ready:true,accept:true,breakBefore,point:{...point,breakBefore},speed:smoothed===null?null:Math.round(smoothed)};
  }};
 }
 return {create,distance};
});
