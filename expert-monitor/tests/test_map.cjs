'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const map = require('../russia-map-data.js');
const U = require('../monitor-utils.js');

test('country geometry fits the viewport without a dateline streak', () => {
  assert.equal(map.viewBox, '0 0 900 430');
  let vertices = 0;
  for (const path of map.paths) {
    assert.match(path, /^M[\d.,L]+Z$/);
    const points = path.slice(1,-1).split('L').map(p => p.split(',').map(Number));
    for (let i=0;i<points.length;i++) {
      const [x,y] = points[i];
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      assert.ok(x>=0 && x<=900 && y>=0 && y<=430);
      const previous = points[(i+points.length-1)%points.length];
      assert.ok(Math.hypot(x-previous[0], y-previous[1])<150, 'No line across the map at the antimeridian');
      vertices++;
    }
  }
  assert.ok(vertices>500);
  assert.deepEqual(map.project(180,67),map.project(-180,67));
  assert.ok(map.project(100,70).y < map.project(100,50).y, 'North is up');
});

test('every search direction has a correctly projected map anchor', () => {
  assert.deepEqual(Object.keys(map.districtPoints).sort(),U.DISTRICTS.map(d=>d.id).sort());
  for (const p of Object.values(map.districtPoints)) {
    assert.deepEqual(map.project(p.lon,p.lat), {x:p.x,y:p.y});
    assert.ok(p.x>0 && p.x<900 && p.y>0 && p.y<430);
  }
  assert.ok(map.districtPoints.central.x<map.districtPoints.ural.x);
  assert.ok(map.districtPoints.ural.x<map.districtPoints.fareast.x);
});

test('projection rejects unusable coordinates and preserves source attribution', () => {
  for (const point of [[NaN,50],[30,Infinity],[30,90],[30,-90],['30',55]]) {
    assert.equal(map.project(...point),null);
  }
  assert.equal(map.source.license,'Public domain');
  assert.match(map.source.url,/naturalearthdata.com/);
});
