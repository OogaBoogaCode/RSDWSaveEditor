// Custom difficulty tags the game registers (taken from the game's own log output).
// kind "bool" is stored as 0/1, "scale" as a multiplier where 1 is the default.

const AI = ['Beast', 'Boss', 'Construct', 'Critter', 'Garou', 'Goblin', 'Kalphite', 'Kothaar', 'MiniBoss', 'Skeleton', 'Undead', 'Zamorak'];

export const DIFFICULTY_TAGS = [
  { tag: 'Difficulty.Player.HealthScale', group: 'Player', kind: 'scale', def: 1, label: 'Health' },
  { tag: 'Difficulty.Player.StaminaScale', group: 'Player', kind: 'scale', def: 1, label: 'Stamina' },
  { tag: 'Difficulty.Player.DamageScale', group: 'Player', kind: 'scale', def: 1, label: 'Damage dealt' },
  { tag: 'Difficulty.Player.LifewardScale', group: 'Player', kind: 'scale', def: 1, label: 'Lifeward' },
  { tag: 'Difficulty.Player.InventoryCarryCapacityScale', group: 'Player', kind: 'scale', def: 1, label: 'Carry capacity' },
  { tag: 'Difficulty.Player.KeepInventoryOnDeath', group: 'Player', kind: 'bool', def: 0, label: 'Keep inventory on death' },
  { tag: 'Difficulty.Player.NoBuildingStability', group: 'Player', kind: 'bool', def: 0, label: 'No building stability' },
  { tag: 'Difficulty.Progression.XPGainScale', group: 'Progression', kind: 'scale', def: 1, label: 'XP gain' },
  { tag: 'Difficulty.Progression.ProcessingSpeedScale', group: 'Progression', kind: 'scale', def: 1, label: 'Processing speed' },
  { tag: 'Difficulty.SurvivalCore.SustenanceDrainScale', group: 'Survival', kind: 'scale', def: 1, label: 'Hunger drain' },
  { tag: 'Difficulty.SurvivalCore.HydrationDrainScale', group: 'Survival', kind: 'scale', def: 1, label: 'Thirst drain' },
  { tag: 'Difficulty.SurvivalCore.EnduranceDrainScale', group: 'Survival', kind: 'scale', def: 1, label: 'Endurance drain' },
  { tag: 'Difficulty.Environment.FriendlyFire', group: 'World', kind: 'bool', def: 0, label: 'Friendly fire' },
  { tag: 'Difficulty.AI.DisableAggressiveAI', group: 'World', kind: 'bool', def: 0, label: 'Passive enemies' },
  ...AI.flatMap(a => ['Health', 'Damage', 'Resistances'].map(s => ({
    tag: `Difficulty.AI.${a}.${s}`, group: 'Enemies', kind: 'scale', def: 1,
    label: a.replace('MiniBoss', 'Mini-boss') + ' ' + s.toLowerCase(),
  }))),
];

// SurvivalDifficulty values confirmed from saves. Anything else is shown as "Other (n)".
export const DIFFICULTY_MODES = { 0: 'Standard', 3: 'Custom' };
