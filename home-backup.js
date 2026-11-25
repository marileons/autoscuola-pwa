/* Home shortcut to the existing manual full-backup flow. No microphone access. */
(()=>{
"use strict";
window.BackupVoice?.viewChanged?.("manual-backup-transition");
document.getElementById("prepareBackupVoice")?.remove();document.getElementById("prepareBackupVoiceStatus")?.remove();
const $=id=>document.getElementById(id),user=()=>window.AgendaAuth?.currentUser?.();
const allowed=()=>["ADMIN","ISTRUTTORE"].includes(user()?.role)&&!user()?.mustChangePassword&&window.AgendaAuth?.can?.("operate");
function status(text){const note=$("homeFullBackupStatus");if(note)note.textContent=text}
function prepare(){
 if(!allowed()||!$("home")?.classList.contains("active"))return;
 try{
  for(const target of ["openSettings","exportFullBackup"]){
   const button=$(target);
   if(!button||button.disabled||button.hidden||button.classList.contains("hidden"))throw Error("Backup non disponibile in questo momento. Riprova da Impostazioni.");
   button.click();
  }
 }catch(error){status(error.message||"Impossibile preparare il backup. Riprova da Impostazioni.")}
}
function sync(){const button=$("homeFullBackup");if(button)button.hidden=!allowed()}
function mount(){
 if($("homeFullBackup")){sync();return}
 const intro=$("home")?.querySelector(".home-guide-intro");if(!intro)return;
 const button=document.createElement("button");button.type="button";button.id="homeFullBackup";
 button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16v13H4zM3 3h18v5H3zM9 12h6"/></svg><span>BACKUP COMPLETO</span>';
 button.onclick=prepare;button.setAttribute("aria-describedby","homeFullBackupStatus");intro.append(button);
 const note=document.createElement("p");note.id="homeFullBackupStatus";note.setAttribute("role","status");intro.after(note);sync();
}
window.HomeBackup={mount,sync};
})();
