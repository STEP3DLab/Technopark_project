import {DuelEngine, RULES, cleanName} from './duel-engine.js';

const PROTOCOL = 1;
const PREFIX = 'pulse-shield-duel-v1-';
const LABEL = 'pulse-shield-duel-v1';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_OPEN_TIMEOUT = 16000;
const CONNECTION_TIMEOUT = 20000;
let peerLibraryPromise;

const randomString = length => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => ALPHABET[byte % ALPHABET.length]).join('');
};
export const normalizeRoomCode = code => String(code || '').trim().toUpperCase().replace(/[\s-]/g, '');
const messageText = {
  'peer-unavailable': 'Комната не найдена. Проверьте код: создатель должен оставить страницу открытой.',
  'network': 'Сервис соединения недоступен. Проверьте интернет и попробуйте ещё раз.',
  'server-error': 'Сервис соединения временно недоступен. Попробуйте через минуту.',
  'socket-error': 'Не удалось связаться с сервисом соединения. Попробуйте другую сеть.',
  'socket-closed': 'Связь с сервисом соединения прервалась.',
  'browser-incompatible': 'Этот браузер не поддерживает соединение игроков. Откройте сайт в Safari или Chrome.',
  'unavailable-id': 'Этот код комнаты уже занят. Создайте новую комнату.',
  'connection-timeout': 'Телефоны не соединились. Подключитесь к одной сети Wi-Fi и попробуйте снова.',
  'room-full': 'В этой комнате уже два игрока. Создайте новую комнату.',
  'library-error': 'Не загрузился модуль связи. Обновите страницу и попробуйте снова.',
  'protocol': 'Версии игры не совпадают. Обновите страницу на обоих телефонах.',
};

function networkError(type, message) {
  const error = new Error(message || messageText[type] || 'Соединение прервалось. Попробуйте ещё раз.');
  error.type = type;
  return error;
}

function loadPeerLibrary() {
  if (globalThis.Peer) return Promise.resolve(globalThis.Peer);
  if (!peerLibraryPromise) {
    peerLibraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./vendor/peerjs.min.js', import.meta.url).href;
      script.async = true;
      const timer = setTimeout(() => { script.remove(); reject(networkError('library-error')); }, 15000);
      script.onload = () => {
        clearTimeout(timer);
        globalThis.Peer ? resolve(globalThis.Peer) : reject(networkError('library-error'));
      };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(networkError('library-error')); };
      document.head.append(script);
    }).catch(error => { peerLibraryPromise = null; throw error; });
  }
  return peerLibraryPromise;
}

/**
 * Host-authoritative WebRTC room using the bundled PeerJS 1.5.5 client.
 * Camera frames, audio and images NEVER enter this module or its connection.
 * Events: shot, hit, reload, reloaded, countdown, start, result, interrupted,
 * rematch, shot-rejected, disconnect. `state` snapshots are immutable to callers.
 * Status: {kind,message,connected,pingMs,roomCode}; error: Error with `.type`.
 */
export class DuelNetwork {
  constructor({onState = () => {}, onEvent = () => {}, onStatus = () => {}, onError = () => {}} = {}) {
    this.callbacks = {onState, onEvent, onStatus, onError};
    this.role = null;
    this.roomCode = '';
    this.state = null;
    this.pingMs = null;
    this.connected = false;
    this.engine = null;
    this._generation = 0;
    this._peer = null;
    this._conn = null;
    this._interval = null;
    this._timers = new Set();
    this._offset = 0;
    this._samples = [];
    this._clockSynced = false;
    this._pendingReady = false;
    this._pendingPings = new Map();
    this._pingSeq = 0;
    this._shotSeq = 0;
    this._localLastShot = -Infinity;
    this._lastSeen = 0;
    this._lastPing = 0;
    this._publishedRevision = -1;
    this._lastEvent = 0;
    this._session = '';
    this._name = '';
    this._available = true;
    this._lobbyResolve = null;
    this._lobbyReject = null;
    this._peerOpenReject = null;
  }

  now() { return Date.now() + (this.role === 'guest' ? this._offset : 0); }
  getServerNow() { return this.now(); }

  _call(name, value) {
    try { this.callbacks[name](value); } catch (error) { console.error('Duel UI callback:', name, error); }
  }
  _status(kind, message) {
    this._call('onStatus', {kind, message, connected: this.connected, pingMs: this.pingMs, roomCode: this.roomCode});
  }
  _timeout(callback, delay) {
    const timer = setTimeout(() => { this._timers.delete(timer); callback(); }, delay);
    this._timers.add(timer);
    return timer;
  }
  _clearTimer(timer) { clearTimeout(timer); this._timers.delete(timer); }

