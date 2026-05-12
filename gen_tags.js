// Generate sound_tags.json — TRPG SoundPad tag database
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, 'tta-sounds');

// ── SoundPad → Setting ──
const SETTING = {
  tavern: 'D&D_Fantasy', dungeon: 'D&D_Fantasy', castle_raven: 'D&D_Fantasy',
  darkforest: 'D&D_Fantasy', olde_towne: 'D&D_Fantasy', combat: 'D&D_Fantasy',
  combat_siege: 'D&D_Fantasy', monsters: 'D&D_Fantasy', sanctum: 'D&D_Fantasy',
  dm_tools: 'D&D_Fantasy', wasteland: 'D&D_Fantasy',
  cthulhu: 'CoC_Horror', house_on_the_hill: 'CoC_Horror', vampire: 'CoC_Horror',
  film_noir: 'CoC_Horror', secret_agent: 'CoC_Horror', bleakwater_docks: 'CoC_Horror',
  future_city: 'Cyberpunk', combat_future: 'Cyberpunk',
  alien_starship: 'SciFi_Space', starship: 'SciFi_Space', desert_planet: 'SciFi_Space',
  ice_planet: 'SciFi_Space', jungle_planet: 'SciFi_Space', hell_planet: 'SciFi_Space',
  deep_six: 'SciFi_Space', steampunk: 'SciFi_Space',
  ancient_greece: 'Historical', atlantis: 'Historical', true_west: 'Historical',
  age_of_sail: 'Historical',
  wuxia: 'Wuxia',
  weirder_things: 'Universal',
};

