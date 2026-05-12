// AI Sound Matcher — query sound_tags.json from TRPG scene descriptions
const fs = require('fs');
const path = require('path');

// ── Scene description → tag mapping ──
// Maps natural language scene descriptions to Setting + Scene + Emotion tags
const DESCRIPTOR_MAP = {
  // D&D Fantasy locations
  'tavern|inn|pub|bar|alehouse|brewery': { scene: 'Tavern', setting: 'D&D_Fantasy' },
  'dungeon|underground|catacomb|crypt|sewer|mine|underdark': { scene: 'Dungeon' },
  'forest|woods|grove|thicket|jungle|wildwood': { scene: 'Forest' },
  'temple|shrine|church|cathedral|abbey|monastery|sanctum': { scene: 'Temple' },
  'castle|fortress|keep|citadel|palace|stronghold': { scene: 'Castle' },
  'mountain|peak|cliff|crag|pass|highland': { scene: 'Mountain' },
  'desert|dune|arid|sand|wasteland|badland': { scene: 'Desert' },
  'swamp|marsh|bog|fen|wetland|mire': { scene: 'Swamp' },
  'snow|ice|frozen|tundra|glacier|winter|arctic': { scene: 'Snow_Ice' },
  'village|hamlet|farm|cottage|rural|countryside|pasture': { scene: 'Rural' },
  'plains|prairie|steppe|grassland|meadow': { scene: 'Plains' },
  'sea|ocean|coast|shore|beach|harbor|port|dock|ship|boat|sail|voyage': { scene: 'Sea' },

  // CoC / Modern locations
  'city|street|urban|alley|market|bazaar|plaza|downtown': { scene: 'City' },
  'office|agency|bureau|headquarter|department': { scene: 'City', setting: 'CoC_Horror' },
  'mansion|estate|manor|villa|chateau|arkham|innsmouth': { scene: 'Castle', setting: 'CoC_Horror' },
  'attic|basement|cellar|creaky|dusty|old_house': { scene: 'Dungeon', setting: 'CoC_Horror' },
  'asylum|sanitarium|hospital|ward|clinic|infirmary': { scene: 'Asylum' },
  'library|archive|study|museum|gallery|collection|antiquarian': { scene: 'Temple', setting: 'CoC_Horror' },
  'laboratory|lab|workshop|factory|foundry|plant': { scene: 'Laboratory' },
  'graveyard|cemetery|tomb|crypt|mausoleum|necropolis|funeral|burial|grave': { scene: 'Graveyard', setting: 'CoC_Horror' },
  'hotel|motel|lodge|inn_modern': { scene: 'Tavern', setting: 'CoC_Horror' },
  'police|sheriff|detective|investigator|crime|csi|forensic': { scene: 'City', setting: 'CoC_Horror' },
  'docks|wharf|pier|waterfront|harbor_town': { scene: 'Sea', setting: 'CoC_Horror' },

  // Sci-Fi / Space
  'spaceship|starship|shuttle|freighter|cruiser|frigate|bridge|cockpit': { scene: 'Spaceship', setting: 'SciFi_Space' },
  'spaceport|starbase|station|dock|hangar|bay': { scene: 'Spaceport', setting: 'SciFi_Space' },
  'alien|extraterrestrial|xeno|martian|planet': { scene: 'Alien', setting: 'SciFi_Space' },

  // Cyberpunk
  'nightclub|neon.lit|neon_|cyber|megacorp|hacker|netrunner|cyberspace|matrix': { scene: 'City', setting: 'Cyberpunk' },
  'rave|discotheque|underground_club|club_music': { scene: 'Tavern', setting: 'Cyberpunk' },

  // Weather (cross-cutting)
  'rain|rainy|downpour|drizzle|precipitation': { scene: 'Weather_Rain' },
  'storm|thunder|lightning|hurricane|typhoon|gale|tempest': { scene: 'Weather_Storm' },
  'wind|windy|gust|breeze|howling_wind': { scene: 'Weather_Wind' },

  // Western
  'saloon|ranch|frontier|west|outlaw|sheriff|posse': { scene: 'Tavern', setting: 'Historical' },

  // Combat
  'battle|combat|fight|skirmish|assault|ambush|siege|war|raid|clash': { scene: 'Battle' },
  'chase|pursuit|escape|flee|run_away|getaway': { scene: 'Battle' },
  'duel|showdown|arena|tournament|joust': { scene: 'Battle' },

  // Travel
  'journey|travel|voyage|trek|expedition|caravan|march': { scene: 'Movement' },
  'camp|campsite|rest|long_rest|bivouac|make_camp': { scene: 'Campsite' },

  // Rituals & Ceremonies
  'ritual|ceremony|rite|procession|sacrifice|offering|incantation|invocation|conjuration': { scene: 'Temple' },
  'choir|chant|hymn|psalm|gregorian|liturgy|orchestral_mass': { scene: 'Temple', emotion: 'Epic' },

  // Emotions
  'horror|terror|fear|dread|nightmare|frightening|terrifying|eldritch|cthulhu|lovecraftian': { emotion: 'Horror' },
  'epic|grand|heroic|glorious|majestic|triumphant|legendary': { emotion: 'Epic' },
  'tense|suspense|danger|thrilling|nerve|edge.of.seat|anxiety|stress': { emotion: 'Tense' },
  'sad|sorrow|tragic|mourn|grief|lament|heartbreak|melancholy|funeral|requiem|dirge|elegy': { emotion: 'Sorrow' },
  'calm|peace|serene|tranquil|gentle|quiet|relaxing|soothing|stillness': { emotion: 'Peaceful' },
  'happy|joy|celebration|festive|cheerful|merry|jubilant|revelry|feast|banquet': { emotion: 'Joyful' },
  'mystery|mysterious|enigma|puzzle|secret|unknown|strange|occult|supernatural': { emotion: 'Mystery' },
  'dark|gloomy|shadow|sinister|ominous|foreboding|grim|bleak|dreary|dim': { emotion: 'Dark' },

  // Sound type hints
  'background|ambient|ambience|atmosphere|loop|continuous': { type: 'Ambience_Loop' },
  'effect|sound|noise|bang|crash|boom|slam': { type: 'Oneshot' },
  'music|song|melody|tune|orchestral|instrumental': { type: 'Music' },
};

