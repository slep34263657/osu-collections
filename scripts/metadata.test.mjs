import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDifficulty } from './metadata.mjs';
import { dtStats } from './dt.mjs';
import { officialCalculator } from './calculator.mjs';

test('reads stats, backgrounds and slider lengths across timing changes', () => {
  const diff = parseDifficulty(Buffer.from(`osu file format v14
[General]
Mode:0
[Metadata]
Version:Hard
BeatmapID:42
[Difficulty]
HPDrainRate:6
CircleSize:4
OverallDifficulty:8
SliderMultiplier:2
[Events]
0,0,"bg, image.jpg",0,0
[TimingPoints]
0,500,4,2,1,50,1,0
1000,-50,4,2,1,50,0,0
2000,400,4,2,1,50,1,0
[HitObjects]
0,0,500,1,0
0,0,1000,2,0,B|10:10,2,400
0,0,2500,2,0,B|10:10,1,1000
`));
  assert.equal(diff.name, 'Hard'); assert.equal(diff.ar, 8); assert.equal(diff.cs, 4);
  assert.equal(diff.bpmMin, 120); assert.equal(diff.bpmMax, 150); assert.equal(diff.bpmMain, 150);
  assert.equal(diff.objects, 3); assert.equal(diff.length, 4); assert.equal(diff.background, 'bg, image.jpg');
});

test('counts mania hold endpoints and tolerates missing stats', () => {
  const diff = parseDifficulty(Buffer.from('[General]\nMode:3\n[HitObjects]\n0,0,1000,128,0,62500:0:0:0:0:\n'));
  assert.equal(diff.mode, 3); assert.equal(diff.length, 62); assert.equal(diff.objects, 1);
  assert.equal(diff.ar, null); assert.equal(diff.bpmMin, null);
});
test('DT adjusts timing and official calculators return stars and PP', async () => {
  const data = Buffer.from('osu file format v14\n[General]\nMode:0\n[Difficulty]\nApproachRate:9\nOverallDifficulty:8\nCircleSize:4\nSliderMultiplier:1.4\n[TimingPoints]\n0,500,4,2,1,50,1,0\n[HitObjects]\n64,192,1000,1,0\n448,192,2000,1,0\n');
  const base = parseDifficulty(data), dt = dtStats(base);
  assert.equal(dt.bpmMain, 180); assert.equal(dt.cs, 4);
  assert.ok(Math.abs(dt.ar - 10.333333) < 0.001);
  assert.ok(dt.od > base.od);
  assert.equal(dt.length, Math.round(base.length / 1.5));
  const calculator = await officialCalculator();
  try {
    const result = await calculator.calculate(data, base.mode);
    assert.ok(result.normal.stars > 0); assert.ok(result.dt.stars > result.normal.stars);
    assert.ok(result.normal.pp > 0); assert.ok(result.dt.pp > result.normal.pp);
    assert.equal(result.normal.maxCombo, result.dt.maxCombo);
  } finally { calculator.close(); }
});
