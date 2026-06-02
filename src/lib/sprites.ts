/**
 * Get sprite URL for a Pokémon species using Pokémon Showdown sprites.
 */

const SHOWDOWN_SPRITE_BASE =
  'https://play.pokemonshowdown.com/sprites/gen5/'

/**
 * Convert species name to Showdown sprite ID.
 * Examples: "Aerodactyl" → "aerodactyl", "Charizard-Mega-Y" → "charizard-megay"
 */
function toSpriteId(species: string): string {
  let id = species
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^basculegion-f$/, 'basculegion-f')
    .replace(/-mega-([xy])/, '-mega$1')
    .replace(/\s+/g, '')
  // Convert "mega-xyz" prefix to "xyz-mega" suffix (Showdown format)
  const megaMatch = id.match(/^mega-(.+?)(-[xy])?$/)
  if (megaMatch) {
    id = megaMatch[1] + '-mega' + (megaMatch[2] ?? '')
  }
  return id
}

export function getSpriteUrl(species: string): string {
  const id = toSpriteId(species)
  return `${SHOWDOWN_SPRITE_BASE}${id}.png`
}
