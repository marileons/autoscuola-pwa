"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const summary=require('../lesson-summary.js'),pdf=require('../assets/vendor/pdf-lib-1.17.1.min.js');
test('diciture CHECK LIST: sole sottovoci della guida, niente cumulo e storico esplicito in anteprima e PDF',async()=>{
 const student={category:'auto'},stamp=Date.parse('2026-10-30T09:00:00Z'),principal={label:'ILLUSTRAZIONE CHECK LIST COMPLETA',activityKey:'auto:checklist',status:'good'};
 const cases=[
  [{createdAt:stamp,lessonActivities:[{...principal,checklistDetails:{tyres:'good',brakes:'orange',lights:'none'}}],activitySnapshot:[{...principal,checklistDetails:{lights:'good',levels:'good'}}]},'CHECK LIST — VOCI SVOLTE: PNEUMATICI, FRENI'],
  [{createdAt:stamp,lessonActivities:[principal]},'CHECK LIST — DETTAGLI NON DISPONIBILI'],
  [{createdAt:stamp,checklist:[{label:principal.label,status:'good'}]},'CHECK LIST — DETTAGLI NON DISPONIBILI'],
  [{createdAt:stamp,lessonActivities:[{...principal,checklistDetails:{tyres:'none',brakes:'none'}}]},'CHECK LIST — NESSUNA SOTTOVOCE SVOLTA NELLA GUIDA']
 ];
 const fonts=await summary.fontsFor(pdf);
 for(const [lesson,expected]of cases){const before=JSON.stringify(lesson),copy=summary.snapshot(lesson),model=summary.buildModel(student,copy,summary.defaults(student,copy),{auto:'AUTO'});assert.deepEqual(model.activities,[expected]);const plan=summary.layout(model,fonts);assert.ok(plan.pages.flat().some(atom=>atom.text===expected));const bytes=await summary.makePdf(plan,pdf);const result=spawnSync('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['-c',"import sys,io,json;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()));print(json.dumps(' '.join(p.extract_text() for p in r.pages),ensure_ascii=True))"],{input:Buffer.from(bytes)});assert.equal(result.status,0,result.stderr.toString());assert.ok(JSON.parse(result.stdout.toString()).includes(expected));assert.equal(JSON.stringify(lesson),before);}
 const modern={createdAt:stamp,lessonActivities:[],activitySnapshot:[principal]};assert.deepEqual(summary.buildModel(student,summary.snapshot(modern),summary.defaults(student,modern),{auto:'AUTO'}).activities,[]);
});
