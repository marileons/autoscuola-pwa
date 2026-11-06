# Guida accompagnata: modifica locale, non pubblicata

## Blocco NUOVA GUIDA e contratto delle etichette

La diagnosi fornita dall’utente contiene 30 voci GA, lunghezza massima 504 e nessun valore non testuale: il contesto della guida rifiutava etichette oltre 500, mentre l’editor permetteva di crearle. MAX_ACTIVITY_LABEL_LENGTH = 1024 unità UTF-16 è ora l’unico limite per contesto, aggiunta/rinomina e testo delle attività nei trasferimenti. Consente una descrizione articolata, copre integralmente le 504 unità rilevate e mantiene un limite esplicito (massimo circa 6 KB JSON con escape per etichetta). Non sono cambiati limiti di numero voci, tipi, versione o campi del contesto, né i limiti complessivi di backup/trasferimento. I testi archiviati non vengono troncati, normalizzati o riscritti in massa. Un valore oltre il limite resta conservato; aggiunta/rinomina lo rifiutano prima della scrittura e mantengono il testo inserito.

Rimossa la diagnostica temporanea NUOVA GUIDA: riquadro, codici visibili, rilevatori e attesa diagnostica. Resta un normale messaggio se l’apertura fallisce. La diagnostica GPS non è modificata.

## Ore e attività GA

Le ore derivano esclusivamente da duration nelle guide salvate con categoria GA, ordinate per data della guida e ID, fino a quella considerata. Si deduplicano soltanto ID uguali. Ore/minuti con unità esplicite sono convertiti esattamente, senza arrotondare; frazioni inferiori alla precisione dei millisecondi non vengono inventate. Mancanze o durate senza unità sono dichiarate non disponibili, senza inferenze da GPS, timer o appuntamenti. Si mostrano range interi (8–9/10), ore/minuti per le frazioni e totali effettivi anche oltre dieci. Le opzioni di durata storiche non presenti nel selettore restano selezionabili e inalterate alla riapertura. Una durata GA assente o non testuale usa un segnaposto: salvare note o attività non inventa una durata. Il valore originario viene mantenuto; una durata con unità viene aggiunta soltanto dopo una scelta esplicita. Il selettore GA conserva anche gli orari con minuti non presenti tra le opzioni orarie standard, evitando di azzerarli alla riapertura.

Le nuove lezioni GA iniziano con le attività non selezionate. Le attività della singola guida sono quelle registrate in lessonActivities; il cumulo usa solo queste fino alla guida selezionata, nel contesto GA. Lo storico senza dettagli non è interpretato come attività di una singola lezione. Se viene modificata esplicitamente una vecchia guida GA, il precedente stato complessivo resta in activityBaseline e activityDetailsIncomplete:true conserva la provenienza incompleta; lessonActivities contiene solo le selezioni esplicite. Questa proprietà facoltativa è conservata in backup e trasferimento. Nessuna riscrittura dello storico alla sola consultazione.

FOGLIO ROSA è nascosto per GA, senza cancellare eventuali valori esistenti; resta nel normale modulo AUTO. AREA RISERVATA cambia soltanto stile, resta ultima mediante l’ordinamento esistente e conserva i permessi originali.

## Passaggio esplicito a una nuova scheda AUTO

Usare PREPARA SCHEDA AUTO nella scheda GA, dopo almeno dieci ore documentate. Si apre il normale modulo AUTO con i dati anagrafici disponibili, la data foglio rosa vuota da compilare e una conferma manuale del compimento dei diciotto anni e della verifica dei requisiti. Il modello non dispone di data di nascita: non si deduce né si certifica l’età, il rilascio di documenti o l’idoneità amministrativa.

La scheda AUTO ha un nuovo ID e zero guide. L’origine mantiene lo stesso ID, dati, stato attivo/archiviato, lezioni e documenti. Non sono copiati documenti, guide, ore o spunte AUTO. Il riepilogo del percorso GA compare separatamente e non alimenta gli indicatori AUTO. Il precedente comando CAMBIO PERCORSO resta una correzione di classificazione della stessa scheda, non questo passaggio formativo: per conservare una scheda GA separata usare il nuovo comando.

accompaniedOrigin è una proprietà locale facoltativa: versione 1, sourceId stabile, linked e summary. Il riepilogo di provenienza conserva solo ore note, numero di durate/dettagli mancanti e attività documentate, non copie di lezioni. Se l’origine è disponibile si mostra il suo stato attuale; altrimenti il riepilogo è chiaramente indicato come fotografia al momento del passaggio e non aggiornato. Disattivare/riattivare il collegamento cambia solo linked, conservando origine e riepilogo; il controllo duplicati considera anche il collegamento disattivato e il cestino.

Si usano autorizzazioni esistenti di modifica degli allievi e il bridge locale con controllo account, concorrenza e transazione dell’archivio. Nessun accesso remoto o nuovo diritto. I profili che non possono operare sulle guide non ricevono il nuovo dettaglio didattico. Bozza nuova GA, lezione attiva o operazioni incompatibili impediscono il passaggio. ANNULLA non scrive. Dopo un errore di scrittura non resta una scheda parziale.

## Conservazione, pubblicazione futura e ritorno

Nessuna modifica allo schema D1 e nessuna migrazione necessaria. I campi facoltativi sono nelle strutture locali già esistenti. Backup/ripristino e condivisione allievo conservano i riferimenti; la copia di entrambi gli allievi tramite importazione multipla rimappa il sourceId. Il trasferimento di una singola guida conserva contesto, attività e indicazione dello storico incompleto, omettendo il GPS come prima; non sostituisce i metadati del percorso del destinatario.

La pubblicazione futura richiede autorizzazione e il consueto backup verificato dell’edizione in uso. I riferimenti degli asset sono aggiornati soltanto per il caricamento dei file modificati. Nessun nuovo binding, variabile, servizio, watcher GPS o polling.

Il codice con limite 500 NON è un ritorno sicuro dopo aver salvato una guida con etichetta da 504 nel contesto: potrebbe rifiutare l’archivio in lettura. Un eventuale ritorno deve mantenere il lettore/validatore compatibile a 1024 e la conservazione dei campi facoltativi, senza rimuovere proprietà o restaurare dati vecchi. I vecchi file restano leggibili dal nuovo codice; per importare i nuovi pacchetti con indicazione dello storico incompleto servono destinatari aggiornati. Nessun rollback automatico è stato eseguito o predisposto sui dati.

## Controlli locali

Eseguiti soltanto casi pertinenti con dati fittizi: 504/1024/1025 e aggiunta/rinomina, guida GA aperta/salvata/riaperta con il testo completo, ore/frazioni/retrodatazione/eliminazione, storico non attribuito, passaggio separato e duplicati, backup/copia e trasferimento. Controllo UI isolato del flusso, annullamento, permessi, errore di scrittura senza modifica parziale, backup completo su archivio vuoto e acquisizioni telefono/tablet. Browser Edge locale; non è una certificazione su Safari/PWA o Chrome Android reali. Nessuna suite GPS o generale, nessun dato reale.
