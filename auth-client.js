"use strict";
(() => {
  let currentUser = null;
  let onShowApp = null;
  let onShowLogin = null;
  let checkTimer = null;

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
    currentUser = user;
    const adminButton = document.getElementById("openUserManagement");
    if (adminButton) adminButton.classList.toggle("hidden", user?.role !== "ADMIN");
    updateAccountSummary();
  }

  function loseAccess(message) {
    applyUser(null);
    onShowLogin?.();
    const error = document.getElementById("loginError");
    if (error && message) { error.textContent = message; error.classList.remove("hidden"); }
  }

  async function checkSession(silent = false) {
    try {
      const data = await api("/api/auth/me", { method: "GET" });
      applyUser(data.user);
      return true;
    } catch (error) {
      if (error.status === 401) loseAccess("La sessione è scaduta o l’accesso è stato revocato.");
      else loseAccess("Impossibile verificare l’accesso. Riconnettiti per entrare.");
      return false;
    }
  }

  async function initialize(showApp, showLogin) {
    onShowApp = showApp;
    onShowLogin = showLogin;
    bindAdminUi();
    if (await checkSession()) onShowApp(); else if (!currentUser) onShowLogin();
    checkTimer = setInterval(() => { if (currentUser) checkSession(true); }, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && currentUser) checkSession(true); });
  }

  async function login(event, showApp) {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector("button[type=submit]"), errorBox = document.getElementById("loginError");
    errorBox.classList.add("hidden"); button.disabled = true; button.textContent = "Accesso…";
    try {
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: document.getElementById("loginUsername").value, password: document.getElementById("loginPassword").value }) });
      applyUser(data.user); form.reset(); showApp();
    } catch (error) {
      errorBox.textContent = error.status === 401 ? error.message : "Connessione non disponibile. Riprova.";
      errorBox.classList.remove("hidden"); document.getElementById("loginPassword").select();
    } finally { button.disabled = false; button.textContent = "Accedi"; }
  }

  async function logout(showLogin) {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch {}
    applyUser(null); showLogin();
  }

  function updateAccountSummary() {
    const box = document.getElementById("accountSummary");
    if (box) box.textContent = currentUser ? `${currentUser.name} · ${currentUser.username} · ${currentUser.role === "ADMIN" ? "Amministratore" : "Istruttore"}` : "Nessun account attivo.";
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

  function userRow(user) {
    const row = document.createElement("div"); row.className = "user-admin-row";
    const name = document.createElement("strong"); name.textContent = user.name;
    const detail = document.createElement("span"); detail.className = "muted"; detail.textContent = `${user.username} · ${user.role === "ADMIN" ? "Amministratore" : "Istruttore"} · `;
    const status = document.createElement("span"); status.className = user.active ? "user-status-active" : "user-status-blocked"; status.textContent = user.active ? "ATTIVO" : "BLOCCATO"; detail.appendChild(status);
    const actions = document.createElement("div"); actions.className = "user-admin-actions";
    actions.append(action("Modifica nome", async () => { const value = prompt("Nome e cognome", user.name); if (!value || value.trim() === user.name) return; await update(user.id, { name: value.trim() }); }));
    actions.append(action("Reimposta password", async () => { const value = prompt("Nuova password (almeno 10 caratteri)"); if (value === null) return; await update(user.id, { password: value }); }));
    if (user.id !== currentUser.id) {
      actions.append(action(user.active ? "Blocca" : "Riattiva", () => update(user.id, { active: !user.active }), user.active ? "danger" : "secondary"));
      actions.append(action("Revoca definitivamente", async () => { if (!confirm(`Revocare definitivamente l’accesso di ${user.name}?`)) return; try { await api(`/api/users/${encodeURIComponent(user.id)}`, { method: "DELETE", body: "{}" }); message("Accesso revocato."); await refreshUsers(); } catch (error) { message(error.message, true); } }, "danger"));
    }
    row.append(name, detail, actions); return row;
  }

  async function update(id, changes) {
    try { await api(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) }); message("Utente aggiornato. Le sessioni interessate sono state revocate."); await refreshUsers(); }
    catch (error) { message(error.message, true); }
  }

  async function createUser(event) {
    event.preventDefault();
    const form = event.currentTarget, submit = form.querySelector("button[type=submit]"); submit.disabled = true;
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify({ name: document.getElementById("newUserName").value, username: document.getElementById("newUsername").value, password: document.getElementById("newUserPassword").value, role: document.getElementById("newUserRole").value }) });
      form.reset(); message("Utente creato e attivo."); await refreshUsers();
    } catch (error) { message(error.message, true); }
    finally { submit.disabled = false; }
  }

  function bindAdminUi() {
    document.getElementById("openUserManagement").onclick = openUsers;
    document.getElementById("backUserManagement").onclick = () => window.show("home");
    document.getElementById("createUserForm").onsubmit = createUser;
  }

  window.AgendaAuth = { initialize, login, logout, updateAccountSummary, currentUser: () => currentUser };
})();
