# Segreteria centrale: transizione obbligatoria prima della pubblicazione

La 0012 non designa né assegna utenti: tutte le nuove tabelle sono vuote. L'account reale e la sede devono essere identificati esplicitamente dall'amministratore principale; non usare nomi o username per deduzioni automatiche. Non è stata eseguita alcuna operazione remota durante lo sviluppo.

## Ordine obbligatorio della futura procedura autorizzata

1. Backup completo D1, conservato fuori dal repository; verifica ricostruzione, SHA-256, integrity_check e foreign_key_check.
2. Verifica che solo la 0012 sia pendente e applicala una sola volta. Confronta schemi, conteggi e tutti i dati precedenti; solo la registrazione della migrazione può cambiare. La designazione deve essere vuota.
3. Assegna **parametricamente** l'account Segreteria identificato alla sede identificata come Zena. Verifica account attivo/coerente, sede attiva, principale unico/attivo. Nessuna assegnazione viene incorporata nella migrazione.
4. Designa **parametricamente** lo stesso account come Segreteria centrale; controlla la versione attesa del singleton e registra l'operazione nell'Audit.
5. Verifica con un controllo esplicito entrambe le operazioni: assegnazione alla sede e designazione dello stesso account. Deve risultare `transition_ready=1`. Non basta il successo del processo CLI.
6. **Solo dopo** questi controlli distribuisci il commit applicativo, mantenendo binding e flag invariati.

Se assegnazione, designazione o verifica falliscono: arresto senza deploy, senza retry automatico, senza rollback automatico. Conservare il backup. Non procedere se il principale, l'account o la sede non sono identificati in modo univoco.

Il Worker precedente non ammette SEGRETERIA nell'endpoint assegnazioni e non possiede l'endpoint designazione. Perciò i passi 3–5 precedenti al deploy richiedono un intervento D1 amministrativo separatamente autorizzato, usando gli SQL parametrici preparati da `shared-calendar-central-secretary-transition.cjs`. Lo script **prepara soltanto file locali**, non esegue operazioni remote. Richiede gli identificatori espliciti `--secretary-id`, `--site-id`, `--principal-id`, la versione attesa `--expected-version` e una cartella esterna `--output-dir`; non sovrascrive file già esistenti. Eseguire successivamente nell'ordine assignment.sql, designation.sql e verification.sql attraverso gli strumenti D1 autorizzati. Non usare la cartella degli asset come destinazione.

I passi 3 e 4 sono separati nella procedura pre-deploy: se il secondo fallisce l'assegnazione può essere già presente. Non correggere implicitamente: interrompere e verificare prima di un nuovo intervento autorizzato. Dopo il deploy le operazioni di designazione/sostituzione/revoca sono atomiche, versionate e riservate al principale attraverso l'interfaccia Agenda. Le assegnazioni sono indipendenti dalla designazione.

## Permessi

- Segreteria ordinaria: solo sedi esplicitamente assegnate e attive; nessun accesso Agenda se nessuna sede è assegnata.
- Segreteria centrale: consultazione e stampa di tutte le sedi attive; gestione aziendale dei veicoli, stati e trasferimenti. Modifica completa degli appuntamenti solo nelle sedi assegnate. Negli esami esterni è ammessa soltanto la componente veicolo tramite endpoint dedicato con campi ammessi espliciti.
- Nessun potere sugli utenti, ruoli, password, assegnazioni, interruttore globale o Audit riservato. L'Audit non contiene segreti o dati locali didattici.
- ADMIN secondario e ISTRUTTORE conservano i rispettivi ambiti; il principale conserva tutti i poteri.

## Compatibilità e rollback

Nessuna tabella, riga o ID precedente è riscritto dalla migrazione. I trasferimenti temporanei/versionati sono in una tabella dedicata; gli annullamenti espliciti dei trasferimenti legacy hanno una tabella laterale. Lo storico originale resta leggibile. Gli esami storici senza tipo non sono rimappati: possono gestire solo l'elenco veicoli, senza dedurre AUTO/MOTO.

Il Worker precedente continua a leggere lo schema originario, ma **ignora** designazione, trasferimenti temporanei/rientri e revoche legacy. Inoltre ripristina il precedente accesso globale delle Segreterie ordinarie. Quindi un rollback applicativo non è una garanzia di conservare i nuovi vincoli: prima di attivarlo bisogna sospendere le scritture e verificare l'assenza di trasferimenti o revoche attivi incompatibili, oppure predisporre un rollback correttivo che mantenga i controlli. Non eliminare la 0012 o i dati nuovi e non rimappare automaticamente lo storico.

Il primo deploy va eseguito con la transizione completata. Nessun account reale della Segreteria è stato ora assegnato o designato.
