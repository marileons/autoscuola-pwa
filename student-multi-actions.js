(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.StudentMultiActions=api})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
function stableId(value){return String(value??"").trim()}
function prepareIds(selectedIds){
  if(!Array.isArray(selectedIds))throw new TypeError("Selezione allievi non valida.");
  const ids=selectedIds.map(stableId);
  if(ids.some(id=>!id))throw new Error("La selezione contiene un ID non valido.");
  if(new Set(ids).size!==ids.length)throw new Error("La selezione contiene ID duplicati.");
  return new Set(ids);
}
function apply(students,selectedIds,action){
  if(!Array.isArray(students))throw new TypeError("Archivio allievi non valido.");
  if(!["archive","delete"].includes(action))throw new TypeError("Operazione allievi non valida.");
  const ids=prepareIds(selectedIds);
  if(!ids.size)throw new Error("Seleziona almeno un allievo.");
  const existing=new Set(students.map(student=>stableId(student?.id)));
  const missing=[...ids].filter(id=>!existing.has(id));
  if(missing.length)throw new Error("La selezione contiene un allievo non più disponibile.");
  const result=action==="delete"
    ?students.filter(student=>!ids.has(stableId(student.id)))
    :students.map(student=>ids.has(stableId(student.id))?{...student,archived:true}:student);
  return {students:result,affected:ids.size,selectedIds:[...ids]};
}
return Object.freeze({apply,prepareIds});
});
