import { useEffect, useMemo, useState } from 'react'
import {
  type PokemonSet,
  parseAllSets,
  parseSingleSet,
} from './lib/pokemon-parser'
import { calcSpeed } from './lib/speed-calc'
import { getSpriteUrl } from './lib/sprites'
import { BASE_SPEED } from './lib/base-stats'
import { DEFAULT_OPPONENTS } from './lib/default-opponents'
import './App.css'

/* ─────────── Types ─────────── */

type ParsedCalc = {
  attacker: string
  defender: string
  minDamage: number
  maxDamage: number
  minPercent: number
  maxPercent: number
  koText: string
}

type MatchupEntry = {
  id: string
  raw: string
}

type MatchupData = {
  defensive: MatchupEntry[]
  offensive: MatchupEntry[]
}

type OpponentEntry = {
  id: string
  raw: string
  set: PokemonSet | null
  speedOverride: number | null
}

type AppState = {
  teamRaw: string
  team: PokemonSet[]
  opponents: OpponentEntry[]
  selectedPokemonId: string | null
  matchupByPokemon: Record<string, MatchupData>
}

/* ─────────── Constants ─────────── */

const STORAGE_KEY = 'vgc-testbench-v3'

const defaultState: AppState = {
  teamRaw: '',
  team: [],
  opponents: [],
  selectedPokemonId: null,
  matchupByPokemon: {},
}

/* ─────────── Calc parser ─────────── */

const parseCalcLine = (line: string): ParsedCalc | null => {
  const trimmed = line.trim()
  if (!trimmed) return null
  const regex =
    /^(?<attacker>.+?)\s+vs\.\s+(?<defender>.+?):\s*(?<minDamage>\d+)-(?<maxDamage>\d+)\s*\((?<minPercent>\d+(?:\.\d+)?)\s*-\s*(?<maxPercent>\d+(?:\.\d+)?)%\)\s*--\s*(?<koText>.+)$/
  const match = trimmed.match(regex)
  if (!match?.groups) return null
  return {
    attacker: match.groups.attacker.trim(),
    defender: match.groups.defender.trim(),
    minDamage: Number(match.groups.minDamage),
    maxDamage: Number(match.groups.maxDamage),
    minPercent: Number(match.groups.minPercent),
    maxPercent: Number(match.groups.maxPercent),
    koText: match.groups.koText.trim(),
  }
}

/* ─────────── Staleness detection ─────────── */

/**
 * Parse EV stats from a calc side string.
 * Attacker format: "32+ Atk Sneasler Gunk Shot" → { atk: 32 }
 * Defender format: "7 HP / 24 Def Sylveon" → { hp: 7, def: 24 }
 */
function parseCalcEvs(sideStr: string): Record<string, number> {
  const evs: Record<string, number> = {}
  // Match patterns like "32+ Atk", "7 HP", "24 Def", "20+ SpA", "0 SpD"
  const pattern = /(\d+)\+?\s+(HP|Atk|Def|SpA|SpD|Spe)/gi
  let m: RegExpExecArray | null
  while ((m = pattern.exec(sideStr)) !== null) {
    evs[m[2].toLowerCase()] = Number(m[1])
  }
  return evs
}

/**
 * Check if a calc is stale by comparing EVs in the calc text against current Pokémon EVs.
 * For defensive calcs: compare defender EVs (HP, Def, SpD) with our Pokémon
 * For offensive calcs: compare attacker EVs (Atk, SpA) with our Pokémon
 */
function isCalcStale(
  parsed: ParsedCalc,
  mode: 'defensive' | 'offensive',
  pokemon: PokemonSet,
): boolean {
  const side = mode === 'defensive' ? parsed.defender : parsed.attacker
  const calcEvs = parseCalcEvs(side)
  if (Object.keys(calcEvs).length === 0) return false
  for (const [stat, val] of Object.entries(calcEvs)) {
    const currentEv = pokemon.evs[stat] ?? 0
    if (currentEv !== val) return true
  }
  return false
}

/* ─────────── File helpers ─────────── */

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function openFileDialog(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsText(file)
    }
    input.click()
  })
}

/* ─────────── Mega helpers ─────────── */

/**
 * Map of mega stone names (lowercase) to their mega form species key.
 * Covers common mega stones. The key is the BASE_SPEED key for the mega form.
 */
const MEGA_STONE_MAP: Record<string, string> = {
  aerodactylite: 'aerodactyl-mega',
  venusaurite: 'venusaur-mega',
  'charizardite x': 'charizard-mega-x',
  'charizardite y': 'charizard-mega-y',
  blastoisinite: 'blastoise-mega',
  alakazite: 'alakazam-mega',
  gengarite: 'gengar-mega',
  kangaskhanite: 'kangaskhan-mega',
  gyaradosite: 'gyarados-mega',
  'mewtwonite x': 'mewtwo-mega-x',
  'mewtwonite y': 'mewtwo-mega-y',
  scizorite: 'scizor-mega',
  heracronite: 'heracross-mega',
  tyranitarite: 'tyranitar-mega',
  blazikenite: 'blaziken-mega',
  swampertite: 'swampert-mega',
  gardevoirite: 'gardevoir-mega',
  sablenite: 'sableye-mega',
  mawilite: 'mawile-mega',
  aggronite: 'aggron-mega',
  manectite: 'manectric-mega',
  salamencite: 'salamence-mega',
  metagrossite: 'metagross-mega',
  latiasite: 'latias-mega',
  latiosite: 'latios-mega',
  'rayquaza-mega': 'rayquaza-mega',
  lopunnite: 'lopunny-mega',
  lucarionite: 'lucario-mega',
  abomasite: 'abomasnow-mega',
  galladite: 'gallade-mega',
  diancite: 'diancie-mega',
  ampharosite: 'ampharos-mega',
  banettite: 'banette-mega',
  beedrillite: 'beedrill-mega',
  cameruptite: 'camerupt-mega',
  pidgeotite: 'pidgeot-mega',
  slowbronite: 'slowbro-mega',
  steelixite: 'steelix-mega',
  pinsirite: 'pinsir-mega',
  altarianite: 'altaria-mega',
  sharpedonite: 'sharpedo-mega',
  absolite: 'absol-mega',
  glalitite: 'glalie-mega',
  audinite: 'audino-mega',
  gaborite: 'garchomp-mega',
  garchompite: 'garchomp-mega',
  glimmorite: 'glimmora-mega',
  glimmoranite: 'glimmora-mega',
  dragonitite: 'dragonite-mega',
  dragoninite: 'dragonite-mega',
  froslassite: 'froslass-mega',
}