  async create({name = 'Игрок 1', mode = 'duel'} = {}) {
    this.leave({silent: true});
    const generation = this._generation;
    this.role = 'host'; this._name = cleanName(name); this._clockSynced = true;
    this._status('loading', 'Готовим комнату…');
    const Peer = await loadPeerLibrary();
    if (generation !== this._generation) throw networkError('cancelled', 'Создание комнаты отменено.');
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.roomCode = '9'+[...crypto.getRandomValues(new Uint8Array(5))].map(n=>n%10).join('');
      try {
        await this._openPeer(Peer, PREFIX + this.roomCode, generation);
        this._session = randomString(16);
        this.engine = new DuelEngine({name: this._name, mode});
        this._publishedRevision = -1;
        this._publish();
        this._startLoop();
        this._status('waiting', 'Комната открыта. Пригласите второго игрока.');
        return this.roomCode;
      } catch (error) {
        lastError = error;
        if (generation !== this._generation) throw networkError('cancelled', 'Создание комнаты отменено.');
        this._peer?.destroy(); this._peer = null;
        if (error.type !== 'unavailable-id') break;
      }
    }
    this._call('onError', lastError);
    throw lastError;
  }

  async join(code, {name = 'Игрок 2'} = {}) {
    code = normalizeRoomCode(code);
    if (!/^(?:9[0-9]{5}|[A-Z2-9]{6})$/.test(code)) throw networkError('invalid-code', 'Введите код комнаты из шести символов.');
    this.leave({silent: true});
    const generation = this._generation;
    this.role = 'guest'; this.roomCode = code; this._name = cleanName(name);
    this._status('loading', 'Подключаемся к комнате…');
    try {
      const Peer = await loadPeerLibrary();
      if (generation !== this._generation) throw networkError('cancelled', 'Подключение отменено.');
      await this._openPeer(Peer, undefined, generation);
      if (generation !== this._generation) throw networkError('cancelled', 'Подключение отменено.');
      const connected = new Promise((resolve, reject) => { this._lobbyResolve = resolve; this._lobbyReject = reject; });
      const conn = this._peer.connect(PREFIX + code, {label: LABEL, reliable: true, serialization: 'json', metadata: {protocol: PROTOCOL}});
      this._attachConnection(conn, generation);
      this._timeout(() => {
        if (!this.connected && generation === this._generation) this._failConnection(networkError('connection-timeout'));
      }, CONNECTION_TIMEOUT);
      await connected;
      this._startLoop();
      return code;
    } catch (error) {
      if (generation === this._generation) {
        this._call('onError', error);
        this._peer?.destroy(); this._peer = null;
        this._conn = null; this.connected = false;
      }
      throw error;
    }
  }

  _openPeer(Peer, id, generation) {
    return new Promise((resolve, reject) => {
      let settled = false;
      // Keep PeerJS's own STUN/TURN defaults; a partial custom ICE config removes them.
      const peer = id ? new Peer(id, {debug: 0, secure: true}) : new Peer({debug: 0, secure: true});
      this._peer = peer;
      const timer = this._timeout(() => {
        if (settled) return; settled = true; this._peerOpenReject = null; peer.destroy(); reject(networkError('network'));
      }, PEER_OPEN_TIMEOUT);
      this._peerOpenReject = error => {
        if (settled) return;
        settled = true; this._clearTimer(timer); this._peerOpenReject = null; reject(error);
      };
      peer.on('open', () => {
        if (generation !== this._generation) { peer.destroy(); return; }
        if (!settled) { settled = true; this._peerOpenReject = null; this._clearTimer(timer); resolve(peer); }
      });
      peer.on('connection', conn => {
        if (generation !== this._generation || this.role !== 'host' || conn.label !== LABEL || conn.metadata?.protocol !== PROTOCOL) {
          conn.on('open', () => { conn.send({v: PROTOCOL, kind: 'reject', reason: 'protocol'}); this._timeout(() => conn.close(), 100); });
          return;
        }
        if (this._conn) {
          conn.on('open', () => { conn.send({v: PROTOCOL, kind: 'reject', reason: 'room-full'}); this._timeout(() => conn.close(), 100); });
          return;
        }
        this._attachConnection(conn, generation);
      });
      peer.on('error', error => {
        if (generation !== this._generation) return;
        const err = networkError(error.type || 'network');
        if (!settled) { settled = true; this._peerOpenReject = null; this._clearTimer(timer); reject(err); }
        else if (!this.connected && this.role === 'guest') this._failConnection(err);
        else if (!this.connected) this._call('onError', err);
        else this._status('warning', 'Сервис знакомства временно недоступен; соединение игроков продолжает работать.');
      });
      peer.on('disconnected', () => {
        if (generation !== this._generation || peer.destroyed) return;
        this._status('warning', this.connected ? 'Прямое соединение активно.' : 'Восстанавливаем связь с сервисом…');
        this._timeout(() => { if (generation === this._generation && !peer.destroyed && peer.disconnected) peer.reconnect(); }, 1800);
      });
    });
  }

  _attachConnection(conn, generation) {
    this._conn = conn;
    this._status('connecting', 'Устанавливаем прямое соединение…');
    const helloTimer = this._timeout(() => {
      if (generation === this._generation && this._conn === conn && !this.connected) {
        this._failConnection(networkError('connection-timeout')); conn.close();
      }
    }, CONNECTION_TIMEOUT);
    conn.on('open', () => {
      if (generation !== this._generation) { conn.close(); return; }
      this._lastSeen = Date.now();
      if (this.role === 'guest') this._send({kind: 'hello', name: this._name, available: this._available});
    });
    conn.on('data', data => {
      if (generation !== this._generation || conn !== this._conn) return;
      if (!data || typeof data !== 'object' || data.v !== PROTOCOL || typeof data.kind !== 'string') return;
      if (JSON.stringify(data).length > 20000) return;
      if (this.connected && data.session !== this._session && !['hello', 'reject'].includes(data.kind)) return;
      this._lastSeen = Date.now();
      this._receive(data);
      if (this.connected) this._clearTimer(helloTimer);
    });
    conn.on('close', () => {
      if (generation !== this._generation || conn !== this._conn) return;
      this._clearTimer(helloTimer);
      this._disconnected('connection');
    });
    conn.on('error', () => {
      if (generation !== this._generation || conn !== this._conn) return;
      this._failConnection(networkError('connection-timeout'));
    });
  }

  _send(payload) {
    if (!this._conn?.open) return false;
    try { this._conn.send({v: PROTOCOL, session: this._session, ...payload}); return true; }
    catch { return false; }
  }

  _receive(data) {
    if (data.kind === 'reject') { this._failConnection(networkError(data.reason || 'protocol')); return; }
    if (data.kind === 'hello' && this.role === 'host' && !this.connected) {
      this.connected = true;
      this.engine.setPlayer('guest', {name: data.name, connected: true});
      this.engine.setAvailable('guest', data.available !== false);
      this._send({kind: 'welcome', code: this.roomCode, session: this._session, state: this.engine.snapshot()});
      this._publishedRevision = -1;
      this._publish();
      this._status('connected', 'Соперник подключён. Подтвердите готовность.');
      this._ping();
      return;
    }
    if (data.kind === 'welcome' && this.role === 'guest' && !this.connected) {
      if (typeof data.session !== 'string' || data.session.length !== 16 || !this._validState(data.state)) { this._failConnection(networkError('protocol')); return; }
      this._session = data.session;
      this.connected = true;
      this._acceptState(data.state);
      this._lobbyResolve?.(this.roomCode); this._lobbyResolve = this._lobbyReject = null;
      this._status('syncing', 'Синхронизируем таймеры…');
      this._ping();
      this._timeout(() => this._ping(), 180);
      this._timeout(() => this._ping(), 400);
      return;
    }
    if (!this.connected) return;
    if (data.kind === 'ping') {
      if (Number.isSafeInteger(data.id) && Number.isFinite(data.t0)) this._send({kind: 'pong', id: data.id, t0: data.t0, t1: Date.now(), t2: Date.now()});
      return;
    }
    if (data.kind === 'pong') { this._pong(data); return; }
    if (data.kind === 'bye') { this._disconnected('connection'); return; }
    if (this.role === 'guest') {
      if (data.kind === 'state' && this._validState(data.state)) this._acceptState(data.state);
      if (data.kind === 'event' && data.event && Number.isSafeInteger(data.event.id) && data.event.id > this._lastEvent) {
        this._lastEvent = data.event.id; this._call('onEvent', data.event);
      }
      if (data.kind === 'shot-rejected') this._call('onEvent', {type: 'shot-rejected', seq: data.seq, reason: data.reason});
      return;
    }
    if (data.kind === 'ready' && typeof data.ready === 'boolean') this.engine.setReady('guest', data.ready);
    else if (data.kind === 'available' && typeof data.available === 'boolean') this.engine.setAvailable('guest', data.available);
    else if (data.kind === 'name' && typeof data.name === 'string') this.engine.setPlayer('guest', {name: data.name});
    else if (data.kind === 'dodge') this.engine.dodge('guest', data.round);
    else if (data.kind === 'rematch') this.engine.requestRematch('guest');
    else if (data.kind === 'shot') {
      const result = this.engine.shoot('guest', data.shot);
      if (!result.accepted) this._send({kind: 'shot-rejected', seq: data.shot?.seq, reason: result.reason});
    }
    this._publish();
  }

  _validState(state) {
    return Boolean(state && state.version === 1 && Number.isSafeInteger(state.revision)
      && Number.isSafeInteger(state.round) && ['lobby', 'countdown', 'active', 'settling', 'finished', 'interrupted'].includes(state.phase)
      && state.players?.host && state.players?.guest
      && ['host', 'guest'].every(r => typeof state.players[r].name === 'string' && Number.isFinite(state.players[r].hp)));
  }

  _acceptState(state) {
    if (this.state && state.revision <= this.state.revision) return;
    if (!this.state || state.round !== this.state.round) { this._shotSeq = 0; this._localLastShot = -Infinity; }
    this.state = JSON.parse(JSON.stringify(state));
    this._call('onState', this.state);
  }

  _publish() {
    if (!this.engine) return;
    const current = this.engine.state;
    if (current.revision !== this._publishedRevision) {
      this._publishedRevision = current.revision;
      const snapshot = this.engine.snapshot();
      if (!this.state || snapshot.round !== this.state.round) { this._shotSeq = 0; this._localLastShot = -Infinity; }
      this.state = snapshot;
      this._send({kind: 'state', state: snapshot});
      this._call('onState', snapshot);
    }
    for (const event of this.engine.drainEvents()) {
      this._call('onEvent', event);
      this._send({kind: 'event', event});
    }
  }

  _startLoop() {
    clearInterval(this._interval);
    this._interval = setInterval(() => {
      if (this.engine) { this.engine.tick(); this._publish(); }
      if (this.connected && Date.now() - this._lastSeen > 5500) { this._disconnected('connection'); return; }
      if (this.connected && Date.now() - this._lastPing > 1200) this._ping();
    }, 40);
  }

  _ping() {
    if (!this.connected) return;
    const id = ++this._pingSeq, t0 = Date.now();
    this._lastPing = t0;
    this._pendingPings.set(id, t0);
    for (const [key, value] of this._pendingPings) if (t0 - value > 10000) this._pendingPings.delete(key);
    this._send({kind: 'ping', id, t0});
  }

  _pong(data) {
    const t0 = this._pendingPings.get(data.id);
    if (t0 === undefined || data.t0 !== t0 || !Number.isFinite(data.t1) || !Number.isFinite(data.t2)) return;
    this._pendingPings.delete(data.id);
    const t3 = Date.now();
    const rtt = Math.max(0, t3 - t0 - (data.t2 - data.t1));
    if (rtt > 5000) return;
    this.pingMs = Math.round(rtt);
    if (this.role === 'guest') {
      this._samples.push({rtt, offset: ((data.t1 - t0) + (data.t2 - t3)) / 2});
      if (this._samples.length > 12) this._samples.shift();
      this._offset = this._samples.reduce((best, sample) => sample.rtt < best.rtt ? sample : best).offset;
      if (this._samples.length >= 2 && !this._clockSynced) {
        this._clockSynced = true;
        this._status('connected', 'Соперник подключён. Подтвердите готовность.');
        if (this._pendingReady) { this._pendingReady = false; this.setReady(true); }
      }
    } else this.engine?.setLatency(rtt);
    this._status(rtt > 800 ? 'warning' : this._clockSynced ? 'connected' : 'syncing',
      rtt > 800 ? 'Высокая задержка. Для ровного счёта используйте общую Wi-Fi сеть.' : this._clockSynced ? 'Игроки на связи' : 'Синхронизируем таймеры…');
  }

  setReady(ready) {
    if (!this.connected || !this.state) return false;
    if (ready && !this._available) return false;
    if (this.role === 'guest' && ready && !this._clockSynced) { this._pendingReady = true; return true; }
    this._pendingReady = false;
    if (this.role === 'host') { const ok = this.engine.setReady('host', Boolean(ready)); this._publish(); return ok; }
    return this._send({kind: 'ready', ready: Boolean(ready)});
  }

  setAvailable(available) {
    this._available = Boolean(available);
    if (!this._available) this._pendingReady = false;
    if (this.role === 'host' && this.engine) { this.engine.setAvailable('host', this._available); this._publish(); return true; }
    return this._send({kind: 'available', available: this._available});
  }

  updateName(name) {
    this._name = cleanName(name);
    if (this.role === 'host' && this.engine) { this.engine.setPlayer('host', {name: this._name}); this._publish(); return true; }
    return this._send({kind: 'name', name: this._name});
  }

  changeMode(mode) {
    if (this.role !== 'host' || !this.engine) return false;
    const ok = this.engine.changeMode(mode); this._publish(); return ok;
  }

  fire({hit = false, confidence = 0, targetAgeMs = Infinity} = {}) {
    if (!this.connected || !this._conn?.open || Date.now() - this._lastSeen > 3000) return {accepted: false, reason: 'connection'};
    const s = this.state, at = this.now();
    if (!s || !this._available || s.phase !== 'active' || at < s.startAt || at >= s.endAt) return {accepted: false, reason: 'not-active'};
    const p = s.players[this.role];
    if (!p.available || p.hp <= 0) return {accepted: false, reason: 'unavailable'};
    if (at - this._localLastShot < RULES.cooldownMs - 5) return {accepted: false, reason: 'cooldown'};
    if (p.reloadUntil > at || (p.ammo <= 0 && p.reloadUntil > at)) return {accepted: false, reason: 'reloading'};
    const shot = {seq: ++this._shotSeq, round: s.round, at, hit: hit === true,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      targetAgeMs: Number.isFinite(targetAgeMs) ? targetAgeMs : 99999};
    this._localLastShot = at;
    if (this.role === 'host') { const result = this.engine.shoot('host', shot); this._publish(); return result; }
    return this._send({kind: 'shot', shot}) ? {accepted: true, seq: shot.seq, pending: true} : {accepted: false, reason: 'connection'};
  }

  dodge() {
    if (!this.connected || this.state?.phase !== 'active') return false;
    if (this.role === 'guest') return this._send({kind:'dodge', round:this.state.round});
    const ok = this.engine.dodge('host', this.state.round);
    this._publish();
    return ok;
  }

  requestRematch() {
    if (!this.connected || !this._available) return false;
    if (this.role === 'host') { const ok = this.engine.requestRematch('host'); this._publish(); return ok; }
    return this._send({kind: 'rematch'});
  }

  _failConnection(error) {
    const pendingReject = this._lobbyReject;
    this._lobbyResolve = this._lobbyReject = null;
    if (pendingReject) pendingReject(error);
    else this._call('onError', error);
    this._disconnected('connection');
  }

  _disconnected(reason) {
    const wasConnected = this.connected;
    this.connected = false;
    const conn = this._conn; this._conn = null;
    try { conn?.close(); } catch {}
    if (this._lobbyReject) {
      this._lobbyReject(networkError('connection-timeout'));
      this._lobbyResolve = this._lobbyReject = null;
    }
    if (this.engine) {
      this.engine.setPlayer('guest', {connected: false});
      this._publish();
    } else if (this.state && this.state.phase !== 'finished') {
      this.state = {...this.state, phase: 'interrupted', winner: null, result: null, reason};
      this._call('onState', this.state);
    }
    if (wasConnected) this._call('onEvent', {type: 'disconnect', reason});
    this._status('disconnected', this.role === 'host' ? 'Соперник отключился. Он может войти снова по тому же коду.' : 'Связь потеряна. Вернитесь в комнату по тому же коду.');
  }

  leave({silent = false} = {}) {
    this._send({kind: 'bye'});
    this._generation++;
    this._peerOpenReject?.(networkError('cancelled', 'Подключение отменено.'));
    clearInterval(this._interval); this._interval = null;
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
    this._lobbyReject?.(networkError('cancelled', 'Подключение отменено.'));
    this._lobbyResolve = this._lobbyReject = null;
    const conn = this._conn, peer = this._peer;
    this._conn = this._peer = null;
    try { conn?.close(); peer?.destroy(); } catch {}
    this.role = null; this.roomCode = ''; this.state = null; this.engine = null; this.connected = false;
    this._offset = 0; this._samples = []; this._clockSynced = false; this._pendingReady = false;
    this._shotSeq = 0; this._localLastShot = -Infinity; this._lastEvent = 0;
    this._session = ''; this._lastSeen = 0; this._lastPing = 0; this._available = true;
    this._pendingPings.clear(); this.pingMs = null; this._publishedRevision = -1;
    if (!silent) this._status('closed', 'Вы вышли из комнаты.');
  }
}
