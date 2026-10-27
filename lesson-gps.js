"use strict";
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.LessonGps=api;})(typeof window!=="undefined"?window:globalThis,function(){
 function distance(a,b){const r=Math.PI/180,x=(b.lat-a.lat)*r,y=(b.lng-a.lng)*r,h=Math.sin(x/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(y/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
 // Accuracy is uncertainty, not absence of signal. Preserve raw coordinates;
 // heading, acceleration and sensor speed do not veto plausible track points.
 function create({initialAcquisition=false,now=()=>Date.now()}={}){let acquisitionPrevious=null;let previous=null,accepted=null,trustedObservation=null,candidate=null,pending=null,pendingCount=0,ready=false,interrupted=false,smoothed=null;
  const coherent=(a,b)=>{const seconds=(b.time-a.time)/1000;return seconds>0&&seconds<=60&&distance(a,b)<=65*seconds+Math.min(100,a.accuracy+b.accuracy)};
  // Missing speed is not a zero reading. Keep a bounded, session-local evidence window.
  let unknownMotion=[],unknownMoving=false;
  const resetUnknownMotion=()=>{unknownMotion=[];unknownMoving=false};
  const consistentMotion=points=>{
   if(points.length<5)return false;
   const velocities=[],vectors=[];let path=0;
   for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],seconds=(b.time-a.time)/1000,metres=distance(a,b);
    if(seconds<=0||seconds>15||metres/seconds<=1||metres/seconds>65)return false;
    velocities.push(metres/seconds);path+=metres;
    const latitude=(a.lat+b.lat)*Math.PI/360;
    vectors.push({x:(b.lng-a.lng)*Math.cos(latitude),y:b.lat-a.lat});
   }
   if(Math.max(...velocities)>2*Math.min(...velocities)||distance(points[0],points.at(-1))<.85*path)return false;
   for(let i=1;i<vectors.length;i++){const a=vectors[i-1],b=vectors[i];if(a.x*b.x+a.y*b.y<.5*Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y))return false}
   return true;
  };
  const unknownMotionPoints=(point,noise,baselineMove)=>{
   if(!unknownMotion.length&&trustedObservation&&point.time-trustedObservation.time<=15000)unknownMotion.push({...trustedObservation});
   unknownMotion.push({...point});
   while(unknownMotion.length>64||point.time-unknownMotion[0].time>15000)unknownMotion.shift();
   const recent=consistentMotion(unknownMotion.slice(-5));
   // Establish movement only after it also clears the original uncertainty radius.
   if(!unknownMoving&&baselineMove&&recent&&distance(unknownMotion[0],point)>Math.max(noise,Math.min(100,unknownMotion[0].accuracy+point.accuracy)))unknownMoving=true;
   if(!unknownMoving)return null;
   // Inferred-only movement waits for two following fixes. A genuine zero never enters here.
   const eligible=baselineMove&&recent?unknownMotion:unknownMotion.slice(0,-2),confirmed=[];let cursor=accepted;
   for(const fix of eligible)if(fix.time>cursor.time&&distance(cursor,fix)>3){confirmed.push({...fix,breakBefore:false});cursor=fix}
   if(!recent){resetUnknownMotion();unknownMotion.push({...point})}
   return confirmed.length?confirmed:null;
  };
  return {interrupt(){resetUnknownMotion();interrupted=!!accepted;candidate=null;pending=null;pendingCount=0;smoothed=null;},observe(point,speed){let justAcquired=false;
   const valid=point&&Number.isFinite(point.lat)&&Math.abs(point.lat)<=90&&Number.isFinite(point.lng)&&Math.abs(point.lng)<=180&&Number.isFinite(point.accuracy)&&point.accuracy>=0&&Number.isFinite(point.time);
   if(!valid){resetUnknownMotion();acquisitionPrevious=null;previous=null;candidate=null;pending=null;pendingCount=0;smoothed=null;interrupted=!!accepted;return{ready:false,accept:false,speed:null};}
   if(initialAcquisition&&!ready){
    // Fresh precise fixes start immediately; otherwise confirm automatically.
    // No fixed timer, and sparse delivery does not perpetually reset acquisition.
    const age=now()-point.time;
    if(age>8000||age< -2000||point.accuracy>65)return{ready:false,accept:false,speed:null,reason:"acquiring"};
    const fast=point.accuracy<=8&&age<=3000;
    const dt=acquisitionPrevious?(point.time-acquisitionPrevious.time)/1000:0;
    if(acquisitionPrevious&&dt<=0)return{ready:false,accept:false,speed:null,reason:"acquiring"};
    const consistent=acquisitionPrevious&&dt>=.3&&coherent(acquisitionPrevious,point);
    acquisitionPrevious={...point};
    if(!fast&&!consistent)return{ready:false,accept:false,speed:null,reason:"acquiring"};
    ready=true;justAcquired=true;previous=null;candidate=null;smoothed=null;
   }
   if(initialAcquisition&&ready&&(now()-point.time>8000||point.time-now()>2000)){resetUnknownMotion();return{ready:true,accept:false,speed:null,reason:"stale"};}
   if((previous&&point.time<=previous.time)||(accepted&&point.time<=accepted.time)){resetUnknownMotion();return{ready,accept:false,speed:null,reason:"stale"};}
   // Reject unusable uncertainty, preserving ordinary urban tolerance.
   if(initialAcquisition&&point.accuracy>150){resetUnknownMotion();interrupted=!!accepted;candidate=null;smoothed=null;return{ready:false,accept:false,speed:null,reason:"accuracy"};}
   const last=previous;previous={...point};
   if(!interrupted&&((last&&point.time-last.time>15000)||(trustedObservation&&point.time-trustedObservation.time>15000))){resetUnknownMotion();interrupted=!!accepted;candidate=null;}
   // Existing tachometer measurement and smoothing stay separate from recording.
   let measured=null;
   if(!justAcquired&&point.accuracy<=35&&typeof speed==="number"&&Number.isFinite(speed)&&speed>=0&&speed<=65)measured=speed*3.6;
   else if(last&&point.accuracy<=25&&last.accuracy<=25){const dt=(point.time-last.time)/1000,d=distance(last,point),noise=Math.max(3,(last.accuracy+point.accuracy)/2);if(dt>=1&&dt<=10&&d/dt<=65)measured=d<=noise?0:d/dt*3.6;}
   if(!ready){ready=point.accuracy<=15||!!(candidate&&coherent(candidate,point));candidate={...point};if(!ready)return{ready:false,accept:false,speed:null};candidate=null;}
   let breakBefore=false,recoveredPoints=null;
   if(interrupted){
    resetUnknownMotion();
    const age=now()-point.time,elapsed=accepted?(point.time-accepted.time)/1000:0;
    // Precision alone cannot validate a physically impossible displaced fix.
    const plausible=accepted&&elapsed>0&&distance(accepted,point)<=65*elapsed+Math.min(100,accepted.accuracy+point.accuracy);
    const fast=point.accuracy<=8&&(!initialAcquisition||age<=3000)&&plausible;
    if(point.accuracy>65){candidate=null;return{ready:false,accept:false,speed:null,reason:"acquiring"};}
    const confirmed=candidate&&point.time-candidate.time<=15000&&coherent(candidate,point);
    if(!fast&&!confirmed){candidate={...point};return{ready:false,accept:false,speed:null,reason:"acquiring"};}
    // Retain the actual first buffered fix only after automatic confirmation.
    if(confirmed)recoveredPoints=[{...candidate,breakBefore:true},{...point,breakBefore:false}];
    breakBefore=true;interrupted=false;candidate=null;pending=null;pendingCount=0;smoothed=null;
   }else if(accepted){
    const dt=(point.time-accepted.time)/1000,d=distance(accepted,point),uncertainty=Math.min(100,accepted.accuracy+point.accuracy);
    if(d>65*dt+uncertainty||(trustedObservation&&!coherent(trustedObservation,point))){
     resetUnknownMotion();pendingCount=pending&&coherent(pending,point)?pendingCount+1:1;pending={...point};
     if(pendingCount<3)return{ready:true,accept:false,speed:null,reason:"pending"};
     // Sustained recovery from a displaced fix starts a separate segment.
     breakBefore=true;pending=null;pendingCount=0;
    }else{
     pending=null;pendingCount=0;
     const hasSpeed=typeof speed==="number"&&Number.isFinite(speed)&&speed>=0&&speed<=65;
     const moving=hasSpeed&&speed>1;
     const noise=moving?3:Math.max(3,Math.min(100,(accepted.accuracy+point.accuracy)/2));
     if(hasSpeed)resetUnknownMotion();
     else recoveredPoints=unknownMotionPoints(point,noise,d>noise);
     if(!recoveredPoints&&d<=noise){trustedObservation={...point};return{ready:true,accept:false,speed:0,reason:"stationary"};}
    }
   }
   if(breakBefore)resetUnknownMotion();
   const recordedPoint=recoveredPoints?.at(-1)||point;
   accepted={...recordedPoint};trustedObservation={...point};smoothed=measured===null?null:measured===0?0:smoothed===null?measured:.6*smoothed+.4*measured;
   return{ready:true,accept:true,breakBefore,point:{...recordedPoint,breakBefore},...(recoveredPoints?{points:recoveredPoints}:{}),speed:smoothed===null?null:Math.round(smoothed)};
  }};
 }
 return {create,distance};
});
