const net = require("node:net");

const DISCORD_APPLICATION_ID = "1555622761924272249";
const GITHUB_PROJECT_URL = "https://github.com/fattestbro/Untitled-Browser";
const PIPE_PREFIX = "\\\\?\\pipe\\discord-ipc-";
const HANDSHAKE_OPCODE = 0;
const FRAME_OPCODE = 1;

function makeFrame(opcode, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const frame = Buffer.allocUnsafe(8 + body.length);
  frame.writeUInt32LE(opcode, 0);
  frame.writeUInt32LE(body.length, 4);
  body.copy(frame, 8);
  return frame;
}

function makeActivity(activity = {}) {
  return {
    ...activity,
    buttons: [
      {
        label: "GitHub Project",
        url: GITHUB_PROJECT_URL
      }
    ]
  };
}

function randomNonce() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

class DiscordRPC {
  constructor() {
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.connected = false;
    this.ready = false;
    this.stopped = false;
    this.retryTimer = null;
    this.pipeIndex = null;
    this.activity = null;
    this.startTimestamp = Math.floor(Date.now() / 1000);
  }

  start() {
    if (process.platform !== "win32") return;
    this.stopped = false;
    this.connectToPipe(0);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.ready = false;
    this.connected = false;
    this.buffer = Buffer.alloc(0);
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  setActivity(activity) {
    this.activity = makeActivity({
      ...activity,
      timestamps: activity.timestamps || { start: this.startTimestamp }
    });
    if (this.ready) this.sendActivity();
  }

  connectToPipe(index) {
    if (this.stopped) return;
    if (index > 9) {
      this.scheduleReconnect();
      return;
    }

    const socket = net.createConnection(PIPE_PREFIX + index);
    let connectedOnce = false;
    let failedBeforeConnect = false;

    const failBeforeConnect = () => {
      if (connectedOnce || failedBeforeConnect || this.stopped) return;
      failedBeforeConnect = true;
      socket.destroy();
      this.connectToPipe(index + 1);
    };

    socket.once("connect", () => {
      connectedOnce = true;
      this.socket = socket;
      this.pipeIndex = index;
      this.connected = true;
      this.ready = false;
      this.buffer = Buffer.alloc(0);

      socket.on("data", chunk => this.onData(chunk));
      socket.on("error", error => {
        if (this.socket === socket) {
          console.warn("[discord-rpc] IPC error:", error.message);
        }
      });
      socket.on("close", () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.connected = false;
        this.ready = false;
        this.buffer = Buffer.alloc(0);
        this.pipeIndex = null;
        this.scheduleReconnect();
      });

      this.send(HANDSHAKE_OPCODE, {
        v: 1,
        client_id: DISCORD_APPLICATION_ID
      });
    });

    socket.once("error", failBeforeConnect);
    socket.once("close", () => {
      if (!connectedOnce) failBeforeConnect();
    });
  }

  scheduleReconnect() {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connectToPipe(0);
    }, 10000);
  }

  send(opcode, payload) {
    if (!this.socket || !this.connected) return false;
    try {
      this.socket.write(makeFrame(opcode, payload));
      return true;
    } catch (error) {
      console.warn("[discord-rpc] send failed:", error.message);
      return false;
    }
  }

  sendActivity() {
    if (!this.ready || !this.activity) return;
    this.send(FRAME_OPCODE, {
      cmd: "SET_ACTIVITY",
      args: {
        pid: process.pid,
        activity: this.activity
      },
      nonce: randomNonce()
    });
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 8) {
      const opcode = this.buffer.readUInt32LE(0);
      const length = this.buffer.readUInt32LE(4);
      if (this.buffer.length < 8 + length) return;

      const body = this.buffer.subarray(8, 8 + length).toString("utf8");
      this.buffer = this.buffer.subarray(8 + length);

      if (opcode !== FRAME_OPCODE) continue;

      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        continue;
      }

      if (payload?.evt === "READY") {
        this.ready = true;
        this.sendActivity();
      }
    }
  }
}

module.exports = {
  DISCORD_APPLICATION_ID,
  GITHUB_PROJECT_URL,
  makeFrame,
  makeActivity,
  DiscordRPC
};
