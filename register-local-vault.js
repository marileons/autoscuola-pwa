(function registerLocalVaultModule(root, factory) {
  const api = factory(root?.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.indexedDB && root?.crypto) {
    root.RegisterLocalVault = api.createVault({
      cryptoApi: root.crypto,
      storageFactory: api.createIndexedDbStorageFactory(root.indexedDB),
      clearSensitive: api.clearSensitiveDom
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createModule(defaultCrypto) {
  "use strict";

  const DB_PREFIX = "agenda-register-v1-";
  const DB_VERSION = 1;
  const ENVELOPE_VERSION = 1;
  const META_DEVICE_KEY = "deviceWrappingKey";
  const META_WRAPPED_DEK = "wrappedDek";
  const META_PIN_SECURITY = "pinSecurity";
  const META_PIN_FAILURES = "pinFailures";
  const PIN_LENGTH = 4;
  const DEFAULT_INACTIVITY_MS = 5 * 60 * 1000;
  const DEFAULT_KDF_ITERATIONS = 310000;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function bytesToBase64(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary);
  }
  function base64ToBytes(value) {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }
  function randomBytes(cryptoApi, length) {
    return cryptoApi.getRandomValues(new Uint8Array(length));
  }
  async function sha256Base64Url(cryptoApi, value) {
    const digest = new Uint8Array(await cryptoApi.subtle.digest("SHA-256", encoder.encode(value)));
    return bytesToBase64(digest).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }
  function clone(value) {
    return typeof structuredClone === "function" ? structuredClone(value) : value;
  }

  function validPin(value) {
    return typeof value === "string" && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(value);
  }
  function normalizeRecoveryCode(value) {
    const normalized = String(value || "").replace(/[^0-9a-f]/gi, "").toUpperCase();
    return /^[0-9A-F]{64}$/.test(normalized) ? normalized : "";
  }
  function formatRecoveryCode(value) {
    return value.match(/.{1,8}/g).join("-");
  }
  async function deriveWrappingKey(cryptoApi, secret, salt, iterations) {
    const material = await cryptoApi.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveKey"]);
    return cryptoApi.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
  async function wrapRawDek(cryptoApi, rawDek, wrappingKey, namespace, purpose) {
    const iv = randomBytes(cryptoApi, 12);
    const ciphertext = await cryptoApi.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(`${namespace}:${purpose}`), tagLength: 128 },
      wrappingKey,
      rawDek
    );
    return { algorithm: "AES-GCM", iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
  }
  async function unwrapRawDek(cryptoApi, wrapped, wrappingKey, namespace, purpose) {
    return new Uint8Array(await cryptoApi.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(wrapped.iv),
        additionalData: encoder.encode(`${namespace}:${purpose}`),
        tagLength: 128
      },
      wrappingKey,
      base64ToBytes(wrapped.ciphertext)
    ));
  }

  function createIndexedDbStorageFactory(indexedDb) {
    return {
      async open(name) {
        const request = indexedDb.open(name, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
          if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "key" });
          if (!db.objectStoreNames.contains("revisions")) db.createObjectStore("revisions", { keyPath: "key" });
        };
        const db = await requestPromise(request);
        return {
          get: (store, key) => transactionRequest(db, store, "readonly", (objectStore) => objectStore.get(key)),
          put: (store, value, key) => transactionRequest(db, store, "readwrite",
            (objectStore) => key === undefined ? objectStore.put(value) : objectStore.put(value, key)),
          getAll: (store) => transactionRequest(db, store, "readonly", (objectStore) => objectStore.getAll()),
          delete: (store, key) => transactionRequest(db, store, "readwrite", (objectStore) => objectStore.delete(key)),
          setPinSecurity: (configuration) => new Promise((resolve, reject) => {
            const transaction = db.transaction("meta", "readwrite");
            const store = transaction.objectStore("meta");
            store.put(configuration, META_PIN_SECURITY);
            store.delete(META_DEVICE_KEY);
            store.delete(META_WRAPPED_DEK);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error("Configurazione PIN non riuscita"));
            transaction.onabort = () => reject(transaction.error || new Error("Configurazione PIN annullata"));
          }),
          replaceEncryptedData: (records, revisions) => new Promise((resolve, reject) => {
            const transaction = db.transaction(["records", "revisions"], "readwrite");
            const recordStore = transaction.objectStore("records");
            const revisionStore = transaction.objectStore("revisions");
            recordStore.clear(); revisionStore.clear();
            records.forEach((entry) => recordStore.put(entry));
            revisions.forEach((entry) => revisionStore.put(entry));
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error("Ripristino locale non riuscito"));
            transaction.onabort = () => reject(transaction.error || new Error("Ripristino locale annullato"));
          }),
          clearAllData: () => new Promise((resolve, reject) => {
            const transaction = db.transaction(["meta", "records", "revisions"], "readwrite");
            transaction.objectStore("meta").clear();
            transaction.objectStore("records").clear();
            transaction.objectStore("revisions").clear();
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error("Cancellazione Registro non riuscita"));
            transaction.onabort = () => reject(transaction.error || new Error("Cancellazione Registro annullata"));
          }),
          close: () => db.close()
        };
      }
    };
  }

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Operazione IndexedDB non riuscita"));
    });
  }
  function transactionRequest(db, storeName, mode, operation) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      request.onerror = () => reject(request.error || new Error("Operazione IndexedDB non riuscita"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error || new Error("Transazione IndexedDB non riuscita"));
      transaction.onabort = () => reject(transaction.error || new Error("Transazione IndexedDB annullata"));
    });
  }

  function createMemoryStorageFactory() {
    const databases = new Map();
    return {
      async open(name) {
        if (!databases.has(name)) {
          databases.set(name, {
            meta: new Map(),
            records: new Map(),
            revisions: new Map()
          });
        }
        const stores = databases.get(name);
        return {
          async get(store, key) { return clone(stores[store].get(key)); },
          async put(store, value, key) {
            const actualKey = key === undefined ? value.key : key;
            stores[store].set(actualKey, clone(value));
          },
          async getAll(store) { return [...stores[store].values()].map(clone); },
          async delete(store, key) { stores[store].delete(key); },
          async setPinSecurity(configuration) {
            stores.meta.set(META_PIN_SECURITY, clone(configuration));
            stores.meta.delete(META_DEVICE_KEY);
            stores.meta.delete(META_WRAPPED_DEK);
          },
          async replaceEncryptedData(records, revisions) {
            const nextRecords = new Map(records.map((entry) => [entry.key, clone(entry)]));
            const nextRevisions = new Map(revisions.map((entry) => [entry.key, clone(entry)]));
            stores.records = nextRecords;
            stores.revisions = nextRevisions;
          },
          async clearAllData() {
            stores.meta = new Map(); stores.records = new Map(); stores.revisions = new Map();
          },
          close() {}
        };
      },
      inspect(name, store) {
        const database = databases.get(name);
        return database ? [...database[store].values()].map(clone) : [];
      },
      names() { return [...databases.keys()]; }
    };
  }

  function clearSensitiveDom() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("[data-register-sensitive]").forEach((element) => {
      if ("value" in element) element.value = "";
      element.textContent = "";
    });
    document.dispatchEvent(new CustomEvent("agenda:register-vault-locked"));
  }

  function createVault({
    cryptoApi = defaultCrypto,
    storageFactory,
    clearSensitive = clearSensitiveDom,
    now = () => Date.now(),
    setTimer = (handler, delay) => {
      const timer = setTimeout(handler, delay);
      timer?.unref?.();
      return timer;
    },
    clearTimer = (timer) => clearTimeout(timer),
    inactivityMs = DEFAULT_INACTIVITY_MS,
    kdfIterations = DEFAULT_KDF_ITERATIONS
  }) {
    if (!cryptoApi?.subtle) throw new Error("Web Crypto non disponibile");
    if (!storageFactory?.open) throw new Error("Archivio locale non disponibile");
    let backend = null;
    let accountNamespace = "";
    let databaseName = "";
    let dek = null;
    let generation = 0;
    let pinSecurity = null;
    let inactivityTimer = null;

    function cancelInactivityTimer() {
      if (inactivityTimer !== null) clearTimer(inactivityTimer);
      inactivityTimer = null;
    }
    function scheduleInactivityLock() {
      cancelInactivityTimer();
      if (!dek) return;
      inactivityTimer = setTimer(() => { void lock(); }, inactivityMs);
    }
    function touch() {
      requireOpen(false);
      scheduleInactivityLock();
    }

    function requireOpen(resetInactivity = true) {
      if (!backend || !dek || !accountNamespace) throw new Error("Archivio Registro chiuso");
      if (resetInactivity) scheduleInactivityLock();
      return generation;
    }
    async function aad(store, key) {
      return encoder.encode(JSON.stringify({
        application: "agenda-istruttori",
        vault: 1,
        accountNamespace,
        store,
        key
      }));
    }
    async function encrypt(store, key, payload) {
      requireOpen();
      const iv = randomBytes(cryptoApi, 12);
      const ciphertext = await cryptoApi.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: await aad(store, key), tagLength: 128 },
        dek,
        encoder.encode(JSON.stringify(payload))
      );
      return {
        key,
        version: ENVELOPE_VERSION,
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(ciphertext))
      };
    }
    async function decrypt(store, envelope) {
      requireOpen();
      if (envelope.version !== ENVELOPE_VERSION) throw new Error("Versione archivio non supportata");
      const plaintext = await cryptoApi.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: base64ToBytes(envelope.iv),
          additionalData: await aad(store, envelope.key),
          tagLength: 128
        },
        dek,
        base64ToBytes(envelope.ciphertext)
      );
      return JSON.parse(decoder.decode(plaintext));
    }

    async function importRuntimeDek(rawDek) {
      return cryptoApi.subtle.importKey("raw", rawDek, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    }
    async function pinKey(pin, configuration) {
      return deriveWrappingKey(
        cryptoApi,
        pin,
        base64ToBytes(configuration.pinSalt),
        configuration.pinIterations
      );
    }
    async function recoveryKey(code, configuration) {
      return deriveWrappingKey(
        cryptoApi,
        code,
        base64ToBytes(configuration.recoverySalt),
        configuration.recoveryIterations
      );
    }
    async function readFailureState() {
      return await backend.get("meta", META_PIN_FAILURES)
        || { failedAttempts: 0, lockLevel: 0, lockedUntil: 0 };
    }
    function lockDuration(level) {
      return [5, 15, 30][Math.min(Math.max(level - 1, 0), 2)] * 60 * 1000;
    }
    async function pinLockStatus() {
      if (!backend) throw new Error("Archivio account non attivo");
      const state = await readFailureState();
      return {
        locked: state.lockedUntil > now(),
        lockedUntil: state.lockedUntil || 0,
        remainingMs: Math.max((state.lockedUntil || 0) - now(), 0),
        failedAttempts: state.failedAttempts || 0,
        lockLevel: state.lockLevel || 0
      };
    }
    async function registerWrongPin() {
      const state = await readFailureState();
      state.failedAttempts = (state.failedAttempts || 0) + 1;
      if (state.failedAttempts >= 5) {
        state.failedAttempts = 0;
        state.lockLevel = Math.min((state.lockLevel || 0) + 1, 3);
        state.lockedUntil = now() + lockDuration(state.lockLevel);
      }
      await backend.put("meta", state, META_PIN_FAILURES);
      return pinLockStatus();
    }
    async function resetFailures() {
      await backend.put("meta", { failedAttempts: 0, lockLevel: 0, lockedUntil: 0 }, META_PIN_FAILURES);
    }
    async function unwrapWithPin(pin) {
      const status = await pinLockStatus();
      if (status.locked) {
        const error = new Error("PIN temporaneamente bloccato");
        error.code = "PIN_LOCKED";
        error.lockStatus = status;
        throw error;
      }
      try {
        const wrappingKey = await pinKey(pin, pinSecurity);
        return await unwrapRawDek(cryptoApi, pinSecurity.pinWrappedDek, wrappingKey, accountNamespace, "pin");
      } catch {
        const updated = await registerWrongPin();
        const error = new Error(updated.locked ? "PIN temporaneamente bloccato" : "PIN non corretto");
        error.code = updated.locked ? "PIN_LOCKED" : "PIN_INVALID";
        error.lockStatus = updated;
        throw error;
      }
    }
    function validateNewPin(pin, confirmation) {
      if (!validPin(pin)) throw new Error("Il PIN deve contenere esattamente 4 cifre");
      if (pin !== confirmation) throw new Error("La conferma PIN non coincide");
    }
    async function createPinConfiguration(rawDek, pin, recoveryCode, existingRecovery = null) {
      const pinSalt = randomBytes(cryptoApi, 16);
      const derivedPinKey = await deriveWrappingKey(cryptoApi, pin, pinSalt, kdfIterations);
      const pinWrappedDek = await wrapRawDek(cryptoApi, rawDek, derivedPinKey, accountNamespace, "pin");
      if (existingRecovery) {
        return {
          ...pinSecurity,
          pinSalt: bytesToBase64(pinSalt),
          pinIterations: kdfIterations,
          pinWrappedDek
        };
      }
      const recoverySalt = randomBytes(cryptoApi, 16);
      const derivedRecoveryKey = await deriveWrappingKey(cryptoApi, recoveryCode, recoverySalt, kdfIterations);
      const recoveryWrappedDek = await wrapRawDek(
        cryptoApi, rawDek, derivedRecoveryKey, accountNamespace, "recovery"
      );
      return {
        version: 1,
        kdf: "PBKDF2-HMAC-SHA-256",
        pinSalt: bytesToBase64(pinSalt),
        pinIterations: kdfIterations,
        pinWrappedDek,
        recoverySalt: bytesToBase64(recoverySalt),
        recoveryIterations: kdfIterations,
        recoveryWrappedDek
      };
    }
    async function legacyRawDek() {
      const deviceKey = await backend.get("meta", META_DEVICE_KEY);
      const wrapped = await backend.get("meta", META_WRAPPED_DEK);
      if (!deviceKey && !wrapped) return null;
      if (!deviceKey || !wrapped) throw new Error("Materiale cifrato locale precedente incompleto");
      return new Uint8Array(await cryptoApi.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: base64ToBytes(wrapped.iv),
          additionalData: encoder.encode(accountNamespace),
          tagLength: 128
        },
        deviceKey,
        base64ToBytes(wrapped.ciphertext)
      ));
    }
    async function setupPin(pin, confirmation) {
      if (!backend || !accountNamespace) throw new Error("Archivio account non attivo");
      if (pinSecurity) throw new Error("PIN già configurato");
      validateNewPin(pin, confirmation);
      const recoveryPlain = [...randomBytes(cryptoApi, 32)]
        .map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
      const rawDek = await legacyRawDek() || randomBytes(cryptoApi, 32);
      try {
        const configuration = await createPinConfiguration(rawDek, pin, recoveryPlain);
        await backend.setPinSecurity(configuration);
        pinSecurity = configuration;
        dek = await importRuntimeDek(rawDek);
        await resetFailures();
        scheduleInactivityLock();
        return { recoveryCode: formatRecoveryCode(recoveryPlain) };
      } finally {
        rawDek.fill(0);
      }
    }
    async function unlock(pin) {
      if (!backend || !accountNamespace) throw new Error("Archivio account non attivo");
      if (!pinSecurity) throw new Error("PIN non ancora configurato");
      if (!validPin(pin)) {
        const updated = await registerWrongPin();
        const error = new Error(updated.locked ? "PIN temporaneamente bloccato" : "PIN non corretto");
        error.code = updated.locked ? "PIN_LOCKED" : "PIN_INVALID";
        error.lockStatus = updated;
        throw error;
      }
      const rawDek = await unwrapWithPin(pin);
      try {
        dek = await importRuntimeDek(rawDek);
        await resetFailures();
        scheduleInactivityLock();
        return true;
      } finally {
        rawDek.fill(0);
      }
    }
    async function changePin(currentPin, newPin, confirmation) {
      validateNewPin(newPin, confirmation);
      const rawDek = await unwrapWithPin(currentPin);
      try {
        const configuration = await createPinConfiguration(rawDek, newPin, "", true);
        await backend.setPinSecurity(configuration);
        pinSecurity = configuration;
        dek = await importRuntimeDek(rawDek);
        await resetFailures();
        scheduleInactivityLock();
      } finally {
        rawDek.fill(0);
      }
    }
    async function recover(recoveryCode, newPin, confirmation) {
      if (!backend || !pinSecurity) throw new Error("Archivio con PIN non disponibile");
      validateNewPin(newPin, confirmation);
      const normalized = normalizeRecoveryCode(recoveryCode);
      if (!normalized) throw new Error("Codice di recupero non valido");
      let rawDek;
      try {
        const key = await recoveryKey(normalized, pinSecurity);
        rawDek = await unwrapRawDek(
          cryptoApi, pinSecurity.recoveryWrappedDek, key, accountNamespace, "recovery"
        );
      } catch {
        throw new Error("Codice di recupero non valido");
      }
      try {
        const configuration = await createPinConfiguration(rawDek, newPin, "", true);
        await backend.setPinSecurity(configuration);
        pinSecurity = configuration;
        dek = await importRuntimeDek(rawDek);
        await resetFailures();
        scheduleInactivityLock();
      } finally {
        rawDek.fill(0);
      }
    }

    async function lock() {
      generation += 1;
      cancelInactivityTimer();
      dek = null;
      pinSecurity = null;
      accountNamespace = "";
      databaseName = "";
      const closingBackend = backend;
      backend = null;
      try { clearSensitive(); } finally { closingBackend?.close(); }
    }

    async function activate(accountId) {
      const stableId = String(accountId || "").trim();
      if (!stableId) throw new Error("Identità account mancante");
      await lock();
      const activation = generation;
      const namespace = await sha256Base64Url(cryptoApi, `agenda-register-account:${stableId}`);
      if (activation !== generation) throw new Error("Attivazione archivio annullata");
      const targetDatabaseName = DB_PREFIX + namespace.slice(0, 32);
      const opened = await storageFactory.open(targetDatabaseName);
      if (activation !== generation) { opened.close(); throw new Error("Attivazione archivio annullata"); }
      let configuration;
      try { configuration = await opened.get("meta", META_PIN_SECURITY); }
      catch (error) { opened.close(); throw error; }
      if (activation !== generation) { opened.close(); throw new Error("Attivazione archivio annullata"); }
      accountNamespace = namespace;
      databaseName = targetDatabaseName;
      backend = opened;
      pinSecurity = configuration || null;
      dek = null;
      return {
        accountNamespace,
        databaseName,
        pinConfigured: Boolean(pinSecurity),
        requiresPinSetup: !pinSecurity
      };
    }

    async function opaqueKey(kind, id) {
      requireOpen();
      return sha256Base64Url(cryptoApi, `${accountNamespace}:${kind}:${String(id)}`);
    }
    async function putRecord(recordId, payload) {
      const state = requireOpen();
      const key = await opaqueKey("record", recordId);
      const envelope = await encrypt("records", key, { recordId, payload });
      if (state !== generation) throw new Error("Archivio cambiato durante l’operazione");
      await backend.put("records", envelope);
      return recordId;
    }
    async function getRecord(recordId) {
      requireOpen();
      const key = await opaqueKey("record", recordId);
      const envelope = await backend.get("records", key);
      if (!envelope) return null;
      return (await decrypt("records", envelope)).payload;
    }
    async function listRecords() {
      requireOpen();
      const envelopes = await backend.getAll("records");
      return Promise.all(envelopes.map(async (envelope) => (await decrypt("records", envelope)).payload));
    }

    async function appendRevision(recordId, revisionId, revision) {
      const state = requireOpen();
      const key = await opaqueKey("revision", revisionId);
      const envelope = await encrypt("revisions", key, { recordId, revisionId, revision });
      if (state !== generation) throw new Error("Archivio cambiato durante l’operazione");
      await backend.put("revisions", envelope);
      return revisionId;
    }
    async function listRevisions(recordId) {
      requireOpen();
      const envelopes = await backend.getAll("revisions");
      const decrypted = await Promise.all(envelopes.map((envelope) => decrypt("revisions", envelope)));
      return decrypted.filter((item) => item.recordId === recordId).map((item) => item.revision);
    }
    async function exportSnapshot() {
      requireOpen();
      const recordEnvelopes = await backend.getAll("records");
      const revisionEnvelopes = await backend.getAll("revisions");
      const records = await Promise.all(recordEnvelopes.map((envelope) => decrypt("records", envelope)));
      const revisions = await Promise.all(revisionEnvelopes.map((envelope) => decrypt("revisions", envelope)));
      return {
        schemaVersion: 1,
        records: records.map(({ recordId, payload }) => ({ recordId, payload: clone(payload) })),
        revisions: revisions.map(({ recordId, revisionId, revision }) => ({ recordId, revisionId, revision: clone(revision) }))
      };
    }
    async function replaceSnapshot(snapshot) {
      const state = requireOpen();
      if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.records) || !Array.isArray(snapshot.revisions)) {
        throw new TypeError("Struttura ripristino non valida");
      }
      const records = [];
      for (const item of snapshot.records) {
        const key = await opaqueKey("record", item.recordId);
        records.push(await encrypt("records", key, { recordId: item.recordId, payload: clone(item.payload) }));
      }
      const revisions = [];
      for (const item of snapshot.revisions) {
        const key = await opaqueKey("revision", item.revisionId);
        revisions.push(await encrypt("revisions", key, {
          recordId: item.recordId, revisionId: item.revisionId, revision: clone(item.revision)
        }));
      }
      if (state !== generation) throw new Error("Archivio cambiato durante il ripristino");
      await backend.replaceEncryptedData(records, revisions);
      return { records: records.length, revisions: revisions.length };
    }
    async function destroyAll(pin) {
      const state = requireOpen();
      if (!pinSecurity) throw new Error("PIN non configurato");
      if (!validPin(pin)) {
        const updated = await registerWrongPin();
        const error = new Error(updated.locked ? "PIN temporaneamente bloccato" : "PIN non corretto");
        error.code = updated.locked ? "PIN_LOCKED" : "PIN_INVALID"; error.lockStatus = updated; throw error;
      }
      const rawDek = await unwrapWithPin(pin);
      rawDek.fill(0);
      if (state !== generation) throw new Error("Archivio cambiato durante la cancellazione");
      await backend.clearAllData();
      await lock();
      return true;
    }
    function status() {
      return {
        active: Boolean(backend),
        pinConfigured: Boolean(pinSecurity),
        unlocked: Boolean(backend && dek),
        databaseName: databaseName || null
      };
    }

    return Object.freeze({
      activate,
      lock,
      touch,
      setupPin,
      unlock,
      changePin,
      recover,
      pinLockStatus,
      status,
      putRecord,
      getRecord,
      listRecords,
      appendRevision,
      listRevisions,
      exportSnapshot,
      replaceSnapshot,
      destroyAll
    });
  }

  return Object.freeze({
    createVault,
    createIndexedDbStorageFactory,
    createMemoryStorageFactory,
    clearSensitiveDom
  });
});
