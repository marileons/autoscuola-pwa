# Sigle operative e disponibilità - procedura locale e futura pubblicazione

## Modello

`calendar_vehicles.operational_code` è l'unico nuovo dato del mezzo: nullable, massimo 12 lettere A-Z, numeri o trattini, normalizzato in maiuscolo e senza spazi alle estremità. Stringa vuota/NULL disattiva la sigla; più mezzi possono condividerla. Nessuna assegnazione automatica e nessun catalogo fisico duplicato. Categoria, cambio, targa, sigla del partecipante e sigla operativa restano separati.

`calendar_event_operational_resources` conserva fotografie per unità richiesta: chiave organizzativa, sigla, tipo e identificatore del mezzo fisico quando scelto. La sola sigla riserva capacità del gruppo senza assegnare automaticamente una targa. I veicoli fisici occupano una sola unità, anche se presenti nelle associazioni di istruttori e partecipanti. Una guida moto doppia espone una selezione operativa per ciascun allievo.

Un mezzo privo di sigla resta utilizzabile nei flussi storici con assegnazione fisica e controlli di conflitto; non diventa automaticamente un gruppo di disponibilità. Per le prenotazioni senza mezzo specifico, quando il parco della sede è configurato, occorre scegliere esplicitamente una sigla operativa. Le sigle degli eventi precedenti non vengono dedotte da modelli, targhe o sigle dei partecipanti.

## Calcolo e transazione

Disponibilità per sede e intervallo completo: veicoli effettivamente presenti, stati, indisponibilità, trasferimenti e rientri, impegni non annullati e richieste senza mezzo fisico. Il calcolo considera tutti i confini temporali dell'intervallo: inizio/fine appuntamenti, indisponibilità e movimenti. Gli impegni consecutivi non vengono sommati come se fossero contemporanei.

Le unità fisiche già impegnate sono sottratte una sola volta; le richieste anonime consumano la capacità residua della stessa sigla/tipo. Un controllo SQL nella medesima transazione dei dati e delle associazioni blocca il superamento anche in caso di concorrenza. Ripetizioni e copie restano atomiche: l'errore annulla l'intero batch. Le richieste del client non determinano i conteggi autorevoli.

La schermata mostra il minimo numero disponibile nell'intervallo scelto. Il dettaglio dei mezzi non contiene dati degli allievi. Una prenotazione per sola sigla non significa che sia stata scelta una specifica moto: il dettaglio distingue la quota di capacità riservata dai mezzi fisicamente occupati.

Il riepilogo di stampa riporta il picco contemporaneo delle richieste fotografate. Nessuna ricostruzione retroattiva dei vecchi eventi. Gli annullati sono esclusi. I conflitti di un salvataggio respinto non creano record da stampare e non vengono presentati come appuntamenti risolti realmente avvenuti.

## Permessi

Principale e Segreteria centrale: sigle dell'intero parco, mantenendo gli altri limiti del centrale. ADMIN secondario: sigle dei mezzi nelle proprie sedi attive. Segreteria ordinaria: lettura/utilizzo nel proprio perimetro; modifica della sigla negata, nessun parco globale. Istruttore: consultazione e stampa nelle sedi assegnate. Profili non autorizzati e sessioni di solo cambio password: negati. La cache offline indica l'ultimo dato sincronizzato e non abilita scritture.

## Migrazione e futuro rilascio

Preparata esclusivamente `migrations/0013_vehicle_operational_codes.sql`. Aggiunge colonna nullable, tabella delle fotografie, indice e guardia transazionale. Non rimappa dati esistenti; non assegna sigle. Nessuna esecuzione remota autorizzata in questo intervento.

In una futura pubblicazione separatamente autorizzata: backup verificato; applicazione unica della sola 0013; confronto dei record precedenti/integrità/chiavi esterne; deploy del codice compatibile. Compilazione delle sigle solo esplicita, mediante i profili autorizzati, dopo il rilascio. Non compilare le sigle con SQL automatico.

Il Worker precedente è compatibile in lettura con lo schema additivo. Un rollback del solo codice IGNORA le nuove prenotazioni di capacità e le nuove sigle: prima di un eventuale rollback bloccare tutte le scritture organizzative, anche del principale, e mantenere la sola consultazione. Non eliminare le nuove tabelle e non ricostruire i dati precedenti. Nessun rollback automatico.

## Dettatura NOTE

Il controller è limitato a `lessonNotes`, usa testo definitivo e provvisorio separati e non registra file audio. Aggiorna la bozza tramite il flusso esistente. La ripresa dopo silenzio richiede intenzione attiva, stessa lezione/account, pagina visibile e nessuna interruzione di sicurezza. Gli errori recuperabili hanno riprese limitate; permesso negato, microfono mancante e servizio non disponibile arrestano il ciclo.

STOP, salvataggio, uscita, cambio account, logout, pagina nascosta e perdita del focus della finestra interrompono l'ascolto e richiedono un nuovo tocco. Nessuna ripresa nascosta al ritorno. GPS, cronometro e attività didattiche non sono controllati dal modulo vocale.

Chrome/Edge Android, Samsung Internet e Safari/iPhone/PWA dipendono dalle API effettivamente disponibili. Il servizio del browser o del sistema può elaborare audio; l'app non implementa upload di audio né conservazione di registrazioni. Non è garantita continuità in background o durante telefonate. Se il servizio non è disponibile, il testo resta modificabile e si può usare la dettatura della tastiera.

## Eventi precedenti non classificati

Un vecchio appuntamento senza mezzo fisico e senza fotografia operativa non riceve una sigla dedotta. Finché un operatore non lo completa esplicitamente, il calcolo sottrae prudenzialmente la domanda non classificata ai gruppi compatibili della sede; il quadro lo segnala senza memorizzare associazioni inventate. Le modifiche ai soli metadati restano possibili e non generano fotografie retroattive. La cache contiene al massimo le ultime 96 fasce e viene filtrata immediatamente alla revoca delle sedi o dell’accesso.
