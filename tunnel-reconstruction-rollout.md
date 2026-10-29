# Ricostruzione sperimentale delle gallerie — pubblicazione e ripristino

## Riferimento stabile da preservare
- Git: 65ae24de432eb4af621775dc4f26211a8f5b4cdd.
- Worker: 0fa1fa02-62f1-44c2-a379-46d694dfde7b, verificato attivo al 100% prima dell'intervento.
- Configurazione: wrangler.toml, binding e variabili invariati; nessuna migrazione o query D1.

## Dati reali
Estratto OSM 2026-10-28T21:23:06Z: bbox 44.30,8.76,44.54,9.31.
Sono stati risolti tutti i nodi delle 56.316 way stradali ricevute, senza risposta troncata.
Il pacchetto derivato contiene 77.865 nodi di grafo e 183.595 archi direzionali.
Sei collegamenti autostradali diretti verificati fra gli svincoli OSM Genova Aeroporto, Rapallo e Genova Bolzaneto (andata e ritorno).
Sono inclusi anche i raccordi motorway_link collegati al corridoio fino alla rete di superficie.
Sono selezionati i tratti galleria che appartengono al corridoio così delimitato, inclusi i raccordi; 56 catene direzionali, non 56 gallerie fisicamente distinte.
Otto catene con diramazioni interne sono escluse dalla ricostruzione automatica.
Gli altri rifiuti dipendono dai campioni effettivi, dalle alternative, dalla copertura del grafo e dal contesto di sessione.
Licenza, query riproducibile, fonte e attribuzione in tunnel-map-license.txt; timestamp/hash nel pacchetto.

## Criteri prudenziali (non modificano il filtro GPS)
Tre punti reali per lato, precisione <=25 m, sequenza temporale crescente; segmenti locali senza interruzioni interne.
Baseline direzionale >=15 m e >=2 volte la massima precisione dichiarata; coerenza delle direzioni entro45°.
Portali entro max(20 m, precisione del fix); orientamento entro30°; vuoto osservato oltre15 s e non oltre240 s.
La lunghezza deve essere percorribile entro il limite fisico già usato dal GPS (65 m/s), senza attribuire una velocità alla galleria.
Un'unica geometria compatibile e nessuna alternativa nel grafo completo entro il budget prudenziale 65 m/s * durata del vuoto + incertezze.
Turni e accessi non noti sono considerati possibili nella ricerca delle alternative: ciò può impedire una ricostruzione, non provarla.
Raggiungere il bordo dell'estratto o superare5000 nodi di ricerca comporta rifiuto, non successo.
Sessioni, stop, pagina nascosta, eventi freeze/pagehide e ritardi dell'heartbeat >5s invalidano le prove della continuità: non si colma il vuoto.
Nessuna ricostruzione dello storico. Una sospensione non osservabile dal browser resta un limite del collaudo reale; i ritardi monotoni di heartbeat determinano comunque il rifiuto.
Il pacchetto è caricato prima dell'app/GPS, senza richieste di geometria durante la lezione. Le normali immagini mappa restano quelle già esistenti.

## Dati e compatibilità
Proprietà opzionale lesson.tunnelReconstructions, separata da route; ancoraggi verificati alla visualizzazione.
Le distanze, il tachimetro, le soste, gli errori e il report vie continuano a usare soltanto route.
I trasferimenti che omettono GPS continuano a omettere questa proprietà; nessuna modifica del loro formato.
La canonicalizzazione del backup stabile resta byte-per-byte invariata; un hash opzionale aggiuntivo nel manifest verifica l'estensione senza cambiare appDataSha256 o la versione del manifest.
Il codice stabile ignora il nuovo hash, conserva le proprietà opzionali delle guide e legge i backup nel formato corrente.
Dopo un ripristino del Worker stabile le stime non sono mostrate: tornano soltanto segmenti GPS e vuoti, senza cancellare la proprietà o alterare route.
Le geometrie conservate non si mostrano se gli ancoraggi originali non coincidono più.

## Ordine di pubblicazione
Controlli mirati; commit unico dei soli file pertinenti; push normale e hash coincidenti.
Riconfermare versione attiva stabile; un solo wrangler deploy --config wrangler.toml --keep-vars.
Verificare attivazione al100%, binding/variabili identici, smoke test anonimi. Un403/1010 automatico non dimostra un guasto dell'app.

## Ripristino esatto del comportamento stabile (non eseguito automaticamente)
Comando verificato con l'help della CLI installata:
wrangler rollback 0fa1fa02-62f1-44c2-a379-46d694dfde7b --config wrangler.toml --message "Ripristino versione stabile prima della prova gallerie" --yes
Poi: wrangler deployments status --config wrangler.toml; verificare versione stabile al100% e smoke test.
Dopo il rollback riaprire o aggiornare normalmente la PWA: le finestre già aperte possono mantenere il JavaScript sperimentale in memoria fino al ricaricamento. Il service worker esistente inoltra le richieste alla rete; non occorre cancellare cache o reinstallare.
Non fare un altro deploy, git reset, migrazioni o cancellazioni di archivi. Non azionare l'interruttore dell'Agenda.
Ripristino autorizzato dall'utente in caso di problema grave introdotto dal deploy. Per risultati insoddisfacenti su strada attendere la sua richiesta.