// ── Setting hints from system mentions ──
const SETTING_HINTS = {
  'D&D|dnd|dungeons.?dragons|pathfinder|osr|forgotten.?realms|greyhawk|dragonlance|ebberon|ravenloft|barovia|strahd|faerun|sword.?coast|neverwinter|waterdeep|baldur': 'D&D_Fantasy',
  'coc|cthulhu|lovecraft|eldritch|mythos|delta.?green|trail.?of.?cthulhu|sanity|insanity|madness|arkham|innsmouth|miskatonic|nyarlathotep|shoggoth': 'CoC_Horror',
  'cyberpunk|shadowrun|sprawl|chrome|neon|megacorp|netrunner|edgerunner': 'Cyberpunk',
  'starfinder|traveller|mothership|stars.?without.?number|alien.?rpg|space.?opera|galactic|interstellar': 'SciFi_Space',
  'deadlands|weird.?west|western|cowboy|six.?shooter|saloongirl': 'Historical',
  'viking|norse|midgard|asgard|odin|thor|ragnarok|valhalla|draugr': 'Historical',
  'victorian|gaslight|steampunk|vaesen|blades.?in.?the.?dark|duskvol': 'Historical',
  'wuxia|oriental|samurai|ninja|shogun|ronin|l5r|legend.?of.?the.?five.?rings': 'Wuxia',
};

function matchDescriptors(text, map) {
  const lower = text.toLowerCase();
  const results = {};
  for (const [pattern, tags] of Object.entries(map)) {
    if (new RegExp(pattern, 'i').test(lower)) {
      Object.assign(results, tags);
    }
  }
  return results;
}

