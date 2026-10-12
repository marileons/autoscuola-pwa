# Agenda condivisa: coordinamento locale

## Perimetro

Il calendario conserva esclusivamente programmazione e coordinamento. Nessuna nuova funzione legge o sincronizza documenti, GPS, schede allievi, guide didattiche, esiti degli esami locali, PIN o Registro Ore e Compensi. Il collegamento locale consulta soltanto l'archivio in memoria dell'account corrente; non importa dati e non avvia una lezione.

La correzione già presente dei comandi di stampa giornaliera è conservata. I due generatori di stampa restano quelli esistenti; i nuovi stati sono aggiunti nel controller, senza cambiare paginazione, colori o totali.

## Permessi

- Principale: gestione, pubblicazione, assegnazioni, interruttore e Audit.
- SEGRETERIA: gestione organizzativa delle sedi già consentite dal server.
- ADMIN secondario: gestione esclusivamente nelle sedi assegnate e attive; nessuna assegnazione autonoma, interruttore globale o Audit.
- ISTRUTTORE: lettura e stampa delle sedi assegnate, risposte personali, indisponibilità proprie, SVOLTO/ASSENTE degli appuntamenti che lo coinvolgono; programmi pubblicati esclusivamente personali.
- USER_MANAGER, PASSWORD_CHANGE, utenti bloccati o incoerenti: nessun accesso.

Origin, sessione NORMAL, ambito delle sedi e versioni sono verificati server-side. Le scritture composte utilizzano batch D1 atomici con vincoli di asserzione. Non è previsto alcun invio automatico a servizi esterni.

## Migrazione 0011 e compatibilità

La sola migrazione `0011_shared_calendar_coordination.sql` aggiunge tabelle e indici. Non riscrive dati esistenti, non cambia ID e non ricostruisce tabelle. I vecchi stati vengono mantenuti nel modello storico: PROGRAMMATA/CONFERMATA/SVOLTA/ANNULLATA e CONCLUSO per gli esami sono presentati come stati organizzativi uniformi.

Le risposte sono legate alla revisione organizzativa, distinta dalla versione tecnica. Una riscrittura equivalente non richiede una nuova presa visione. Le revisioni precedenti e le correzioni rimangono nell'Audit. Per gli eventi storici senza revisioni viene mostrato DA LEGGERE; non viene inventata una risposta precedente.

Il Worker precedente continua a leggere le tabelle originarie dopo la migrazione additiva. Non comprende le nuove indisponibilità, risposte o pubblicazioni. Un rollback del solo codice conserva i nuovi dati, ma riattiva i vecchi controlli di programmazione che non considerano le indisponibilità: sospendere operativamente l'Agenda prima di un eventuale rollback. Non effettuare una migrazione inversa o eliminare le nuove tabelle. Dopo scritture con il vecchio Worker, verificare e ripubblicare i programmi prima di ripristinare il coordinamento.

## Programma di domani

Pubblicazione manuale per il giorno successivo in Europe/Rome, senza scadenza automatica alle 20:00. Le fotografie sono versionate e non sovrascritte. Una modifica organizzativa di appuntamenti pubblicati produce una nuova versione nella stessa transazione. Le risposte delle persone il cui programma personale è identico vengono mantenute.

I programmi personali escludono appuntamenti e assegnazioni degli altri istruttori. Un esame condiviso compare per ciascun istruttore coinvolto, con la sua auto e i partecipanti convocati. Le denominazioni storiche che non consentono di riconoscere prudentemente cognome e iniziale devono essere verificate nella programmazione prima di pubblicare; non vengono dedotti nomi dall'archivio allievi.

I PDF sono creati nel browser e riutilizzati per apertura, download e condivisione nativa di un solo file. Il documento HTML stampabile riusa il controller esistente. Il PDF diretto viene disegnato localmente con i caratteri del dispositivo, preservando il testo Unicode, e incorpora immagini ad alta risoluzione. Il documento HTML stampabile mantiene il testo selezionabile e riusa il controller esistente.

## Offline

Solo la cache dell'account corrente, già sincronizzata con ambito e ruolo autorizzati, rimane consultabile e stampabile in sola lettura. Ultima sincronizzazione e possibile obsolescenza sono indicate. Nessuna scrittura o presa visione ha successo offline. Un diniego esplicito del server prevale sulla cache. Le revoche effettuate mentre il dispositivo è scollegato diventano conoscibili al successivo aggiornamento, prima di nuove scritture.

## Ricorrenze e spostamento

Massimo 12 copie settimanali per operazione, con data finale obbligatoria, riepilogo e conferma. Orari mantenuti in Europe/Rome; orari ambigui o inesistenti al cambio dell'ora vengono rifiutati. Ogni copia è autonoma, parte come PROGRAMMATO e senza risposte o stati conclusivi. Un conflitto annulla tutto il batch. I trasferimenti dei veicoli continuano a utilizzare il catalogo e lo storico esistenti.

## Validazione e dispositivi

Solo dati sintetici e SQLite in memoria. La verifica responsive finale riguarda PC, tablet e smartphone 390x844. I pannelli nativi di stampa/condivisione, Safari/PWA iOS e i dispositivi reali richiedono un collaudo manuale dopo una futura distribuzione autorizzata. Nessun test locale equivale a tale collaudo.

Le indisponibilità sono limitate alla sede selezionata. Per ferie su più sedi autorizzate, registrare il periodo in ciascuna sede interessata. ALTRA SEDE blocca la sede indicata senza impedire appuntamenti nelle altre sedi; un ADMIN secondario non può bloccare indirettamente sedi fuori dal proprio ambito.
