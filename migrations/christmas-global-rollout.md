# Tema natalizio globale — preparazione locale

## Struttura e pubblicazione futura
- Migrazione additiva 0026_global_christmas_theme.sql: aggiunge soltanto christmas_theme (auto/on/off, default auto) ad app_home_sections.
- Tabella, binding DB, controllo del principale, POST /api/home-sections, versionamento e confronto delle revisioni già esistenti sono riutilizzati.
- Applicare 0026 prima del codice, dopo futura autorizzazione e backup verificati. Nessuna applicazione remota è stata eseguita qui.
- Nessuna riga viene riscritta in massa: i percorsi e la versione precedenti restano conservati. Riga assente: Automatico; colonna/tabella assente o dato errato: errore 503, non configurazione assente.
- Senza 0026 anche le letture delle impostazioni Home richiedenti la nuova colonna restituiscono 503: non distribuire prima il codice.

## Uso e aggiornamento
Gestione funzioni > Impostazioni predefinite globali > Tema natalizio > SALVA.
Solo il principale può scrivere, anche sul server. Il tema vale per tutti, comprese le persone con sezioni Home personali.
La risposta di SALVA conferma la scrittura; una modifica al selettore o ANNULLA non cambia il tema applicato.
La lettura iniziale pubblica contiene esclusivamente modalità, versione e disponibilità. Il controllo /api/auth/me già esistente trasporta la scelta durante l’uso (30 secondi) e al ritorno in primo piano/riconnessione. Non è stato aggiunto un intervallo HTTP.
Il cambio di data resta locale, con Europe/Rome e periodo inclusivo 8 dicembre–6 gennaio.

## Offline e compatibilità
La cache agenda-mr-christmas-global-cache-v1 contiene soltanto una configurazione globale verificata dal server.
La vecchia preferenza agenda-mr-christmas-theme-v1 è ignorata, senza cancellarla o importarla.
Un errore o l’assenza di rete non sovrascrive l’ultima scelta globale; al primo utilizzo senza cache né rete si usa provvisoriamente Automatico.
I vecchi client che salvano soltanto le sezioni preservano la colonna del tema.
Il codice precedente può ignorare la nuova colonna: non rimuoverla in caso di ritorno. Tornando al codice precedente, la vecchia gestione per dispositivo del tema torna a funzionare; riusare il codice nuovo per riprendere l’impostazione globale.
Nessuna modifica a backup personali, GPS, dati degli allievi, tariffe o configurazione Cloudflare.

## Verifiche locali
Tre test server/migrazione con SQLite in memoria e dati fittizi.
Una prova con due contesti browser isolati, Worker reale e adattatore D1 su SQLite in memoria: scrittura del principale, ricezione tramite /api/auth/me, rifiuto dell’istruttore, cache offline anche dopo riapertura, riconnessione e salvataggio fallito senza conferma.
Sintassi e git diff --check. Grafica e date precedentemente verificate riutilizzate.
