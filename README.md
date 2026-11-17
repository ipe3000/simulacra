# Simulacra

Prototipo desktop di Simulacra, gioco di Matteo Perlini. Il menu permette di giocare in due sullo stesso dispositivo, affrontare il computer oppure osservare due computer.

In Giocatore vs Computer scegli il tuo Arcimago e la difficoltà dell’avversario. In Computer vs Computer puoi assegnare una difficoltà a ogni Arcimago, mettere in pausa la partita, avanzare di una decisione e regolare la velocità. I tre livelli usano la propria mano, le informazioni pubbliche e le carte rivelate dagli effetti di gioco. Il livello Facile varia di più le sue scelte, il Normale valuta anche Condizioni ed esposizione, il Difficile valuta anche attacchi dopo un movimento e possibili risposte avversarie.

Il prototipo usa la configurazione illustrata nel regolamento 5.1 e il catalogo di 70 carte, oltre a Colpo Arcano. Ogni Arcimago pesca sei carte da un grimorio casuale di 30 carte, composto da 4 Reazioni, 8 Attacchi e 18 Utilità. Il catalogo è in catalogo-carte.json. Ricaricare la pagina avvia una nuova partita.

Per avviare in locale, eseguire `python -m http.server 8000` e aprire `http://localhost:8000/`.

Le animazioni evidenziano chi lancia un incantesimo, il bersaglio e le finestre di Reazione. Danni e Condizioni compaiono sulla plancia; il movimento segue il percorso casella per casella anche nelle partite locali. Il menu Animazioni regola il ritmo e permette di ridurre il movimento, rispettando inizialmente la preferenza del sistema.

L’annuncio distingue il lancio dall’esito effettivo. Il pannello indica separatamente il Simulacro di turno e chi deve decidere; i pulsanti dei Simulacri aprono le spiegazioni delle Condizioni e della loro durata. Le carte indisponibili restano consultabili con il motivo del vincolo. Il collegamento «Ultimo turno e cronologia» apre il riepilogo avversario e lo storico delle azioni, con testi delle carte giocate, Reazioni e conseguenze. La cronologia non conserva le identità delle carte ancora nascoste.

Per eseguire i test con Node.js, usare `node --test tests/*.test.mjs`. La suite verifica i casi di regressione e simula partite complete con semi riproducibili per tutte e tre le difficoltà.
