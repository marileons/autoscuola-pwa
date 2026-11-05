# Sigla account sul marker GPS — preparazione locale

## Pubblicazione futura, non eseguita

1. Verificare branch, commit stabile e versione attiva; creare e verificare il backup dell'edizione sul PC secondo la preferenza dell'utente.
2. Verificare le migrazioni pendenti e applicare **0023_user_gps_marker_initials.sql prima del nuovo codice**, sul binding D1 già esistente, solo dopo un'autorizzazione specifica alla pubblicazione e migrazione remota. Non applicare migrazioni inattese.
3. Pubblicare Worker e asset insieme con wrangler.toml invariato, preservando le variabili. Nessun nuovo binding, servizio o interruttore.
4. Il principale sblocca l'Area riservata e apre Gestione utenti. In ciascuna scheda usa **Sigla sulla macchinina → SALVA SIGLA**. Due lettere A–Z, anche minuscole in ingresso, sono salvate in maiuscolo; il campo vuoto rimuove la sigla. Duplicati consentiti. Nessuna assegnazione iniziale automatica.
5. Sugli altri dispositivi la sigla arriva con il controllo sessione già esistente o il successivo accesso. Una pagina già aperta con codice precedente va chiusa e riaperta normalmente, senza eliminare dati o cache.

## Schema, permessi e colonna assente

La migrazione aggiunge soltanto `users.gps_marker_initials`, nullable e con vincolo per due lettere A–Z. Non esegue UPDATE, backfill, ricostruzioni di tabelle o modifiche agli ID, alle credenziali e ai rapporti esistenti.

`PATCH /api/users/:id` conserva controllo origine, sessione normale, ruoli e sblocco dell'Area riservata. Il nuovo campo richiede inoltre `isPrimaryAdmin` sul server: ADMIN secondari, USER_MANAGER e istruttori non possono cambiarlo, nemmeno con richieste manuali. Il form invia soltanto `gpsMarkerInitials`; il server aggiorna quel campo, il normale updated_at e l'audit già esistente. Non sono modificati ruoli, password o sessioni. Nessuna nuova autorizzazione ai dati.

Login e `/api/auth/me` usano il normale profilo autenticato. Con colonna ancora assente restano utilizzabili e restituiscono sigla neutra; un tentativo di salvataggio restituisce **HTTP 503 GPS_MARKER_SCHEMA_UNAVAILABLE**, senza scritture né successo apparente. Non viene creato lo schema dal Worker. Un errore del database non viene trasformato in un salvataggio riuscito.

## Marker e separazione dei dati

L'auto blu e l'alfabeto vettoriale A–Z derivano dall'HTML approvato. MR conserva i due tracciati del logo originale. Il tetto è neutro se il campo manca; il pallino per direzione sconosciuta resta distinto. SVG e tracciati già presenti sono aggiornati solo al cambio del profilo. Il controllo dei punti continua ad aggiornare esclusivamente posizione e orientamento; nessun watcher, font, polling o richiesta di rete aggiunto.

La coppia ID/sigla è mantenuta soltanto in memoria per il profilo corrente e notificata ai marker aperti. Logout, perdita di accesso e cambio ID eliminano subito la sigla precedente. Durante il logout il marker resta neutro anche se arriva una risposta profilo tardiva; il profilo di presentazione usato da un modulo caricato in ritardo rispetta la stessa protezione. La risorsa SVG locale contiene il disegno neutro, senza nomi né associazioni ad account.

I backup personali di allievi e Registro rimangono invariati e non scrivono impostazioni server. Un ripristino personale non invia PATCH agli utenti e non sovrascrive le sigle centrali. Nessuna modifica ai formati di lezioni o tracce.

## Ritorno al codice precedente

La colonna additiva può rimanere: il codice precedente del commit `7ffd6899fac7b5126033eb5b2413f8db613c6521` usa `u.*` in lettura ma il proprio DTO ignora il campo. Torna quindi il precedente marker giallo con logo MR, senza alterare sigle o dati salvati. Non rimuovere la colonna e non convertire gli utenti. Il codice precedente rifiuta un eventuale PATCH con il nuovo campo come richiesta non consentita. Nessun rollback automatico. Il successivo ritorno al nuovo codice ritrova le sigle.

## Verifiche locali

Test mirati con SQLite in memoria e adattatore D1 del repository: nessun database locale esistente aperto o sovrascritto, nessuna query remota. Verificati migrazione su utenti fittizi preesistenti, conservazione degli altri campi, permessi, validazione, rimozione, duplicati, login/profilo, schema assente e lettura del Worker precedente. Il controllo DOM mirato usa il codice reale del profilo e del marker, con UI e Leaflet minimi simulati, senza acquisizione GPS, rendering ripetuto o richieste di rete. La grafica e la rotazione già approvate non vengono ricollaudate qui.

Esito: cinque test server/schema e un controllo DOM mirato superati; sintassi JavaScript e git diff --check positivi. Nessuna suite generale, nuovo rendering o confronto dei filtri. I test server ripetibili sono in tests/gps-user-marker.test.js; il controllo DOM della sessione è in outputs/gps-user-marker-local-2026-11-05/dom-check.cjs fuori dal repository.
