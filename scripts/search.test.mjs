import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearch } from '../web/search.js';

const map = { title: 'Blue Night', artist: 'Some Band', creator: 'Mapper', setId: 123 };
const diff = { id: 456, name: 'Another Insane', stars: 5.678, ar: 9, od: 8, cs: 4, hp: 6, bpmMain: 180, bpmMin: 90, bpmMax: 200, length: 110, drain: 100, mode: 0, tags: 'rock anime', source: 'A Series', pp: 250 };
test('combines numeric filters on the same difficulty', () => {
  const query = parseSearch('stars>5 ar>=9 bpm=180 length<2m');
  assert.equal(query.error, ''); assert.ok(query.matches(map, diff));
  assert.ok(!query.matches(map, { ...diff, ar: 8 }));
  assert.ok(!query.matches(map, { ...diff, stars: 4 }));
  assert.ok(parseSearch('stars > 5 AR >= 9').matches(map, diff));
});
test('handles aliases, quotes, exclusions, free text and IDs', () => {
  assert.ok(parseSearch('artist="some band" mapper!=other diff:insane sr>=5 source="A Series" anime').matches(map, diff));
  assert.ok(parseSearch('title="Blue Night"!').matches(map, { ...diff, titleUnicode: '別名' }));
  assert.ok(!parseSearch('artist!=band').matches(map, diff));
  assert.ok(parseSearch('123').matches(map, diff)); assert.ok(parseSearch('456').matches(map, diff));
  assert.ok(!parseSearch('789').matches(map, diff));
  assert.ok(!parseSearch('-anime').matches(map, diff));
});
test('matches osu numeric precision and time syntax', () => {
  assert.ok(!parseSearch('stars>5.67').matches(map, diff));
  assert.ok(parseSearch('stars=5.67 ar=9.02 bpm=180.3').matches(map, diff));
  assert.ok(parseSearch('length=1:50 drain=100s ss>=250').matches(map, diff));
  assert.ok(!parseSearch('length<1m').matches(map, diff));
});
test('supports ruleset and key filters without treating missing values as zero', () => {
  const mania = { ...diff, mode: 3, ln: 35 };
  assert.ok(parseSearch('mode=m keys=4 ln>30').matches(map, mania));
  assert.ok(!parseSearch('keys=4').matches(map, diff));
  assert.ok(parseSearch('mode=osu,taiko').matches(map, diff));
  assert.ok(!parseSearch('stars!=5').matches(map, { ...diff, stars: null }));
});
test('reports unavailable and invalid filters clearly', () => {
  assert.match(parseSearch('played=yes').error, /play-history/);
  assert.match(parseSearch('status=ranked').error, /online beatmap metadata/);
  assert.match(parseSearch('stars>oops').error, /Invalid value/);
  assert.match(parseSearch('stars>').error, /Enter a value/);
  assert.match(parseSearch('nonsense>5').error, /Unknown filter/);
  assert.ok(parseSearch('').matches(map, diff));
});
