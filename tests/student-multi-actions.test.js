"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),api=require("../student-multi-actions.js");
const students=()=>[
  {id:"a",firstName:"Primo",archived:false,category:"auto",lessons:[1],payments:[1]},
  {id:"b",firstName:"Centro",archived:false,category:"moto",lessons:[2]},
  {id:"c",firstName:"Ultimo",archived:true,category:"auto",lessons:[3]}
];
test("elimina esclusivamente un allievo selezionato",()=>{const input=students(),out=api.apply(input,["b"],"delete");assert.deepEqual(out.students.map(x=>x.id),["a","c"]);assert.deepEqual(out.students[0],input[0]);assert.equal(out.students[1].archived,true)});
test("eliminazione multipla lascia invariato il non selezionato",()=>{const input=students(),untouched=structuredClone(input[1]),out=api.apply(input,["a","c"],"delete");assert.deepEqual(out.students,[untouched]);assert.equal(out.students[0].archived,false)});
test("elimina primo centrale ultimo e tutti senza dipendere dagli indici",()=>{for(const id of ["a","b","c"]){const out=api.apply(students(),[id],"delete");assert.equal(out.students.some(x=>x.id===id),false)}assert.deepEqual(api.apply(students(),["a","b","c"],"delete").students,[])});
test("nessuna selezione, ID inesistente o duplicato sono rifiutati senza mutazioni",()=>{for(const ids of [[],["x"],["a","a"]]){const input=students(),before=structuredClone(input);assert.throws(()=>api.apply(input,ids,"delete"));assert.deepEqual(input,before)}});
test("archiviazione modifica soltanto gli ID selezionati",()=>{const input=students(),out=api.apply(input,["a"],"archive");assert.equal(out.students[0].archived,true);assert.strictEqual(out.students[1],input[1]);assert.strictEqual(out.students[2],input[2])});
test("il risultato serializzato e ricaricato non archivia allievi estranei",()=>{const out=api.apply(students(),["a","c"],"delete");const restored=JSON.parse(JSON.stringify(out.students));assert.deepEqual(restored.map(x=>[x.id,x.archived]),[["b",false]])});
