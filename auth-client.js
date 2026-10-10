"use strict";
(() => {
  let currentUser = null;
  let onShowApp = null;
  let onShowLogin = null;
  let checkTimer = null;
  let applicationLoaded = false;
  let applicationLoading = null;
  let sessionChecking=false,sessionRetry=null,sessionFailures=0,authEpoch=0;
  const loadedScripts=new Set();
  const diagnosticEvents=[];
  const diagnosticCodes=new Set(["network_unavailable","session_denied","session_resumed","backup_collect","backup_encode","backup_ready","backup_failed","share_cancelled","share_unsupported","share_failed","share_completed","download_requested","draft_recovered"]);
  function recordEvent(code){if(!diagnosticCodes.has(code))return;diagnosticEvents.push({code,at:Date.now()});if(diagnosticEvents.length>24)diagnosticEvents.shift();}
  function connectionNotice(text="Connessione temporaneamente assente"){
    let box=document.getElementById("connectionNotice");
    if(!box){box=document.createElement("aside");box.id="connectionNotice";box.className="card";box.setAttribute("role","status");document.body.prepend(box);}
    box.replaceChildren(document.createTextNode(text+" "));
    const retry=document.createElement("button");retry.type="button";retry.textContent="RIPROVA";
    retry.onclick=async()=>{if(await checkSession(!currentUser)){if(!applicationLoaded)await routeAfterAuthentication()}};box.append(retry);
  }
  let reservedUnlocked = false;
  let reservedTimer = null;
  let presenceTimer=null,presenceBusy=false,presenceLast=0,presenceAccount=null,presencePeers=[];
  const dismissedPresence=new Set();
  function dismissPresence(){for(const id of presencePeers)dismissedPresence.add(id);document.getElementById("adminPresenceNotice")?.remove();}
  async function checkAdminPresence(){
    if(presenceBusy||document.hidden||currentUser?.role!=="ADMIN"||currentUser.mustChangePassword||Date.now()-presenceLast<90000)return;
    presenceBusy=true;presenceLast=Date.now();const identity=currentUser.id;
    try{
      let installation=localStorage.getItem("agenda-installation-id");
      if(!installation){installation=crypto.randomUUID();localStorage.setItem("agenda-installation-id",installation);}
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(installation));
      const deviceHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
      const response=await api("/api/auth/presence",{method:"POST",body:JSON.stringify({deviceHash})});
      if(currentUser?.id!==identity||currentUser.role!=="ADMIN"||document.hidden)return;
      presencePeers=(response.peers||[]).filter(id=>typeof id==="string"&&/^[a-f0-9]{64}$/.test(id));
      if(!presencePeers.some(id=>!dismissedPresence.has(id))){document.getElementById("adminPresenceNotice")?.remove();return;}
      document.getElementById("adminPresenceNotice")?.remove();
      const box=document.createElement("aside"),text=document.createElement("span"),close=document.createElement("button");
      box.id="adminPresenceNotice";box.setAttribute("role","status");box.className="card";
      text.textContent="Account amministratore attivo anche su un altro dispositivo.";
      close.type="button";close.textContent="×";close.setAttribute("aria-label","Chiudi avviso");close.onclick=dismissPresence;
      box.append(text,close);document.getElementById("appShell")?.prepend(box);
    }catch{}finally{presenceBusy=false;}
  }
  function syncAdminPresence(){
    if(presenceAccount!==currentUser?.id){presenceAccount=currentUser?.id;presenceLast=0;presencePeers=[];dismissedPresence.clear();dismissPresence();}
    clearInterval(presenceTimer);presenceTimer=null;
    if(currentUser?.role!=="ADMIN"||document.hidden){document.getElementById("adminPresenceNotice")?.remove();return;}
    void checkAdminPresence();presenceTimer=setInterval(checkAdminPresence,120000);
  }

  async function lockReservedArea() {
    reservedUnlocked = false;
    clearTimeout(reservedTimer);
    removeAuditPanel();
    document.getElementById("userList")?.replaceChildren();
    document.getElementById("createUserForm")?.classList.add("hidden");
    document.getElementById("createSecretary")?.remove();
    document.getElementById("reservedAreaDialog")?.remove();
    if (currentUser?.capabilities?.manageUsers) configureUserManagementForm();
    try { await api("/api/reserved-area/lock", { method: "POST", body: "{}" }); } catch {}
  }

  async function enterReservedArea() {
    if (!currentUser?.capabilities?.manageUsers) return false;
    const identity = currentUser.id;
    const status = await api("/api/reserved-area/status", { method: "GET" });
    if (currentUser?.id !== identity) return false;
    if (status.unlocked && Number.isFinite(Date.parse(status.expiresAt)) && Date.parse(status.expiresAt) > Date.now()) {
      reservedUnlocked = true; clearTimeout(reservedTimer);
      reservedTimer = setTimeout(() => { void lockReservedArea(); message("Area riservata bloccata: inserisci nuovamente il PIN.", true); }, Date.parse(status.expiresAt) - Date.now());
      return true;
    }
    reservedUnlocked = false; removeAuditPanel();
    document.getElementById("reservedAreaDialog")?.remove();
    return new Promise(resolve => {
      const dialog = document.createElement("dialog"); dialog.id = "reservedAreaDialog";
      dialog.setAttribute("aria-label", "PIN personale Area riservata");
      const form = document.createElement("form"), title = document.createElement("h2"), notice = document.createElement("p"), error = document.createElement("p");
      title.textContent = status.configured ? "Sblocca Area riservata" : "Configura PIN Area riservata";
      notice.textContent = "PIN personale di quattro cifre, distinto dal Registro ore e compensi. Sblocco valido per 15 minuti.";
      error.setAttribute("role", "alert");
      const inputs = {};
      function field(key, label, pin) {
        const wrap = document.createElement("label"), input = document.createElement("input");
        wrap.textContent = label; input.type = "password"; input.required = true; input.autocomplete = "off";
        input.style.fontSize = "16px"; input.style.maxWidth = "100%";
        if (pin) { input.inputMode = "numeric"; input.pattern = "[0-9]{4}"; input.maxLength = 4; }
        inputs[key] = input; wrap.append(input); form.append(wrap);
      }
      form.append(title, notice); field("pin", "PIN", true);
      if (!status.configured) { field("confirmPin", "Conferma PIN", true); field("operatorPassword", "Password account", false); }
      const submit = action(status.configured ? "SBLOCCA" : "CONFIGURA E SBLOCCA", () => {}); submit.type = "submit";
      let cancelled = false;
      const finish = value => { if (!value) { cancelled = true; void lockReservedArea(); } form.reset(); dialog.close(); dialog.remove(); resolve(value); };
      form.append(error, submit, action("ANNULLA", () => finish(false)));
      if (status.configured) form.append(action("RIPRISTINA PIN", async () => {
        const operatorPassword = prompt("Conferma la password account per azzerare il PIN dell’Area riservata");
        if (operatorPassword === null) return;
        try { await api("/api/reserved-area/reset", { method: "POST", body: JSON.stringify({ operatorPassword }) }); finish(false); alert("PIN azzerato. Riapri l’Area riservata per configurarlo."); } catch (e) { error.textContent = e.message; }
      }));
      dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); });
      let busy = false;
      form.addEventListener("submit", async event => {
        event.preventDefault(); if (busy) return; busy = true; submit.disabled = true;
        try {
          const values = Object.fromEntries(Object.entries(inputs).map(([key,input]) => [key,input.value]));
          if (!status.configured) { await api("/api/reserved-area/configure", { method: "POST", body: JSON.stringify(values) }); status.configured = true; }
          if (cancelled) return;
          const data = await api("/api/reserved-area/unlock", { method: "POST", body: JSON.stringify({ pin: values.pin }) });
          if (cancelled) { await lockReservedArea(); return; }
          if (currentUser?.id !== identity) { finish(false); return; }
          reservedUnlocked = true; clearTimeout(reservedTimer);
          reservedTimer = setTimeout(() => { void lockReservedArea(); message("Area riservata bloccata: inserisci nuovamente il PIN.", true); }, Math.max(0, Date.parse(data.expiresAt) - Date.now()));
          finish(true);
        } catch (e) { error.textContent = e.message; } finally { busy = false; submit.disabled = false; }
      });
      dialog.append(form); document.body.append(dialog); dialog.showModal(); inputs.pin.focus();
    });
  }

  async function lockRegisterVault() {
    window.RegisterUI?.handleVaultLock?.();
    if (window.RegisterLocalVault) await window.RegisterLocalVault.lock();
  }

  async function activateRegisterVault() {
    if (!currentUser?.id || !["ADMIN", "ISTRUTTORE"].includes(currentUser.role) || !window.RegisterLocalVault) return;
    await window.RegisterLocalVault.activate(currentUser.id);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) }
    });
    let body = {};
    let validJson=false;
    try { body = await response.json();validJson=!!body&&typeof body==="object"; } catch {}
    if (!response.ok) {
      const error = new Error(body.error || "Operazione non riuscita.");
      error.status = response.status;
      error.authDenied=validJson&&typeof body.error==="string"&&(response.status===401||response.status===403);
      throw error;
    }
    return body;
  }

  function applyUser(user) {
    const previousId = currentUser?.id || null;
    const nextId = user?.id || null;
    if (previousId && previousId !== nextId) {
      reservedUnlocked = false; clearTimeout(reservedTimer); document.getElementById("reservedAreaDialog")?.remove();
      void lockRegisterVault();
      window.ExaminerRoutesUI?.stopAll?.();
    }
    if(previousId!==nextId)authEpoch++;
    currentUser = user;
    if(!user?.sharedCalendarEnabled || previousId!==nextId)window.SharedCalendar?.dispose?.();
    syncAdminPresence();
    document.body.classList.toggle("secretary-session",user?.role==="SEGRETERIA");
    syncAuditPanel();
    const adminButton = document.getElementById("openUserManagement");
    if (adminButton) adminButton.classList.toggle("hidden", !user?.capabilities?.manageUsers);
    updateHomeUser();
    updateAccountSummary();
  }

  function updateHomeUser() {
    const box = document.getElementById("homeAuthenticatedUser");
    const displayName = String(currentUser?.name || "").trim();
    if (!box) return;
    box.textContent = displayName ? `Utente: ${displayName}` : "";
    box.classList.toggle("hidden", !displayName);
  }

  function loseAccess(message) {
    document.getElementById("connectionNotice")?.remove();
    clearTimeout(sessionRetry);sessionRetry=null;
    // The app snapshots the lesson with its still-valid account ID first.
    if (onShowLogin) onShowLogin(); else showPublicLogin();
    applyUser(null);
    const error = document.getElementById("loginError");
    if (error && message) { error.textContent = message; error.classList.remove("hidden"); }
  }

  async function checkSession(initial = false) {
    if(sessionChecking)return false;
    sessionChecking=true;
    const epoch=authEpoch,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try {
      const data = await api("/api/auth/me", { method: "GET",signal:controller.signal });
      if(epoch!==authEpoch)return false;
      if(!data?.user?.id||!data.user.role)throw new Error("Risposta di sessione non valida");
      applyUser(data.user);
      if(sessionFailures)recordEvent("session_resumed");
      sessionFailures=0;clearTimeout(sessionRetry);sessionRetry=null;
      document.getElementById("connectionNotice")?.remove();
      return true;
    } catch (error) {
      if(epoch!==authEpoch)return false;
      if (error.authDenied) {recordEvent("session_denied");loseAccess("La sessione è scaduta o l’accesso è stato revocato.");}
      else {
        recordEvent("network_unavailable");
        connectionNotice();
        clearTimeout(sessionRetry);
        if(sessionFailures<3){const delay=[1000,3000,10000][sessionFailures++];sessionRetry=setTimeout(async()=>{if(await checkSession(initial)){if(!applicationLoaded)await routeAfterAuthentication()}},delay);}
      }
      return false;
    }finally{clearTimeout(timeout);sessionChecking=false;}
  }

  function showPublicLogin() {
    document.getElementById("appShell")?.classList.add("hidden");
    document.getElementById("loginScreen")?.classList.remove("hidden");
  }

  function loadScript(src) {
    if(loadedScripts.has(src))return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src; script.onload = ()=>{loadedScripts.add(src);resolve()}; script.onerror = () => {script.remove();reject(new Error("Caricamento temporaneamente non disponibile"))};
      document.body.appendChild(script);
    });
  }

  async function loadApplication() {
    if (currentUser?.role === "USER_MANAGER") return showManagerShell();
    if (applicationLoaded) { await activateRegisterVault(); onShowApp?.(); return; }
    if (applicationLoading) return applicationLoading;
    applicationLoading = (async () => {
      await loadScript("student-license.js?v=1.21-license-v1");
      await loadScript("student-license-store.js?v=1.21-license-store-v1");
      await loadScript("student-archive-store.js?v=1.21-student-archive-v1");
      await loadScript("lesson-drafts.js?v=1.21-lesson-drafts-v1");
      await loadScript("lesson-activities.js?v=1.21-activities-v1");
      if(currentUser?.role!=="SEGRETERIA")await loadScript("lesson-gps.js?v=1.21-gps-v1");
      await loadScript("student-report-print.js?v=1.21-student-report-print-v1");
      for (const src of ["https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", "register-economic-engine.js?v=1.21-register-v2", "register-local-vault.js?v=1.21-register-v1", "register-ledger.js?v=1.21-register-v2", "register-report.js?v=1.21-register-report-v3", "register-backup.js?v=1.21-register-backup-v2", "register-deletion.js?v=1.21-register-deletion-v1", "register-ui.js?v=1.21-register-ui-v6", "driving-errors.js?v=1.21-driving-errors-v2", "student-multi-actions.js?v=1.21-student-actions-v1", "examiner-routes.js?v=1.21-exam-routes-v1", "exams.js?v=1.21-exams-v2", "app.js?v=1.21-exams-v2", "examiner-routes-ui.js?v=1.21-exam-routes-v1", "student-photo.js?v=1.21-photo-v1", "documents.js?v=1.21", "full-backup-stream.js?v=1.21-full-backup-stream-v2", "full-backup.js?v=1.21-exams-v2", "r10-features.js?v=1.21-student-report-print-v1"]) { if(currentUser?.role==="SEGRETERIA" && !["driving-errors.js","student-multi-actions.js","exams.js","app.js","documents.js","r10-features.js"].includes(src.split("?")[0]))continue; await loadScript(src); }
      if (window.AgendaAppReady) await window.AgendaAppReady;
      applicationLoaded = true;
      await activateRegisterVault();
      onShowApp?.();
    })();
    try { await applicationLoading; } catch { applicationLoading = null; connectionNotice(window.AgendaArchiveFailureMessage || "Caricamento temporaneamente non disponibile. Riprova."); }
  }
  async function routeAfterAuthentication() {
    if (currentUser?.mustChangePassword) { showPasswordChangeOnly(); return; }
    if (currentUser?.role === "USER_MANAGER") { showManagerShell(); await openUsers(); return; }
    await loadApplication();
    if(currentUser?.sharedCalendarEnabled===true && applicationLoaded){
      try {
        await loadScript("shared-calendar-store.js?v=1");
        await loadScript("shared-calendar.js?v=1");
        window.SharedCalendar.mount(currentUser);
      } catch {
        window.SharedCalendar?.dispose?.();
        connectionNotice("Agenda condivisa temporaneamente non disponibile. Le altre funzioni restano utilizzabili.");
      }
    }
  }
  function showManagerShell() {
    syncAuditPanel();
    document.getElementById("loginScreen")?.classList.add("hidden");
    document.getElementById("appShell")?.classList.remove("hidden");
    document.querySelectorAll("#appShell .view").forEach(view => view.classList.remove("active"));
    document.getElementById("userManagement")?.classList.add("active");
    document.getElementById("managerOnlyNotice")?.classList.remove("hidden");
    document.getElementById("managerLogout")?.classList.remove("hidden");
    document.getElementById("backUserManagement")?.closest(".other-functions-subnav")?.classList.add("hidden");
    configureUserManagementForm();
  }
  function showPasswordChangeOnly() {
    document.getElementById("loginScreen")?.classList.add("hidden");
    document.getElementById("appShell")?.classList.remove("hidden");
    document.querySelectorAll("#appShell .view").forEach(view => view.classList.remove("active"));
    const current = document.getElementById("ownCurrentPassword"); current.required = false; current.closest("label").classList.add("hidden");
    document.getElementById("ownPasswordTitle").textContent = "Scegli una nuova password personale";
    openOwnPassword();
  }

  function applicationReady(showApp, showLogin) {
    onShowApp = showApp;
    onShowLogin = showLogin;
    bindAdminUi();
  }

  async function login(event) {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector("button[type=submit]"), errorBox = document.getElementById("loginError");
    errorBox.classList.add("hidden"); button.disabled = true; button.textContent = "Accesso…";
    try {
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: document.getElementById("loginUsername").value, password: document.getElementById("loginPassword").value }) });
      applyUser(data.user); form.reset(); await routeAfterAuthentication();
    } catch (error) {
      errorBox.textContent = error.status === 401 ? error.message : "Connessione non disponibile. Riprova.";
      errorBox.classList.remove("hidden"); document.getElementById("loginPassword").select();
    } finally { button.disabled = false; button.textContent = "Accedi"; }
  }

  async function logout(showLogin) {
    await lockReservedArea();
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch {}
    window.ExaminerRoutesUI?.stopAll?.();
    await lockRegisterVault();
    showLogin();applyUser(null);clearTimeout(sessionRetry);sessionRetry=null;
  }

  function updateAccountSummary() {
    const box = document.getElementById("accountSummary");
    const roleLabel = currentUser?.role === "ADMIN" ? "Amministratore" : currentUser?.role === "USER_MANAGER" ? "Gestore utenti" : "Istruttore";
    if (box) box.textContent = currentUser ? `${currentUser.name} · ${currentUser.username} · ${roleLabel}` : "Nessun account attivo.";
  }

  function openOwnPassword() {
    const form = document.getElementById("ownPasswordForm");
    form.reset();
    document.getElementById("ownPasswordError").classList.add("hidden");
    document.getElementById("ownPasswordModal").classList.remove("hidden");
    setTimeout(() => document.getElementById("ownCurrentPassword").focus(), 0);
  }
  function closeOwnPassword() {
    document.getElementById("ownPasswordForm").reset();
    document.getElementById("ownPasswordModal").classList.add("hidden");
  }
  async function changeOwnPassword(event) {
    event.preventDefault();
    const form = event.currentTarget, submit = form.querySelector("button[type=submit]"), errorBox = document.getElementById("ownPasswordError");
    const currentPassword = document.getElementById("ownCurrentPassword").value;
    const newPassword = document.getElementById("ownNewPassword").value;
    const confirmPassword = document.getElementById("ownConfirmPassword").value;
    errorBox.classList.add("hidden");
    if (newPassword !== confirmPassword) { errorBox.textContent = "La conferma non coincide con la nuova password."; errorBox.classList.remove("hidden"); return; }
    submit.disabled = true;
    try {
      const data = await api("/api/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
      closeOwnPassword();
      if (data.requireLogin) { loseAccess(data.message); return; }
      const messageBox = document.getElementById("accountPasswordMessage");
      messageBox.textContent = data.message || "Password modificata correttamente.";
      messageBox.style.color = "#70d49a";
      messageBox.classList.remove("hidden");
    } catch (error) {
      if (error.authDenied && error.status === 401) { closeOwnPassword(); loseAccess("La sessione è scaduta. Accedi nuovamente."); return; }
      errorBox.textContent = error.status ? error.message : "Errore di rete. Controlla la connessione e riprova.";
      errorBox.classList.remove("hidden");
    } finally { submit.disabled = false; }
  }

  function message(text, error = false) {
    const box = document.getElementById("userManagementMessage");
    box.textContent = text; box.style.color = error ? "#ff7c86" : "#70d49a"; box.classList.remove("hidden");
  }

  async function openUsers() {
    if (!currentUser?.capabilities?.manageUsers) return;
    try { if (!(await enterReservedArea())) return; } catch (error) { message(error.message, true); return; }
    if (currentUser.role === "USER_MANAGER") showManagerShell(); else window.show("userManagement");
    syncAuditPanel();
    await refreshUsers();
    configureUserManagementForm();
    if (currentUser?.capabilities?.viewAudit === true) await refreshAudit();
  }

  async function refreshUsers() {
    const list = document.getElementById("userList");
    list.textContent = "Caricamento…";
    try {
      const path = currentUser?.role === "USER_MANAGER" ? "/api/user-management/users" : "/api/users";
      const data = await api(path, { method: "GET" });
      list.replaceChildren(...data.users.map(userRow));
    } catch (error) {
      if (error.authDenied && error.status === 401) return loseAccess("L’accesso è stato revocato.");
      list.textContent = error.message;
    }
  }
  function removeAuditPanel() {
    document.getElementById("userManagementAudit")?.remove();
  }
  function createAuditPanel() {
    const section = document.getElementById("userManagement");
    if (!section || currentUser?.capabilities?.viewAudit !== true) return null;
    const panel = document.createElement("div"); panel.id = "userManagementAudit"; panel.className = "card";
    const title = document.createElement("h2"); title.textContent = "Audit gestione utenti";
    const description = document.createElement("p"); description.className = "muted"; description.textContent = "Eventi essenziali degli ultimi 180 giorni. Password e segreti non vengono registrati.";
    const refresh = document.createElement("button"); refresh.id = "refreshUserAudit"; refresh.type = "button"; refresh.className = "secondary"; refresh.textContent = "AGGIORNA AUDIT"; refresh.onclick = refreshAudit;
    const list = document.createElement("div"); list.id = "userAuditList";
    panel.append(title, description, refresh, list);
    section.insertBefore(panel, section.querySelector(".other-functions-subnav"));
    return panel;
  }
  function syncAuditPanel() {
    removeAuditPanel();
    if (reservedUnlocked && currentUser?.capabilities?.viewAudit === true) createAuditPanel();
  }
  async function refreshAudit() {
    if (!reservedUnlocked || currentUser?.capabilities?.viewAudit !== true) { removeAuditPanel(); return; }
    const panel = document.getElementById("userManagementAudit") || createAuditPanel();
    if (!panel) return;
    const list = document.getElementById("userAuditList"); list.textContent = "Caricamento…";
    try {
      const data = await api("/api/user-management/audit?limit=50", { method: "GET" });
      list.replaceChildren(...data.events.map(event => {
        const row = document.createElement("p"); row.className = "user-audit-row";
        const target = event.target_name || event.target_username || event.target_user_ref || "destinatario non disponibile";
        row.textContent = `${new Date(event.occurred_at).toLocaleString("it-IT")} · ${event.action} · ${event.outcome} · ${target} · ${event.reason_code}`;
        return row;
      }));
      if (!data.events.length) list.textContent = "Nessun evento registrato.";
    } catch (error) { list.textContent = `Impossibile leggere lo storico Audit: ${error.message}`; }
  }

  function action(label, handler, className = "secondary") {
    const button = document.createElement("button");
    button.type = "button"; button.className = className; button.textContent = label; button.onclick = handler;
    return button;
  }

  function mondayIso(value = new Date()) {
    const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
    const weekday = date.getDay();
    date.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function nextMondayIso() {
    const date = new Date();
    const weekday = date.getDay();
    date.setDate(date.getDate() + (weekday === 0 ? 1 : 8 - weekday));
    return mondayIso(date);
  }

  async function changeEmployment(user) {
    const current = user.scheduledEmploymentType || user.employmentType || "PART_TIME";
    if (typeof window.chooseAction !== "function") return message("Selettore tipo lavorativo non disponibile.", true);
    const employmentType = await window.chooseAction("Tipo lavorativo", "Scegli il tipo da applicare dalla nuova decorrenza.", [
      { label: "PART TIME", value: "PART_TIME", className: current === "PART_TIME" ? "" : "secondary" },
      { label: "FULL TIME", value: "FULL_TIME", className: current === "FULL_TIME" ? "" : "secondary" },
      { label: "ANNULLA", value: "", className: "secondary" }
    ]);
    if (!employmentType) return;
    const proposedDate = user.scheduledEmploymentEffectiveFrom || nextMondayIso();
    const employmentEffectiveFrom = String(prompt("Decorrenza (YYYY-MM-DD). Sarà applicata dal lunedì della settimana indicata.", proposedDate) || "").trim();
    if (!employmentEffectiveFrom) return;
    await update(user.id, { employmentType, employmentEffectiveFrom });
  }

  function userRow(user) {
    const row = document.createElement("div"); row.className = "user-admin-row";
    const name = document.createElement("strong"); name.textContent = user.name;
    const detail = document.createElement("span"); detail.className = "muted";
    const employment = user.employmentType
      ? `${user.employmentType.replace("_", " ")} dal ${user.employmentEffectiveFrom}`
      : "Tipo lavorativo non ancora attivo";
    const scheduled = user.scheduledEmploymentType
      ? ` · programmato ${user.scheduledEmploymentType.replace("_", " ")} dal ${user.scheduledEmploymentEffectiveFrom}`
      : "";
    detail.textContent = `${user.username} · ${{ADMIN:"Amministratore",USER_MANAGER:"Gestore utenti",SEGRETERIA:"Segreteria",ISTRUTTORE:"Istruttore"}[user.role]||"Ruolo non valido"} · ${employment}${scheduled} · `;
    const status = document.createElement("span"); status.className = user.active ? "user-status-active" : "user-status-blocked"; status.textContent = user.active ? "ATTIVO" : "BLOCCATO"; detail.appendChild(status);
    const actions = document.createElement("div"); actions.className = "user-admin-actions";
    if(currentUser?.capabilities?.managePrivilegedUsers && user.id!==currentUser.id && ["ADMIN","USER_MANAGER"].includes(user.role))actions.append(action("Azzera PIN Area riservata",async()=>{
      if(!confirm(`Azzerare il PIN Area riservata di ${user.name}? Gli sblocchi attivi verranno revocati.`))return;
      const operatorPassword=prompt("Riconferma la password del tuo account");if(operatorPassword===null)return;
      try{await api("/api/reserved-area/reset",{method:"POST",body:JSON.stringify({targetId:user.id,operatorPassword})});message("PIN Area riservata azzerato.")}catch(error){message(error.message,true)}
    }));
    if (currentUser?.role === "ADMIN") {
      actions.append(action("Modifica nome", async () => { const value = prompt("Nome e cognome", user.name); if (!value || value.trim() === user.name) return; await update(user.id, { name: value.trim() }); }));
      actions.append(action("Modifica tipo lavorativo", () => changeEmployment(user)));
    }
    actions.append(action("Password provvisoria", () => issueTemporaryPassword(user)));
    if (user.id !== currentUser.id && (currentUser?.role === "USER_MANAGER" || user.role === "ISTRUTTORE" || currentUser?.capabilities?.managePrivilegedUsers)) {
      actions.append(action(user.active ? "Blocca" : "Riattiva", () => setManagedStatus(user, !user.active), user.active ? "danger" : "secondary"));
      if (currentUser?.role === "ADMIN")
      actions.append(action("Revoca definitivamente", async () => { if (!confirm(`Revocare definitivamente l’accesso di ${user.name}?`)) return; try { await api(`/api/users/${encodeURIComponent(user.id)}`, { method: "DELETE", body: "{}" }); message("Accesso revocato."); await refreshUsers(); } catch (error) { message(error.message, true); } }, "danger"));
    }
    row.append(name, detail, actions); return row;
  }
  async function setManagedStatus(user, active) {
    if (currentUser?.role === "USER_MANAGER") { try { await api(`/api/user-management/users/${encodeURIComponent(user.id)}/status`, { method: "POST", body: JSON.stringify({ active }) }); message("Stato utente aggiornato."); await refreshUsers(); } catch(error) { message(error.message, true); } return; }
    await update(user.id, { active });
  }
  async function issueTemporaryPassword(user) {
    const operatorPassword = prompt("Conferma la tua password per generare una password provvisoria"); if (operatorPassword === null) return;
    try { const data = await api(`/api/user-management/users/${encodeURIComponent(user.id)}/temporary-password`, { method: "POST", body: JSON.stringify({ operatorPassword }) }); showTemporaryPassword(data); await refreshUsers(); }
    catch(error) { message(error.message, true); }
  }
  function showTemporaryPassword(data) {
    document.getElementById("temporaryPasswordValue").textContent = data.temporaryPassword;
    document.getElementById("temporaryPasswordExpiry").textContent = `Scade: ${new Date(data.temporaryPasswordExpiresAt).toLocaleString("it-IT")}`;
    document.getElementById("temporaryPasswordModal").classList.remove("hidden");
  }
  function configureUserManagementForm() {
    document.getElementById("unlockReservedArea")?.remove();
    if (!reservedUnlocked && currentUser?.capabilities?.manageUsers) {
      const unlock = action("SBLOCCA AREA RISERVATA", () => openUsers());
      unlock.id = "unlockReservedArea";
      document.getElementById("createUserForm").before(unlock);
    }
    document.getElementById("createUserForm").classList.toggle("hidden",!reservedUnlocked);
    document.getElementById("createSecretary")?.remove();
    if(reservedUnlocked && currentUser?.capabilities?.managePrivilegedUsers){
      const button=action("CREA ACCOUNT SEGRETERIA",async()=>{
        if(button.disabled)return;button.disabled=true;
        try{const name=prompt("Nome visualizzato del nuovo account Segreteria");if(!name)return;const username=prompt("Username del nuovo account Segreteria");if(!username)return;const operatorPassword=prompt("Riconferma la tua password per creare l’account");if(operatorPassword===null)return;
          const data=await api("/api/user-management/secretaries",{method:"POST",body:JSON.stringify({name,username,operatorPassword})});showTemporaryPassword(data);message("Account Segreteria creato con password provvisoria.");await refreshUsers();
        }catch(error){message(error.message,true)}finally{button.disabled=false}
      });button.id="createSecretary";document.getElementById("createUserForm").before(button);
    }
    const manager = currentUser?.role === "USER_MANAGER";
    document.getElementById("newUserPasswordLabel").classList.toggle("hidden", manager);
    document.getElementById("newUserPassword").required = !manager;
    document.getElementById("newUserRoleLabel").classList.toggle("hidden", manager);
    document.getElementById("newUserOperatorPasswordLabel").classList.toggle("hidden", !manager);
    document.getElementById("newUserOperatorPassword").required = manager;
  }

  async function update(id, changes) {
    try { await api(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) }); message("Utente aggiornato."); await refreshUsers(); }
    catch (error) { message(error.message, true); }
  }

  async function createUser(event) {
    event.preventDefault();
    const form = event.currentTarget, submit = form.querySelector("button[type=submit]"); submit.disabled = true;
    try {
      const manager = currentUser?.role === "USER_MANAGER";
      const payload = {
        name: document.getElementById("newUserName").value,
        username: document.getElementById("newUsername").value,
        employmentType: document.getElementById("newUserEmploymentType").value,
        employmentEffectiveFrom: document.getElementById("newUserEmploymentEffectiveFrom").value,
        ...(manager ? { operatorPassword: document.getElementById("newUserOperatorPassword").value } : { password: document.getElementById("newUserPassword").value, role: document.getElementById("newUserRole").value })
      };
      const data = await api(manager ? "/api/user-management/users" : "/api/users", { method: "POST", body: JSON.stringify(payload) });
      if (data.temporaryPassword) showTemporaryPassword(data);
      form.reset();
      document.getElementById("newUserEmploymentEffectiveFrom").value = mondayIso();
      message("Utente creato e attivo."); await refreshUsers();
    } catch (error) { message(error.message, true); }
    finally { submit.disabled = false; }
  }

  function bindAdminUi() {
    document.getElementById("openUserManagement").onclick = openUsers;
    document.getElementById("backUserManagement").onclick = async () => { await lockReservedArea(); window.show("home"); };
    document.getElementById("createUserForm").onsubmit = createUser;
    document.getElementById("openOwnPassword").onclick = openOwnPassword;
    document.getElementById("cancelOwnPassword").onclick = closeOwnPassword;
    document.getElementById("ownPasswordForm").onsubmit = changeOwnPassword;
    document.getElementById("closeTemporaryPassword").onclick = () => { document.getElementById("temporaryPasswordValue").textContent = ""; document.getElementById("temporaryPasswordModal").classList.add("hidden"); };
    document.getElementById("managerLogout").onclick = () => logout(showPublicLogin);
    document.getElementById("newUserEmploymentEffectiveFrom").value = mondayIso();
  }

  async function boot() {
    const form = document.getElementById("loginForm");
    form.onsubmit = login;
    document.getElementById("toggleLoginPassword").onclick = () => {
      const input = document.getElementById("loginPassword"), visible = input.type === "password";
      input.type = visible ? "text" : "password";
      document.getElementById("toggleLoginPassword").setAttribute("aria-label", visible ? "Nascondi password" : "Mostra password");
      document.getElementById("toggleLoginPassword").setAttribute("aria-pressed", String(visible));
    };
    bindAdminUi();
    document.getElementById("loginScreen")?.classList.add("hidden");
    if (await checkSession(true)) await routeAfterAuthentication();
    checkTimer = setInterval(() => { if (currentUser) checkSession(); }, 30000);
    document.addEventListener("visibilitychange", () => {
      syncAdminPresence();
      if (document.hidden) void lockRegisterVault();
      else if (currentUser) checkSession();
    });
    window.addEventListener("pagehide", () => { void lockRegisterVault(); });
    window.addEventListener("online",async()=>{sessionFailures=0;if(await checkSession(!currentUser)){if(!applicationLoaded)await routeAfterAuthentication()}});
    window.addEventListener("wheel",dismissPresence,{passive:true});
    window.addEventListener("touchmove",dismissPresence,{passive:true});
  }

  window.AgendaAuth = {
    recordEvent,
    diagnostics:()=>diagnosticEvents.map(event=>({...event})),
    can: action => currentUser?.role==="SEGRETERIA" ? ["consult","import","share","archive","trash","license","documents","report"].includes(action) : ["ADMIN","ISTRUTTORE"].includes(currentUser?.role),
    applicationReady,
    login,
    logout,
    updateAccountSummary,
    currentUser: () => currentUser,
    lockRegisterVault,
    lockReservedArea
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
