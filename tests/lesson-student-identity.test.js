"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("app.js","utf8"),html=fs.readFileSync("index.html","utf8");
function fixture(){
 const label={textContent:""},alerts=[],state={studentId:"one",lessonId:null,students:[{id:"one",firstName:"MARÌA",lastName:"D'ANGELO-TEST",lessons:[]},{id:"two",firstName:"MARÌA",lastName:"D'ANGELO-TEST DUE",archived:true,lessons:[{id:"old"}]}]};
 const ctx={window:{AgendaAuth:{can:()=>true}},state,$:()=>label,alert:msg=>alerts.push(msg),enteredName:(a,b)=>[a,b].join(" "),student:()=>state.students.find(x=>x.id===state.studentId),lesson:()=>ctx.student()?.lessons.find(x=>x.id===state.lessonId)};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf("let lessonStudentId="),source.indexOf("\n",source.indexOf("function validLessonStudent"))),ctx);
 return{ctx,state,label,alerts,run:code=>vm.runInContext(code,ctx)};
}
test("nome guida derivato dall’ID, omonimi e allievo archiviato",()=>{
 const f=fixture();assert.equal(f.run("bindLessonStudent()"),true);assert.equal(f.label.textContent,"ALLIEVO: MARÌA D'ANGELO-TEST");
 f.state.studentId="two";assert.equal(f.run("validLessonStudent()"),false);assert.equal(f.run("bindLessonStudent()"),true);assert.match(f.label.textContent,/DUE$/);
 f.state.lessonId="old";assert.equal(f.run("validLessonStudent()"),true);f.state.lessonId="missing";assert.equal(f.run("validLessonStudent()"),false);
});
test("identità inesistente blocca prima di scritture e operazioni GPS",async()=>{
 const f=fixture();f.run("bindLessonStudent()");f.state.studentId="missing";
 f.ctx.studentSaving=false;f.ctx.lessonDraftReady=true;f.ctx.stopGps=()=>assert.fail("nessuna operazione GPS");f.ctx.save=()=>assert.fail("nessuna scrittura");
 vm.runInContext(source.slice(source.indexOf("async function saveLesson()"),source.indexOf("async function deleteLesson",source.indexOf("async function saveLesson()"))),f.ctx);await f.run("saveLesson()");assert.match(f.alerts[0],/Allievo non disponibile o cambiato/);
 assert.equal(f.run("bindLessonStudent()"),false);
});
test("banner precede i campi, ID HTML univoci e navigazione gerarchica esplicita",()=>{
 assert.ok(html.indexOf('id="lessonTitle"')<html.indexOf('id="lessonStudentIdentity"'));assert.ok(html.indexOf('id="lessonStudentIdentity"')<html.indexOf('id="lessonDate"'));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);
 assert.match(source.match(/^function closeStudentMultiImport.*$/m)[0],/show\("generalStudentManagement"\)/);
 assert.match(source,/\[data-general-students-back\].*show\("generalStudentManagement"\)/);
});
