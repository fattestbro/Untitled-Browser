'use strict';

const net = require('node:net');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');

const IPC_PREFIX = '\\\\?\\pipe\\discord-ipc-';
const IPC_MAX_INDEX = 9;
const CONNECT_TIMEOUT_MS = 2500;
const HANDSHAKE_TIMEOUT_MS = 10000;
const RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];
const PING_INTERVAL_MS = 15000;
const FIXED_APPLICATION_ID = '1555622761924272249';

function validateApplicationId(input) {
  const id = String(input ?? '').trim().replace(/\s+/g, '');
  if (!id) return { ok: false, id: '', reason: 'Application ID is empty.' };
  // Discord IDs are snowflakes sent as strings. Do not turn them into Number/BigInt;
  // large IDs must retain their exact decimal representation.
  if (!/^\d+$/.test(id)) return { ok: false, id, reason: 'Application ID must contain digits only.' };
  if (id.length > 32) return { ok: false, id, reason: 'Application ID is too long.' };
  return { ok: true, id };
}

function makeNonce() {
  return crypto.randomUUID();
}

function encodeFrame(opcode, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const frame = Buffer.allocUnsafe(8 + body.length);
  frame.writeUInt32LE(opcode, 0);
  frame.writeUInt32LE(body.length, 4);
  body.copy(frame, 8);
  return frame;
}

function decodeFrames(buffer) {
  const packets = [];
  let offset = 0;
  while (buffer.length - offset >= 8) {
    const opcode = buffer.readUInt32LE(offset);
    const length = buffer.readUInt32LE(offset + 4);
    if (length < 0 || length > 16 * 1024 * 1024) throw new Error('Discord IPC frame is invalid or too large.');
    if (buffer.length - offset < 8 + length) break;
    const body = buffer.subarray(offset + 8, offset + 8 + length).toString('utf8');
    let payload = null;
    if (body) {
      try { payload = JSON.parse(body); }
      catch (_) { throw new Error('Discord sent malformed JSON over IPC.'); }
    }
    packets.push({ opcode, payload });
    offset += 8 + length;
  }
  return { packets, remainder: buffer.subarray(offset) };
}

