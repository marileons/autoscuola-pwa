"use strict";

const STORAGE_KEY = "autoscuola_students_v1";

const state = {
  students: loadStudents(),
  currentStudentId: null,
  watchId: null,
  map: null,
  routeLayer: null,
  startMarker: null,
  endMarker: null
};

const elements = {
  listView: document.getElementById("listView"),
  studentView: document.getElementById("studentView"),
  searchInput: document.getElementById("searchInput"),
  newStudentButton: document.getElementById("newStudentButton"),
  studentList: document.getElementById("studentList"),
  emptyListMessage: document.getElementById("emptyListMessage"),
  backupButton: document.getElementById("backupButton"),
  restoreInput: document.getElementById("restoreInput"),
  backButton: document.getElementById("backButton"),
  saveButton: document.getElementById("saveButton"),
  firstNameInput: document.getElementById("firstNameInput"),
  lastNameInput: document.getElementById("lastNameInput"),
  phoneInput: document.getElementById("phoneInput"),
  licenseInput: document.getElementById("licenseInput"),
  checklistContainer: document.getElementById("checklistContainer"),
  addChecklistButton: document.getElementById("addChecklistButton"),
  notesInput: document.getElementById("notesInput"),
  startGpsButton: document.getElementById("startGpsButton"),
  stopGpsButton: document.getElementById("stopGpsButton"),
  gpsStatus: document.getElementById("gpsStatus")
};

function loadStudents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeStudent) : [];
  } catch {
    return [];
  }
}

function normalizeStudent(student) {
  return {
    id: typeof student.id === "string" ? student.id : createId(),
    firstName: typeof student.firstName === "string" ? student.firstName : "",
    lastName: typeof student.lastName === "string" ? student.lastName : "",
    phone: typeof student.phone === "string" ? student.phone : "",
    license: typeof student.license === "string" ? student.license : "",
    checklist: Array.isArray(student.checklist)
      ? student.checklist.map(item => ({
          id: typeof item.id === "string" ? item.id : createId(),
          text: typeof item.text === "string" ? item.text : "",
          done: Boolean(item.done)
        }))
      : [],
    notes: typeof student.notes === "string" ? student.notes : "",
    route: Array.isArray(student.route)
      ? student.route
          .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng))
          .map(point => ({
            lat: point.lat,
            lng: point.lng,
            accuracy: Number.isFinite(point.accuracy) ? point.accuracy : null,
            timestamp: Number.isFinite(point.timestamp) ? point.timestamp : Date.now()
          }))
      : []
  };
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveStudents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.students));
}

function getCurrentStudent() {
  return state.students.find(student => student.id === state.currentStudentId) || null;
}

function createEmptyStudent() {
  return {
    id: createId(),
    firstName: "",
    lastName: "",
    phone: "",
    license: "",
    checklist: [],
    notes: "",
    route: []
  };
}

function renderStudentList() {
  const query = elements.searchInput.value.trim().toLocaleLowerCase("it");
  const filtered = state.students
    .filter(student => {
      const searchable = `${student.firstName} ${student.lastName} ${student.phone} ${student.license}`
        .toLocaleLowerCase("it");
      return searchable.includes(query);
    })
    .sort((a, b) => {
      const nameA = `${a.lastName} ${a.firstName}`.trim();
      const nameB = `${b.lastName} ${b.firstName}`.trim();
      return nameA.localeCompare(nameB, "it", { sensitivity: "base" });
    });

  elements.studentList.innerHTML = "";
  elements.emptyListMessage.hidden = filtered.length > 0;

  for (const student of filtered) {
    const item = document.createElement("li");
    item.className = "student-item";

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.studentId = student.id;

    const name = document.createElement("strong");
    name.className = "student-name";
    name.textContent = `${student.lastName} ${student.firstName}`.trim() || "Allievo senza nome";

    const details = document.createElement("span");
    details.className = "student-details";
    details.textContent = [student.phone, student.license].filter(Boolean).join(" · ");

    button.append(name, details);
    item.appendChild(button);
    elements.studentList.appendChild(item);
  }
}

function showListView() {
  stopGps();
  state.currentStudentId = null;
  elements.studentView.classList.add("hidden");
  elements.listView.classList.remove("hidden");
  renderStudentList();
}

function showStudentView(studentId) {
  const student = state.students.find(item => item.id === studentId);
  if (!student) {
    return;
  }

  stopGps();
  state.currentStudentId = studentId;
  elements.firstNameInput.value = student.firstName;
  elements.lastNameInput.value = student.lastName;
  elements.phoneInput.value = student.phone;
  elements.licenseInput.value = student.license;
  elements.notesInput.value = student.notes;
  elements.gpsStatus.textContent = "GPS non attivo.";

  renderChecklist(student);
  elements.listView.classList.add("hidden");
  elements.studentView.classList.remove("hidden");

  requestAnimationFrame(() => {
    initializeMap();
    renderRoute(student.route);
    state.map.invalidateSize();
  });
}

function saveCurrentStudent() {
  const student = getCurrentStudent();
  if (!student) {
    return;
  }

  student.firstName = elements.firstNameInput.value.trim();
  student.lastName = elements.lastNameInput.value.trim();
  student.phone = elements.phoneInput.value.trim();
  student.license = elements.licenseInput.value.trim();
  student.notes = elements.notesInput.value;

  const rows = [...elements.checklistContainer.querySelectorAll(".checklist-row")];
  student.checklist = rows.map(row => ({
    id: row.dataset.itemId,
    text: row.querySelector('input[type="text"]').value.trim(),
    done: row.querySelector('input[type="checkbox"]').checked
  }));

  saveStudents();
  showListView();
}