// ── Keyword → Scene (longest match first) ──
const SCENE_KW = [
  ['innkeeper','Tavern'],['bartender','Tavern'],['saloon','Tavern'],['tavern','Tavern'],
  ['drinking','Tavern'],['drink','Tavern'],['wine','Tavern'],['ale','Tavern'],
  ['lute','Tavern_Music'],['glasses','Tavern'],['inn','Tavern'],
  ['dungeon','Dungeon'],['catacomb','Dungeon'],['underground','Dungeon'],
  ['sewer','Dungeon'],['mine','Dungeon'],['cavern','Dungeon'],['cave','Dungeon'],
  ['tunnel','Dungeon'],['tomb','Dungeon'],['crypt','Dungeon'],['prison','Dungeon'],
  ['jail','Dungeon'],['ooze','Dungeon'],['drip','Dungeon'],['bubbles','Dungeon'],
  ['forest','Forest'],['woods','Forest'],['jungle','Forest'],['grove','Forest'],
  ['trees','Forest'],['birdsong','Forest'],['cricket','Forest'],['darkforest','Forest'],
  ['wild','Forest'],['bush','Forest'],
  ['campfire','Campsite'],['camp','Campsite'],['bivouac','Campsite'],
  ['temple','Temple'],['church','Temple'],['cathedral','Temple'],
  ['sanctum','Temple'],['choir','Temple'],['monk','Temple'],['oracle','Temple'],
  ['shrine','Temple'],['altar','Temple'],['abbey','Temple'],
  ['castle','Castle'],['throne','Castle'],['royal','Castle'],['portcullis','Castle'],
  ['palace','Castle'],['citadel','Castle'],['fortress','Castle'],
  ['siege','Battle'],['battle','Battle'],['combat','Battle'],['attack','Battle'],
  ['assault','Battle'],['skirmish','Battle'],['ambush','Battle'],['warfare','Battle'],
  ['sword','Battle'],['arrow','Battle'],['pistol','Battle'],['gun','Battle'],
  ['rifle','Battle'],['cannon','Battle'],['ballista','Battle'],['catapult','Battle'],
  ['explosion','Battle'],['bombard','Battle'],['phalanx','Battle'],['shield_wall','Battle'],
  ['naval','Battle_Sea'],['broadsides','Battle_Sea'],
  ['ocean','Sea'],['sea','Sea'],['sail','Sea'],['ship','Sea'],['harbor','Sea'],
  ['dock','Sea'],['underwater','Sea'],['wave','Sea'],['bilge','Sea'],
  ['boat','Sea'],['deck','Sea'],['seawash','Sea'],['mast','Sea'],['titanic','Sea'],
  ['submerged','Sea'],['whirlpool','Sea'],['deep_blue','Sea'],['fishing','Sea'],
  ['city','City'],['street','City'],['market','City'],['bazaar','City'],
  ['crowd','City'],['traffic','City'],['subway','City'],['urban','City'],
  ['alley','City'],['rooftop','City'],['slum','City'],
  ['desert','Desert'],['sand','Desert'],['oasis','Desert'],['dune','Desert'],
  ['wasteland','Wasteland'],['ruin','Wasteland'],['barren','Wasteland'],
  ['snow','Snow_Ice'],['ice','Snow_Ice'],['frozen','Snow_Ice'],['winter','Snow_Ice'],
  ['blizzard','Snow_Ice'],['avalanche','Snow_Ice'],['glacier','Snow_Ice'],
  ['swamp','Swamp'],['marsh','Swamp'],['bog','Swamp'],['mud','Swamp'],
  ['mountain','Mountain'],['cliff','Mountain'],['crag','Mountain'],['peak','Mountain'],
  ['plains','Plains'],['steppe','Plains'],['prairie','Plains'],
  ['farm','Rural'],['village','Rural'],['cow','Rural'],['horse','Rural'],
  ['stable','Rural'],['field','Rural'],['ranch','Rural'],
  ['lab','Laboratory'],['computer','Laboratory'],['machine','Laboratory'],
  ['reactor','Laboratory'],['testing','Laboratory'],['experiment','Laboratory'],
  ['spaceship','Spaceship'],['starship','Spaceship'],['bridge','Spaceship'],
  ['docking','Spaceship'],['cryo','Spaceship'],['freighter','Spaceship'],
  ['shuttle','Spaceship'],['probe','Spaceship'],['cockpit','Spaceship'],
  ['alien','Alien'],['planet','Alien'],['martian','Alien'],['extraterrestrial','Alien'],
  ['spaceport','Spaceport'],['starbase','Spaceport'],['station','Spaceport'],
  ['graveyard','Graveyard'],['zombie','Undead'],['vampire','Undead'],
  ['ghost','Undead'],['spirit','Undead'],['undead','Undead'],['necropolis','Undead'],
  ['banshee','Undead'],['lich','Undead'],['skeleton','Undead'],
  ['asylum','Asylum'],['hospital','Asylum'],['sanitarium','Asylum'],
  ['rain','Weather_Rain'],['storm','Weather_Storm'],['thunder','Weather_Storm'],
  ['lightning','Weather_Storm'],['wind','Weather_Wind'],
  ['fire','Fire'],['burn','Fire'],['volcano','Fire'],['lava','Fire'],
  ['inferno','Fire'],['flame','Fire'],
  ['footstep','Movement'],['walk','Movement'],['run','Movement'],
  ['door','Door'],['gate','Door'],['open','Door'],['close','Door'],
  ['music','Music'],['melody','Music'],['song','Music'],['ballad','Music'],
  ['tone','Music_Tone'],['drone','Music_Tone'],['pad','Music_Tone'],
  ['sting','Sting'],['stinger','Sting'],['hit','Sting'],
  ['scream','Voice'],['shout','Voice'],['laugh','Voice'],['cheer','Voice'],
  ['whisper','Voice'],['chant','Voice'],['crowd','Voice'],
  ['animal','Creature'],['beast','Creature'],['monster','Creature'],
  ['dragon','Creature'],['goblin','Creature'],['troll','Creature'],
  ['creature','Creature'],['beast','Creature'],['growl','Creature'],
];

