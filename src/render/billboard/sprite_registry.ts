// Sprite registry: maps entity types to sprite sheet URLs.
// Each entity (player class, NPC, mob) can have its own sprite sheet.
//
// ============================================================================
// HOW TO ADD MORE SPRITES
// ============================================================================
//
// 1. CREATE THE SPRITE SHEET
//    - PNG: 4 columns (SE, E, N, NW), 1 row (idle). Each frame same size.
//    - Standard size: 2752x1536 (frame 688x1536) or 1836x1024 (frame 459x1024).
//    - Place in: public/models/chars/sprite_XXX_.png
//
// 2. CREATE THE JSON METADATA
//    - Copy an existing sprite_XXX_.json and update "image" + dimensions.
//    - frameWidth = imageWidth / columns
//    - frameHeight = imageHeight / rows
//    - Place in: public/models/chars/sprite_XXX_.json
//
// 3. REGISTER THE MAPPING
//    - Add entry to SPRITE_REGISTRY below:
//        'player_<class>': 'sprite_XXX_',   // for player classes
//        'mob_<family>':   'sprite_XXX_',   // for mobs
//        'npc_<id>':       'sprite_XXX_',   // for NPCs
//    - The key matches the visualKey from manifest.ts
//
// 4. DONE
//    - Preloading is automatic (getAllSpriteFilenames in loader.ts)
//    - Renderer uses getSpriteUrlsForEntity(vKey) to pick the right sprite
//    - Billboard direction + mirroring handled automatically by the system
//
// ============================================================================

export interface SpriteEntry {
  metaUrl: string;
  textureUrl: string;
}

// Default sprite for players (fallback)
const DEFAULT_PLAYER_SPRITE = 'sprite_003_';

// Sprite registry: entity key → sprite filename (without extension)
// Entity keys follow the visualKey convention: 'player_<class>', 'mob_<family>', 'npc_<id>'
const SPRITE_REGISTRY: Record<string, string> = {
  // Player classes
  'player_warrior': 'sprite_001_',
  'player_paladin': 'sprite_004_',
  'player_hunter': 'sprite_005_',
  'player_rogue': 'sprite_007_',
  'player_priest': 'sprite_009_',
  'player_shaman': 'sprite_010_',
  'player_mage': 'sprite_003_',
  'player_warlock': 'sprite_012_',
  'player_druid': 'sprite_013_',
  'player_novice': 'sprite_014_',

  // Fallback: any player class not listed above uses default
  'player_default': DEFAULT_PLAYER_SPRITE,

  // Town NPCs — map visual keys from manifest.ts to sprite sheets
  'npc_knight': 'sprite_001_',       // marshal_redbrook, warden_fenwick, captain_thessaly
  'npc_mage': 'sprite_003_',         // loremaster_caddis
  'npc_aldric': 'sprite_003_',       // brother_aldric
  'npc_smith': 'sprite_001_',        // smith_haldren, armorer_hode, foreman_odell, forgemistress_darva, tinker_gizzel
  'npc_scout': 'sprite_007_',        // scout_maren
  'npc_villager': 'sprite_007_',     // trader_wilkes, fisherman_brandt, provisioner_hale, quartermaster_bree, cook_marlow, tanner_hesk
  'npc_villager_robed': 'sprite_003_', // apothecary_lin, herbalist_yara, spirit_healer, weaver_ottilie, alchemist_verane
  'npc_fernando': 'sprite_007_',     // bursar_fernando
  'npc_reliquary_keeper': 'sprite_004_', // brother_halven
  'npc_edda_reedhand': 'sprite_013_',    // edda_reedhand
  'npc_chronicler': 'sprite_003_',   // chronicler_saul, chronicler_osric_fenn, chronicler_edda_hartwell
};

/** Get the sprite filename for an entity visual key. */
export function getSpriteFilename(visualKey: string): string {
  // Direct match
  if (SPRITE_REGISTRY[visualKey]) return SPRITE_REGISTRY[visualKey];

  // Player classes: extract class from 'player_<class>'
  if (visualKey.startsWith('player_')) {
    const cls = visualKey.slice(7); // remove 'player_'
    return SPRITE_REGISTRY[`player_${cls}`] ?? DEFAULT_PLAYER_SPRITE;
  }

  // NPCs and mobs: use visual key directly as sprite name
  // e.g., 'npc_guard' → 'sprite_npc_guard_' (if exists)
  // For now, fall back to default player sprite
  return DEFAULT_PLAYER_SPRITE;
}

/** Get full sprite URLs for an entity visual key. */
export function getSpriteUrls(visualKey: string): SpriteEntry {
  const filename = getSpriteFilename(visualKey);
  return {
    metaUrl: `/models/chars/${filename}.json`,
    textureUrl: `/models/chars/${filename}.png`,
  };
}

/** Get all registered sprite filenames (for preloading). */
export function getAllSpriteFilenames(): string[] {
  const filenames = new Set<string>(Object.values(SPRITE_REGISTRY));
  return [...filenames];
}

/** Register a custom sprite mapping at runtime. */
export function registerSprite(visualKey: string, spriteFilename: string): void {
  SPRITE_REGISTRY[visualKey] = spriteFilename;
}
