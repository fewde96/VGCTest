import { getBaseSpeed } from './base-stats'

/**
 * Nature speed modifiers.
 * +Speed: Jolly, Timid, Hasty, Naive
 * -Speed: Brave, Quiet, Relaxed, Sassy
 * Neutral: all others
 */
const SPEED_BOOSTING_NATURES = ['Jolly', 'Timid', 'Hasty', 'Naive']
const SPEED_DROPPING_NATURES = ['Brave', 'Quiet', 'Relaxed', 'Sassy']

export function getNatureModifier(nature: string | null): number {
  if (!nature) return 1.0
  const capitalized = nature.charAt(0).toUpperCase() + nature.slice(1).toLowerCase()
  if (SPEED_BOOSTING_NATURES.includes(capitalized)) return 1.1
  if (SPEED_DROPPING_NATURES.includes(capitalized)) return 0.9
  return 1.0
}

/**
 * Calculate the NCP speed stat.
 *
 * Formula (reverse-engineered from the NCP Damage Calculator):
 *   Speed = floor( (floor((2*Base + 31 + 2*EV_spe) * Level/100) + 5) * NatureMod )
 *
 * @param species - Pokémon species name
 * @param ncpSpeedEv - NCP EV points invested in Speed (0-32)
 * @param nature - Nature name
 * @param level - Pokémon level (default 50)
 * @returns calculated speed stat, or null if base stats unknown
 */
export function calcSpeed(
  species: string,
  ncpSpeedEv: number,
  nature: string | null,
  level: number = 50,
): number | null {
  const base = getBaseSpeed(species)
  if (base === null) return null

  const iv = 31
  const evContribution = 2 * ncpSpeedEv
  const inner = Math.floor((2 * base + iv + evContribution) * level / 100) + 5
  const natureMod = getNatureModifier(nature)
  return Math.floor(inner * natureMod)
}
