# VGC Test Bench

Webapp per analisi competitiva VGC Pokémon (formato NCP). Confronta speed tier, salva matchup notes con damage calc, gestisci avversari con varianti di spread.

## Avvio rapido

```bash
# Installa dipendenze
npm install

# Avvia dev server (hot reload)
npm run dev

# Build di produzione
npm run build
```

Il dev server si avvia su `http://localhost:5173` (o la prima porta libera successiva).

## Funzionalità

### 1. Team
- Incolla il tuo team in formato Showdown/Pokepaste nella textarea
- Ogni Pokémon viene parsato automaticamente con speed calcolata (formula NCP: EVs 0-32, 66 totali)
- Supporto Choice Scarf (×1.5 automatico), Mega Evolution, Ability speed-doubling (Unburden, Swift Swim, ecc.)

### 2. Avversari / Speed Benchmark
- **Al primo avvio l'app carica ~60 set preconfigurati** con le spread più comuni del meta (Basculegion, Garchomp, Kingambit, Charizard-Y, Lopunny-Mega, Froslass-Mega, ecc.)
- Griglia compatta con sprite, natura, EVs e speed
- Clicca su un tile per modificare il set
- Supporta più varianti dello stesso Pokémon (nature/spread diverse)
- Choice Scarf rilevata automaticamente dall'item

### 3. Speed Tier Chart
- Grafico lineare con i tuoi Pokémon (verde) e avversari (arancione)
- La riga TEAM resta sticky mentre scorri
- Linee tratteggiate verticali di riferimento dal team sugli avversari
- Toggle: Tailwind, +1 Speed (separati per team/avversari)
- Toggle: mostra marker Mega e Ability-boost
- Barra range per restringere il campo visibile
- Varianti dello stesso avversario raggruppate con barra range

### 4. Matchup Notes
- Seleziona un Pokémon del tuo team
- Aggiungi calc (formato output del damage calculator) in sezione Defensive e Offensive
- Filtro per avversario con sprite-tabs
- Colori: verde (favorevole), rosso (sfavorevole), giallo (roll)
- Badge Mega con 2 colori: verde = il tuo è mega, rosso = l'avversario è mega
- Rilevamento "stale" se la spread del tuo Pokémon è cambiata rispetto al calc
- Cancella singolo o tutti i calc

### 5. Persistenza e Import/Export
- Tutto salvato in localStorage automaticamente
- **Export/Import completo** del progetto (team + avversari + matchup notes) in un unico JSON
- **Export/Import solo avversari** per condividere o ripristinare la lista benchmark separatamente
- Al primo avvio (localStorage vuoto) viene caricato il set di default; dopo ogni modifica viene salvato automaticamente

## Stack tecnico

- Vite + React + TypeScript
- Nessun backend, tutto client-side
- Sprite da Pokémon Showdown CDN
- ~200+ base speed nel database locale (`src/lib/base-stats.ts`)

## Struttura

```
src/
├── App.tsx              # Componente principale con tutta la logica
├── App.css              # Stili
└── lib/
    ├── base-stats.ts    # Mappa species → base speed
    ├── speed-calc.ts    # Formula NCP per speed stat
    ├── pokemon-parser.ts # Parser formato Showdown
    ├── sprites.ts       # URL sprite Showdown
    └── default-opponents.ts # Set avversari precaricati
```
