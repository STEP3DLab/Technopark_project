/** Deterministic, host-authoritative casual duel rules. All times are host epoch ms. */
export const RULES = Object.freeze({
  dodgeCooldownMs: 4500, maxHp: 3, magazine: 6, cooldownMs: 600, reloadMs: 1400,
  countdownMs: 4000, durationMs: 45000, simultaneousMs: 100,
  minConfidence: 0.5, maxTargetAgeMs: 350,
});

const ROLES = ['host', 'guest'];
export const otherRole = role => role === 'host' ? 'guest' : 'host';
export const cleanName = value => String(value || '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 18) || 'Игрок';
const copy = value => JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

function newPlayer(name, maxHp, connected = false) {
  return {name: cleanName(name), connected, available: connected, ready: false,
    hp: maxHp, ammo: RULES.magazine, reloadUntil: 0, lastShotAt: null,
    dodgeAt: null, dodgeSide: 1, shots: 0, hits: 0, rematch: false};
}

export class DuelEngine {
  constructor({name = 'Игрок 1', mode = 'duel', now = Date.now} = {}) {
    this.clock = now;
    this.pending = [];
    this.events = [];
    this.lastSeq = {host: 0, guest: 0};
    this.lastReloadEnd = {host: 0, guest: 0};
    this.eventSeq = 0;
    this.lagAllowanceMs = 180;
    const maxHp = mode === 'quickdraw' ? 1 : RULES.maxHp;
    this.state = {
      version: 1, revision: 1, phase: 'lobby', round: 0,
      mode: mode === 'quickdraw' ? 'quickdraw' : 'duel', maxHp,
      cooldownMs: RULES.cooldownMs, reloadMs: RULES.reloadMs,
      magazine: RULES.magazine, durationMs: RULES.durationMs,
      startAt: null, endAt: null, winner: null, reason: null,
      finishedAt: null, result: null,
      players: {host: newPlayer(name, maxHp, true), guest: newPlayer('Соперник', maxHp)},
    };
  }

  snapshot() { return copy(this.state); }
  drainEvents() { const events = this.events; this.events = []; return events; }
  _touch() { this.state.revision++; }
  _event(type, details = {}) { this.events.push({type, id: ++this.eventSeq, round: this.state.round, ...details}); }
  setLatency(rttMs) {
    if (finite(rttMs) && rttMs >= 0) this.lagAllowanceMs = Math.min(650, Math.max(180, rttMs / 2 + 90));
  }

  setPlayer(role, {name, connected} = {}) {
    if (!ROLES.includes(role)) return false;
    const p = this.state.players[role];
    if (name !== undefined) p.name = cleanName(name);
    if (connected !== undefined) {
      p.connected = Boolean(connected);
      p.available = Boolean(connected);
      p.ready = false;
      if (!connected && ['countdown', 'active', 'settling'].includes(this.state.phase)) {
        this.interrupt('connection');
      } else if (!connected) {
        this.state.players.host.ready = this.state.players.guest.ready = false;
      }
    }
    if (this.state.phase === 'interrupted' && ROLES.every(r => this.state.players[r].connected && this.state.players[r].available)) {
      this._resetLobby();
    }
    this._touch();
    return true;
  }

  changeMode(mode) {
    if (this.state.phase !== 'lobby' || !['duel', 'quickdraw'].includes(mode)) return false;
    this.state.mode = mode;
    this.state.maxHp = mode === 'quickdraw' ? 1 : RULES.maxHp;
    this._resetLobby();
    return true;
  }

  setAvailable(role, available) {
    if (!ROLES.includes(role)) return false;
    const p = this.state.players[role];
    p.available = Boolean(available);
    if (!p.available) {
      p.ready = false;
      if (['countdown', 'active', 'settling'].includes(this.state.phase)) this.interrupt('unavailable');
    }
    if (this.state.phase === 'interrupted' && ROLES.every(r => this.state.players[r].connected && this.state.players[r].available)) this._resetLobby();
    this._touch();
    return true;
  }

  setReady(role, ready, at = this.clock()) {
    if (!ROLES.includes(role) || !['lobby', 'countdown'].includes(this.state.phase)) return false;
    const p = this.state.players[role];
    if (ready && (!p.connected || !p.available)) return false;
    p.ready = Boolean(ready);
    if (!ready && this.state.phase === 'countdown') {
      this.state.phase = 'lobby';
      this.state.startAt = this.state.endAt = null;
      this.state.players.host.ready = this.state.players.guest.ready = false;
      this._event('countdown-cancelled');
    }
    if (this.state.phase === 'lobby' && ROLES.every(r => {
      const player = this.state.players[r];
      return player.connected && player.available && player.ready;
    })) {
      this.state.phase = 'countdown';
      this.state.round++;
      this.state.startAt = at + RULES.countdownMs;
      this.state.endAt = this.state.startAt + RULES.durationMs;
      this.state.winner = this.state.result = this.state.reason = this.state.finishedAt = null;
      this.pending = [];
      this.lastSeq = {host: 0, guest: 0};
      this.lastReloadEnd = {host: 0, guest: 0};
      for (const r of ROLES) {
        Object.assign(this.state.players[r], {hp: this.state.maxHp, ammo: RULES.magazine,
          dodgeAt: null, dodgeSide: 1, shots: 0, hits: 0, lastShotAt: null, reloadUntil: 0, rematch: false});
      }
      this._event('countdown', {startAt: this.state.startAt, endAt: this.state.endAt});
    }
    this._touch();
    return true;
  }

  dodge(role, round, at = this.clock()) {
    const s = this.state, player = s.players[role];
    if (!player || s.round !== round || s.phase !== 'active' || at >= s.endAt || player.hp <= 0) return false;
    if (player.dodgeAt !== null && at - player.dodgeAt < RULES.dodgeCooldownMs) return false;
    player.dodgeAt = at;
    player.dodgeSide *= -1;
    this._touch(); this._event('dodge', {role});
    return true;
  }

  shoot(role, shot, receivedAt = this.clock()) {
    if (!ROLES.includes(role) || !shot || typeof shot !== 'object') return {accepted: false, reason: 'invalid'};
    const s = this.state, p = s.players[role];
    // Insert an on-time packet before resolving queued simultaneous shots.
    if (s.phase === 'countdown' && receivedAt >= s.startAt) {
      s.phase = 'active'; this._touch(); this._event('start', {startAt: s.startAt});
    }
    if (!['active', 'settling'].includes(s.phase)) return {accepted: false, reason: 'not-active'};
    if (!ROLES.every(r => s.players[r].connected && s.players[r].available)) return {accepted: false, reason: 'unavailable'};
    if (shot.round !== s.round || !Number.isSafeInteger(shot.seq) || shot.seq <= this.lastSeq[role]) return {accepted: false, reason: 'duplicate'};
    const at = shot.at;
    if (!finite(at) || at < s.startAt || at > s.endAt || at > receivedAt + 80 || at < receivedAt - this.lagAllowanceMs) return {accepted: false, reason: 'late'};
    if (p.hp <= 0) return {accepted: false, reason: 'eliminated'};
    if (p.lastShotAt !== null && at - p.lastShotAt < RULES.cooldownMs - 5) return {accepted: false, reason: 'cooldown'};
    if (at < this.lastReloadEnd[role]) return {accepted: false, reason: 'reloading'};
    // A reload is measured at shot time, so a late packet cannot borrow future ammunition.
    if (p.reloadUntil && at >= p.reloadUntil) { p.ammo = RULES.magazine; p.reloadUntil = 0; }
    if (p.ammo <= 0) return {accepted: false, reason: 'reloading'};
    this.lastSeq[role] = shot.seq;
    p.lastShotAt = at;
    p.shots++;
    p.ammo--;
    const hit = shot.hit === true && finite(shot.confidence) && shot.confidence >= RULES.minConfidence
      && shot.confidence <= 1 && finite(shot.targetAgeMs) && shot.targetAgeMs >= 0 && shot.targetAgeMs <= RULES.maxTargetAgeMs;
    const accepted = {role, shooter: role, target: otherRole(role), at, seq: shot.seq, hit, round: s.round};
    this.pending.push(accepted);
    this.pending.sort((a, b) => a.at - b.at || a.seq - b.seq);
    if (p.ammo === 0) {
      p.reloadUntil = at + RULES.reloadMs;
      this.lastReloadEnd[role] = p.reloadUntil;
      this._event('reload', {role, until: p.reloadUntil});
    }
    this._event('shot', {...accepted, ammo: p.ammo});
    this._touch();
    return {accepted: true, seq: shot.seq, hit};
  }

  tick(at = this.clock()) {
    const s = this.state;
    if (s.phase === 'countdown' && at >= s.startAt) {
      s.phase = 'active'; this._touch(); this._event('start', {startAt: s.startAt});
    }
    if (!['active', 'settling'].includes(s.phase)) return;
    for (const role of ROLES) {
      const p = s.players[role];
      if (p.reloadUntil && at >= p.reloadUntil) {
        p.ammo = RULES.magazine; p.reloadUntil = 0;
        this._touch(); this._event('reloaded', {role});
      }
    }
    // Wait for the same finite network allowance on both players, then resolve by shot time.
    // Hits within one 100 ms window are simultaneous, including mutual elimination.
    while (this.pending.length && at > this.pending[0].at + this.lagAllowanceMs + RULES.simultaneousMs) {
      const firstAt = this.pending[0].at;
      const group = [];
      while (this.pending.length && this.pending[0].at <= firstAt + RULES.simultaneousMs) group.push(this.pending.shift());
      const aliveBefore = {host: s.players.host.hp > 0, guest: s.players.guest.hp > 0};
      for (const shot of group) {
        if (!shot.hit || !aliveBefore[shot.role]) continue;
        const shooter = s.players[shot.role], target = s.players[shot.target];
        shooter.hits++;
        target.hp = Math.max(0, target.hp - 1);
        this._event('hit', {...shot, hp: target.hp, damage: 1});
        this._touch();
      }
      if (s.players.host.hp === 0 || s.players.guest.hp === 0) {
        const winner = s.players.host.hp === s.players.guest.hp ? null : s.players.host.hp > 0 ? 'host' : 'guest';
        this._finish(winner, winner ? 'elimination' : 'simultaneous', at);
        return;
      }
    }
    if (at >= s.endAt && s.phase === 'active') { s.phase = 'settling'; this._touch(); }
    if (at >= s.endAt + this.lagAllowanceMs + RULES.simultaneousMs && this.pending.length === 0) {
      const a = s.players.host.hp, b = s.players.guest.hp;
      this._finish(a === b ? null : a > b ? 'host' : 'guest', 'timeout', at);
    }
  }

  _finish(winner, reason, at) {
    const s = this.state;
    s.phase = 'finished'; s.winner = winner; s.reason = reason; s.finishedAt = at;
    s.result = {winner, reason, draw: winner === null, finishedAt: at};
    this.pending = [];
    s.players.host.ready = s.players.guest.ready = false;
    this._touch(); this._event('result', {...s.result});
  }

  interrupt(reason = 'unavailable') {
    if (this.state.phase === 'finished') return false;
    this.state.phase = 'interrupted';
    this.state.winner = this.state.result = null;
    this.state.reason = reason;
    this.state.startAt = this.state.endAt = null;
    this.pending = [];
    this.state.players.host.ready = this.state.players.guest.ready = false;
    this._touch(); this._event('interrupted', {reason});
    return true;
  }

  requestRematch(role) {
    if (!ROLES.includes(role) || !['finished', 'interrupted'].includes(this.state.phase)) return false;
    if (!this.state.players[role].connected || !this.state.players[role].available) return false;
    this.state.players[role].rematch = true;
    this._touch();
    if (ROLES.every(r => this.state.players[r].rematch && this.state.players[r].connected && this.state.players[r].available)) {
      this._resetLobby();
      this._event('rematch');
    }
    return true;
  }

  _resetLobby() {
    const s = this.state;
    s.phase = 'lobby'; s.startAt = s.endAt = s.finishedAt = null;
    s.winner = s.result = s.reason = null;
    this.pending = [];
    for (const role of ROLES) Object.assign(s.players[role], {ready: false, hp: s.maxHp,
      ammo: RULES.magazine, reloadUntil: 0, lastShotAt: null, dodgeAt: null, dodgeSide: 1, shots: 0, hits: 0, rematch: false});
    this._touch();
  }
}
