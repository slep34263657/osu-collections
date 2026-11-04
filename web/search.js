const aliases = {
  star: 'stars', sr: 'stars', dr: 'hp', key: 'keys', lns: 'ln', diff: 'difficulty', author: 'creator', mapper: 'creator',
  ss: 'pp', combo: 'maxCombo', maxcombo: 'maxCombo', tags: 'tag'
};
const numeric = new Set(['stars', 'ar', 'od', 'cs', 'hp', 'bpm', 'length', 'drain', 'keys', 'ln', 'divisor', 'circles', 'sliders', 'objects', 'pp', 'maxCombo', 'id', 'setid']);
const textFields = new Set(['artist', 'title', 'creator', 'difficulty', 'source', 'tag']);
const unavailable = new Set(['status', 'played', 'unplayed', 'lastplayed', 'speed', 'created', 'submitted', 'updated', 'ranked', 'favourites', 'featured_artist']);
const modes = { osu: 0, o: 0, standard: 0, taiko: 1, t: 1, catch: 2, c: 2, fruits: 2, mania: 3, m: 3 };
const operators = { ':': '=', '==': '=', '!:': '!=', '<:': '<=', '>:': '>=' };

function comparison(actual, operator, expected, tolerance = 0) {
  if (!Number.isFinite(actual)) return false;
  if (operator === '=') return Math.abs(actual - expected) <= tolerance + 1e-9;
  if (operator === '!=') return Math.abs(actual - expected) > tolerance + 1e-9;
  if (operator === '>') return actual > expected;
  if (operator === '<') return actual < expected;
  if (operator === '>=') return actual >= expected;
  return actual <= expected;
}

function seconds(value) {
  if (/^\d+:\d{1,2}(?::\d{1,2})?$/.test(value)) return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  return match ? Number(match[1]) * ({ ms: .001, s: 1, m: 60, h: 3600 }[match[2]] ?? 1) : NaN;
}

function fieldValue(map, diff, key) {
  if (key === 'stars') return Number.isFinite(diff.stars) ? Math.floor((diff.stars + 1e-9) * 100) / 100 : null;
  if (key === 'bpm') return diff.bpmMain ?? diff.bpmMax;
  if (key === 'keys') return diff.mode === 3 ? diff.cs : null;
  if (key === 'difficulty') return diff.name || '';
  if (key === 'creator') return diff.creator || map.creator || '';
  if (key === 'title') return [map.title, diff.titleUnicode].filter(Boolean);
  if (key === 'artist') return [map.artist, diff.artistUnicode].filter(Boolean);
  if (key === 'tag') return diff.tags || map.tags || '';
  if (key === 'setid') return map.setId;
  return diff[key] ?? map[key];
}

export function parseSearch(query) {
  const tests = []; let structured = false, error = '';
  const tokens = query.match(/(?:[^\s"']+|"[^"\\]*(?:\\.[^"\\]*)*"!?|'[^']*'!?)+/g) || [];
  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    if (/^\w+$/.test(token) && /^(?:!=|!:|==|>=|<=|>:|<:|[=:<>])/.test(tokens[i + 1] || '')) token += tokens[++i];
    const match = token.match(/^(\w+)(!=|!:|==|>=|<=|>:|<:|[=:<>])(.*)$/);
    if (!match) {
      let term = token, exclude = term.startsWith('-');
      if (exclude) term = term.slice(1);
      term = term.replace(/^["']|["']$/g, '').toLowerCase();
      if (!term) continue;
      tests.push((map, diff) => {
        const haystack = [map.title, map.artist, map.creator, diff.name, diff.creator, diff.titleUnicode, diff.artistUnicode, diff.source, diff.tags].filter(Boolean).join(' ').toLowerCase();
        const found = /^\d+$/.test(term) ? Number(term) === diff.id || Number(term) === map.setId : haystack.includes(term);
        return exclude ? !found : found;
      });
      continue;
    }
    structured = true;
    const raw = match[1].toLowerCase(), key = aliases[raw] || raw, operator = operators[match[2]] || match[2];
    let value = match[3];
    if (!value && tokens[i + 1] && !/\w+[=:<>!]/.test(tokens[i + 1])) value = tokens[++i];
    const exact = /^(["']).*\1!$/.test(value);
    value = value.replace(/^["']|["']!?$/g, '').replace(/\\"/g, '"').toLowerCase();
    if (unavailable.has(key)) { error = `${raw} needs ${['played', 'unplayed', 'lastplayed', 'speed'].includes(key) ? 'your osu! play-history data' : 'online beatmap metadata'}, which isn’t in these exports.`; break; }
    if (!numeric.has(key) && !textFields.has(key) && key !== 'mode') { error = `Unknown filter: ${raw}`; break; }
    if (!value) { error = `Enter a value for ${raw}.`; break; }
    if (key === 'mode') {
      const values = value.split(',').map(v => modes[v] ?? (/^[0-3]$/.test(v) ? Number(v) : NaN));
      if (!values.every(Number.isFinite)) { error = 'Mode must be osu, taiko, catch or mania.'; break; }
      tests.push((map, diff) => operator === '=' || operator === '!=' ? values.includes(diff.mode) === (operator === '=') : comparison(diff.mode, operator, values[0]));
    } else if (numeric.has(key)) {
      const expected = key === 'length' || key === 'drain' ? seconds(value) : /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
      if (!Number.isFinite(expected)) { error = `Invalid value for ${raw}: ${value}`; break; }
      const tolerance = key === 'stars' ? 0 : key === 'bpm' ? .5 : ['ar', 'od', 'cs', 'hp'].includes(key) ? .05 : 0;
      tests.push((map, diff) => comparison(fieldValue(map, diff, key), operator, expected, tolerance));
    } else {
      if (operator !== '=' && operator !== '!=') { error = `${raw} supports = and !=.`; break; }
      tests.push((map, diff) => {
        const raw = fieldValue(map, diff, key);
        const values = (Array.isArray(raw) ? raw : [raw]).map(value => String(value || '').toLowerCase());
        return values.some(actual => exact ? actual === value : actual.includes(value)) === (operator === '=');
      });
    }
  }
  return { active: query.trim().length > 0, structured, error, matches: (map, diff) => !error && tests.every(test => test(map, diff)) };
}
