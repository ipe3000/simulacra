# Simulacra

Prototipo desktop di Simulacra, gioco di Matteo Perlini. Due persone giocano a turno nello stesso browser. L’indicatore di turno e la mano si aggiornano automaticamente quando cambia chi deve decidere.

Il prototipo usa la configurazione illustrata nel regolamento 5.1 e 32 incantesimi giocabili, incluso Colpo Arcano. Ogni Arcimago pesca sei carte da un grimorio casuale di 30 carte, composto da 4 Reazioni, 8 Attacchi e 18 Utilità estratti fra le carte implementate. Il catalogo delle 70 carte è in catalogo-carte.json. Ricaricare la pagina avvia una nuova partita.

Per avviare in locale, eseguire `python -m http.server 8000` e aprire `http://localhost:8000/`.