function getMegaForm(item: string | null): string | null {
  if (!item) return null
  const key = item.toLowerCase().trim()
  return MEGA_STONE_MAP[key] ?? null
}

function getMegaSpeed(set: PokemonSet): number | null {
  const megaKey = getMegaForm(set.item)
  if (!megaKey) return null
  const spe = set.evs.spe ?? 0
  return calcSpeed(megaKey, spe, set.nature, set.level)
}

/** Abilities that double speed under certain conditions */
const SPEED_DOUBLING_ABILITIES = new Set([
  'sand rush', 'swift swim', 'chlorophyll', 'slush rush', 'unburden', 'surge surfer',
])

function hasSpeedDoublingAbility(set: PokemonSet): boolean {
  if (!set.ability) return false
  return SPEED_DOUBLING_ABILITIES.has(set.ability.toLowerCase())
}

function getAbilityBoostedSpeed(set: PokemonSet): number | null {
  if (!hasSpeedDoublingAbility(set)) return null
  const base = getEffectiveSpeed(set, null)
  if (base == null) return null
  return base * 2
}

/** Short label for the ability boost */
function getAbilityBoostLabel(ability: string): string {
  const map: Record<string, string> = {
    'sand rush': '🏜️',
    'swift swim': '🌧️',
    'chlorophyll': '☀️',
    'slush rush': '❄️',
    'unburden': '🪶',
    'surge surfer': '⚡',
  }
  return map[ability.toLowerCase()] ?? '⚡'
}

/** Check which side of the calc mentions mega: 'mine', 'opp', or null */
function getMegaSource(text: string, colorMode: 'defensive' | 'offensive'): 'mine' | 'opp' | null {
  const parsed = parseCalcLine(text)
  if (!parsed) return /mega/i.test(text) ? 'opp' : null
  const attackerMega = /mega/i.test(parsed.attacker)
  const defenderMega = /mega/i.test(parsed.defender)
  if (!attackerMega && !defenderMega) return null
  if (colorMode === 'defensive') {
    // attacker = opponent, defender = mine
    if (defenderMega) return 'mine'
    if (attackerMega) return 'opp'
  } else {
    // attacker = mine, defender = opponent
    if (attackerMega) return 'mine'
    if (defenderMega) return 'opp'
  }
  return null
}

/* ─────────── Speed helper ─────────── */

function getEffectiveSpeed(set: PokemonSet, override: number | null): number | null {
  if (override != null) return override
  const spe = set.evs.spe ?? 0
  return calcSpeed(set.species, spe, set.nature, set.level)
}

/* ─────────── App ─────────── */

