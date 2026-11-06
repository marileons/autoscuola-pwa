# Guida accompagnata: programma esplicito e provenienza AUTO — revisione locale

## Stato e perimetro

Implementazione solo locale sul branch auth-users-cloudflare-dev, base 89fc310153e4a26bbc5fc85c5a1652727b3d6323. Nessuna migrazione, modifica di configurazione, accesso remoto, commit, push o deploy. Il limite attività 1024 già pubblicato e la rimozione della diagnostica temporanea NUOVA GUIDA restano conservati. GPS, Registro, NOTE ESAME e altri percorsi non cambiano.

File coinvolti: app.js, auth-client.js, index.html, ga-course.js (nuovo modello), lesson-activities.js, lesson-drafts.js, lesson-secretary-transfer.js, student-multi-import.js, full-backup.js, mr-command-look.css, worker.js (soltanto disponibilità autenticata del modulo ga-course.js agli stessi profili degli altri validatori), tests/ga-course-program.test.js (nuovo), tests/guida-accompagnata.test.js (solo aspettative cambiate), questo documento.

## Ore del programma e storico

Proprietà facoltativa di ciascuna guida: gaProgram = {version:1,kind:'program'|'additional',hours:[...]}. Il programma ammette una o due ore consecutive, ciascuna da 1 a 10 e corrispondente a sessanta minuti. Una guida da due ore assegna due ore; non viene sdoppiata in due lezioni. Le ore 9 e 10 sono indicate AUTOSTRADA secondo il requisito dell'utente. Non sono inventati i nomi dei moduli 1–8: il repository non conteneva una tabella numerata dei moduli.

La nuova guida GA ha data e ora da compilare manualmente e durata di una o due ore intere. Gli altri percorsi mantengono i propri selettori. Le assegnazioni delle altre guide non sono selezionabili; modificando una guida originale le sue ore tornano correggibili. Il riepilogo è derivato ogni volta dalle guide salvate, senza un secondo archivio di contatori. Le ripetizioni della stessa ora in guide diverse sono segnalate: il numero univoco delle ore non si moltiplica, il completamento è sospeso e CREA SCHEDA AUTO resta indisponibile finché il conflitto non è risolto. Una durata incompatibile con l'assegnazione è ugualmente da verificare. Eliminazioni e retrodatazioni non producono assegnazioni nuove.

Lo storico privo di gaProgram resta senza assegnazioni, anche se la somma delle durate raggiunge dieci. Un utente autorizzato deve aprire la guida, verificare e confermare manualmente la classificazione. La sola consultazione non scrive. Una durata storica assente, numerica o frazionaria viene mantenuta; selezionare caselle non la converte. Per attribuire ore del programma serve una durata esatta corrispondente. Eventuali correzioni di durata restano operazioni esplicite dell'utente, mai deduzioni da GPS o timer. Una guida storica con durata diversa può essere classificata esplicitamente come aggiuntiva mantenendone la durata.

Dopo 10/10 NUOVA GUIDA resta disponibile e propone una guida aggiuntiva: durata, attività, località/tratte, errori e note seguono il normale salvataggio. Le aggiuntive hanno hours vuoto e non creano moduli 11/10 o successivi. La durata effettiva complessiva e quella aggiuntiva restano visibili distintamente dalle ore del programma.

## Attività e percorso

Si riusano catalogo locale, ricerca, gruppi e stati didattici esistenti. gaDetails = {version:1,place?,from?,to?} è facoltativo in ciascuna attività, con massimo 200 caratteri di testo semplice per campo. Nessuna geocodifica, coordinata dedotta o richiesta di rete. La voce può essere ripetuta nella stessa guida con un nuovo ID di occorrenza, per registrare tratte diverse. Cambiare località non svolge automaticamente l'attività. Una nuova guida non eredita i luoghi o le tratte della precedente.

Le guide salvate mostrano i propri dati, senza duplicare il riepilogo cumulativo in ogni scheda. La scheda GA contiene un unico percorso complessivo espandibile con ore e attività documentate; la guida selezionata ha il proprio riepilogo salvato fino a quella guida, senza usare quelle successive. Stati diversi della stessa attività in più guide restano riconoscibili, senza promuoverli automaticamente al verde. Nessuna attività è attribuita allo storico senza dettagli; activityDetailsIncomplete e baseline già esistenti restano preservati.

## Passaggio manuale ad AUTO

Serve il completamento delle dieci ore assegnate, senza conflitti, e la conferma manuale dei requisiti. Nessuna creazione per età o tempo trascorso. Il modello non dispone della data di nascita: la verifica dei diciotto anni rimane manuale. Il foglio rosa AUTO è facoltativo, vuoto all'apertura; non è condizione per creare la scheda. Rimangono i controlli ordinari dei dati se il campo viene compilato.

