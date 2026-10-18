# Esami centrali e tipo di prova - verifica locale

## Modello
La designazione centrale esplicita abilita gli ESAMI nelle sedi attive; `writeSites` delle GUIDE resta invariato. Entrambi i siti, origine e destinazione, sono controllati. Le guardie della transazione ricontrollano account, versione di sessione, designazione, stato sede e assegnazioni. Non sono ammesse conversioni GUIDA/ESAME.

`exam_purpose` usa `conseguimento`, `esame-revisione`, `esame-esperimento`: gli ultimi due identificativi sono quelli delle sezioni locali preesistenti. Qui classificano una prova ESAME, senza creare lezioni o collegare allievi per nome. AUTO/MOTO e categoria restano distinti. I record storici mantengono NULL; un salvataggio precedente senza il campo ne conserva il valore. Nessuna funzione dell'archivio locale è modificata.

## Migrazione 0015
Due colonne nullable: `calendar_events.exam_purpose` e `calendar_program_publications.exam_only`. La seconda separa i programmi esterni SOLO ESAMI dai programmi completi della sede; entrambi mantengono la propria versione corrente. Nessun UPDATE/DROP/DELETE e nessuna assegnazione automatica dello storico. Verificata solo su SQLite con dati fittizi. Non applicata da remoto.

## Compatibilità e rollback
Le colonne additive non impediscono la lettura del database al Worker precedente. Gli UPDATE precedenti su calendar_events non nominano la nuova colonna e quindi non la cancellano. Tuttavia il vecchio Worker non gestisce il nuovo tipo di prova, rifiuta il relativo campo nei payload ed è ignaro del perimetro exam_only: può rigenerare un programma SOLO ESAMI come programma completo. Un rollback applicativo non è quindi una strategia operativa trasparente dopo l'uso dei nuovi programmi: sospendere le scritture/pubblicazioni o fornire un Worker compatibile, e riallineare gli asset. Non rimuovere colonne o convertire record automaticamente. Nessun rollback, deploy o accesso remoto è stato eseguito.
