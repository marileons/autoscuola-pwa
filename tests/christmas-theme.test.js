const test=require("node:test"),assert=require("node:assert/strict"),T=require("../christmas-theme.js");
test("Automatico: inclusione 8 dicembre e 6 gennaio, ogni anno in Europe/Rome",()=>{
 for(const year of [2026,2027,2028]){
 assert.equal(T.isSeason(year+"-12-07T22:59:59.000Z"),false);
 assert.equal(T.isSeason(year+"-12-07T23:00:00.000Z"),true);
 assert.equal(T.isSeason((year+1)+"-01-06T22:59:59.000Z"),true);
 assert.equal(T.isSeason((year+1)+"-01-06T23:00:00.000Z"),false);
 }
});
test("Tre modalità e convenzione Roma indipendente dal fuso del dispositivo",()=>{
 for(const timezone of ["UTC","Pacific/Honolulu","Asia/Tokyo"]){process.env.TZ=timezone;assert.equal(T.isActive("auto",Date.parse("2026-12-07T23:15:00Z")),true);assert.equal(T.isActive("on",Date.parse("2026-07-01T12:00:00Z")),true);assert.equal(T.isActive("off",Date.parse("2026-12-25T12:00:00Z")),false)}
});
test("Risveglio alla mezzanotte di Roma, compresa ora legale e solare",()=>{
 for(const [start,hours]of [["2026-03-28T23:00:00Z",23],["2026-10-24T22:00:00Z",25],["2026-12-07T23:00:00Z",24]]){const n=Date.parse(start),delay=T.nextDayDelay(n);assert.ok(Math.abs(delay-hours*3600000)<100);assert.notEqual(T.day(n+delay),T.day(n))}
});

test("Solo le nuove decorazioni sono pubbliche; una risorsa applicativa resta protetta",async()=>{
 const worker=(await import("../worker.js")).default;
 const env={ASSETS:{fetch:async()=>new Response("decorazione locale")},DB:{prepare(){throw Error("Il test non deve interrogare un database")}}};
 for(const asset of ["christmas-theme.js","assets/christmas-hat.svg","assets/christmas-road-tree.svg","assets/christmas-branch.svg","assets/christmas-home.svg"]){
 const response=await worker.fetch(new Request("https://local.invalid/"+asset),env);assert.equal(response.status,200);
 }
 const protectedResponse=await worker.fetch(new Request("https://local.invalid/app.js"),env);assert.equal(protectedResponse.status,401);
});