La scheda AUTO ha un nuovo ID e nessuna guida AUTO copiata. La fonte GA rimane intatta. Il percorso didattico AUTO mostra anche le evidenze GA, comprese le guide aggiuntive, con stato originale, data, istruttore, località/tratta e dicitura PROVENIENZA GA. Non basta un elenco separato delle vecchie guide. Non vengono create spunte AUTO né equivalenze arbitrarie tra attività di cataloghi differenti. Nel riepilogo della singola guida AUTO restano escluse le evidenze GA successive alla sua data; la fonte GA locale permette sempre di consultare l'intero percorso attuale.

accompaniedOrigin versione 2 conserva lo stesso collegamento reversibile e una fotografia di evidenze e avanzamento del programma. Il lettore accetta anche la versione 1. Se la fonte GA è locale, si usano le sue guide aggiornate; altrimenti le evidenze sono esplicitamente dichiarate come fotografia al passaggio, senza aggiornamento automatico e senza bisogno dell'account di origine. Per avere tutto lo storico originale, inclusi documenti, note ed errori, trasferire anche la scheda GA completa: la fotografia non è una seconda copia delle guide.

## Trasferimenti, deduplicazione e backup

Scheda completa e singola guida conservano assegnazioni, durata originale, attività e stati, località/tratte, note, errori e istruttore originale nei rispettivi formati. Il trasferimento della singola guida continua a omettere GPS e ricostruzioni, senza introdurre nuove coordinate. Si riusano checksum, revisioni, autorità e scritture compensate esistenti. Il destinatario autorizzato può proseguire sulla propria scheda GA locale e creare AUTO senza accedere al mittente.

Le importazioni complete GA mantengono gli ID e uniscono le guide identiche senza cancellare quelle già presenti. L'abbinamento usa ID di scheda, ID di guida e provenienza di trasferimento, anche quando la prima guida è stata abbinata esplicitamente a un ID di scheda locale diverso. Non si abbinano schede per il solo nome. Non è proposta la creazione accidentale di una copia GA. Identità presenti in più schede o versioni discordanti richiedono verifica: nessuna sovrascrittura automatica; usare il flusso di revisione/conflitto della singola guida. I dati GPS già locali sono conservati quando la copia ricevuta li omette; due tracce originali diverse non vengono unite o sostituite automaticamente.

Non è possibile garantire unicità globale di una scheda AUTO tra account indipendenti senza sincronizzazione: i controlli proteggono gli ID e i collegamenti conosciuti localmente, compreso il cestino per il passaggio ad AUTO. Nessun nuovo servizio è introdotto per aggirare questo limite.

Bozze e firme comprendono le scelte GA. Backup completo, ripristino e condivisione allievo conservano i campi facoltativi; la verifica canonica controlla anche gaProgram e gaDetails. Il ripristino di backup personali non tocca utenti o impostazioni server.

## Compatibilità e ritorno

Nessuna modifica di schema o migrazione necessaria. I vecchi archivi restano leggibili, senza riscritture di massa e senza assegnazioni inventate. I destinatari dei nuovi trasferimenti devono avere lettori compatibili. Il codice base 89fc310 non è un ripristino sicuro dopo l'uso di accompaniedOrigin versione 2: potrebbe rifiutarlo; altri vecchi normalizzatori potrebbero perdere metadati nuovi nei trasferimenti. Un eventuale ritorno richiede mantenere i validatori/lettori compatibili, la conservazione dei campi GA e il limite etichette 1024; non cancellare campi, convertire lo storico o ripristinare dati vecchi. Non è stato eseguito alcun rollback.

## Controlli eseguiti

Solo dati fittizi e browser locale Edge con API simulate e risorse esterne bloccate/intercettate. Controlli del modello: assegnazioni e confini, conflitti, storico e cutoff, guide aggiuntive, evidenze/stati e passaggio AUTO, bozze e firma, singola guida e importazioni complete nei due ordini, destinatario con ID locale diverso, lettura versione 1, protezione dell'asset e preservazione della traccia locale in unione. Tre controlli precedenti sono stati aggiornati per il contratto nuovo; non sono stati ripetuti quelli invariati.

Flusso reale: nuova GA con data/ora vuote, 9–10 salvate e riaperte, due occorrenze con tratte diverse, aggiuntiva con nota ed errore, creazione AUTO con foglio rosa vuoto e fonte invariata, evidenze aggiuntive nel percorso, backup/ripristino su archivio fittizio vuoto. Controllo separato solo del caso storico con durata un'ora e mezza e della rimozione dei controlli GA tornando ad AUTO. Quattro acquisizioni telefono/tablet nella singola anteprima integrata fuori dal repository. Sintassi e git diff --check finali. Nessun collaudo su Safari/PWA o Android reali, nessuna suite generale o test GPS/Registro/sedi.
