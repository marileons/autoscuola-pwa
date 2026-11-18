(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.LessonReminders=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const clone=x=>JSON.parse(JSON.stringify(x));
  function ids(value=[]){
    if(!Array.isArray(value)||value.some(x=>typeof x!=="string"||!x||x.length>180))throw Error("Stato del promemoria non valido.");
    return [...new Set(value)].sort();
  }
  function reminder(value){
    if(value==null)return null;
    if(typeof value.id!=="string"||!value.id||value.id.length>180||typeof value.text!=="string"||!value.text.trim()||value.text.length>4000)throw Error("Promemoria non valido o troppo lungo.");
    return {id:value.id,text:value.text};
  }
  function history(values=[]){
    if(!Array.isArray(values))throw Error("Storico dei promemoria non valido.");
    const entries=new Map();
    for(const value of values){const item=reminder(value);if(!item)throw Error("Storico del promemoria incompleto.");entries.set(item.id,item)}
    return [...entries.values()];
  }
  function readIds(students=[],previous=[]){
    return ids([...previous,...students.flatMap(s=>[...ids(s.reminderReadIds),...(s.lessons||[]).flatMap(l=>ids(l.reminderReadIds))])]);
  }
  function carry(students,previous=[],retained=[]){
    const result=clone(students),read=readIds([...previous,...result],retained);
    const oldLessons=new Map(previous.flatMap(s=>(s.lessons||[]).map(l=>[l.id,l])));
    for(const s of result){
      for(const lesson of s.lessons||[]){
        const saved=history([...(oldLessons.get(lesson.id)?.reminderHistory||[]),...(lesson.reminderHistory||[])]);
        if(saved.length)lesson.reminderHistory=saved;
      }
      const own=ids([...ids(s.reminderReadIds),...(s.lessons||[]).flatMap(l=>[...ids(l.reminderReadIds),...(l.nextLessonReminder&&read.includes(reminder(l.nextLessonReminder).id)?[l.nextLessonReminder.id]:[])])]);
      if(own.length)s.reminderReadIds=own;
    }
    return {students:result,read};
  }
  function pending(student){
    const read=new Set(readIds([student]));
    return (student.lessons||[]).map(l=>({lesson:l,reminder:reminder(l.nextLessonReminder)}))
      .filter(x=>x.reminder&&!read.has(x.reminder.id))
      .sort((a,b)=>(a.lesson.createdAt||0)-(b.lesson.createdAt||0)||a.reminder.id.localeCompare(b.reminder.id));
  }
  function edit(previous,text,uuid){
    text=String(text).trim();
    if(text.length>4000)throw Error("Il promemoria può contenere al massimo 4.000 caratteri.");
    if(!text)return null;
    const old=reminder(previous);
    return {id:old?.text===text?old.id:uuid(),text};
  }
  function markRead(student,id){
    if(!pending(student).some(x=>x.reminder.id===id))throw Error("Il promemoria è cambiato. Riapri la guida.");
    const next=clone(student);
    next.reminderReadIds=ids([...readIds([student]),id]);
    // Receipts travel with every lesson, including transfers of a single lesson.
    for(const lesson of next.lessons||[]){
      lesson.reminderReadIds=ids([...ids(lesson.reminderReadIds),id]);

    }
    return next;
  }
  return {ids,reminder,history,readIds,carry,pending,edit,markRead};
});