function App() {
  const [state, setState] = useState<AppState>(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // Load default opponents on first use
      const opponents = DEFAULT_OPPONENTS.map((o) => ({
        id: crypto.randomUUID(),
        raw: o.raw,
        set: parseSingleSet(o.raw),
        speedOverride: null,
      }))
      return { ...defaultState, opponents }
    }
    try {
      return { ...defaultState, ...JSON.parse(raw) }
    } catch {
      return defaultState
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  /* ─── Team parsing ─── */
  const handleTeamPaste = (text: string) => {
    const parsed = parseAllSets(text)
    setState((prev) => {
      // Try to preserve IDs for pokémon that still exist (by species, order-stable)
      const usedOldIds = new Set<string>()
      const idMap = new Map<string, string>() // newId → oldId
      const stableTeam = parsed.map((newMon) => {
        const match = prev.team.find(
          (old) =>
            old.species.toLowerCase() === newMon.species.toLowerCase() &&
            !usedOldIds.has(old.id),
        )
        if (match) {
          usedOldIds.add(match.id)
          idMap.set(newMon.id, match.id)
          return { ...newMon, id: match.id }
        }
        return newMon
      })

      // Remap matchupByPokemon keys if IDs changed
      const newMatchups = { ...prev.matchupByPokemon }
      // No remapping needed since we reuse old IDs directly

      return {
        ...prev,
        teamRaw: text,
        team: stableTeam,
        matchupByPokemon: newMatchups,
        selectedPokemonId:
          stableTeam.length > 0
            ? prev.selectedPokemonId &&
              stableTeam.some((p) => p.id === prev.selectedPokemonId)
              ? prev.selectedPokemonId
              : stableTeam[0].id
            : null,
      }
    })
  }

  /* ─── Opponents management ─── */
  const addOpponent = () => {
    const newId = crypto.randomUUID()
    setState((prev) => ({
      ...prev,
      opponents: [
        ...prev.opponents,
        { id: newId, raw: '', set: null, speedOverride: null },
      ],
    }))
    setEditingOpponentId(newId)
  }

  const updateOpponentRaw = (id: string, text: string) => {
    const parsed = text.trim() ? parseSingleSet(text.trim()) : null
    setState((prev) => ({
      ...prev,
      opponents: prev.opponents.map((o) =>
        o.id === id ? { ...o, raw: text, set: parsed } : o,
      ),
    }))
  }

  const updateOpponentSpeedOverride = (id: string, value: string) => {
    const num = value === '' ? null : Number(value)
    setState((prev) => ({
      ...prev,
      opponents: prev.opponents.map((o) =>
        o.id === id ? { ...o, speedOverride: num } : o,
      ),
    }))
  }

  const removeOpponent = (id: string) => {
    setState((prev) => ({
      ...prev,
      opponents: prev.opponents.filter((o) => o.id !== id),
    }))
  }

  /* ─── Matchups ─── */
  const selectedPokemon = state.team.find((m) => m.id === state.selectedPokemonId)
  const selectedMatchup: MatchupData = state.matchupByPokemon[
    state.selectedPokemonId ?? ''
  ] ?? { defensive: [], offensive: [] }

  const [matchupFilter, setMatchupFilter] = useState<string | null>(null)
  const [newDefCalc, setNewDefCalc] = useState('')
  const [newOffCalc, setNewOffCalc] = useState('')
  const [editingOpponentId, setEditingOpponentId] = useState<string | null>(null)

  const addCalcEntry = (bucket: 'defensive' | 'offensive', raw: string) => {
    if (!state.selectedPokemonId || !raw.trim()) return
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    const newEntries = lines.map((line) => ({
      id: crypto.randomUUID(),
      raw: line,
    }))
    setState((prev) => ({
      ...prev,
      matchupByPokemon: {
        ...prev.matchupByPokemon,
        [prev.selectedPokemonId!]: {
          ...(prev.matchupByPokemon[prev.selectedPokemonId!] ?? {
            defensive: [],
            offensive: [],
          }),
          [bucket]: [
            ...(prev.matchupByPokemon[prev.selectedPokemonId!]?.[bucket] ?? []),
            ...newEntries,
          ],
        },
      },
    }))
  }

  const removeCalcEntry = (bucket: 'defensive' | 'offensive', entryId: string) => {
    if (!state.selectedPokemonId) return
    setState((prev) => ({
      ...prev,
      matchupByPokemon: {
        ...prev.matchupByPokemon,
        [prev.selectedPokemonId!]: {
          ...(prev.matchupByPokemon[prev.selectedPokemonId!] ?? {
            defensive: [],
            offensive: [],
          }),
          [bucket]: (
            prev.matchupByPokemon[prev.selectedPokemonId!]?.[bucket] ?? []
          ).filter((e) => e.id !== entryId),
        },
      },
    }))
  }

  const clearAllCalcs = (bucket: 'defensive' | 'offensive') => {
    if (!state.selectedPokemonId) return
    setState((prev) => ({
      ...prev,
      matchupByPokemon: {
        ...prev.matchupByPokemon,
        [prev.selectedPokemonId!]: {
          ...(prev.matchupByPokemon[prev.selectedPokemonId!] ?? {
            defensive: [],
            offensive: [],
          }),
          [bucket]: [],
        },
      },
    }))
  }

  /* ─── Export / Import ─── */
  const exportAll = () => {
    downloadJson(state, `vgc-project-${Date.now()}.json`)
  }

  const importAll = async () => {
    const text = await openFileDialog('.json')
    if (!text) return
    try {
      const data = JSON.parse(text) as Partial<AppState>
      setState({ ...defaultState, ...data })
    } catch {
      alert('File JSON non valido')
    }
  }

  const exportOpponents = () => {
    downloadJson(state.opponents, `vgc-opponents-${Date.now()}.json`)
  }

  const importOpponents = async () => {
    const text = await openFileDialog('.json')
    if (!text) return
    try {
      const data = JSON.parse(text) as OpponentEntry[]
      if (!Array.isArray(data)) throw new Error('not array')
      setState((prev) => ({ ...prev, opponents: data }))
    } catch {
      alert('File JSON non valido')
    }
  }

  const exportMatchups = () => {
    downloadJson(state.matchupByPokemon, `vgc-matchups-${Date.now()}.json`)
  }

  const importMatchups = async () => {
    const text = await openFileDialog('.json')
    if (!text) return
    try {
      const data = JSON.parse(text) as Record<string, MatchupData>
      if (typeof data !== 'object' || data === null) throw new Error('not object')
      setState((prev) => ({ ...prev, matchupByPokemon: data }))
    } catch {
      alert('File JSON non valido')
    }
  }

  // Extract species from a calc's attacker/defender string
  const extractSpecies = (text: string): string | null => {
    // First check opponent names (proper-cased)
    const knownOpponents = state.opponents
      .filter((o) => o.set)
      .map((o) => o.set!.species)
    for (const species of knownOpponents) {
      if (text.toLowerCase().includes(species.toLowerCase())) return species
    }
    // Fallback: check all species in BASE_SPEED (keys are lowercase/hyphenated)
    const textLower = text.toLowerCase()
    // Sort by length descending so longer names match first (e.g. "Urshifu-Rapid-Strike" before "Urshifu")
    const allKeys = Object.keys(BASE_SPEED).sort((a, b) => b.length - a.length)
    for (const key of allKeys) {
      // Convert key to space-separated for matching: "iron-hands" → "iron hands"
      const spacedKey = key.replace(/-/g, ' ')
      if (textLower.includes(spacedKey) || textLower.includes(key)) {
        // Capitalize for display
        return key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-')
      }
    }
    return null
  }

  // All unique opponent species mentioned in current matchup
  const matchupSpecies = useMemo(() => {
    const species = new Set<string>()
    for (const entry of selectedMatchup.defensive) {
      const parsed = parseCalcLine(entry.raw)
      if (parsed) {
        const s = extractSpecies(parsed.attacker)
        if (s) species.add(s)
      }
    }
    for (const entry of selectedMatchup.offensive) {
      const parsed = parseCalcLine(entry.raw)
      if (parsed) {
        const s = extractSpecies(parsed.defender)
        if (s) species.add(s)
      }
    }
    return Array.from(species)
  }, [selectedMatchup, state.opponents])

  /* ─── Speed modifiers ─── */
  const [speedMods, setSpeedMods] = useState({
    teamTailwind: false,
    teamPlus1: false,
    oppTailwind: false,
    oppPlus1: false,
    showAbilityBoost: true,
    showMega: true,
  })

  const toggleSpeedMod = (key: keyof typeof speedMods) => {
    setSpeedMods((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  /* ─── Speed chart data ─── */
  const applyMod = (base: number, tailwind: boolean, plus1: boolean): number => {
    let s = base
    if (plus1) s = Math.floor(s * 1.5)
    if (tailwind) s = s * 2
    return s
  }

  const isScarfItem = (item: string | null): boolean => {
    if (!item) return false
    return item.toLowerCase() === 'choice scarf'
  }

  const teamWithSpeed = useMemo(
    () =>
      state.team
        .map((m) => {
          const base = getEffectiveSpeed(m, null)
          if (base == null) return { ...m, speed: null as number | null, megaSpeed: null as number | null, abilitySpeed: null as number | null, hasScarf: false }
          const hasScarf = isScarfItem(m.item)
          const megaBase = getMegaSpeed(m)
          let speed = applyMod(base, speedMods.teamTailwind, speedMods.teamPlus1)
          if (hasScarf) speed = Math.floor(speed * 1.5)
          const megaSpeed = megaBase != null ? applyMod(megaBase, speedMods.teamTailwind, speedMods.teamPlus1) : null
          const abilityBase = getAbilityBoostedSpeed(m)
          let abilitySpeed = abilityBase != null ? applyMod(abilityBase, speedMods.teamTailwind, speedMods.teamPlus1) : null
          if (abilitySpeed != null && hasScarf) abilitySpeed = Math.floor(abilitySpeed * 1.5)
          return { ...m, speed, megaSpeed, abilitySpeed, hasScarf }
        })
        .filter((m) => m.speed != null) as (PokemonSet & { speed: number; megaSpeed: number | null; abilitySpeed: number | null; hasScarf: boolean })[],
    [state.team, speedMods.teamTailwind, speedMods.teamPlus1],
  )

  const opponentsWithSpeed = useMemo(
    () =>
      state.opponents
        .filter((o) => o.set != null)
        .map((o) => {
          const base = getEffectiveSpeed(o.set!, o.speedOverride)
          if (base == null) return { ...o, speed: null as number | null, hasScarf: false, abilitySpeed: null as number | null }
          const hasScarf = isScarfItem(o.set!.item)
          const scarfSpeed = hasScarf ? Math.floor(base * 1.5) : base
          const abilityBase = getAbilityBoostedSpeed(o.set!)
          const abilitySpeed = abilityBase != null ? applyMod(abilityBase, speedMods.oppTailwind, speedMods.oppPlus1) : null
          return { ...o, speed: applyMod(scarfSpeed, speedMods.oppTailwind, speedMods.oppPlus1), hasScarf, abilitySpeed }
        })
        .filter((o) => o.speed != null) as (OpponentEntry & { speed: number; hasScarf: boolean; abilitySpeed: number | null })[],
    [state.opponents, speedMods.oppTailwind, speedMods.oppPlus1],
  )

  const opponentGroups = useMemo(() => {
    const map = new Map<string, (OpponentEntry & { speed: number; hasScarf: boolean; abilitySpeed: number | null })[]>()
    for (const o of opponentsWithSpeed) {
      const key = o.set!.species
      const arr = map.get(key) || []
      arr.push(o)
      map.set(key, arr)
    }
    return map
  }, [opponentsWithSpeed])

  const allSpeeds = useMemo(() => {
    const speeds: number[] = []
    for (const m of teamWithSpeed) {
      speeds.push(m.speed)
      if (speedMods.showMega && m.megaSpeed != null) speeds.push(m.megaSpeed)
      if (speedMods.showAbilityBoost && m.abilitySpeed != null) speeds.push(m.abilitySpeed)
    }
    for (const o of opponentsWithSpeed) {
      speeds.push(o.speed)
      if (speedMods.showAbilityBoost && o.abilitySpeed != null) speeds.push(o.abilitySpeed)
    }
    return speeds
  }, [teamWithSpeed, opponentsWithSpeed, speedMods.showMega, speedMods.showAbilityBoost])

  const autoSpeedMin = allSpeeds.length > 0 ? Math.min(...allSpeeds) - 12 : 0
  const autoSpeedMax = allSpeeds.length > 0 ? Math.max(...allSpeeds) + 12 : 100

  const [speedRange, setSpeedRange] = useState<[number, number] | null>(null)
  const speedMin = speedRange ? speedRange[0] : autoSpeedMin
  const speedMax = speedRange ? speedRange[1] : autoSpeedMax

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="topbar">
        <div>
          <p className="eyebrow">VGC Test Helper</p>
          <h1>Speed Tier + Matchup Planner</h1>
          <p className="subtitle">
            Incolla i set in formato Showdown/Pokepaste. La speed viene calcolata
            automaticamente dalla formula NCP.
          </p>
        </div>
        <a
          className="calc-link"
          href="https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/"
          target="_blank"
          rel="noreferrer"
        >
          Apri Damage Calc
        </a>
        <div className="topbar-actions">
          <button type="button" className="io-btn" onClick={exportAll}>💾 Esporta progetto</button>
          <button type="button" className="io-btn" onClick={importAll}>📂 Importa progetto</button>
        </div>
      </header>

      {/* ═══════ SECTION 1: Team ═══════ */}
      <section className="panel">
        <h2>Il tuo Team</h2>
        <p className="hint">
          Incolla tutti i 6 set separati da una riga vuota. La speed viene
          calcolata automaticamente.
        </p>
        <textarea
          className="big-paste"
          value={state.teamRaw}
          onChange={(e) => handleTeamPaste(e.target.value)}
          placeholder={`Aerodactyl @ Aerodactylite\nAbility: Unnerve\nLevel: 50\nEVs: 2 HP / 32 Atk / 32 Spe\nJolly Nature\n- Rock Slide\n- Dual Wingbeat\n- Tailwind\n- Protect\n\nSylveon @ Fairy Feather\n...`}
          rows={10}
        />

        {state.team.length > 0 && (
          <div className="set-cards">
            {state.team.map((mon) => {
              const speed = getEffectiveSpeed(mon, null)
              return (
                <article className="set-card team" key={mon.id}>
                  <div className="set-card-header">
                    <img
                      className="set-sprite"
                      src={getSpriteUrl(mon.species)}
                      alt={mon.species}
                    />
                    <div>
                      <strong className="set-species">{mon.species}</strong>
                      {mon.item && (
                        <span className="set-item">@ {mon.item}</span>
                      )}
                    </div>
                  </div>
                  <div className="set-meta">
                    {mon.ability && <span>{mon.ability}</span>}
                    {mon.nature && <span>{mon.nature}</span>}
                    {Object.keys(mon.evs).length > 0 && (
                      <span>
                        {Object.entries(mon.evs)
                          .map(([s, v]) => `${v} ${s.toUpperCase()}`)
                          .join(' / ')}
                      </span>
                    )}
                  </div>
                  <div className="set-moves">
                    {mon.moves.map((move) => (
                      <span key={move} className="move-chip">
                        {move}
                      </span>
                    ))}
                  </div>
                  <div className="speed-badge">
                    Speed: <b>{speed ?? '?'}</b>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* ═══════ SECTION 2: Opponents ═══════ */}
      <section className="panel">
        <div className="section-header-row">
          <div>
            <h2>Avversari / Speed Benchmark</h2>
            <p className="hint">
              Aggiungi singoli set avversari. Puoi inserire più varianti dello stesso
              Pokémon (natura/spread diverse). Le mosse non servono.
            </p>
          </div>
          <div className="section-actions">
            <button type="button" className="io-btn small" onClick={exportOpponents}>💾 Esporta</button>
            <button type="button" className="io-btn small" onClick={importOpponents}>📂 Importa</button>
          </div>
        </div>

        <div className="opponents-grid">
          {state.opponents.map((opp) => {
            const baseSpeed = opp.set
              ? getEffectiveSpeed(opp.set, opp.speedOverride)
              : null
            const hasScarf = opp.set ? isScarfItem(opp.set.item) : false
            const speed = baseSpeed != null && hasScarf ? Math.floor(baseSpeed * 1.5) : baseSpeed
            const isEditing = editingOpponentId === opp.id

            if (isEditing) {
              return (
                <div className="opponent-edit-panel" key={opp.id}>
                  <textarea
                    className="opp-paste"
                    value={opp.raw}
                    onChange={(e) => updateOpponentRaw(opp.id, e.target.value)}
                    placeholder={`Sneasler @ White Herb\nAbility: Unburden\nLevel: 50\nEVs: 2 HP / 32 Atk / 32 Spe\nJolly Nature`}
                    rows={5}
                  />
                  <div className="opp-edit-info">
                    {opp.set && (
                      <span className="opp-speed">
                        Speed: <b>{speed ?? '?'}</b>
                        {hasScarf && <img className="scarf-icon" src="https://play.pokemonshowdown.com/sprites/itemicons/choice-scarf.png" alt="Scarf" />}
                      </span>
                    )}
                    {speed === null && (
                      <label className="opp-override">
                        Override:
                        <input
                          type="number"
                          min={1}
                          value={opp.speedOverride ?? ''}
                          onChange={(e) =>
                            updateOpponentSpeedOverride(opp.id, e.target.value)
                          }
                          placeholder="speed"
                        />
                      </label>
                    )}
                  </div>
                  <div className="opp-edit-actions">
                    <button type="button" className="io-btn small" onClick={() => setEditingOpponentId(null)}>✓ Chiudi</button>
                    <button type="button" className="remove-btn" onClick={() => { removeOpponent(opp.id); setEditingOpponentId(null) }}>✕ Rimuovi</button>
                  </div>
                </div>
              )
            }

            return (
              <div
                className="opponent-tile"
                key={opp.id}
                title={opp.set ? `${opp.set.species} – ${opp.set.nature ?? ''} ${opp.set.evs.spe ?? 0} Spe – Speed: ${speed ?? '?'}` : 'Set vuoto'}
                onClick={() => setEditingOpponentId(opp.id)}
              >
                {opp.set ? (
                  <>
                    <img
                      className="opp-tile-sprite"
                      src={getSpriteUrl(opp.set.species)}
                      alt={opp.set.species}
                    />
                    <span className="opp-tile-meta">{opp.set.nature ? opp.set.nature.slice(0, 3) : ''} {opp.set.evs.spe ?? 0} Spe</span>
                    <span className="opp-tile-speed">{speed ?? '?'}{hasScarf && <img className="scarf-icon-sm" src="https://play.pokemonshowdown.com/sprites/itemicons/choice-scarf.png" alt="Scarf" />}</span>
                  </>
                ) : (
                  <span className="opp-tile-empty">?</span>
                )}
              </div>
            )
          })}
          <div className="opponent-tile opp-tile-add" onClick={addOpponent} title="Aggiungi avversario">
            <span className="opp-tile-plus">+</span>
          </div>
        </div>
      </section>

      {/* ═══════ SECTION 3: Speed Chart ═══════ */}
      <section className="panel">
        <h2>Speed Tier Chart</h2>
        <p className="hint">
          I tuoi Pokémon in verde, gli avversari in arancione con range se hanno
          più varianti. Choice Scarf viene applicata automaticamente (×1.5).
        </p>

        <div className="speed-mods">
          <span className="speed-mods-label">Modificatori:</span>
          <button
            type="button"
            className={`mod-btn${speedMods.teamTailwind ? ' active' : ''}`}
            onClick={() => toggleSpeedMod('teamTailwind')}
          >
            🌬️ Team Tailwind
          </button>
          <button
            type="button"
            className={`mod-btn${speedMods.teamPlus1 ? ' active' : ''}`}
            onClick={() => toggleSpeedMod('teamPlus1')}
          >
            ⬆️ Team +1
          </button>
          <button
            type="button"
            className={`mod-btn${speedMods.oppTailwind ? ' active' : ''}`}
            onClick={() => toggleSpeedMod('oppTailwind')}
          >
            🌬️ Avversari Tailwind
          </button>
          <button
            type="button"
            className={`mod-btn${speedMods.oppPlus1 ? ' active' : ''}`}
            onClick={() => toggleSpeedMod('oppPlus1')}
          >
            ⬆️ Avversari +1
          </button>
          <span className="speed-mods-divider">|</span>
          <button
            type="button"
            className={`mod-btn${speedMods.showAbilityBoost ? ' active' : ''}`}
            onClick={() => toggleSpeedMod('showAbilityBoost')}
          >
            🪶 Abilità ×2
          </button>
          <button
            type="button"
            className={`mod-btn${speedMods.showMega ? ' active' : ''}`}
            onClick={() => toggleSpeedMod('showMega')}
          >
            Ⓜ Mega
          </button>
        </div>

        {allSpeeds.length >= 2 && (
          <div className="speed-range-control">
            <label className="range-label">
              Range: <b>{speedMin}</b> – <b>{speedMax}</b>
            </label>
            <div className="range-inputs">
              <input
                type="range"
                min={autoSpeedMin - 20}
                max={autoSpeedMax}
                value={speedMin}
                onChange={(e) => setSpeedRange([Number(e.target.value), speedMax])}
              />
              <input
                type="range"
                min={autoSpeedMin}
                max={autoSpeedMax + 20}
                value={speedMax}
                onChange={(e) => setSpeedRange([speedMin, Number(e.target.value)])}
              />
            </div>
            {speedRange && (
              <button
                type="button"
                className="mod-btn"
                onClick={() => setSpeedRange(null)}
              >
                Reset
              </button>
            )}
          </div>
        )}

        {allSpeeds.length < 2 ? (
          <p className="empty-note">
            Inserisci almeno 2 Pokémon con speed calcolabile per vedere il
            grafico.
          </p>
        ) : (
          <div className="speed-ruler-container">
            {/* Axis */}
            <div className="speed-chart-sticky-header">
            <div className="ruler-axis">
              <span className="ruler-label">{speedMin}</span>
              <div className="ruler-line" />
              <span className="ruler-label">{speedMax}</span>
            </div>

            {/* Team */}
            <div className="ruler-section track-row">
              <h4 className="ruler-section-label team-label">Team</h4>
              <div className="ruler-track team-track">
                {teamWithSpeed.map((m) => {
                  const pct =
                    ((m.speed - speedMin) / (speedMax - speedMin)) * 100
                  return (
                    <div
                      key={m.id}
                      className="speed-marker team-marker"
                      style={{ left: `${pct}%` }}
                      title={`${m.species}: ${m.speed}`}
                    >
                      <img
                        className="marker-sprite-inline"
                        src={getSpriteUrl(m.species)}
                        alt={m.species}
                      />
                      <span className="marker-speed-num">{m.speed}{m.hasScarf && <img className="scarf-icon" src="https://play.pokemonshowdown.com/sprites/itemicons/choice-scarf.png" alt="Scarf" />}</span>
                    </div>
                  )
                })}
                {/* Mega speed markers */}
                {speedMods.showMega && teamWithSpeed
                  .filter((m) => m.megaSpeed != null && m.megaSpeed !== m.speed)
                  .map((m) => {
                    const megaForm = getMegaForm(m.item)!
                    const pct =
                      ((m.megaSpeed! - speedMin) / (speedMax - speedMin)) * 100
                    return (
                      <div
                        key={`mega-${m.id}`}
                        className="speed-marker team-marker mega-marker"
                        style={{ left: `${pct}%` }}
                        title={`${m.species} Mega: ${m.megaSpeed}`}
                      >
                        <img
                          className="marker-sprite-inline"
                          src={getSpriteUrl(megaForm)}
                          alt={`${m.species} Mega`}
                        />
                        <span className="marker-speed-num">{m.megaSpeed} Ⓜ</span>
                      </div>
                    )
                  })}
                {/* Ability-boosted speed markers */}
                {speedMods.showAbilityBoost && teamWithSpeed
                  .filter((m) => m.abilitySpeed != null && m.abilitySpeed !== m.speed)
                  .map((m) => {
                    const emoji = getAbilityBoostLabel(m.ability ?? '')
                    const pct =
                      ((m.abilitySpeed! - speedMin) / (speedMax - speedMin)) * 100
                    return (
                      <div
                        key={`ability-${m.id}`}
                        className="speed-marker team-marker ability-marker"
                        style={{ left: `${pct}%` }}
                        title={`${m.species} (${m.ability}): ${m.abilitySpeed}`}
                      >
                        <img
                          className="marker-sprite-inline"
                          src={getSpriteUrl(m.species)}
                          alt={`${m.species} ${m.ability}`}
                        />
                        <span className="marker-speed-num">{m.abilitySpeed} {emoji}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
            </div>{/* end sticky header */}

            {/* Opponents with vertical reference lines */}
            <div className="opponents-chart-area">
              <div className="vlines-layer">
                {teamWithSpeed.map((m) => {
                  const pct =
                    ((m.speed - speedMin) / (speedMax - speedMin)) * 100
                  return (
                    <div
                      key={`vline-${m.id}`}
                      className="team-vline"
                      style={{ left: `${pct}%` }}
                    />
                  )
                })}
                {speedMods.showMega && teamWithSpeed
                  .filter((m) => m.megaSpeed != null && m.megaSpeed !== m.speed)
                  .map((m) => {
                    const pct =
                      ((m.megaSpeed! - speedMin) / (speedMax - speedMin)) * 100
                    return (
                      <div
                        key={`vline-mega-${m.id}`}
                        className="team-vline mega-vline"
                        style={{ left: `${pct}%` }}
                      />
                    )
                  })}
                {speedMods.showAbilityBoost && teamWithSpeed
                  .filter((m) => m.abilitySpeed != null && m.abilitySpeed !== m.speed)
                  .map((m) => {
                    const pct =
                      ((m.abilitySpeed! - speedMin) / (speedMax - speedMin)) * 100
                    return (
                      <div
                        key={`vline-ability-${m.id}`}
                        className="team-vline ability-vline"
                        style={{ left: `${pct}%` }}
                      />
                    )
                  })}
              </div>

            {/* Opponents grouped */}
            {Array.from(opponentGroups.entries()).map(([species, entries]) => {
              const speeds = entries.map((e) => e.speed)
              const minSpd = Math.min(...speeds)
              const maxSpd = Math.max(...speeds)
              const leftPct =
                ((minSpd - speedMin) / (speedMax - speedMin)) * 100
              const rightPct =
                ((maxSpd - speedMin) / (speedMax - speedMin)) * 100

              return (
                <div className="ruler-section track-row" key={species}>
                  <h4 className="ruler-section-label opp-label">
                    <img
                      className="section-sprite"
                      src={getSpriteUrl(species)}
                      alt=""
                    />
                  </h4>
                  <div className="ruler-track">
                    {speeds.length > 1 && (
                      <div
                        className="speed-range-bar"
                        style={{
                          left: `${leftPct}%`,
                          width: `${Math.max(rightPct - leftPct, 0.5)}%`,
                        }}
                      />
                    )}
                    {entries.map((entry) => {
                      const pct =
                        ((entry.speed - speedMin) / (speedMax - speedMin)) * 100
                      const natureShort = entry.set?.nature
                        ? entry.set.nature.slice(0, 3)
                        : ''
                      const label = entry.set?.nature
                        ? `${natureShort} ${entry.set.evs.spe ?? 0}`
                        : `${entry.speed}`
                      const fullLabel = entry.set?.nature
                        ? `${entry.set.nature} ${entry.set.evs.spe ?? 0} Spe`
                        : `${entry.speed}`
                      return (
                        <div
                          key={entry.id}
                          className="speed-marker opp-marker"
                          style={{ left: `${pct}%` }}
                          title={`${species} (${fullLabel}): ${entry.speed}`}
                        >
                          <span className="marker-dot" />
                          <span className="marker-label">
                            {label}
                            <br />
                            <span className="marker-speed-row">
                              <b>{entry.speed}</b>
                              {entry.hasScarf && <img className="scarf-icon" src="https://play.pokemonshowdown.com/sprites/itemicons/choice-scarf.png" alt="Scarf" />}
                            </span>
                          </span>
                        </div>
                      )
                    })}
                    {/* Ability-boosted opponent markers */}
                    {speedMods.showAbilityBoost && entries
                      .filter((e) => e.abilitySpeed != null && e.abilitySpeed !== e.speed)
                      .map((entry) => {
                        const pct =
                          ((entry.abilitySpeed! - speedMin) / (speedMax - speedMin)) * 100
                        const emoji = getAbilityBoostLabel(entry.set?.ability ?? '')
                        return (
                          <div
                            key={`ability-${entry.id}`}
                            className="speed-marker opp-marker ability-marker"
                            style={{ left: `${pct}%` }}
                            title={`${species} (${entry.set?.ability}): ${entry.abilitySpeed}`}
                          >
                            <span className="marker-dot ability-dot" />
                            <span className="marker-label">
                              {emoji}
                              <br />
                              <b>{entry.abilitySpeed}</b>
                            </span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )
            })}
            </div>{/* end opponents-chart-area */}
          </div>
        )}
      </section>

      {/* ═══════ SECTION 4: Matchup Notes ═══════ */}
      <section className="panel">
        <div className="section-header-row">
          <div>
            <h2>Matchup Notes</h2>
            <p className="hint">
              Clicca un Pokémon del tuo team, aggiungi calc e filtra per avversario.
            </p>
          </div>
          <div className="section-actions">
            <button type="button" className="io-btn small" onClick={exportMatchups}>💾 Esporta</button>
            <button type="button" className="io-btn small" onClick={importMatchups}>📂 Importa</button>
          </div>
        </div>

        {state.team.length === 0 ? (
          <p className="empty-note">Inserisci prima il team.</p>
        ) : (
          <>
            <div className="team-tabs">
              {state.team.map((mon) => (
                <button
                  key={mon.id}
                  type="button"
                  className={
                    state.selectedPokemonId === mon.id ? 'tab active' : 'tab'
                  }
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      selectedPokemonId: mon.id,
                    }))
                  }
                >
                  <img
                    className="tab-sprite"
                    src={getSpriteUrl(mon.species)}
                    alt=""
                  />
                  {mon.species || 'Unnamed'}
                </button>
              ))}
            </div>

            {selectedPokemon && (
              <>
                <p className="selected-title">
                  <img
                    className="selected-sprite"
                    src={getSpriteUrl(selectedPokemon.species)}
                    alt=""
                  />
                  <strong>{selectedPokemon.species}</strong>
                </p>

                {/* Filter */}
                {matchupSpecies.length > 0 && (
                  <div className="matchup-filters">
                    <button
                      type="button"
                      className={matchupFilter === null ? 'filter-btn active' : 'filter-btn'}
                      onClick={() => setMatchupFilter(null)}
                    >
                      Tutti
                    </button>
                    {matchupSpecies.map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        className={matchupFilter === sp ? 'filter-btn active' : 'filter-btn'}
                        onClick={() => setMatchupFilter(sp)}
                      >
                        <img className="filter-sprite" src={getSpriteUrl(sp)} alt="" />
                        {sp}
                      </button>
                    ))}
                  </div>
                )}

                <div className="matchup-grid two-col">
                  {/* Defensive */}
                  <article className="matchup-col">
                    <div className="matchup-col-header">
                      <h3>🛡️ Defensive</h3>
                      {selectedMatchup.defensive.length > 0 && (
                        <button
                          type="button"
                          className="clear-btn"
                          onClick={() => clearAllCalcs('defensive')}
                        >
                          Cancella tutti
                        </button>
                      )}
                    </div>
                    <div className="add-calc-row">
                      <textarea
                        value={newDefCalc}
                        onChange={(e) => setNewDefCalc(e.target.value)}
                        placeholder="Incolla calc (anche più righe)..."
                        rows={2}
                      />
                      <button
                        type="button"
                        className="add-btn"
                        onClick={() => {
                          addCalcEntry('defensive', newDefCalc)
                          setNewDefCalc('')
                        }}
                      >
                        + Aggiungi
                      </button>
                    </div>
                    <div className="calc-list">
                      {selectedMatchup.defensive.map((entry) => {
                        const parsed = parseCalcLine(entry.raw)
                        if (!parsed) {
                          return (
                            <CalcCard
                              key={entry.id}
                              raw={entry.raw}
                              onRemove={() => removeCalcEntry('defensive', entry.id)}
                            />
                          )
                        }
                        const oppSpecies = extractSpecies(parsed.attacker)
                        if (matchupFilter && oppSpecies !== matchupFilter) return null
                        const stale = isCalcStale(parsed, 'defensive', selectedPokemon)
                        const megaSource = getMegaSource(entry.raw, 'defensive')
                        return (
                          <CalcCard
                            key={entry.id}
                            parsed={parsed}
                            colorMode="defensive"
                            oppSpecies={oppSpecies}
                            stale={stale}
                            megaSource={megaSource}
                            onRemove={() => removeCalcEntry('defensive', entry.id)}
                          />
                        )
                      })}
                    </div>
                  </article>

                  {/* Offensive */}
                  <article className="matchup-col">
                    <div className="matchup-col-header">
                      <h3>⚔️ Offensive</h3>
                      {selectedMatchup.offensive.length > 0 && (
                        <button
                          type="button"
                          className="clear-btn"
                          onClick={() => clearAllCalcs('offensive')}
                        >
                          Cancella tutti
                        </button>
                      )}
                    </div>
                    <div className="add-calc-row">
                      <textarea
                        value={newOffCalc}
                        onChange={(e) => setNewOffCalc(e.target.value)}
                        placeholder="Incolla calc (anche più righe)..."
                        rows={2}
                      />
                      <button
                        type="button"
                        className="add-btn"
                        onClick={() => {
                          addCalcEntry('offensive', newOffCalc)
                          setNewOffCalc('')
                        }}
                      >
                        + Aggiungi
                      </button>
                    </div>
                    <div className="calc-list">
                      {selectedMatchup.offensive.map((entry) => {
                        const parsed = parseCalcLine(entry.raw)
                        if (!parsed) {
                          return (
                            <CalcCard
                              key={entry.id}
                              raw={entry.raw}
                              onRemove={() => removeCalcEntry('offensive', entry.id)}
                            />
                          )
                        }
                        const oppSpecies = extractSpecies(parsed.defender)
                        if (matchupFilter && oppSpecies !== matchupFilter) return null
                        const stale = isCalcStale(parsed, 'offensive', selectedPokemon)
                        const megaSource = getMegaSource(entry.raw, 'offensive')
                        return (
                          <CalcCard
                            key={entry.id}
                            parsed={parsed}
                            colorMode="offensive"
                            oppSpecies={oppSpecies}
                            stale={stale}
                            megaSource={megaSource}
                            onRemove={() => removeCalcEntry('offensive', entry.id)}
                          />
                        )
                      })}
                    </div>
                  </article>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/* ─────────── Components ─────────── */

function CalcCard({
  parsed,
  raw,
  colorMode,
  oppSpecies,
  stale,
  megaSource,
  onRemove,
}: {
  parsed?: ParsedCalc
  raw?: string
  colorMode?: 'defensive' | 'offensive'
  oppSpecies?: string | null
  stale?: boolean
  megaSource?: 'mine' | 'opp' | null
  onRemove: () => void
}) {
  if (!parsed) {
    return (
      <div className="calc-card raw">
        <p className="calc-main">{raw}</p>
        <button type="button" className="card-remove" onClick={onRemove}>✕</button>
      </div>
    )
  }

  let cardClass = 'calc-card'
  if (colorMode === 'defensive') {
    if (parsed.minPercent >= 100) cardClass += ' card-red'
    else if (parsed.maxPercent >= 100) cardClass += ' card-yellow'
    else cardClass += ' card-green'
  } else if (colorMode === 'offensive') {
    if (parsed.minPercent >= 100) cardClass += ' card-green'
    else if (parsed.maxPercent >= 100) cardClass += ' card-yellow'
    else cardClass += ' card-red'
  }
  if (stale) cardClass += ' card-stale'

  return (
    <div className={cardClass}>
      {stale && <span className="stale-badge" title="EVs cambiate — calc potenzialmente obsoleto">⚠️ obsoleto</span>}
      {megaSource === 'mine' && <span className="mega-badge mega-mine">Ⓜ Mega</span>}
      {megaSource === 'opp' && <span className="mega-badge mega-opp">Ⓜ Mega</span>}
      <div className="calc-card-top">
        {oppSpecies && (
          <img
            className="calc-opp-sprite"
            src={getSpriteUrl(oppSpecies)}
            alt={oppSpecies}
          />
        )}
        <div className="calc-card-content">
          <p className="calc-main">
            <strong>{parsed.attacker}</strong>
            <span className="vs-label">vs</span>
            <strong>{parsed.defender}</strong>
          </p>
          <p className="calc-pct">
            {parsed.minPercent.toFixed(1)}–{parsed.maxPercent.toFixed(1)}%
          </p>
          <p className="calc-ko">{parsed.koText}</p>
        </div>
        <button type="button" className="card-remove" onClick={onRemove}>✕</button>
      </div>
    </div>
  )
}

export default App