// ── Main query function ──
function querySounds(sceneText, db, options = {}) {
  const { maxResults = 10, preferSetting = null } = options;

  // 1. Parse scene text → desired tags
  const desired = matchDescriptors(sceneText, DESCRIPTOR_MAP);
  const sysSetting = matchDescriptors(sceneText, Object.fromEntries(
    Object.entries(SETTING_HINTS).map(([k, v]) => [k, { setting: v }])
  ));
  const setting = preferSetting || sysSetting.setting || desired.setting || null;

  // 2. Score every file
  const scored = [];
  for (const [pad, data] of Object.entries(db)) {
    if (pad === '_meta') continue;
    for (const [name, tags] of Object.entries(data.files)) {
      let score = 0;

      // Scene match (highest weight — what the scene IS)
      if (desired.scene && tags.scene === desired.scene) score += 40;
      else if (desired.scene && tags.scene === 'General') score += 5;

      // Emotion match
      if (desired.emotion && tags.emotion === desired.emotion) score += 25;
      else if (desired.emotion && tags.emotion === 'Neutral') score += 8;

      // Setting match (context boost, less weight than scene)
      if (setting && data.setting === setting) score += 15;
      else if (data.setting === 'Universal') score += 10;
      else if (setting && data.setting !== setting && data.setting !== 'Universal') score += 0;

      // Type preference (ambience loops for background)
      if (desired.type && tags.type === desired.type) score += 10;
      else if (!desired.type && tags.type === 'Ambience_Loop') score += 8;

      if (score > 0) {
        scored.push({ pad, name, tags, setting: data.setting, score });
      }
    }
  }

  // 3. Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // 4. Deduplicate across pads (prefer variety)
  const seen = new Set();
  const results = [];
  for (const item of scored) {
    const key = item.tags.scene + '|' + item.tags.type;
    if (!seen.has(key) || item.score > 40) {
      seen.add(key);
      results.push(item);
    }
    if (results.length >= maxResults) break;
  }

  return results;
}

// ── Group recommendations by scene ──
function recommendForModule(moduleScenes, db) {
  // moduleScenes: [{ description, setting?, count? }]
  const recommendations = {};

  for (const scene of moduleScenes) {
    const key = scene.description.slice(0, 30);
    const results = querySounds(scene.description, db, {
      maxResults: scene.count || 5,
      preferSetting: scene.setting || null
    });
    recommendations[key] = results;
  }

  return recommendations;
}

// ── CLI test ──
if (require.main === module) {
  const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'sound_tags.json'), 'utf8'));

  const testScenes = [
    { description: 'Players enter a dark forest at night, wolves howling in the distance', count: 5 },
    { description: 'A tense battle against goblins in a dungeon corridor', count: 4 },
    { description: 'Investigating an abandoned Victorian mansion in Arkham, strange noises from the attic', count: 5 },
    { description: 'The party arrives at a bustling medieval tavern, music and laughter fill the air', count: 4 },
    { description: 'Space station docking bay, alarms blaring as the crew escapes', count: 4 },
    { description: 'Peaceful campsite by a mountain lake at dawn', count: 3 },
    { description: 'Cyberpunk nightclub in the neon-lit undercity', count: 4 },
    { description: 'Sailing through a violent storm, waves crashing against the hull', count: 4 },
    { description: 'Ancient Greek temple ceremony with choir and ritual', count: 4 },
    { description: 'A sorrowful funeral in a rain-soaked Victorian graveyard', count: 4 },
  ];

  console.log('=== AI Sound Matcher — Demo ===\n');
  for (const scene of testScenes) {
    console.log(`Scene: "${scene.description}"`);
    const results = querySounds(scene.description, db, { maxResults: scene.count });
    for (const r of results) {
      console.log(`  [${r.score}] ${r.pad}/${r.name}`);
      console.log(`       tags: ${r.setting} | ${r.tags.scene} | ${r.tags.emotion} | ${r.tags.type}`);
    }
    console.log('');
  }
}

module.exports = { querySounds, recommendForModule };
