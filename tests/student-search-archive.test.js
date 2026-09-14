"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("app.js","utf8");
const names=["compactPersonPart","normalizedPersonPart","studentSearchText","studentsForCategorySearch"];
const code=names.map(name=>source.split(/\r?\n/).find(line=>line.startsWith(`function ${name}(`))||"").join("\n");
const context={};vm.runInNewContext(`${code};globalThis.api={normalizedPersonPart,studentSearchText,studentsForCategorySearch}`,context);const api=context.api;
const student=(id,first,last,archived=false,category="auto")=>({id,firstName:first,lastName:last,archived,category,phone:"",license:""});
const find=(items,query)=>items.filter(item=>api.studentSearchText(item).includes(api.normalizedPersonPart(query)));

test("ricerca trova allievi attivi archiviati e combinati",()=>{const active=student("a","Anna","Rossi"),archived=student("b","Luca","Bianchi",true),items=[active,archived];assert.deepEqual(find(api.studentsForCategorySearch(items,"auto",true),"rossi").map(x=>x.id),["a"]);assert.deepEqual(find(api.studentsForCategorySearch(items,"auto",true),"luca").map(x=>x.id),["b"]);assert.deepEqual(find(api.studentsForCategorySearch(items,"auto",true),"").map(x=>x.id),["a","b"]);assert.deepEqual(api.studentsForCategorySearch(items,"auto",false).map(x=>x.id),["a"])});
test("nome completo funziona in entrambi gli ordini e normalizza accenti e spazi",()=>{const item=student("a","Élia-Maria","D’Angelo");for(const query of ["Élia-Maria D’Angelo","elia-maria d’angelo","D’Angelo   Élia-Maria"])assert.deepEqual(find([item],query).map(x=>x.id),["a"])});
test("apostrofi trattini e maiuscole restano ricercabili",()=>{const items=[student("a","Anna-Lisa","D'Amico"),student("b","Marco","De André")];assert.deepEqual(find(items,"D'AMICO").map(x=>x.id),["a"]);assert.deepEqual(find(items,"de andre").map(x=>x.id),["b"])});
test("categorie differenti e zero risultati restano esclusi",()=>{const items=[student("a","Anna","Rossi",true,"auto"),student("b","Anna","Rossi",true,"moto")],auto=api.studentsForCategorySearch(items,"auto",true);assert.deepEqual(auto.map(x=>x.id),["a"]);assert.deepEqual(find(auto,"inesistente"),[])});
test("ID duplicato produce una sola riga conservando il primo record persistito",()=>{const first=student("same","Anna","Rossi",true),duplicate=student("same","Anna","Rossi",false);const result=api.studentsForCategorySearch([first,duplicate],"auto",true);assert.equal(result.length,1);assert.equal(result[0].archived,true)});
