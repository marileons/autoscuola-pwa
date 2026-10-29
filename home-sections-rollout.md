# Visibilità globale dei percorsi — implementazione locale

## Pubblicazione futura (non eseguita)
1. Verificare commit, perimetro e migrazioni pendenti; conservare versione precedente e backup secondo la procedura di pubblicazione.
2. Applicare **0021_app_home_sections.sql prima del nuovo Worker** sul D1 esistente, verificandone registrazione e struttura. Non applicare migrazioni inattese.
3. Pubblicare codice e asset insieme usando wrangler.toml invariato.
4. Verificare l’endpoint autenticato e fare il collaudo dell’amministratore.

La migrazione crea esclusivamente app_home_sections, senza aggiornare tabelle o record esistenti. Non inserisce configurazioni. Tabella presente senza riga: AUTO/MOTO, versione 0. Prima scelta salvata: versione 1. Le scritture successive usano confronto della versione, rifiutando sovrascritture concorrenti (409).

**Tabella mancante, contenuto non valido o errore D1:** HTTP 503 HOME_SECTIONS_STORAGE_UNAVAILABLE, mai interpretato come configurazione assente. Nessuna creazione automatica dello schema dal Worker.

## Stato e accesso
GET /api/home-sections: sessione normale ADMIN, ISTRUTTORE o SEGRETERIA. POST: solo isPrimaryAdmin sull’utente riletto dall’autenticazione server; controllo origine già presente nel Worker. USER_MANAGER escluso. Nessuna dipendenza dall’interruttore dell’Agenda.

Ogni apertura della Home rilegge la configurazione, senza polling. Nessuna impostazione locale finge di essere globale. Prima lettura non riuscita/offline: nessun percorso abilitato arbitrariamente, funzioni comuni disponibili e comando di aggiornamento. Se esiste una risposta verificata nella stessa sessione, resta visibile con un avviso in caso di errore successivo. Cambio account/logout azzera lo stato in memoria.

La visibilità limita accessi Home, nuove destinazioni dell’allievo, nuove lezioni, cataloghi e sezioni/destinazioni dei documenti. Non costituisce un’autorizzazione ai dati. Consultazione trasversale/gestione generale, elenchi e backup restano sul perimetro preesistente, includendo anche i percorsi nascosti. Sulle schede esistenti il percorso corrente resta selezionabile per non impedire la conservazione della scheda; non è possibile scegliere una nuova destinazione nascosta.

Backup completo e ripristino del dispositivo continuano a contenere tutti i dati locali, senza filtraggio e senza includere/sovrascrivere la configurazione globale sul server. Non cambiano formati o chiavi.

## Collaudo breve del principale
ALTRE FUNZIONI → GESTISCI SEZIONI. Verificare i nove interruttori; cambiare una scelta e usare ANNULLA (nessun salvataggio). Riaprire, abilitare un percorso e SALVA. Aprire/aggiornare la Home di un istruttore: la sezione e i dati preesistenti devono essere nuovamente disponibili. Nascondere non deve cambiare numero o contenuto dei dati nel backup. Gli altri ruoli non devono poter modificare le impostazioni.

## Ritorno al Worker precedente
Lo schema additivo può restare presente. Il Worker precedente ignora la configurazione e torna a mostrare tutti i percorsi: non offre la stessa limitazione di visibilità. Nessun dato locale è stato eliminato o riclassificato. Nessun rollback automatico.

## Verifiche locali eseguite
19 controlli mirati distinti superati: 7 server/schema/autorizzazioni, 10 UI/avvio reale/documenti/backup/resa e 2 titolo-manifest. Le sole prove fallite durante lo sviluppo sono state ripetute dopo le correzioni; nessuna suite completa o prova GPS/simboli.

SQL eseguito su SQLite in memoria tramite tests/shared-calendar-support.js, con dati fittizi e confronto di schema/dati preesistenti, integrity_check e foreign_key_check. Non sono stati aperti o sovrascritti database locali esistenti. Il binding D1 è simulato dalla fixture; nessuna certificazione sul D1 remoto o su Safari/PWA reale.

