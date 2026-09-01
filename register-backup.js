(function registerBackupModule(root, factory) {
  const api = factory(root?.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RegisterBackup = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createModule(defaultCrypto) {
  "use strict";

  const FORMAT = "agenda-istruttori-register-backup";
  const VERSION = 1;
  const DEFAULT_ITERATIONS = 600000;
  const MIN_PASSWORD_LENGTH = 12;
  const MAX_FILE_BYTES = 50 * 1024 * 1024;
  const WORK_CATEGORIES = new Set(["LG/A", "LG/M", "M/SE", "GOLD", "EX", "VARIE"]);
  const ALL_CATEGORIES = new Set([...WORK_CATEGORIES, "P", "F"]);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function bytesToBase64(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary);
  }
  function base64ToBytes(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("File backup non valido");
    try { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
    catch { throw new Error("File backup non valido"); }
  }
  function randomBytes(cryptoApi, length) { return cryptoApi.getRandomValues(new Uint8Array(length)); }
  function clone(value) { return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function safeInteger(value, minimum = 0) { return Number.isSafeInteger(value) && value >= minimum; }
  function requirePassword(password) {
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`La password del backup deve contenere almeno ${MIN_PASSWORD_LENGTH} caratteri`);
    }
    return password;
  }
  async function fingerprint(cryptoApi, accountId) {
    const stableId = String(accountId || "").trim();
    if (!stableId) throw new Error("Identità account mancante");
    const digest = new Uint8Array(await cryptoApi.subtle.digest("SHA-256", encoder.encode(`agenda-register-backup-account:${stableId}`)));
    return bytesToBase64(digest).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }
  async function deriveKey(cryptoApi, password, salt, iterations) {
    const material = await cryptoApi.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
    return cryptoApi.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations }, material,
      { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
  }
  function validateRateSnapshot(rates) {
    if (!rates || typeof rates !== "object" || !rates.categories || typeof rates.categories !== "object") throw new Error("Tariffe backup non valide");
    for (const category of WORK_CATEGORIES) if (!safeInteger(rates.categories[category])) throw new Error("Tariffe backup non valide");
    if (!safeInteger(rates.overtime || 0)) throw new Error("Tariffa straordinario non valida");
  }
  function validateDay(day) {
    if (day?.kind !== "day" || day.schemaVersion !== 1 || !validDate(day.date) || typeof day.id !== "string" || !day.id) throw new Error("Giornata backup non valida");
    if (!Array.isArray(day.blocks) || !safeInteger(day.revision, 1) || typeof day.note !== "string" || day.note.length > 4000) throw new Error("Contenuto giornata non valido");
    const orders = new Set(), ids = new Set();
    for (const block of day.blocks) {
      if (!block || typeof block.id !== "string" || !block.id || ids.has(block.id)) throw new Error("Blocco attività non valido");
      if (!safeInteger(block.order, 1) || orders.has(block.order) || !ALL_CATEGORIES.has(block.category) || !safeInteger(block.minutes, 1)) throw new Error("Blocco attività non valido");
      if (typeof block.rateVersionId !== "string" || !block.rateVersionId) throw new Error("Versione tariffaria blocco non valida");
      validateRateSnapshot(block.rateSnapshot); ids.add(block.id); orders.add(block.order);
    }
    if (!validDate(day.employmentEffectiveFrom) || !["PART_TIME", "FULL_TIME"].includes(day.employmentType)) throw new Error("Tipo lavorativo giornata non valido");
  }
  function validateRateVersion(rate) {
    if (rate?.kind !== "rateVersion" || rate.schemaVersion !== 1 || typeof rate.id !== "string" || !rate.id || !validDate(rate.effectiveFrom)) throw new Error("Versione tariffaria non valida");
    validateRateSnapshot(rate.rates);
  }
  function validateSnapshot(snapshot) {
    if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.records) || !Array.isArray(snapshot.revisions)) throw new Error("Contenuto backup non supportato");
    const recordIds = new Set(), dayIds = new Set(), rateIds = new Set(), days = [];
    for (const item of snapshot.records) {
      if (!item || typeof item.recordId !== "string" || !item.recordId || item.recordId.length > 300 || recordIds.has(item.recordId)) throw new Error("Record backup duplicato o non valido");
      if (item.payload?.kind === "day") {
        validateDay(item.payload);
        if (item.recordId !== `day:${item.payload.date}`) throw new Error("Chiave giornata backup incoerente");
        dayIds.add(item.payload.id); days.push(item.payload);
      } else if (item.payload?.kind === "rateVersion") {
        validateRateVersion(item.payload);
        if (item.recordId !== `rate:${item.payload.id}`) throw new Error("Chiave tariffa backup incoerente");
        rateIds.add(item.payload.id);
      }
      else throw new Error("Tipo record backup non supportato");
      recordIds.add(item.recordId);
    }
    for (const day of days) for (const block of day.blocks) {
      if (!rateIds.has(block.rateVersionId)) throw new Error("Versione tariffaria referenziata non presente nel backup");
    }
    const revisionIds = new Set();
    for (const item of snapshot.revisions) {
      if (!item || typeof item.recordId !== "string" || typeof item.revisionId !== "string" || !item.revisionId || revisionIds.has(item.revisionId)) throw new Error("Revisione backup non valida");
      const revision = item.revision;
      if (revision?.kind !== "dayRevision" || revision.schemaVersion !== 1 || !safeInteger(revision.revision, 1) || !dayIds.has(revision.dayId)) throw new Error("Revisione giornata non valida");
      validateDay(revision.snapshot);
      if (revision.snapshot.id !== revision.dayId || revision.snapshot.date !== revision.date || item.recordId !== revision.dayId) throw new Error("Revisione incoerente con la giornata");
      for (const block of revision.snapshot.blocks) if (!rateIds.has(block.rateVersionId)) throw new Error("Tariffa revisione non presente nel backup");
      revisionIds.add(item.revisionId);
    }
    return clone(snapshot);
  }
  function parseContainer(source) {
    const text = typeof source === "string" ? source : decoder.decode(source);
    if (encoder.encode(text).length > MAX_FILE_BYTES) throw new Error("File backup troppo grande");
    let container;
    try { container = JSON.parse(text); } catch { throw new Error("File backup non valido"); }
    if (container?.format !== FORMAT || container.version !== VERSION || container.crypto?.algorithm !== "AES-256-GCM" || container.crypto?.kdf !== "PBKDF2-SHA-256") throw new Error("Formato backup non supportato");
    if (!safeInteger(container.crypto.iterations, 1000) || container.crypto.iterations > 2000000) throw new Error("Parametri crittografici non validi");
    return container;
  }

  function createBackupService({ vault, cryptoApi = defaultCrypto, kdfIterations = DEFAULT_ITERATIONS, now = () => new Date().toISOString() }) {
    if (!vault?.exportSnapshot || !vault?.replaceSnapshot) throw new Error("Vault Registro non compatibile");
    if (!cryptoApi?.subtle) throw new Error("Web Crypto non disponibile");
    async function exportBackup(accountId, password) {
      requirePassword(password);
      const accountFingerprint = await fingerprint(cryptoApi, accountId);
      const snapshot = validateSnapshot(await vault.exportSnapshot());
      const payload = { format: FORMAT, version: VERSION, accountFingerprint, createdAt: now(), snapshot };
      const salt = randomBytes(cryptoApi, 16), iv = randomBytes(cryptoApi, 12);
      const key = await deriveKey(cryptoApi, password, salt, kdfIterations);
      const aad = encoder.encode(`${FORMAT}:v${VERSION}`);
      const ciphertext = await cryptoApi.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key, encoder.encode(JSON.stringify(payload)));
      const container = {
        format: FORMAT, version: VERSION,
        crypto: { algorithm: "AES-256-GCM", kdf: "PBKDF2-SHA-256", iterations: kdfIterations, salt: bytesToBase64(salt), iv: bytesToBase64(iv) },
        ciphertext: bytesToBase64(new Uint8Array(ciphertext))
      };
      const date = payload.createdAt.slice(0, 10);
      return { filename: `agenda-registro-backup-${date}.airb`, mimeType: "application/json", content: JSON.stringify(container) };
    }
    async function inspectBackup(accountId, password, source) {
      requirePassword(password);
      const container = parseContainer(source);
      const salt = base64ToBytes(container.crypto.salt), iv = base64ToBytes(container.crypto.iv), ciphertext = base64ToBytes(container.ciphertext);
      if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) throw new Error("File backup non valido");
      let clear;
      try {
        const key = await deriveKey(cryptoApi, password, salt, container.crypto.iterations);
        clear = await cryptoApi.subtle.decrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(`${FORMAT}:v${VERSION}`), tagLength: 128 }, key, ciphertext);
      } catch { throw new Error("Password errata oppure file alterato"); }
      let payload;
      try { payload = JSON.parse(decoder.decode(clear)); } catch { throw new Error("Contenuto backup non valido"); }
      if (payload?.format !== FORMAT || payload.version !== VERSION || payload.accountFingerprint !== await fingerprint(cryptoApi, accountId)) throw new Error("Il backup appartiene a un altro account");
      const snapshot = validateSnapshot(payload.snapshot);
      return { createdAt: payload.createdAt, records: snapshot.records.length, revisions: snapshot.revisions.length, snapshot };
    }
    async function restoreBackup(accountId, password, source) {
      const inspected = await inspectBackup(accountId, password, source);
      const result = await vault.replaceSnapshot(inspected.snapshot);
      return { ...result, createdAt: inspected.createdAt };
    }
    return Object.freeze({ exportBackup, inspectBackup, restoreBackup });
  }
  return Object.freeze({ FORMAT, VERSION, MIN_PASSWORD_LENGTH, DEFAULT_ITERATIONS, createBackupService });
});
