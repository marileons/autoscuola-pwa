"use strict";
// Modern synthetic exam payloads; historical read compatibility is tested separately.
function typedExam(body){if(body.exam_type)return body;const instructors=body.instructors||[],vehicles=body.vehicles||[],moto=(body.participants||[]).some(p=>p.motorcycle_code_id)||vehicles.length>0&&vehicles.length<instructors.length,selected=moto?vehicles:vehicles.slice(-instructors.length);return {...body,exam_type:moto?'MOTO':'AUTO',vehicles:selected,instructor_vehicles:instructors.slice(0,selected.length).map((id,i)=>({instructor_id:id,vehicle_id:selected[i]})),participants:(body.participants||[]).map(p=>({...p,...(moto&&!p.motorcycle_code_id?{motorcycle_code_id:'moto-code-sh'}:{})}))};}
function modernExamCalls(f){const call=f.call;f.call=(user,route,body,options)=>call(user,route,body?.event_type==='ESAME'?typedExam(body):body,options);return f;}
module.exports={typedExam,modernExamCalls};
