# Simulacra

Prototipo desktop di Simulacra, gioco di Matteo Perlini. Il menu permette di giocare online contro un altro giocatore, affrontare il computer oppure osservare due computer.

È disponibile anche **Giocatore vs Giocatore online**: crea un invito, copia il link e invialo all’altro giocatore. L’amico apre il link e preme «Entra nella partita». Il creatore è Rosso e l’invitato è Blu; ciascuno vede la propria mano, oltre alle carte che gli effetti permettono di rivelare. Non servono account o servizi a pagamento. Il collegamento segue il modello di Strategic Wizardry: servizio pubblico PeerJS, dati WebRTC e STUN, senza TURN. Alcune reti possono impedire il collegamento; in quel caso provare un’altra rete. La disponibilità del servizio pubblico non è garantita.

Chi invita conserva il motore completo e deve tenere aperta la partita. Le mosse vengono controllate e salvate in IndexedDB prima della conferma. L’invitato riceve soltanto la propria vista, non lo stato completo o il seme dei mazzi. L’ospitante può tecnicamente ispezionare tutte le carte nel proprio browser: questa modalità è pensata per partite tra amici. Le finestre di Reazione dipendono dagli eventi pubblici anche quando non si possiedono carte utilizzabili; in quel caso basta passare. In questa prima versione online le azioni non attendono animazioni.

Per riprendere dopo un ricaricamento, aprire «Giocatore vs Giocatore online» e scegliere il proprio posto nelle partite salvate. «Ricollega» ristabilisce il collegamento. Non ci sono sconfitte automatiche o timer di turno. Esportare un **backup personale** per recuperare il posto in un altro browser: contiene credenziali e non va condiviso come invito. Il backup dell’ospitante contiene anche l’intera partita privata. Senza i dati del browser o un backup, il recupero non è garantito; non esiste archivio centrale. Entrambi devono usare la stessa versione del gioco. Un backup precedente o divergente non sostituisce una cronologia locale più avanzata.

La libreria PeerJS 1.5.5 è inclusa in `vendor/` con licenza MIT. Per verificare il collegamento reale con due contesti Chrome isolati e il servizio pubblico: `node scripts/check-online.cjs`. Lo script richiede Playwright (impostare `PLAYWRIGHT_PATH` se non installato nel progetto), Chrome e accesso alla rete. `SIMULACRA_URL` permette di ripetere la verifica sul sito pubblicato. Due browser sullo stesso PC non dimostrano il funzionamento tra reti differenti.

In Giocatore vs Computer scegli il tuo Arcimago e la difficoltà dell’avversario. In Computer vs Computer puoi assegnare una difficoltà a ogni Arcimago, mettere in pausa la partita, avanzare di una decisione e regolare la velocità. I tre livelli usano la propria mano, le informazioni pubbliche e le carte rivelate dagli effetti di gioco. Il livello Facile varia di più le sue scelte, il Normale valuta anche Condizioni ed esposizione, il Difficile valuta anche attacchi dopo un movimento e possibili risposte avversarie.

Il prototipo usa la configurazione illustrata nel regolamento 5.1 e il catalogo di 70 carte, oltre a Colpo Arcano. Ogni Arcimago pesca sei carte da un grimorio casuale di 30 carte, composto da 4 Reazioni, 8 Attacchi e 18 Utilità. Il catalogo è in catalogo-carte.json. Ricaricare la pagina avvia una nuova partita.

Nel turno in cui rinasce, prima di compiere azioni, il Simulacro può scegliere di rinunciare agli Attacchi per ottenere PM aggiuntivi pari al proprio Movimento base: 4 per Terra, 5 per Fulmine. Il bonus si somma agli altri modificatori e termina con il turno. Anche i computer valutano questa scelta.

Per avviare in locale, eseguire `python -m http.server 8000` e aprire `http://localhost:8000/`.

Le animazioni evidenziano chi lancia un incantesimo, il bersaglio e le finestre di Reazione. Danni e Condizioni compaiono sulla plancia; il movimento segue il percorso casella per casella anche nelle partite locali. Il menu Animazioni regola il ritmo e permette di ridurre il movimento, rispettando inizialmente la preferenza del sistema.

L’annuncio distingue il lancio dall’esito effettivo. Il pannello indica separatamente il Simulacro di turno e chi deve decidere; i pulsanti dei Simulacri aprono le spiegazioni delle Condizioni e della loro durata. Le carte indisponibili restano consultabili con il motivo del vincolo. Il collegamento «Ultimo turno e cronologia» apre il riepilogo avversario e lo storico delle azioni, con testi delle carte giocate, Reazioni e conseguenze. La cronologia non conserva le identità delle carte ancora nascoste.

Per eseguire i test con Node.js, usare `node --test tests/*.test.mjs`. La suite verifica i casi di regressione e simula partite complete con semi riproducibili per tutte e tre le difficoltà.
