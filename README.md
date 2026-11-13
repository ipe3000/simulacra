# Simulacra

Prototipo desktop di Simulacra, gioco di Matteo Perlini. Due persone giocano a turno nello stesso browser. L’indicatore di turno e la mano si aggiornano automaticamente quando cambia chi deve decidere.

Il prototipo usa la configurazione illustrata nel regolamento 5.1 e 26 incantesimi giocabili, incluso Colpo Arcano. Ogni Arcimago pesca sei carte dal proprio grimorio di prova mescolato. Il catalogo completo delle 70 carte è in catalogo-carte.json. Le carte ancora da implementare restano fuori dalla pesca. Ricaricare la pagina avvia una nuova partita.

Per avviare in locale, eseguire `python -m http.server 8000` e aprire `http://localhost:8000/`.