// ── Keyword → Emotion ──
const EMOTION_KW = [
  ['epic','Epic'],['grand','Epic'],['heroic','Epic'],['majestic','Epic'],
  ['triumph','Epic'],['victory','Epic'],['fanfare','Epic'],['choir','Epic'],
  ['horror','Horror'],['terror','Horror'],['fear','Horror'],['dread','Horror'],
  ['nightmare','Horror'],['haunt','Horror'],['ghost','Horror'],['eerie','Horror'],
  ['spooky','Horror'],['creepy','Horror'],['sinister','Horror'],['evil','Horror'],
  ['demonic','Horror'],['hell','Horror'],['abyssal','Horror'],
  ['cthulhu','Horror'],['lovecraft','Horror'],['eldritch','Horror'],
  ['sad','Sorrow'],['melancholy','Sorrow'],['sorrow','Sorrow'],
  ['mourn','Sorrow'],['tragic','Sorrow'],['funeral','Sorrow'],
  ['lament','Sorrow'],['lonely','Sorrow'],['lonesome','Sorrow'],
  ['desolate','Sorrow'],['grief','Sorrow'],['tear','Sorrow'],
  ['calm','Peaceful'],['peace','Peaceful'],['serene','Peaceful'],
  ['tranquil','Peaceful'],['gentle','Peaceful'],['soft','Peaceful'],
  ['quiet','Peaceful'],['healing','Peaceful'],['meditation','Peaceful'],
  ['soothe','Peaceful'],['relax','Peaceful'],['sleep','Peaceful'],
  ['happy','Joyful'],['joy','Joyful'],['celebrate','Joyful'],
  ['festive','Joyful'],['cheer','Joyful'],['laughter','Joyful'],
  ['dance','Joyful'],['carnival','Joyful'],['festival','Joyful'],
  ['party','Joyful'],['comedy','Joyful'],['fun','Joyful'],
  ['tense','Tense'],['tension','Tense'],['suspense','Tense'],
  ['chase','Tense'],['pursuit','Tense'],['danger','Tense'],
  ['alert','Tense'],['alarm','Tense'],['action','Tense'],['intense','Tense'],
  ['thrill','Tense'],['adrenaline','Tense'],['urgent','Tense'],
  ['mystery','Mystery'],['mysterious','Mystery'],['noir','Mystery'],
  ['investigation','Mystery'],['detective','Mystery'],
  ['strange','Mystery'],['weird','Mystery'],['unknown','Mystery'],
  ['puzzle','Mystery'],['enigma','Mystery'],['secret','Mystery'],
  ['dark','Dark'],['shadow','Dark'],['night','Dark'],['void','Dark'],
  ['black','Dark'],['abyss','Dark'],['gloom','Dark'],
];

function getType(filename) {
  const f = filename.toLowerCase();
  if (/_lp\.|_loop\.|background|_bg\d|ambience/.test(f)) return 'Ambience_Loop';
  if (/_x[2-4]/.test(f)) return 'Oneshot_Multi';
  if (/music/.test(f)) return 'Music';
  if (/_tone|_drone/.test(f)) return 'Tone';
  return 'Oneshot';
}

function matchBest(name, pairs) {
  const lower = name.toLowerCase();
  for (const [kw, tag] of pairs) {
    if (lower.includes(kw)) return tag;
  }
  return null;
}

// ── Build database ──
const db = { _meta: { description: 'TRPG SoundPad tag database', version: '1.0' } };
let totalFiles = 0;

for (const pad of fs.readdirSync(BASE).sort()) {
  const padPath = path.join(BASE, pad);
  if (!fs.statSync(padPath).isDirectory()) continue;
  const files = fs.readdirSync(padPath).filter(f => /\.(ogg|mp3|wav|m4a)$/i.test(f));
  if (!files.length) continue;

  const setting = SETTING[pad] || 'Universal';
  db[pad] = { setting, files: {} };

  for (const file of files.sort()) {
    const name = path.parse(file).name;
    const scene = matchBest(file, SCENE_KW) || 'General';
    const emotion = matchBest(file, EMOTION_KW) || 'Neutral';
    const type = getType(file);
    db[pad].files[name] = { scene, emotion, type };
    totalFiles++;
  }
}

db._meta.total_pads = Object.keys(db).length - 1;
db._meta.total_files = totalFiles;

fs.writeFileSync(path.join(__dirname, 'sound_tags.json'), JSON.stringify(db, null, 2));
console.log(`Generated sound_tags.json: ${totalFiles} files across ${db._meta.total_pads} SoundPads`);

// ── Also output summary stats ──
const settings = {}, scenes = {}, emotions = {}, types = {};
for (const [pad, data] of Object.entries(db)) {
  if (pad === '_meta') continue;
  settings[data.setting] = (settings[data.setting] || 0) + Object.keys(data.files).length;
  for (const [f, tags] of Object.entries(data.files)) {
    scenes[tags.scene] = (scenes[tags.scene] || 0) + 1;
    emotions[tags.emotion] = (emotions[tags.emotion] || 0) + 1;
    types[tags.type] = (types[tags.type] || 0) + 1;
  }
}

console.log('\nSettings:'); for (const [k,v] of Object.entries(settings).sort((a,b)=>b[1]-a[1])) console.log(`  ${k}: ${v}`);
console.log('\nScenes (top 20):'); for (const [k,v] of Object.entries(scenes).sort((a,b)=>b[1]-a[1]).slice(0,20)) console.log(`  ${k}: ${v}`);
console.log('\nEmotions:'); for (const [k,v] of Object.entries(emotions).sort((a,b)=>b[1]-a[1])) console.log(`  ${k}: ${v}`);
console.log('\nTypes:'); for (const [k,v] of Object.entries(types).sort((a,b)=>b[1]-a[1])) console.log(`  ${k}: ${v}`);