## Collaudo reale
AVVIA GPS una volta e FERMA GPS alla fine. Solo dopo la riacquisizione e la conferma di più fix potrà apparire il tratto tratteggiato e la relativa dicitura.
Fuori dal corridoio, con gallerie ravvicinate non separabili, raccordi ambigui, stop o sospensione, può restare il vuoto.
Riaprire la guida salvata e verificare il tratteggio separato. I test sintetici non dimostrano che il percorso reale fosse quello stimato.
Nessuna promessa di continuità del segnale in galleria.

## Inventario cartografico verificato (catene direzionali)

| Catena OSM | Denominazione originale | Way sorgenti | Regola |
|---|---|---|---|
| osm-38566916-271652326 | Galleria OSM 38566916 | 38566916 | Valutabile solo dopo tutte le verifiche |
| osm-23915248-261734332 | Genova Aeroporto | 23915248, 617011477, 617011478 | Valutabile solo dopo tutte le verifiche |
| osm-23915242-80462747 | Galleria Coronata | 23915242 | Valutabile solo dopo tutte le verifiche |
| osm-719998962-38672290 | Galleria Coronata | 719998962 | Valutabile solo dopo tutte le verifiche |
| osm-25268676-42088292 | Galleria Certosa | 25268676 | Valutabile solo dopo tutte le verifiche |
| osm-23915268-38458917 | Galleria Zella | 23915268 | Valutabile solo dopo tutte le verifiche |
| osm-5788257-42079149 | Galleria Maltempo | 5788257 | Valutabile solo dopo tutte le verifiche |
| osm-38571443-45406814 | Galleria Torbella | 38571443 | Valutabile solo dopo tutte le verifiche |
| osm-36872921-38458926 | Galleria Garbo | 36872921 | Valutabile solo dopo tutte le verifiche |
| osm-23915274-38458923 | Galleria Monte Moro | 23915274 | Valutabile solo dopo tutte le verifiche |
| osm-7838574-45399029 | Galleria Rivarolo II | 7838574 | Valutabile solo dopo tutte le verifiche |
| osm-24843093-57597640 | Galleria Rivarolo 3A | 24843093 | Valutabile solo dopo tutte le verifiche |
| osm-24789820-38458938 | Monte Galletto | 24789820 | Valutabile solo dopo tutte le verifiche |
| osm-24843094-269916002 | Galleria Rivarolo 3B | 24843094 | Valutabile solo dopo tutte le verifiche |
| osm-5632001-38670443 | Torbella | 5632001 | Valutabile solo dopo tutte le verifiche |
| osm-82632227-961757905 | Torbella | 82632227 | Valutabile solo dopo tutte le verifiche |
| osm-54939004-691313757 | Galleria Teglia | 54939004 | Valutabile solo dopo tutte le verifiche |
| osm-36843354-428282510 | Galleria Bolzaneto | 36843354 | Valutabile solo dopo tutte le verifiche |
| osm-36918808-429351050 | Galleria OSM 36918808 | 36918808 | Valutabile solo dopo tutte le verifiche |
| osm-36918810-429351052 | Galleria OSM 36918810 | 36918810 | Valutabile solo dopo tutte le verifiche |
| osm-6238835-52136214 | Galleria Colle degli Ometti | 6238835 | Valutabile solo dopo tutte le verifiche |
| osm-23845022-52135377 | Galleria Colle degli Ometti | 23845022 | Valutabile solo dopo tutte le verifiche |
| osm-15604855-155619616 | A12 - Svincolo di Genova Nervi dir. Genova | 15604855 | Valutabile solo dopo tutte le verifiche |
| osm-6239213-38684861 | Galleria Camaldoli | 6239213 | Valutabile solo dopo tutte le verifiche |
| osm-10058924-38684862 | Galleria Camaldoli | 10058924 | Valutabile solo dopo tutte le verifiche |
| osm-6238678-38684866 | Galleria Colle Pianetti | 6238678 | Valutabile solo dopo tutte le verifiche |
| osm-6239298-52140377 | Galleria Apparizione | 6239298 | Valutabile solo dopo tutte le verifiche |
| osm-10059002-38684863 | Galleria Apparizione | 10059002 | Valutabile solo dopo tutte le verifiche |
| osm-19128364-52134296 | Galleria Colle Pianetti | 19128364 | Valutabile solo dopo tutte le verifiche |
| osm-5833107-41860566 | Galleria Monte Sperone | 5833107 | Valutabile solo dopo tutte le verifiche |
| osm-23887630-43471729 | Galleria Monte Sperone | 23887630 | Esclusa: diramazione interna |
| osm-64250197-38903912 | San Pantaleo | 64250197 | Esclusa: diramazione interna |
| osm-10059303-81277723 | Galleria Monte Veilino | 10059303 | Valutabile solo dopo tutte le verifiche |
| osm-10059312-38455742 | Galleria Monte Veilino | 10059312 | Valutabile solo dopo tutte le verifiche |
| osm-5791526-45515990 | Campursone II | 5791526 | Esclusa: diramazione interna |
| osm-459221854-45388214 | Campursone I | 459221854 | Esclusa: diramazione interna |
| osm-10058811-82660046 | Galleria Monte Quezzi | 10058811 | Esclusa: diramazione interna |
| osm-10059207-38455663 | Galleria Monte Quezzi | 10059207 | Valutabile solo dopo tutte le verifiche |
| osm-169146911-45385804 | Galleria OSM 169146911 | 169146911 | Valutabile solo dopo tutte le verifiche |
| osm-459221844-3992530096 | Galleria OSM 459221844 | 459221844 | Valutabile solo dopo tutte le verifiche |
| osm-26439773-258389588 | Galleria Giovanni Maggio | 26439773 | Esclusa: diramazione interna |
| osm-26439802-60134857 | Galleria Giovanni Maggio | 26439802 | Esclusa: diramazione interna |
| osm-427123363-4263588382 | Galleria Casalino | 427123363 | Valutabile solo dopo tutte le verifiche |
| osm-427123364-4263588383 | Galleria Casalino | 427123364 | Valutabile solo dopo tutte le verifiche |
| osm-6239057-49398072 | Monte Moro | 6239057 | Valutabile solo dopo tutte le verifiche |
| osm-23845031-52135345 | Monte Moro | 23845031 | Valutabile solo dopo tutte le verifiche |
| osm-23845043-49398066 | Galleria Costa di Monte Moro | 23845043 | Valutabile solo dopo tutte le verifiche |
| osm-23845054-258388662 | Galleria Costa di Monte Moro | 23845054 | Valutabile solo dopo tutte le verifiche |
| osm-24885446-68856234 | Galleria Monte Giugo / Monte Giugo | 24885446, 692654110 | Valutabile solo dopo tutte le verifiche |
| osm-5649355-258388929 | Galleria OSM 5649355 / Galleria Monte Giugo | 5649355, 366300597 | Valutabile solo dopo tutte le verifiche |
| osm-9219493-42072710 | Monte Castelletti | 9219493 | Valutabile solo dopo tutte le verifiche |
| osm-9219580-68852628 | Monte Castelletti | 9219580 | Valutabile solo dopo tutte le verifiche |
| osm-26373112-288938445 | Galleria Castelletto / Galleria OSM 699007799 | 26373112, 699007799 | Valutabile solo dopo tutte le verifiche |
| osm-26373113-57919746 | Galleria Castelletto | 26373113 | Esclusa: diramazione interna |
| osm-23855366-68855157 | Galleria Sessarego | 23855366 | Valutabile solo dopo tutte le verifiche |
| osm-24885449-270403941 | Galleria Sessarego | 24885449 | Valutabile solo dopo tutte le verifiche |

