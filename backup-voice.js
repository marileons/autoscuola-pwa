/* Compatibility URL for older app loaders. Manual backup only; no speech API. */
(()=>{
"use strict";
const old=window.BackupVoice;old?.viewChanged?.("manual-backup-transition");
let loading=null;
function mount(){
 document.getElementById("prepareBackupVoice")?.remove();document.getElementById("prepareBackupVoiceStatus")?.remove();
 if(window.HomeBackup){window.HomeBackup.mount();return}
 if(loading)return loading;
 loading=new Promise(resolve=>{const script=document.createElement("script");script.src="home-backup.js?v=2-compatible";script.onload=()=>{window.HomeBackup?.mount();resolve()};script.onerror=()=>{loading=null;resolve()};document.body.append(script)});
 return loading;
}
window.BackupVoice={mount,sync(){window.HomeBackup?.sync()},viewChanged(){}};
})();
