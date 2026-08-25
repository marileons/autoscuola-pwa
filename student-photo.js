"use strict";
(()=>{
  let confirmedPhoto="",pendingPhoto="";
  const validPhoto=value=>typeof value==="string"&&/^data:image\/(?:jpeg|png|webp);base64,/i.test(value);
  const input=$("studentPhotoInput"),capture=$("captureStudentPhoto"),panel=$("studentPhotoPreviewPanel"),preview=$("studentPhotoPreview");

  function updateFormPhoto(){
    const shown=pendingPhoto||confirmedPhoto;
    capture.textContent=confirmedPhoto?"CAMBIA FOTO":"SCATTA FOTO";
    panel.classList.toggle("hidden",!pendingPhoto);
    if(shown)preview.src=shown;else preview.removeAttribute("src");
  }

  function compressPhoto(file){
    return new Promise((resolve,reject)=>{
      if(!file||!file.type.startsWith("image/")){reject(new Error("Seleziona un’immagine valida."));return}
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error("La foto non è leggibile."));
      reader.onload=()=>{
        const image=new Image();
        image.onerror=()=>reject(new Error("Il formato della foto non è supportato."));
        image.onload=()=>{
          const longest=Math.max(image.naturalWidth,image.naturalHeight),scale=Math.min(1,600/longest),width=Math.max(1,Math.round(image.naturalWidth*scale)),height=Math.max(1,Math.round(image.naturalHeight*scale)),canvas=document.createElement("canvas");
          canvas.width=width;canvas.height=height;
          const context=canvas.getContext("2d",{alpha:false});
          context.fillStyle="#ffffff";context.fillRect(0,0,width,height);context.drawImage(image,0,0,width,height);
          resolve(canvas.toDataURL("image/jpeg",.78));
        };
        image.src=String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  window.prepareStudentPhoto=value=>{confirmedPhoto=validPhoto(value)?value:"";pendingPhoto="";input.value="";updateFormPhoto()};
  window.studentPhotoValue=()=>confirmedPhoto;
  window.renderStudentProfilePhoto=current=>{
    const photo=validPhoto(current&&current.photo)?current.photo:"",image=$("studentPhoto"),placeholder=$("studentPhotoPlaceholder"),remove=$("removeStudentPhoto");
    image.classList.toggle("hidden",!photo);placeholder.classList.toggle("hidden",!!photo);remove.classList.toggle("hidden",!photo);
    if(photo)image.src=photo;else image.removeAttribute("src");
  };

  capture.addEventListener("click",()=>input.click());
  $("retakeStudentPhoto").addEventListener("click",()=>input.click());
  $("useStudentPhoto").addEventListener("click",()=>{if(!pendingPhoto)return;confirmedPhoto=pendingPhoto;pendingPhoto="";updateFormPhoto()});
  $("cancelStudentPhoto").addEventListener("click",()=>{pendingPhoto="";input.value="";updateFormPhoto()});
  input.addEventListener("change",async event=>{
    const file=event.target.files&&event.target.files[0];event.target.value="";if(!file)return;
    try{pendingPhoto=await compressPhoto(file);updateFormPhoto()}catch(error){alert(error.message||"Non è stato possibile preparare la foto.")}
  });
  $("changeStudentPhoto").addEventListener("click",()=>{editStudent();setTimeout(()=>input.click(),0)});
  $("removeStudentPhoto").addEventListener("click",()=>{
    const current=student();if(!current||!current.photo||!confirm("Rimuovere la foto dell’allievo?"))return;
    delete current.photo;save();openStudent(current.id);
  });
})();