Il tag tunnel=yes non è una certificazione del percorso; eventuali gallerie mancanti o mal classificate in OSM restano non ricostruite. Nessun dato è stato dedotto dai pixel. Il pacchetto è di circa7,6MB, sotto il limite attuale25MiB per asset; non è stato attivato alcun servizio o piano aggiuntivo.

## Estensione diagnostica locale (non pubblicata)

COPIA DIAGNOSI GPS include stato modulo e pacchetto, formato e impronta tecnica del contenuto,
caricamento fallito con codice fisso, contatori di sessione ed esiti aggregati. Nessun nome di galleria,
coordinata, dato personale o orario assoluto viene aggiunto. Nessun dato diagnostico viene salvato o inviato.
Lo storico riaperto non possiede queste statistiche: indica "non disponibile".

Definizioni:
- rilevate: nuovi `breakBefore` nei punti registrati della sessione;
- escluse iniziali: rilevate senza tre ancoraggi precedenti nella sessione;
- candidate: interruzioni entrate nell'insieme pendente;
- valutate: candidate sottoposte all'unico tentativo già previsto dall'algoritmo;
- accettate, rifiutate ed errori: esiti delle valutazioni;
- in attesa: candidate senza ancora tre punti successivi;
- attese terminate: pendenti abbandonate allo stop della sessione.

Invarianti: candidate = valutate + in attesa + attese terminate;
valutate = accettate + rifiutate + errori. I motivi di rifiuto contano il primo controllo che impedisce
il riconoscimento, non tutte le condizioni contemporaneamente non soddisfatte.
L'assenza di compatibilità portali/direzione include anche l'esclusione delle catene ramificate e il limite
fisico di lunghezza già presente: non attribuisce arbitrariamente un motivo più preciso.

Le eccezioni di elaborazione sono conteggiate per categoria tecnica consentita e continuano a propagarsi
come prima; messaggi e stack originali non vengono copiati. Gli esiti null rimangono null e le ricostruzioni
restano identiche. Frequenza dei tentativi, soglie, filtri, pacchetto e dati salvati sono invariati.
Questo intervento non dichiara risolto il mancato tratteggio reale.

Controlli sintetici direttamente pertinenti confrontano decisioni, geometrie e punti con l'HEAD di partenza
37e497e07a2c0e2708b71093265387934a43088b, senza ripetere prove GPS estranee o accedere alla produzione.
