/**
 * Parser for Pokémon Showdown / Pokepaste set format (NCP-compatible).
 *
 * Example input:
 * Aerodactyl @ Aerodactylite
 * Ability: Unnerve
 * Level: 50
 * EVs: 2 HP / 32 Atk / 32 Spe
 * Jolly Nature
 * - Rock Slide
 * - Dual Wingbeat
 * - Tailwind
 * - Protect
 */

export type PokemonSet = {
  id: string
  species: string
  nickname: string | null
  gender: string | null
  item: string | null
  ability: string | null
  level: number
  evs: Record<string, number>
  nature: string | null
  moves: string[]
  speedStat: number | null // manually set by user
}

/**
 * Parse a multi-set text block (sets separated by blank lines or "---...")
 */
export function parseAllSets(raw: string): PokemonSet[] {
  // Split on double newline or "----" separators
  const blocks = raw
    .split(/\n\s*\n|^-{3,}$/m)
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.map(parseSingleSet)
}

/**
 * Parse a single set block into a PokemonSet object
 */
export function parseSingleSet(block: string): PokemonSet {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const set: PokemonSet = {
    id: crypto.randomUUID(),
    species: '',
    nickname: null,
    gender: null,
    item: null,
    ability: null,
    level: 50,
    evs: {},
    nature: null,
    moves: [],
    speedStat: null,
  }

  if (lines.length === 0) return set

  // First line: "Species (Gender) @ Item" or "Nickname (Species) (Gender) @ Item"
  parseFirstLine(lines[0], set)

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('- ')) {
      set.moves.push(line.slice(2).trim())
    } else if (line.startsWith('Ability:')) {
      set.ability = line.replace('Ability:', '').trim()
    } else if (line.startsWith('Level:')) {
      set.level = parseInt(line.replace('Level:', '').trim(), 10) || 50
    } else if (line.startsWith('EVs:')) {
      set.evs = parseEvs(line.replace('EVs:', '').trim())
    } else if (line.endsWith('Nature')) {
      set.nature = line.replace('Nature', '').trim()
    }
  }

  return set
}

function parseFirstLine(line: string, set: PokemonSet) {
  let remaining = line

  // Extract item after " @ "
  const atIndex = remaining.indexOf(' @ ')
  if (atIndex !== -1) {
    set.item = remaining.slice(atIndex + 3).trim()
    remaining = remaining.slice(0, atIndex).trim()
  }

  // Extract gender "(M)" or "(F)"
  const genderMatch = remaining.match(/\s*\((M|F)\)\s*$/)
  if (genderMatch) {
    set.gender = genderMatch[1]
    remaining = remaining.slice(0, genderMatch.index).trim()
  }

  // Check for nickname pattern: "Nickname (Species)"
  const nicknameMatch = remaining.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (nicknameMatch) {
    set.nickname = nicknameMatch[1].trim()
    set.species = nicknameMatch[2].trim()
  } else {
    set.species = remaining.trim()
  }
}

function parseEvs(evString: string): Record<string, number> {
  const evs: Record<string, number> = {}
  const parts = evString.split('/')

  for (const part of parts) {
    const match = part.trim().match(/^(\d+)\s+(\w+)$/)
    if (match) {
      evs[normalizeStatName(match[2])] = parseInt(match[1], 10)
    }
  }

  return evs
}

function normalizeStatName(stat: string): string {
  const map: Record<string, string> = {
    HP: 'hp',
    Atk: 'atk',
    Def: 'def',
    SpA: 'spa',
    SpD: 'spd',
    Spe: 'spe',
  }
  return map[stat] ?? stat.toLowerCase()
}

/**
 * Get a display label for a set (species + nature shorthand + speed info)
 */
export function getSetLabel(set: PokemonSet): string {
  const base = set.species || 'Unknown'
  const nature = set.nature ? ` (${set.nature})` : ''
  return `${base}${nature}`
}

/**
 * Group sets by species name (for opponents that have multiple variants)
 */
export function groupBySpecies(sets: PokemonSet[]): Map<string, PokemonSet[]> {
  const map = new Map<string, PokemonSet[]>()
  for (const set of sets) {
    const key = set.species || 'Unknown'
    const existing = map.get(key) || []
    existing.push(set)
    map.set(key, existing)
  }
  return map
}