function maskApplicationId(id) {
  const value = String(id || '');
  return value.length <= 4 ? '****' : `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

class DiscordRpcManager extends EventEmitter {
  constructor({ logger = () => {}, activityProvider = () => null } = {}) {
    super();
    this.logger = logger;
    this.activityProvider = activityProvider;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.connectPromise = null;
    this.connected = false;
    this.ready = false;
    this.shuttingDown = false;
    this.enabled = false;
    this.applicationId = '';
    this.pipeIndex = null;
    this.state = 'DISCONNECTED';
    this.lastError = '';
    this.lastActivityUpdate = null;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.refreshTimer = null;
    this.updateTimer = null;
    this.currentActivity = null;
    this.lastConnectionAt = 0;
    this.refreshTimer = null;
    this.clientIdRejected = false;
  }

  log(message) {
    try { this.logger(`[Discord] ${message}`); } catch (_) {}
  }

  emitStatus(extra = {}) {
    this.emit('status', {
      state: this.state,
      connected: this.connected,
      ready: this.ready,
      pipe: this.pipeIndex == null ? null : `${this.pipeIndex}`,
      applicationId: maskApplicationId(this.applicationId),
      lastError: this.lastError || null,
      lastActivityUpdate: this.lastActivityUpdate,
      reconnectAttempts: this.reconnectAttempt,
      ...extra,
    });
  }

  setState(state, error = '') {
    this.state = state;
    this.lastError = error || '';
    this.emitStatus();
  }

  getStatus() {
    return {
      state: this.state,
      connected: this.connected,
      ready: this.ready,
      pipe: this.pipeIndex == null ? null : `${this.pipeIndex}`,
      applicationId: maskApplicationId(this.applicationId),
      lastError: this.lastError || null,
      lastActivityUpdate: this.lastActivityUpdate,
      reconnectAttempts: this.reconnectAttempt,
    };
  }

  configure({ enabled = false } = {}) {
    const applicationId = FIXED_APPLICATION_ID;
    const validation = validateApplicationId(applicationId);
    const nextEnabled = Boolean(enabled);
    const nextId = validation.id;
    const changed = this.enabled !== nextEnabled || this.applicationId !== nextId;
    if (this.applicationId !== nextId) this.clientIdRejected = false;
    this.enabled = nextEnabled;
    this.applicationId = nextId;

    if (!this.enabled) {
      this.stop('disabled');
      return { ok: true, status: this.getStatus() };
    }
    if (!validation.ok) {
      this.stop('invalid');
      this.setState('INVALID_CLIENT_ID', validation.reason);
      return { ok: false, error: validation.reason, status: this.getStatus() };
    }
    if (changed || !this.ready) this.connect().catch(() => {});
    return { ok: true, status: this.getStatus() };
  }

  async test() {
    const validation = validateApplicationId(FIXED_APPLICATION_ID);
    if (!validation.ok) {
      this.setState('INVALID_CLIENT_ID', validation.reason);
      return { ok: false, error: validation.reason, status: this.getStatus() };
    }
    this.enabled = true;
    if (this.applicationId !== validation.id) this.clientIdRejected = false;
    this.applicationId = FIXED_APPLICATION_ID;
    if (!this.ready) {
      try { await this.connect({ manual: true }); }
      catch (error) { return { ok: false, error: error.message, status: this.getStatus() }; }
    }
    try {
      const activity = this.activityProvider();
      if (activity) await this.setActivity(activity);
      return { ok: true, message: 'Discord RPC connected successfully.', status: this.getStatus() };
    } catch (error) {
      this.setState('ERROR', error.message);
      return { ok: false, error: error.message, status: this.getStatus() };
    }
  }

  async connect({ manual = false } = {}) {
    if (this.shuttingDown || !this.enabled) throw new Error('Discord RPC is disabled.');
    const validation = validateApplicationId(this.applicationId);
    if (!validation.ok) {
      this.setState('INVALID_CLIENT_ID', validation.reason);
      throw new Error(validation.reason);
    }
    if (this.ready && this.socket && !this.socket.destroyed) return this.socket;
    if (this.connectPromise) return this.connectPromise;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.connectPromise = this._connect(manual).finally(() => { this.connectPromise = null; });
    return this.connectPromise;
  }

  async _connect(manual) {
    this.setState('CONNECTING');
    this.log(`Connecting (application ${maskApplicationId(this.applicationId)})${manual ? ' [manual test]' : ''}`);
    let socket = null;
    try {
      const found = await this.openFirstPipe();
      socket = found.socket;
      this.pipeIndex = found.index;
      this.socket = socket;
      this.buffer = Buffer.alloc(0);
      this.connected = true;
      this.ready = false;
      this.lastConnectionAt = Date.now();
      this.attachSocket(socket);
      this.log(`IPC pipe found: ${this.pipeIndex}`);

      const readyPromise = this.waitForReady();
      this.write(0, { v: 1, client_id: this.applicationId });
      await readyPromise;

      this.ready = true;
      this.reconnectAttempt = 0;
      this.setState('CONNECTED');
      this.log('Handshake successful (READY received)');
      this.startPing();

      const activity = this.activityProvider();
      if (activity) await this.setActivity(activity);
      return socket;
    } catch (error) {
      this.log(`Error: ${error.message}`);
      this.cleanupSocket(socket);
      if (/Invalid Client ID/i.test(error.message) || /code\s*4000/i.test(error.message)) {
        this.clientIdRejected = true;
        this.setState('INVALID_CLIENT_ID', error.message);
      } else if (/not found/i.test(error.message)) {
        this.setState('DISCORD_NOT_RUNNING', error.message);
      } else {
        this.setState('ERROR', error.message);
      }
      if (this.enabled && !this.shuttingDown && !manual && this.state !== 'INVALID_CLIENT_ID') this.scheduleReconnect();
      throw error;
    }
  }

  async openFirstPipe() {
    let lastError = null;
    for (let i = 0; i <= IPC_MAX_INDEX; i++) {
      try {
        const socket = await this.openPipe(i);
        return { socket, index: i };
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`Discord IPC pipe not found: ${lastError?.message || 'Discord is not running.'}`);
  }

  openPipe(index) {
    const path = `${IPC_PREFIX}${index}`;
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(path);
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.removeListener('connect', onConnect);
        socket.removeListener('error', onError);
        if (error) { try { socket.destroy(); } catch (_) {} reject(error); }
        else resolve(socket);
      };
      const onConnect = () => finish();
      const onError = error => finish(error);
      const timer = setTimeout(() => finish(new Error('connection timeout')), CONNECT_TIMEOUT_MS);
      socket.once('connect', onConnect);
      socket.once('error', onError);
    });
  }

  attachSocket(socket) {
    socket.on('data', chunk => {
      try {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        const decoded = decodeFrames(this.buffer);
        this.buffer = decoded.remainder;
        for (const packet of decoded.packets) this.handlePacket(packet);
      } catch (error) {
        this.fail(error);
      }
    });
    socket.on('error', error => this.fail(error));
    socket.on('close', () => this.onClose());
  }

  waitForReady() {
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      clearTimeout(this.readyTimer);
      this.readyTimer = setTimeout(() => {
        this.readyResolve = null;
        this.readyReject = null;
        reject(new Error('Timed out waiting for Discord READY.'));
      }, HANDSHAKE_TIMEOUT_MS);
    });
  }

  handlePacket({ opcode, payload }) {
    if (opcode === 1) {
      if (payload?.evt === 'READY') {
        clearTimeout(this.readyTimer);
        const resolve = this.readyResolve;
        this.readyResolve = null;
        this.readyReject = null;
        if (resolve) resolve(payload);
        return;
      }
      if (payload?.evt === 'ERROR') {
        const code = payload?.data?.code;
        const message = payload?.data?.message || 'Discord RPC error.';
        const error = new Error(`Discord RPC ${code ?? 'ERROR'}: ${message}`);
        if (payload?.nonce && this.pending.has(payload.nonce)) {
          const pending = this.pending.get(payload.nonce);
          this.pending.delete(payload.nonce);
          pending.reject(error);
        } else if (this.readyReject) {
          this.readyReject(error);
          this.readyReject = null;
          this.readyResolve = null;
          clearTimeout(this.readyTimer);
        } else {
          this.fail(error);
        }
        return;
      }
      if (payload?.nonce && this.pending.has(payload.nonce)) {
        const pending = this.pending.get(payload.nonce);
        this.pending.delete(payload.nonce);
        pending.resolve(payload);
      }
      return;
    }
    if (opcode === 2) {
      const code = payload?.code;
      const message = payload?.message || 'Discord closed the RPC connection.';
      const error = new Error(`Discord RPC ${code ?? 'CLOSE'}: ${message}`);
      this.fail(error);
      return;
    }
    if (opcode === 3) {
      try { this.write(4, payload || {}); } catch (error) { this.fail(error); }
    }
  }

  request(cmd, args) {
    if (!this.ready || !this.socket || this.socket.destroyed) return Promise.reject(new Error('Discord RPC is not connected.'));
    const nonce = makeNonce();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(nonce);
        reject(new Error(`Discord RPC ${cmd} timed out.`));
      }, 8000);
      this.pending.set(nonce, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      try {
        this.write(1, { cmd, args, nonce });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(nonce);
        reject(error);
      }
    });
  }

  write(opcode, payload) {
    if (!this.socket || this.socket.destroyed) throw new Error('Discord IPC socket is unavailable.');
    this.socket.write(encodeFrame(opcode, payload));
  }

  async setActivity(activity) {
    if (!this.ready) throw new Error('Discord RPC is not connected.');
    const clean = activity ? JSON.parse(JSON.stringify(activity)) : null;
    await this.request('SET_ACTIVITY', { pid: process.pid, activity: clean });
    this.currentActivity = clean;
    this.lastActivityUpdate = new Date().toISOString();
    this.emitStatus();
    this.log('Activity updated');
    return true;
  }

  scheduleActivity() {
    clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(async () => {
      this.updateTimer = null;
      if (!this.ready) return;
      try {
        const activity = await Promise.resolve(this.activityProvider());
        if (activity) await this.setActivity(activity);
      } catch (error) {
        this.log(`Activity error: ${error.message}`);
      }
    }, 350);
  }

  startRefreshLoop() {
    clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => this.scheduleActivity(), 10000);
  }

  startPing() {
    clearInterval(this.pingTimer);
    clearInterval(this.refreshTimer);
    this.pingTimer = setInterval(() => {
      if (!this.ready || !this.socket || this.socket.destroyed) return;
      try { this.write(3, { nonce: makeNonce() }); } catch (error) { this.fail(error); }
    }, PING_INTERVAL_MS);
  }

  stop(reason = 'stopped') {
    this.enabled = false;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.updateTimer);
    clearTimeout(this.readyTimer);
    clearInterval(this.pingTimer);
    clearInterval(this.refreshTimer);
    this.reconnectTimer = null;
    this.updateTimer = null;
    this.pingTimer = null;
    this.refreshTimer = null;
    this.shuttingDown = reason === 'shutdown';
    this.failPending(new Error('Discord RPC stopped.'));
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    this.ready = false;
    this.pipeIndex = null;
    if (socket) {
      try {
        if (!socket.destroyed) socket.write(encodeFrame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null }, nonce: makeNonce() }));
      } catch (_) {}
      try { socket.end(); } catch (_) {}
      try { socket.destroy(); } catch (_) {}
    }
    this.setState('DISCONNECTED', '');
    this.log(`Disconnected (${reason})`);
  }

  shutdown() {
    this.shuttingDown = true;
    this.stop('shutdown');
  }

  cleanupSocket(socket) {
    clearTimeout(this.readyTimer);
    clearInterval(this.pingTimer);
    clearInterval(this.refreshTimer);
    this.readyResolve = null;
    this.readyReject = null;
    if (this.socket === socket) this.socket = null;
    try { socket?.destroy(); } catch (_) {}
    this.connected = false;
    this.ready = false;
    this.pipeIndex = null;
    this.failPending(new Error('Discord RPC connection closed.'));
  }

  failPending(error) {
    for (const [nonce, pending] of this.pending) {
      this.pending.delete(nonce);
      pending.reject(error);
    }
  }

  fail(error) {
    const socket = this.socket;
    if (this.readyReject) {
      const reject = this.readyReject;
      this.readyReject = null;
      this.readyResolve = null;
      clearTimeout(this.readyTimer);
      reject(error);
    }
    this.cleanupSocket(socket);
    if (!this.shuttingDown) {
      if (/Invalid Client ID/i.test(error.message) || /RPC 4000/i.test(error.message)) { this.clientIdRejected = true; this.setState('INVALID_CLIENT_ID', error.message); }
      else this.setState('ERROR', error.message);
      if (this.enabled && !this.clientIdRejected && !/Invalid Client ID/i.test(error.message) && !/RPC 4000/i.test(error.message)) this.scheduleReconnect();
    }
  }

  onClose() {
    const wasReady = this.ready;
    this.cleanupSocket(this.socket);
    if (this.shuttingDown) return;
    this.log('Disconnected');
    if (this.enabled) {
      this.setState('DISCONNECTED', wasReady ? 'Discord IPC connection closed.' : this.lastError);
      if (!this.clientIdRejected) this.scheduleReconnect();
    } else {
      this.setState('DISCONNECTED', '');
    }
  }

  scheduleReconnect() {
    if (!this.enabled || this.shuttingDown || this.reconnectTimer) return;
    const delay = RECONNECT_BACKOFF_MS[Math.min(this.reconnectAttempt, RECONNECT_BACKOFF_MS.length - 1)];
    this.reconnectAttempt += 1;
    this.log(`Reconnecting in ${delay} ms`);
    this.setState('RECONNECTING');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, delay);
  }
}

module.exports = {
  DiscordRpcManager,
  FIXED_APPLICATION_ID,
  validateApplicationId,
  encodeFrame,
  decodeFrames,
  maskApplicationId,
};
