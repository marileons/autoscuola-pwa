"use strict";
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.LessonGps=api;})(typeof window!=="undefined"?window:globalThis,function(){
 function distance(a,b){const r=Math.PI/180,x=(b.lat-a.lat)*r,y=(b.lng-a.lng)*r,h=Math.sin(x/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(y/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
 function create(){let candidate=null,previous=null,smoothed=null,ready=false;
  return {observe(point,speed){
   const valid=Number.isFinite(point.lat)&&Math.abs(point.lat)<=90&&Number.isFinite(point.lng)&&Math.abs(point.lng)<=180&&Number.isFinite(point.accuracy)&&point.accuracy>=0&&point.accuracy<=40&&Number.isFinite(point.time);
   if(!valid){previous=null;candidate=null;smoothed=null;return {ready:false,speed:null};}
   if(!ready){const dt=candidate?(point.time-candidate.time)/1000:0;ready=point.accuracy<=15||!!(candidate&&dt>=1&&dt<=10&&distance(candidate,point)/dt<45);candidate=point;}
   let measured=null;
   if(point.accuracy<=35&&typeof speed==="number"&&Number.isFinite(speed)&&speed>=0&&speed<=65)measured=speed*3.6;
   else if(previous&&point.accuracy<=25&&previous.accuracy<=25){const dt=(point.time-previous.time)/1000,d=distance(previous,point),noise=Math.max(3,(previous.accuracy+point.accuracy)/2);if(dt>=1&&dt<=10&&d/dt<=65)measured=d<=noise?0:d/dt*3.6;}
   if(previous&&point.time<=previous.time)return {ready:false,speed:null};
   previous={...point};smoothed=measured===null?null:measured===0?0:smoothed===null?measured:.6*smoothed+.4*measured;
   return {ready,speed:smoothed===null?null:Math.round(smoothed)};
  }};
 }
 return {create,distance};
});
