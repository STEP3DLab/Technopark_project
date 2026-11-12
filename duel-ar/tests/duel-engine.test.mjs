import test from 'node:test';
import assert from 'node:assert/strict';
import {DuelEngine, RULES} from '../duel-engine.js';

function setup(mode = 'duel') {
  let clock = 100000;
  const engine = new DuelEngine({name: 'Alice', mode, now: () => clock});
  engine.setPlayer('guest', {name: 'Bob', connected: true});
  engine.setReady('host', true);
  assert.equal(engine.state.phase, 'lobby');
  engine.setReady('guest', true);
  const start = engine.state.startAt;
  const set = t => { clock = t; };
  const advance = t => { clock = t; engine.tick(t); };
  const shoot = (role, seq, at, extra = {}) => engine.shoot(role, {seq, at, round: engine.state.round, hit: true, confidence: .9, targetAgeMs: 15, ...extra}, clock);
  return {engine, start, advance, set, shoot};
}

test('both players must confirm; early shots and cancelled countdown do not hurt', () => {
  const {engine, start, set, shoot} = setup();
  assert.equal(engine.state.phase, 'countdown');
  set(start - 20);
  assert.equal(shoot('host', 1, start - 20).accepted, false);
  engine.setReady('guest', false);
  assert.equal(engine.state.phase, 'lobby');
  assert.equal(engine.state.players.host.ready, false);
  assert.equal(engine.state.players.guest.hp, 3);
});

test('three hits settle to the same deterministic winner; duplicates and cooldown are rejected', () => {
  const {engine, start, advance, set, shoot} = setup();
  advance(start);
  assert.equal(shoot('host', 1, start).accepted, true);
  assert.equal(shoot('host', 1, start).reason, 'duplicate');
  set(start + 100);
  assert.equal(shoot('host', 2, start + 100).reason, 'cooldown');
  advance(start + 600); shoot('host', 2, start + 600);
  advance(start + 1200); shoot('host', 3, start + 1200);
  advance(start + 1481);
  assert.equal(engine.state.phase, 'finished');
  assert.equal(engine.state.winner, 'host');
  assert.equal(engine.state.players.guest.hp, 0);
  assert.equal(engine.state.players.host.hits, 3);
  assert.equal(shoot('guest', 1, start + 1481).accepted, false);
});

test('simultaneous lethal shots are a draw even with different arrival times', () => {
  const {engine, start, advance, set, shoot} = setup('quickdraw');
  advance(start); shoot('host', 1, start);
  set(start + 220);
  assert.equal(shoot('guest', 1, start + 80).accepted, true);
  advance(start + 300);
  assert.equal(engine.state.winner, null);
  assert.equal(engine.state.result.draw, true);
  assert.equal(engine.state.reason, 'simultaneous');
  assert.equal(engine.state.players.host.hp, 0);
  assert.equal(engine.state.players.guest.hp, 0);
});

test('a packet at the tie-window boundary is inserted before queued shots resolve', () => {
  const {engine, start, advance, set, shoot} = setup('quickdraw');
  advance(start); shoot('host', 1, start);
  set(start + 280);
  assert.equal(shoot('guest', 1, start + 100).accepted, true);
  advance(start + 281);
  assert.equal(engine.state.reason, 'simultaneous');
});

test('stale or low-confidence targeting is a miss; out-of-window times are rejected', () => {
  const {engine, start, advance, set, shoot} = setup();
  advance(start);
  assert.equal(shoot('host', 1, start, {targetAgeMs: 800}).hit, false);
  advance(start + 600);
  assert.equal(shoot('host', 2, start + 600, {confidence: .1}).hit, false);
  advance(start + 1000);
  assert.equal(engine.state.players.guest.hp, 3);
  set(start + 1300);
  assert.equal(shoot('host', 3, start + 1100).reason, 'late');
  assert.equal(shoot('host', 3, start + 1400).reason, 'late');
});

test('six cells reload and a late packet cannot use ammunition from a later reload', () => {
  const {engine, start, advance, set, shoot} = setup();
  for (let i = 0; i < 6; i++) {
    advance(start + i * 600);
    assert.equal(shoot('host', i + 1, start + i * 600, {hit: false}).accepted, true);
  }
  const end = start + 3000 + RULES.reloadMs;
  assert.equal(engine.state.players.host.ammo, 0);
  assert.equal(engine.state.players.host.reloadUntil, end);
  advance(end - 600);
  assert.equal(shoot('host', 7, end - 600, {hit: false}).reason, 'reloading');
  advance(end + 50);
  assert.equal(engine.state.players.host.ammo, 6);
  assert.equal(shoot('host', 7, end - 50, {hit: false}).reason, 'reloading');
  set(end + 50);
  assert.equal(shoot('host', 7, end + 50, {hit: false}).accepted, true);
  assert.equal(engine.state.players.host.ammo, 5);
});

test('45 second timeout compares health, tied health is a draw', () => {
  const a = setup(); a.advance(a.start); a.shoot('guest', 1, a.start);
  a.advance(a.start + 45000 + 300);
  assert.equal(a.engine.state.winner, 'guest');
  assert.equal(a.engine.state.reason, 'timeout');
  const b = setup(); b.advance(b.start + 45000 + 300);
  assert.equal(b.engine.state.result.draw, true);
});

test('rematch requires both confirmations and new readiness, with a new round sequence', () => {
  const {engine, start, advance, shoot} = setup('quickdraw');
  advance(start); shoot('host', 1, start); advance(start + 300);
  engine.requestRematch('host'); assert.equal(engine.state.phase, 'finished');
  engine.requestRematch('guest'); assert.equal(engine.state.phase, 'lobby');
  assert.equal(engine.state.players.host.ready, false);
  engine.setReady('host', true); engine.setReady('guest', true);
  assert.equal(engine.state.round, 2);
  assert.equal(engine.state.players.host.hp, 1);
});

test('camera loss interrupts without a winner, recovery requires readiness again', () => {
  const {engine, start, advance, shoot} = setup();
  advance(start); engine.setAvailable('guest', false);
  assert.equal(engine.state.phase, 'interrupted');
  assert.equal(engine.state.winner, null);
  assert.equal(shoot('host', 1, start).accepted, false);
  engine.setAvailable('guest', true);
  assert.equal(engine.state.phase, 'lobby');
  assert.equal(engine.state.players.host.ready, false);
});

test('disconnect interrupts and reconnection keeps the room, resets readiness', () => {
  const {engine, start, advance} = setup();
  advance(start); engine.setPlayer('guest', {connected: false});
  assert.equal(engine.state.phase, 'interrupted');
  assert.equal(engine.state.result, null);
  engine.setPlayer('guest', {name: 'Bob again', connected: true});
  assert.equal(engine.state.phase, 'lobby');
  assert.equal(engine.state.players.guest.ready, false);
});
