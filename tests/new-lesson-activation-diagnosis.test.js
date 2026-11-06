"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),source=app.split(/\r?\n/).find(line=>line.startsWith('function newLesson(){'));
const probe=app.slice(app.indexOf('// BEGIN NEW LESSON ACTIVATION DIAGNOSIS'),app.indexOf('// END NEW LESSON ACTIVATION DIAGNOSIS'));
test('uscite anticipate esplicite: percorso, permesso, identità iniziale e identità dopo il contesto',()=>{
 for(const reason of ['section','permission','first','second']){
  const codes=[],person={id:'synthetic',category:'guida-accompagnata',lessons:[]},before=JSON.stringify(person);let binds=0;
  const diagnostic={enter:()=>({}),phase:()=>{},blocked:code=>codes.push(code),exception:code=>{throw Error('Eccezione inattesa '+code)}};
  const c={window:{NewLessonOpeningDiagnosis:diagnostic,HomeSections:{requirePath:()=>reason!=='section'},AgendaAuth:{can:()=>reason!=='permission'}},student:()=>person,state:{},resetActivitySearch:()=>{},bindLessonStudent:()=>++binds!==(reason==='first'?1:reason==='second'?2:99),captureStudentPathContext:()=>({category:'guida-accompagnata'}),alert:()=>{}};
  vm.createContext(c);vm.runInContext(source,c);c.newLesson();assert.deepEqual(codes,[{section:'NL-SECTION',permission:'NL-PERMISSION',first:'NL-STUDENT',second:'NL-STUDENT-CONTEXT'}[reason]]);assert.equal(JSON.stringify(person),before);
 }
});
test('capture del gesto indipendente dal gestore: assente, no-op, click interrotto e sovrapposizione',async()=>{
 const {chromium}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{for(const scenario of ['absent','noop','stopped','overlay']){
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),p=await ctx.newPage();
  try{await p.route('**/*',r=>r.abort());await p.setContent('<style>.view{display:none}.active{display:block}body{background:#064858;color:white}button{width:260px;height:48px;margin:20px}</style><section id="student" class="view active"><button id="newLesson">NUOVA GUIDA</button></section><section id="lesson" class="view"></section>');
   await p.evaluate(()=>{window.lessonDraftReady=false;window.newLesson=function(){window.commandInvoked=(window.commandInvoked||0)+1;};window.commandInvoked=0;});await p.addScriptTag({content:probe});
   await p.evaluate(s=>{const b=document.getElementById('newLesson');if(s==='absent')b.onclick=null;else if(s==='noop')b.onclick=()=>{};else if(s==='stopped'){b.onclick=newLesson;b.addEventListener('click',e=>e.stopImmediatePropagation(),{capture:true});}else{b.onclick=newLesson;const r=b.getBoundingClientRect(),cover=document.createElement('div');cover.id='cover';Object.assign(cover.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',zIndex:'2'});document.body.append(cover);}NewLessonOpeningDiagnosis.ready();},scenario);
   if(scenario==='overlay')await p.locator('#cover').tap();else await p.locator('#newLesson').tap();
   await p.waitForFunction(()=>document.getElementById('newLessonOpeningDiagnosis').textContent.includes('NL-NO-HANDLER'));
   const text=await p.locator('#newLessonOpeningDiagnosis').textContent();assert.match(text,/tocco: sì/);assert.match(text,/click: sì/);assert.match(text,/funzione: non avviata/);assert.equal(await p.evaluate(()=>commandInvoked),0);if(scenario==='overlay')assert.match(text,/bersaglio diverso/);
  }finally{await ctx.close()}
 }}finally{await browser.close()}
});
test('nessun evento non viene presentato falsamente come tocco ricevuto',async()=>{
 const listeners={},button={disabled:false,onclick:null,after:()=>{}},node={setAttribute:()=>{}},document={getElementById:id=>id==='newLesson'?button:id==='newLessonOpeningDiagnosis'?node:null,createElement:()=>node,addEventListener:(name,fn)=>listeners[name]=fn};let timers=0;
 const c={window:{addEventListener:()=>{}},document,newLesson:()=>{},setTimeout:()=>{timers++;return 1},clearTimeout:()=>{},PointerEvent:function(){}};
 vm.createContext(c);vm.runInContext(probe,c);c.window.NewLessonOpeningDiagnosis.ready();assert.match(node.textContent,/NL-READY/);assert.doesNotMatch(node.textContent,/tocco: sì/);assert.equal(timers,0);assert.equal(typeof listeners.pointerdown,'function');
});
