// Match icons to sound files by keyword overlap
const fs = require('fs');
const path = require('path');

const ICONS = path.join(__dirname, 'tta-icons/sb');
const SOUNDS = path.join(__dirname, 'tta-sounds');
const OUT = path.join(__dirname, 'icon_sound_map.json');

const icons = fs.readdirSync(ICONS).filter(f => f.endsWith('.png'));

function tokenize(name) {
  return name.toLowerCase()
    .replace(/[0-9_]+/g, ' ')
    .replace(/icon\.png$/i, '')
    .replace(/[^a-z]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !['icon','png','lp','the','and','of','in','for'].includes(w));
}

// Build icon tokens
const iconTokens = {};
for (const icon of icons) {
  iconTokens[icon] = tokenize(icon);
}

// For each SoundPad, match icons to sounds
const results = {};

for (const pad of fs.readdirSync(SOUNDS)) {
  const padPath = path.join(SOUNDS, pad);
  if (!fs.statSync(padPath).isDirectory()) continue;

  const files = fs.readdirSync(padPath).filter(f => /\.(ogg|mp3|wav)$/i.test(f));
  if (!files.length) continue;

  results[pad] = {};

  for (const file of files) {
    const name = path.parse(file).name;
    const tokens = tokenize(name);
    if (!tokens.length) continue;

    let bestIcon = null;
    let bestScore = 0;

    for (const [icon, iTokens] of Object.entries(iconTokens)) {
      let score = 0;
      for (const t of tokens) {
        for (const it of iTokens) {
          if (t === it) score += 10;           // exact match
          else if (it.includes(t) || t.includes(it)) score += 4;  // partial match
        }
      }
      // Normalize by icon token count
      score = score / Math.max(1, iTokens.length);
      if (score > bestScore) {
        bestScore = score;
        bestIcon = icon;
      }
    }

    if (bestIcon && bestScore >= 3) {
      results[pad][name] = { icon: bestIcon, score: Math.round(bestScore * 10) / 10 };
    }
  }
}

// Also: for each SoundPad, list which icons are unused
const usedIcons = new Set();
for (const [pad, sounds] of Object.entries(results)) {
  for (const [name, info] of Object.entries(sounds)) {
    usedIcons.add(info.icon);
  }
}

const unmatched = icons.filter(i => !usedIcons.has(i));

// Stats
let totalSounds = 0, matchedSounds = 0;
for (const [pad, sounds] of Object.entries(results)) {
  totalSounds += Object.keys(fs.readdirSync(path.join(SOUNDS, pad)).filter(f => /\.(ogg|mp3|wav)$/i.test(f))).length;
  matchedSounds += Object.keys(sounds).length;
}

const output = {
  _meta: {
    total_icons: icons.length,
    total_sounds: totalSounds,
    matched_sounds: matchedSounds,
    unmatched_icons: unmatched.length,
    unmatched_icon_list: unmatched
  },
  pad_mappings: results
};

fs.writeFileSync(OUT, JSON.stringify(output, null, 2));
console.log(`Matched ${matchedSounds}/${totalSounds} sounds to icons`);
console.log(`Unmatched icons: ${unmatched.length}`);
console.log(`Written to icon_sound_map.json`);