function renderChecklist(student) {
  elements.checklistContainer.innerHTML = "";
  for (const item of student.checklist) {
    addChecklistRow(item);
  }
}

function addChecklistRow(item = { id: createId(), text: "", done: false }) {
  const row = document.createElement("div");
  row.className = "checklist-row";
  row.dataset.itemId = item.id;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = item.done;
  checkbox.setAttribute("aria-label", "Voce completata");

  const text = document.createElement("input");
  text.type = "text";
  text.value = item.text;
  text.placeholder = "Voce checklist";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-checklist-button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Rimuovi voce");
  remove.addEventListener("click", () => row.remove());

  row.append(checkbox, text, remove);
  elements.checklistContainer.appendChild(row);
  text.focus();
}

function initializeMap() {
  if (state.map) {
    return;
  }

  state.map = L.map("map", {
    zoomControl: true,
    attributionControl: true
  }).setView([41.9028, 12.4964], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(state.map);
}

function clearRouteLayers() {
  for (const layer of [state.routeLayer, state.startMarker, state.endMarker]) {
    if (layer && state.map) {
      state.map.removeLayer(layer);
    }
  }
  state.routeLayer = null;
  state.startMarker = null;
  state.endMarker = null;
}

function renderRoute(route) {
  initializeMap();
  clearRouteLayers();

  if (!route.length) {
    state.map.setView([41.9028, 12.4964], 6);
    return;
  }

  const coordinates = route.map(point => [point.lat, point.lng]);
  state.routeLayer = L.polyline(coordinates, { weight: 5 }).addTo(state.map);
  state.startMarker = L.marker(coordinates[0]).addTo(state.map).bindPopup("Inizio percorso");
  state.endMarker = L.marker(coordinates[coordinates.length - 1]).addTo(state.map).bindPopup("Fine percorso");

  if (coordinates.length === 1) {
    state.map.setView(coordinates[0], 17);
  } else {
    state.map.fitBounds(state.routeLayer.getBounds(), { padding: [24, 24] });
  }
}

function startGps() {
  const student = getCurrentStudent();
  if (!student || state.watchId !== null) {
    return;
  }

  if (!navigator.geolocation) {
    elements.gpsStatus.textContent = "GPS non disponibile su questo dispositivo.";
    return;
  }

  elements.gpsStatus.textContent = "Richiesta accesso al GPS…";

  state.watchId = navigator.geolocation.watchPosition(
    position => {
      const point = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        timestamp: position.timestamp
      };

      student.route.push(point);
      saveStudents();
      renderRoute(student.route);
      elements.gpsStatus.textContent = "Registrazione percorso attiva.";
    },
    error => {
      const messages = {
        1: "Permesso GPS negato.",
        2: "Posizione non disponibile.",
        3: "Tempo di acquisizione GPS scaduto."
      };
      elements.gpsStatus.textContent = messages[error.code] || "Errore GPS.";
      stopGps(false);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    }
  );

  elements.startGpsButton.disabled = true;
  elements.stopGpsButton.disabled = false;
}

function stopGps(updateStatus = true) {
  if (state.watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.watchId);
  }

  state.watchId = null;
  elements.startGpsButton.disabled = false;
  elements.stopGpsButton.disabled = true;

  if (updateStatus && !elements.studentView.classList.contains("hidden")) {
    elements.gpsStatus.textContent = "GPS non attivo.";
  }
}

function backupJson() {
  const payload = {
    app: "Autoscuola",
    version: 1,
    exportedAt: new Date().toISOString(),
    students: state.students
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `autoscuola-backup-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function restoreJson(file) {
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const source = Array.isArray(parsed) ? parsed : parsed.students;

    if (!Array.isArray(source)) {
      throw new Error("Formato non valido");
    }

    state.students = source.map(normalizeStudent);
    saveStudents();
    renderStudentList();
    alert("Ripristino completato.");
  } catch {
    alert("Il file JSON non è valido.");
  } finally {
    elements.restoreInput.value = "";
  }
}

elements.searchInput.addEventListener("input", renderStudentList);

elements.newStudentButton.addEventListener("click", () => {
  const student = createEmptyStudent();
  state.students.push(student);
  saveStudents();
  showStudentView(student.id);
});

elements.studentList.addEventListener("click", event => {
  const button = event.target.closest("button[data-student-id]");
  if (button) {
    showStudentView(button.dataset.studentId);
  }
});

elements.backButton.addEventListener("click", showListView);
elements.saveButton.addEventListener("click", saveCurrentStudent);
elements.addChecklistButton.addEventListener("click", () => addChecklistRow());
elements.startGpsButton.addEventListener("click", startGps);
elements.stopGpsButton.addEventListener("click", () => stopGps());
elements.backupButton.addEventListener("click", backupJson);
elements.restoreInput.addEventListener("change", event => restoreJson(event.target.files[0]));

window.addEventListener("beforeunload", () => stopGps(false));

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && state.watchId !== null) {
    const student = getCurrentStudent();
    if (student) {
      saveStudents();
    }
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

renderStudentList();
