import type { PlayerClass } from '../types';
import {
  DRUID_CHOICE_ROWS,
  HUNTER_CHOICE_ROWS,
  MAGE_CHOICE_ROWS,
  PALADIN_CHOICE_ROWS,
  PRIEST_CHOICE_ROWS,
  ROGUE_CHOICE_ROWS,
  SHAMAN_CHOICE_ROWS,
  WARLOCK_CHOICE_ROWS,
} from './choice_rows_classic';
import type { TalentEffect } from './talents';
import { WARRIOR_ROWS } from './warrior_rows';

export const ROW_LEVELS = [5, 8, 11, 14, 17, 20] as const;
export type TalentRowLevel = (typeof ROW_LEVELS)[number];

export const ROW_COUNT = ROW_LEVELS.length;
export const OPTIONS_PER_ROW = 3;

export interface TalentRowOption {
  id: string;
  name: string;
  description: string;
  icon?: string;
  effect: TalentEffect;
}

export interface TalentRow {
  level: TalentRowLevel;
  theme?: string;
  decision?: string;
  options: readonly [TalentRowOption, TalentRowOption, TalentRowOption];
}

export type RowTree = readonly TalentRow[];

export interface ClassChoiceRows {
  rows: RowTree;
}

// Novice class: simplified talent tree for the job change system.
// Novices change class at level 5, so these rows are placeholders.
const NOVICE_ROWS: RowTree = [
  {
    level: 5,
    theme: 'Foundation',
    decision: 'Choose your path',
    options: [
      { id: 'novice_str_1', name: 'Muscle', description: '+5 Strength', effect: { stats: { str: 5 } } },
      { id: 'novice_agi_1', name: 'Agility', description: '+5 Agility', effect: { stats: { agi: 5 } } },
      { id: 'novice_int_1', name: 'Intellect', description: '+5 Intellect', effect: { stats: { int: 5 } } },
    ],
  },
  {
    level: 8,
    theme: 'Endurance',
    options: [
      { id: 'novice_sta_1', name: 'Vitality', description: '+5 Stamina', effect: { stats: { sta: 5 } } },
      { id: 'novice_spi_1', name: 'Spirit', description: '+5 Spirit', effect: { stats: { spi: 5 } } },
      { id: 'novice_armor_1', name: 'Resilience', description: '+20 Armor', effect: { stats: { armor: 20 } } },
    ],
  },
  {
    level: 11,
    theme: 'Focus',
    options: [
      { id: 'novice_dmg_1', name: 'Might', description: '+15% Smite damage', effect: { ability: [{ ability: 'novice_smite', dmgPct: 0.15 }] } },
      { id: 'novice_heal_1', name: 'Grace', description: '+20% healing', effect: { ability: [{ ability: 'novice_heal', dmgPct: 0.2 }] } },
      { id: 'novice_hp_1', name: 'Fortitude', description: '+50 max HP', effect: { stats: { sta: 10 } } },
    ],
  },
  {
    level: 14,
    theme: 'Discipline',
    options: [
      { id: 'novice_cast_1', name: 'Haste', description: '-10% cast time', effect: { ability: [{ ability: 'novice_smite', castPct: -0.1 }] } },
      { id: 'novice_cost_1', name: 'Efficiency', description: '-15% mana cost', effect: { ability: [{ ability: 'novice_heal', costPct: -0.15 }] } },
      { id: 'novice_dur_1', name: 'Endurance', description: '+25% buff duration', effect: { ability: [{ ability: 'novice_blessing', buffPct: 0.25 }] } },
    ],
  },
  {
    level: 17,
    theme: 'Mastery',
    options: [
      { id: 'novice_crit_1', name: 'Precision', description: '+5% crit chance', effect: { stats: { agi: 8 } } },
      { id: 'novice_spd_1', name: 'Swiftness', description: '+5% move speed', effect: { global: { onKillSpeedPct: 0.05 } } },
      { id: 'novice_res_1', name: 'Tenacity', description: '+10% max HP', effect: { stats: { staPct: 0.1 } } },
    ],
  },
  {
    level: 20,
    theme: 'Awakening',
    options: [
      { id: 'novice_all_1', name: 'Balance', description: '+5 all stats', effect: { stats: { str: 5, agi: 5, sta: 5, int: 5, spi: 5 } } },
      { id: 'novice_pwr_1', name: 'Power', description: '+20% all damage and healing', effect: { global: { spellDmgPct: 0.2, healPct: 0.2 } } },
      { id: 'novice_sur_1', name: 'Survival', description: '+100 max HP, +20 armor', effect: { stats: { sta: 20, armor: 20 } } },
    ],
  },
];

export const ROW_TREES = {
  warrior: WARRIOR_ROWS,
  paladin: PALADIN_CHOICE_ROWS.rows,
  hunter: HUNTER_CHOICE_ROWS.rows,
  rogue: ROGUE_CHOICE_ROWS.rows,
  priest: PRIEST_CHOICE_ROWS.rows,
  shaman: SHAMAN_CHOICE_ROWS.rows,
  mage: MAGE_CHOICE_ROWS.rows,
  warlock: WARLOCK_CHOICE_ROWS.rows,
  druid: DRUID_CHOICE_ROWS.rows,
  novice: NOVICE_ROWS,
} satisfies Record<PlayerClass, RowTree>;

const ROW_LEVEL_SET = new Set<number>(ROW_LEVELS);

export function isTalentRowLevel(level: number): level is TalentRowLevel {
  return Number.isInteger(level) && ROW_LEVEL_SET.has(level);
}

export function rowTreeFor(cls: PlayerClass): RowTree | null {
  return (ROW_TREES as Partial<Record<PlayerClass, RowTree>>)[cls] ?? null;
}

export function rowForLevel(cls: PlayerClass, level: number): TalentRow | null {
  if (!isTalentRowLevel(level)) return null;
  return rowTreeFor(cls)?.find((row) => row.level === level) ?? null;
}

export function rowsUnlockedAtLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  let unlocked = 0;
  for (const rowLevel of ROW_LEVELS) {
    if (level >= rowLevel) unlocked++;
  }
  return unlocked;
}

export function validateRowTree(tree: RowTree): string[] {
  const errors: string[] = [];
  if (tree.length !== ROW_COUNT) {
    errors.push(`expected ${ROW_COUNT} rows, got ${tree.length}`);
  }

  const optionIds = new Set<string>();
  for (let index = 0; index < tree.length; index++) {
    const row = tree[index];
    const expectedLevel = ROW_LEVELS[index];
    if (row.level !== expectedLevel) {
      errors.push(`row ${index}: level ${row.level}, expected ${expectedLevel}`);
    }
    if (row.options.length !== OPTIONS_PER_ROW) {
      errors.push(`row ${index}: ${row.options.length} options, expected ${OPTIONS_PER_ROW}`);
    }
    for (const option of row.options) {
      if (option.id.length === 0) {
        errors.push(`row ${index}: an option has no id`);
      } else if (optionIds.has(option.id)) {
        errors.push(`duplicate option id: ${option.id}`);
      } else {
        optionIds.add(option.id);
      }
    }
  }
  return errors;
}

for (const [cls, tree] of Object.entries(ROW_TREES)) {
  const errors = validateRowTree(tree);
  if (errors.length > 0) {
    throw new Error(`Invalid talent row tree for ${cls}: ${errors.join('; ')}`);
  }
}
