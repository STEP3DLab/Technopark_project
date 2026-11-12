import test from 'node:test';
import assert from 'node:assert/strict';
import {ShieldView, phoneAxes} from '../shield.js';
import {DuelEngine, RULES} from '../duel-engine.js';

test('a virtual shield supports touch aiming, device rotation and returning to center', () => {
  const view = new ShieldView();
  const args = {width: 390, height: 820, aim: {x: .5, y: .5}, seconds: .5, role: 'guest', dodgeAge: -1, dodgeSide: 1};
  const locate = () => view.target(args);
  const box = locate().box;
  args.aim = {x: box.x + box.w / 2, y: box.y + box.h / 2};
  assert.equal(locate().hit, true);
  view.axes = phoneAxes(0, 90, 0); view.center();
  view.axes = phoneAxes(180, 90, 0); assert.equal(locate().visible, false);
  view.center(); assert.equal(locate().hit, true);
  args.dodgeAge = 625; assert.equal(locate().hit, false);
});

test('the host limits shield shifts to the current round and cooldown', () => {
  const engine = new DuelEngine({now: () => 10000});
  engine.setPlayer('guest', {connected:true});
  engine.setReady('host',true); engine.setReady('guest',true);
  const {round,startAt} = engine.state;
  assert.equal(engine.dodge('host',round),false);
  engine.tick(startAt);
  assert.equal(engine.dodge('guest',round+1,startAt),false);
  assert.equal(engine.dodge('guest',round,startAt),true);
  assert.equal(engine.dodge('guest',round,startAt+1000),false);
  assert.equal(engine.dodge('guest',round,startAt+RULES.dodgeCooldownMs),true);
});
