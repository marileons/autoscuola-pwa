# GA — moduli nominativi e seconda fase AUTO: preparazione locale

Base: auth-users-cloudflare-dev, commit 67f25506554f75d904d1d1baa2499eebb03b8cb3. Solo modifiche locali; nessuna pubblicazione, migrazione, query remota o accesso a dati reali.

## Programma fornito dall’utente

| ID stabile | Codice | Denominazione | Ore |
| --- | --- | --- | --- |
| ga-module-a | A | Uso del veicolo | 1 |
| ga-module-b | B | Comportamento nel traffico | 3 |
| ga-module-c | C | La guida in condizioni di visione notturna | 2 |
| ga-module-d | D | Guida su strade extraurbane | 2 |
| ga-module-e | E | Guida su autostrade o su strade extraurbane | 2 |

Le definizioni provengono dalla tabella esplicita fornita dall’utente; non sono ricavate dalle posizioni numeriche né dalle attività del catalogo personale. Il totale è dieci ore. Non si attribuisce AUTOSTRADA alle posizioni 9/10. Le vere attività autostradali restano nei cataloghi.

Prima del completamento, NUOVA GUIDA usa giorno e ora modificabili e mostra tutti i cinque moduli con progresso salvato A 0/1, B 0/3, C 0/2, D 0/2, E 0/2. Ogni modulo contiene le proprie ore selezionabili. Una guida completa solo le ore assegnate esplicitamente: B 1/3 non blocca B 2 e B 3. Le ore delle altre guide sono spuntate/disabilitate; quelle della guida originale in modifica sono correggibili. Non vengono duplicate le ore. I moduli non generano automaticamente attività didattiche.

## Dati e storico

Nuove assegnazioni: gaProgram versione 2, kind program, hours con oggetti {moduleId,hour}. Le ore sono identità interne del modulo, indipendenti dalle etichette; massimo una/due ore assegnate per guida nel programma. Per una guida nuova la durata deve corrispondere alle ore selezionate. Per una guida storica confermata manualmente si possono attribuire solo ore effettivamente coperte dalla durata certa, senza convertirla.

gaProgram versione 1 con numeri rimane leggibile e conservato, ma NON viene convertito in A–E. Le vecchie assegnazioni appaiono separatamente come precedenti/da confermare, con durata, ID e collegamenti originali. Non completano automaticamente i moduli nominativi, neppure se il vecchio conteggio raggiungeva dieci. La sola apertura non scrive. Aprendo la guida originale l’utente può confermare esplicitamente modulo e ore reali; senza tale azione il dato precedente resta invariato. Le guide senza dettagli mantengono le informazioni disponibili e non ricevono attività inventate.

Il riepilogo deriva dalle guide salvate, con progressi indipendenti per modulo e conflitti per singola ora. I duplicati non moltiplicano il progresso e i conflitti impediscono di dichiarare il completamento. Modifica, eliminazione e retrodatazione ricalcolano il riepilogo. Il riepilogo fino alla guida selezionata non usa guide successive.

## Seconda fase: nuove guide con catalogo AUTO

Solo dopo il completamento di tutti i moduli nominativi, le nuove guide GA usano gli stessi componenti AUTO: catalogo AUTO corrente, ricerca, stati, CHECK LIST, selettori orari e durate, GPS, errori e note. Nessuna scelta dei moduli e nessun limite di numero aggiunto. L’allievo resta GA fino all’eventuale creazione manuale AUTO.

Il contesto salvato delle nuove aggiuntive è category guida-accompagnata, activityType auto, con fotografia del catalogo AUTO. Non vengono trascinate voci del solo catalogo GA. Le guide precedenti mantengono il proprio contesto, anche se usavano il catalogo GA; non vengono riclassificate. Le nuove bozze GA conservano il contesto nella firma. Per le vecchie bozze senza contesto si preserva il catalogo GA della fotografia salvata, anziché convertirlo automaticamente in AUTO.

Le sottovoci AUTO della CHECK LIST effettivamente svolte sono conservate nelle evidenze GA anche quando il genitore non ha uno stato selezionato. Si mostra il progresso reale, per esempio 1/8, senza dichiarare completate le altre sottovoci. Gli stati, le località e le tratte delle attività restano dati espliciti; nessuna localizzazione automatica.

## Trasferimenti e passaggio AUTO

Scheda completa e singola guida riusano i flussi esistenti e i relativi controlli di autorità, ID, checksum e revisioni. Conservano nuove assegnazioni e precedenti dati, attività/stati, località/tratte, note e istruttore originale. Il trasferimento che omette il GPS continua a ometterlo. La ripetizione della stessa importazione non crea copie o ore doppie; versioni discordanti restano da verificare, senza sovrascritture arbitrarie. Il destinatario lavora sulla propria copia locale, senza dipendere dall’account del mittente.

Il passaggio manuale AUTO resta disponibile dopo il completamento, con foglio rosa facoltativo e fonte GA conservata. Nessuna guida o ora AUTO viene creata duplicando le guide GA. Il percorso AUTO mostra anche le attività delle aggiuntive, con stati, località/tratte, istruttore e provenienza GA.

Le nuove fotografie accompaniedOrigin sono versione 3, con identità delle ore dei moduli. Il lettore conserva anche versioni 1 e 2. Se la fonte GA è locale si usano le sue evidenze aggiornate; altrimenti la fotografia è dichiarata come non aggiornata e non richiede accesso all’account originario. Per tutti i dati originali, inclusi note, errori e documenti, trasferire la scheda GA completa: la fotografia non è una copia integrale delle guide.

Backup e ripristino conservano versioni e dati facoltativi tramite i validatori condivisi. Non servono schema D1, migrazione, nuovi binding, variabili, servizi o richieste di rete. I destinatari dei nuovi trasferimenti devono avere lettori aggiornati. Non è garantita unicità globale tra account indipendenti che non si scambiano i dati.

## Compatibilità di ritorno

Dopo un futuro uso dei nuovi dati, il commit 67f2550 non è un ritorno sicuro senza mantenere lettori di gaProgram v2, accompaniedOrigin v3, evidenze CHECK LIST e contesto delle bozze. Non cancellare o convertire metadati per forzare il ritorno. Conservare anche il limite attività 1024. Non è stato eseguito alcun rollback.

## Controllo mirato di questa revisione

Eseguito un solo flusso integrato con dati fittizi e API intercettate in browser locale: A1, B1 parziale e residui B2/B3, C/D/E fino al completamento; ore già salvate disabilitate e guida originale correggibile; fase aggiuntiva con catalogo AUTO completo e CHECK LIST parziale; singola guida importata ripetutamente senza doppioni; passaggio AUTO con evidenze; backup e ripristino; scheda storica numerica rimasta identica e non convertita. Nessuna nuova anteprima, rendering o suite generale. Le aspettative dei due file di test interessati sono state aggiornate ai nuovi identificativi; non sono state eseguite ulteriori suite. Sintassi e git diff --check finali. Il collaudo sui dispositivi reali resta da effettuare dopo una futura pubblicazione autorizzata.

File: app.js, auth-client.js, ga-course.js, index.html, lesson-activities.js, lesson-drafts.js, mr-command-look.css, tests/ga-course-program.test.js, tests/guida-accompagnata.test.js e questo documento. Nessuna modifica a configurazione, GPS, Registro o NOTE ESAME.
