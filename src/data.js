// Custom difficulty settings as defined by the game's DifficultySettingData assets:
// label, category and description as shown in game, value range, and each preset's value.
// Generated from game data; regenerate after game updates.
export const DIFFICULTY_TAGS = [
 {
  "tag": "Difficulty.Progression.AllSkillsMaxed",
  "label": "All Skills Maxed",
  "group": "Player",
  "kind": "bool",
  "def": 0,
  "presets": {
   "Normal": 0,
   "Hard": 0,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.SurvivalCore.EnduranceDrainScale",
  "label": "Endurance Drain Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The rate at which the player's endurance drains",
  "min": 0,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.SurvivalCore.HungerKills",
  "label": "Hunger Kills",
  "group": "Player",
  "kind": "bool",
  "def": 0,
  "desc": "You can die from not eating",
  "presets": {
   "Normal": 0,
   "Hard": 1,
   "Creative": 0
  }
 },
 {
  "tag": "Difficulty.SurvivalCore.HydrationDrainScale",
  "label": "Hydration Drain Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The rate at which the player's hydration drains",
  "min": 0,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Player.InventoryCarryCapacityScale",
  "label": "Inventory Carry Capacity Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of your maximum inventory weight capacity",
  "min": 0,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Player.Invulnerable",
  "label": "Invulnerable",
  "group": "Player",
  "kind": "bool",
  "def": 0,
  "desc": "Enemy attacks cannot kill you",
  "presets": {
   "Normal": 0,
   "Hard": 0,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Player.LifewardScale",
  "label": "Lifeward Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of lifeward available",
  "min": 1,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Player.MaxNumberOfGravestonesPerPlayer",
  "label": "Max Number Of Gravestones Per Player",
  "group": "Player",
  "kind": "int",
  "def": 10,
  "desc": "How many active Gravestones you can have active in the world at a given time",
  "min": 0,
  "max": 20,
  "step": 1,
  "presets": {
   "Normal": 10,
   "Hard": 1,
   "Creative": 10
  }
 },
 {
  "tag": "Difficulty.Player.DamageScale",
  "label": "Player Damage Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Player.HealthScale",
  "label": "Player Health Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of health available",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Player.ResistancesScale",
  "label": "Player Resistances Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the resistences to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Player.StaminaScale",
  "label": "Player Stamina Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of stamina available",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Player.ResetLastCompletedXPLevelOnDeath",
  "label": "Reset Last Completed XP Level On Death",
  "group": "Player",
  "kind": "bool",
  "def": 0,
  "desc": "Any XP you had between achieved Skill Levels is lost upon death",
  "presets": {
   "Normal": 0,
   "Hard": 1,
   "Creative": 0
  }
 },
 {
  "tag": "Difficulty.Player.KeepInventoryOnDeath",
  "label": "Retain Inventory On Death",
  "group": "Player",
  "kind": "bool",
  "def": 0,
  "desc": "Retain your full inventory on death",
  "presets": {
   "Normal": 0,
   "Hard": 0,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Player.SpellCooldownScale",
  "label": "Spell Cooldown Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of Spell Cooldown times",
  "min": 0,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Player.SpellCostScale",
  "label": "Spell Cost Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of Spell Rune costs",
  "min": 0,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.SurvivalCore.SustenanceDrainScale",
  "label": "Sustenance Drain Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The rate at which the player's sustenance drains",
  "min": 0,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Player.TeleportationCostScale",
  "label": "Teleportation Cost Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of Lodestone Teleportation Rune costs",
  "min": 0,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.SurvivalCore.ThirstKills",
  "label": "Thirst Kills",
  "group": "Player",
  "kind": "bool",
  "def": 0,
  "desc": "You can die from not drinking",
  "presets": {
   "Normal": 0,
   "Hard": 1,
   "Creative": 0
  }
 },
 {
  "tag": "Difficulty.Progression.XPGainScale",
  "label": "XP Gain Scale",
  "group": "Player",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of XP gained from events that grant XP",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Progression.AllBuildingPiecesUnlocked",
  "label": "All Building Pieces Unlocked",
  "group": "Building",
  "kind": "bool",
  "def": 0,
  "desc": "Full access to the building catalogue",
  "presets": {
   "Normal": 0,
   "Hard": 0,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Progression.BuildingMaterialCostScale",
  "label": "Building Material Cost Scale",
  "group": "Building",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the material cost of building pieces",
  "min": 0,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Player.NoBuildingStability",
  "label": "No Building Stability",
  "group": "Building",
  "kind": "bool",
  "def": 0,
  "desc": "Building stability is turned off",
  "presets": {
   "Normal": 0,
   "Hard": 0,
   "Creative": 0
  }
 },
 {
  "tag": "Difficulty.Progression.AllCraftingRecipesUnlocked",
  "label": "All Crafting Recipes Unlocked",
  "group": "Crafting and Processing",
  "kind": "bool",
  "def": 0,
  "desc": "Full access to all Crafting recipes",
  "presets": {
   "Normal": 0,
   "Hard": 0,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Progression.CraftingCostScale",
  "label": "Crafting Cost Scale",
  "group": "Crafting and Processing",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the material cost of crafted items",
  "min": 0,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Progression.ProcessingSpeedScale",
  "label": "Processing Speed Scale",
  "group": "Crafting and Processing",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of time required to process materials",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.Environment.FriendlyFire",
  "label": "Friendly Fire",
  "group": "Environment",
  "kind": "bool",
  "def": 0,
  "desc": "Allow or prevent players from damaging each other",
  "presets": {
   "Normal": 0,
   "Hard": 0,
   "Creative": 0
  }
 },
 {
  "tag": "Difficulty.WorldEvents.MajorWorldEventFrequencyScale",
  "label": "Major World Event Frequency Scale",
  "group": "Environment",
  "kind": "scale",
  "def": 1,
  "desc": "How often Major World Events will occur",
  "min": 0,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.WorldEvents.MinorWorldEventFrequencyScale",
  "label": "Minor World Event Frequency Scale",
  "group": "Environment",
  "kind": "scale",
  "def": 1,
  "desc": "How often Minor World Events will occur",
  "min": 0,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 1,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.DisableAggressiveAI",
  "label": "Disable Aggressive AI",
  "group": "AI",
  "kind": "bool",
  "def": 0,
  "presets": {
   "Normal": 0,
   "Hard": 0,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Beast.Damage",
  "label": "Damage Scale",
  "group": "AI / Beast",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Beast.Health",
  "label": "Health Scale",
  "group": "AI / Beast",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the enemies health",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Beast.Resistances",
  "label": "Resistances Scale",
  "group": "AI / Beast",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the weaknessess to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Boss.Damage",
  "label": "Damage Scale",
  "group": "AI / Boss",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Boss.Health",
  "label": "Health Scale",
  "group": "AI / Boss",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the enemies health",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Boss.Resistances",
  "label": "Resistances Scale",
  "group": "AI / Boss",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the weaknessess to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Construct.Damage",
  "label": "Damage Scale",
  "group": "AI / Construct",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Construct.Health",
  "label": "Health Scale",
  "group": "AI / Construct",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the enemies health",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Construct.Resistances",
  "label": "Resistances Scale",
  "group": "AI / Construct",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the weaknessess to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Critter.Damage",
  "label": "Damage Scale",
  "group": "AI / Critter",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Critter.Health",
  "label": "Health Scale",
  "group": "AI / Critter",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the enemies health",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Critter.Resistances",
  "label": "Resistances Scale",
  "group": "AI / Critter",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the weaknessess to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Garou.Damage",
  "label": "Damage Scale",
  "group": "AI / Garou",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Garou.Health",
  "label": "Health Scale",
  "group": "AI / Garou",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the enemies health",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Garou.Resistances",
  "label": "Resistances Scale",
  "group": "AI / Garou",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the weaknessess to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Goblin.Damage",
  "label": "Damage Scale",
  "group": "AI / Goblin",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Goblin.Health",
  "label": "Health Scale",
  "group": "AI / Goblin",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the enemies health",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Goblin.Resistances",
  "label": "Resistances Scale",
  "group": "AI / Goblin",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the weaknessess to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Kalphite.Damage",
  "label": "Damage Scale",
  "group": "AI / Kalphite",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Kalphite.Health",
  "label": "Health Scale",
  "group": "AI / Kalphite",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the enemies health",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Kalphite.Resistances",
  "label": "Resistances Scale",
  "group": "AI / Kalphite",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the weaknessess to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Kothaar.Damage",
  "label": "Damage Scale",
  "group": "AI / Kothaar",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Kothaar.Health",
  "label": "Health Scale",
  "group": "AI / Kothaar",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the enemies health",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Kothaar.Resistances",
  "label": "Resistances Scale",
  "group": "AI / Kothaar",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the weaknessess to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.MiniBoss.Damage",
  "label": "Damage Scale",
  "group": "AI / Mini-Boss",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.MiniBoss.Health",
  "label": "Health Scale",
  "group": "AI / Mini-Boss",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the enemies health",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.MiniBoss.Resistances",
  "label": "Resistances Scale",
  "group": "AI / Mini-Boss",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the weaknessess to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Skeleton.Damage",
  "label": "Damage Scale",
  "group": "AI / Skeleton",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Skeleton.Health",
  "label": "Health Scale",
  "group": "AI / Skeleton",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the enemies health",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Skeleton.Resistances",
  "label": "Resistances Scale",
  "group": "AI / Skeleton",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the weaknessess to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Undead.Damage",
  "label": "Damage Scale",
  "group": "AI / Undead",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Undead.Health",
  "label": "Health Scale",
  "group": "AI / Undead",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the enemies health",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Undead.Resistances",
  "label": "Resistances Scale",
  "group": "AI / Undead",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the weaknessess to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Zamorak.Damage",
  "label": "Damage Scale",
  "group": "AI / Zamorak",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of damage caused",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Zamorak.Health",
  "label": "Health Scale",
  "group": "AI / Zamorak",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the enemies health",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 },
 {
  "tag": "Difficulty.AI.Zamorak.Resistances",
  "label": "Resistances Scale",
  "group": "AI / Zamorak",
  "kind": "scale",
  "def": 1,
  "desc": "The scale of the weaknessess to damage types the player / AI might have",
  "min": 0.5,
  "max": 3,
  "step": 0.1,
  "presets": {
   "Normal": 1,
   "Hard": 2,
   "Creative": 1
  }
 }
];

// ESurvivalDifficulty (values from the game executable).
export const DIFFICULTY_MODES = { 0: 'Normal', 1: 'Hard', 2: 'Creative', 3: 'Custom' };
