"use strict";
(() => {
  let currentUser = null;
  let onShowApp = null;
  let onShowLogin = null;
  let checkTimer = null;
  let applicationLoaded = false;
  let applicationLoading = null;

  async function lockRegisterVault() {
    window.RegisterUI?.handleVaultLock?.();
    if (window.RegisterLocalVault) await window.RegisterLocalVault.lock();
  }

  async function activateRegisterVault() {
    if (!currentUser?.id || !window.RegisterLocalVault) return;
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
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(body.error || "Operazione non riuscita.");
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function applyUser(user) {
    const previousId = currentUser?.id || null;
    const nextId = user?.id || null;
    if (previousId && previousId !== nextId) {
      void lockRegisterVault();
    }
    currentUser = user;
    const adminButton = document.getElementById("openUserManagement");
    if (adminButton) adminButton.classList.toggle("hidden", user?.role !== "ADMIN");
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
    applyUser(null);
    if (onShowLogin) onShowLogin(); else showPublicLogin();
    const error = document.getElementById("loginError");
    if (error && message) { error.textContent = message; error.classList.remove("hidden"); }
  }

  async function checkSession(initial = false) {
    try {
      const data = await api("/api/auth/me", { method: "GET" });
      applyUser(data.user);
      return true;
    } catch (error) {
      if (error.status === 401 && initial) { applyUser(null); showPublicLogin(); }
      else if (error.status === 401) loseAccess("La sessione è scaduta o l’accesso è stato revocato.");
      else loseAccess("Impossibile verificare l’accesso. Riconnettiti per entrare.");
      return false;
    }
  }

  function showPublicLogin() {
    document.getElementById("appShell")?.classList.add("hidden");
    document.getElementById("loginScreen")?.classList.remove("hidden");
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src; script.onload = resolve; script.onerror = () => reject(new Error(`Caricamento non autorizzato: ${src}`));
      document.body.appendChild(script);
    });
  }

  async function loadApplication() {
    if (applicationLoaded) { await activateRegisterVault(); onShowApp?.(); return; }
    if (applicationLoading) return applicationLoading;
    applicationLoading = (async () => {
      for (const src of ["https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", "register-economic-engine.js?v=1.21-register-v1", "register-local-vault.js?v=1.21-register-v1", "register-ledger.js?v=1.21-register-v1", "register-report.js?v=1.21-register-report-v2", "register-backup.js?v=1.21-register-backup-v1", "register-deletion.js?v=1.21-register-deletion-v1", "register-ui.js?v=1.21-register-ui-v4", "app.js?v=1.21-navigation-r11", "student-photo.js?v=1.21-photo-v1", "documents.js?v=1.21", "full-backup.js?v=1.21-photo-duration-v1", "r10-features.js?v=1.21-photo-v1"]) await loadScript(src);
      applicationLoaded = true;
      await activateRegisterVault();
      onShowApp?.();
    })();
    try { await applicationLoading; } catch { applicationLoading = null; loseAccess("Impossibile caricare le funzioni protette. Riprova."); }
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
      applyUser(data.user); form.reset(); await loadApplication();
    } catch (error) {
      errorBox.textContent = error.status === 401 ? error.message : "Connessione non disponibile. Riprova.";
      errorBox.classList.remove("hidden"); document.getElementById("loginPassword").select();
    } finally { button.disabled = false; button.textContent = "Accedi"; }
  }

  async function logout(showLogin) {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch {}
    await lockRegisterVault();
    applyUser(null); showLogin();
  }

  function updateAccountSummary() {
    const box = document.getElementById("accountSummary");
    if (box) box.textContent = currentUser ? `${currentUser.name} · ${currentUser.username} · ${currentUser.role === "ADMIN" ? "Amministratore" : "Istruttore"}` : "Nessun account attivo.";
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
      const messageBox = document.getElementById("accountPasswordMessage");
      messageBox.textContent = data.message || "Password modificata correttamente.";
      messageBox.style.color = "#70d49a";
      messageBox.classList.remove("hidden");
    } catch (error) {
      if (error.status === 401) { closeOwnPassword(); loseAccess("La sessione è scaduta. Accedi nuovamente."); return; }
      errorBox.textContent = error.status ? error.message : "Errore di rete. Controlla la connessione e riprova.";
      errorBox.classList.remove("hidden");
    } finally { submit.disabled = false; }
  }

  function message(text, error = false) {
    const box = document.getElementById("userManagementMessage");
    box.textContent = text; box.style.color = error ? "#ff7c86" : "#70d49a"; box.classList.remove("hidden");
  }

  async function openUsers() {
    if (currentUser?.role !== "ADMIN") return;
    window.show("userManagement");
    await refreshUsers();
  }

  async function refreshUsers() {
    const list = document.getElementById("userList");
    list.textContent = "Caricamento…";
    try {
      const data = await api("/api/users", { method: "GET" });
      list.replaceChildren(...data.users.map(userRow));
    } catch (error) {
      if (error.status === 401) return loseAccess("L’accesso è stato revocato.");
      list.textContent = error.message;
    }
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
    const employmentType = String(prompt("Tipo lavorativo: PART_TIME oppure FULL_TIME", current) || "").trim().toUpperCase();
    if (!employmentType) return;
    if (!["PART_TIME", "FULL_TIME"].includes(employmentType)) return message("Tipo lavorativo non valido.", true);
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
    detail.textContent = `${user.username} · ${user.role === "ADMIN" ? "Amministratore" : "Istruttore"} · ${employment}${scheduled} · `;
    const status = document.createElement("span"); status.className = user.active ? "user-status-active" : "user-status-blocked"; status.textContent = user.active ? "ATTIVO" : "BLOCCATO"; detail.appendChild(status);
    const actions = document.createElement("div"); actions.className = "user-admin-actions";
    actions.append(action("Modifica nome", async () => { const value = prompt("Nome e cognome", user.name); if (!value || value.trim() === user.name) return; await update(user.id, { name: value.trim() }); }));
    actions.append(action("Reimposta password", async () => { const value = prompt("Nuova password (almeno 10 caratteri)"); if (value === null) return; await update(user.id, { password: value }); }));
    actions.append(action("Modifica tipo lavorativo", () => changeEmployment(user)));
    if (user.id !== currentUser.id) {
      actions.append(action(user.active ? "Blocca" : "Riattiva", () => update(user.id, { active: !user.active }), user.active ? "danger" : "secondary"));
      actions.append(action("Revoca definitivamente", async () => { if (!confirm(`Revocare definitivamente l’accesso di ${user.name}?`)) return; try { await api(`/api/users/${encodeURIComponent(user.id)}`, { method: "DELETE", body: "{}" }); message("Accesso revocato."); await refreshUsers(); } catch (error) { message(error.message, true); } }, "danger"));
    }
    row.append(name, detail, actions); return row;
  }

  async function update(id, changes) {
    try { await api(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) }); message("Utente aggiornato."); await refreshUsers(); }
    catch (error) { message(error.message, true); }
  }

  async function createUser(event) {
    event.preventDefault();
    const form = event.currentTarget, submit = form.querySelector("button[type=submit]"); submit.disabled = true;
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify({
        name: document.getElementById("newUserName").value,
        username: document.getElementById("newUsername").value,
        password: document.getElementById("newUserPassword").value,
        role: document.getElementById("newUserRole").value,
        employmentType: document.getElementById("newUserEmploymentType").value,
        employmentEffectiveFrom: document.getElementById("newUserEmploymentEffectiveFrom").value
      }) });
      form.reset();
      document.getElementById("newUserEmploymentEffectiveFrom").value = mondayIso();
      message("Utente creato e attivo."); await refreshUsers();
    } catch (error) { message(error.message, true); }
    finally { submit.disabled = false; }
  }

  function bindAdminUi() {
    document.getElementById("openUserManagement").onclick = openUsers;
    document.getElementById("backUserManagement").onclick = () => window.show("home");
    document.getElementById("createUserForm").onsubmit = createUser;
    document.getElementById("openOwnPassword").onclick = openOwnPassword;
    document.getElementById("cancelOwnPassword").onclick = closeOwnPassword;
    document.getElementById("ownPasswordForm").onsubmit = changeOwnPassword;
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
    if (await checkSession(true)) await loadApplication();
    checkTimer = setInterval(() => { if (currentUser) checkSession(); }, 30000);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) void lockRegisterVault();
      else if (currentUser) checkSession();
    });
    window.addEventListener("pagehide", () => { void lockRegisterVault(); });
  }

  window.AgendaAuth = {
    applicationReady,
    login,
    logout,
    updateAccountSummary,
    currentUser: () => currentUser,
    lockRegisterVault
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