Browser isolato Chromium, richieste intercettate localmente; resa a 390×844, 820×1180, 1180×820 e avvio dell’app reale con moduli locali. Anteprime con dati fittizi fuori dal repository. Sintassi dei JavaScript coinvolti e git diff --check positivi.

Nome visualizzato: Agenda Istruttori di Guida; short_name: Agenda Guida. Nessuna modifica a start_url, scope, icone, chiavi o discriminanti tecnici dei backup. Manuale PDF esterno non modificato.

## Estensione locale: Home per utente (non pubblicata)

Migrazione successiva verificata disponibile: `0022_app_home_sections_users.sql`.
Crea solo `app_home_sections_users`; non modifica tabelle esistenti né inserisce preferenze.
La tabella globale `app_home_sections` resta il predefinito. Una lista personale (anche vuota)
sostituisce il predefinito senza intersezione. Un valore personale NULL significa assegnazione
rimossa: la revisione viene conservata per impedire a un editor obsoleto di ricrearla (problema ABA).
L'ID utente è chiave esterna con eliminazione a cascata; nome o email non sono mai chiavi.

### Accessi e concorrenza
- GET `/api/home-sections` e POST sullo stesso endpoint restano dedicati al predefinito, compatibili con il flusso precedente.
- GET `/api/home-sections/self` legge esclusivamente la visibilità effettiva dell'account autenticato.
- GET `/api/home-sections/users` e GET/POST `/api/home-sections/users/:id` sono riservati al principale.
- L'elenco restituisce solo ID, nome, ruolo effettivo e stato attivo; utenti disattivati o senza percorsi non possono essere destinatari.
- POST personale: `{enabled:[...],version:N}`; `{enabled:null,version:N}` rimuove la deroga.
- Scritture condizionate da versione e stato/ruolo del destinatario. Conflitto: 409, nessun successo simulato.
- Origine, sessione normale e ruolo principale sono verificati dal Worker esistente. Nessuna autorizzazione ai dati viene ampliata.
- Nessuna preferenza viene persistita nel dispositivo o nel backup personale; stato UI in memoria azzerato al cambio account.

### Collaudo del principale
ALTRE FUNZIONI -> GESTIONE FUNZIONI -> selezionare utente (anche se stesso) -> nove interruttori -> SALVA.
ANNULLA chiude senza salvare. USA IMPOSTAZIONI PREDEFINITE richiede conferma e prepara il ripristino:
serve comunque SALVA. L'opzione IMPOSTAZIONI PREDEFINITE GLOBALI modifica solo chi eredita il predefinito.
L'accesso alla gestione resta visibile al principale anche se nasconde tutti i propri percorsi.
Registro, gestione generale e backup conservano i permessi precedenti.

### Ordine per una futura pubblicazione, non autorizzata da questo intervento
1. Controllare perimetro, versioni attive e migrazioni; effettuare il backup secondo la procedura abituale prima di modificare D1.
2. Applicare esclusivamente 0022 al database esistente prima del nuovo Worker, verificando struttura e dati preesistenti.
3. Pubblicare Worker, markup e asset versionati insieme, senza cambiare binding, variabili o interruttori.
4. Collaudare con account autorizzati su dispositivi reali. Nessuno di questi passi remoti è stato eseguito qui.

Tabella personale mancante o dati invalidi: 503 HOME_SECTIONS_STORAGE_UNAVAILABLE, mai interpretati come assenza di deroga.
Il Worker precedente ignora la nuova tabella e usa solo il predefinito globale; le deroghe restano conservate ma non applicate.
Il ritorno al codice precedente non offre dunque la stessa visibilità individuale. Nessun ripristino automatico.

### Verifiche locali dell'estensione
SQLite `:memory:` della fixture, tutti dati sintetici, nessun database locale persistente aperto/sovrascritto.
Controlli mirati di schema additivo, integrità/FK, ruoli, versioni, configurazioni personali/predefinite,
errori/offline, separazione account e due sessioni; browser isolato con richieste intercettate localmente.
Non sono stati eseguiti test estranei o una suite completa. Le anteprime sono esterne al repository.
