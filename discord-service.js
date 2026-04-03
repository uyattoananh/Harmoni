const RPC = require('discord-rpc');

const DISCORD_CLIENT_ID = '1489756732933804193';

class DiscordService {
  constructor(store) {
    this.store = store;
    this.client = null;
    this.connected = false;
    this.enabled = false;
    this.lastTrack = '';
    this.clientId = null;

    this._loadSettings();
  }

  _loadSettings() {
    if (!this.store) return;
    this.enabled = this.store.get('discordRPC', true);
    this.clientId = this.store.get('discordClientId', DISCORD_CLIENT_ID);
  }

  getClientId() {
    return this.clientId || DISCORD_CLIENT_ID;
  }

  setClientId(id) {
    this.clientId = id;
    if (this.store) this.store.set('discordClientId', id);
  }

  isEnabled() {
    return this.enabled;
  }

  async enable() {
    this.enabled = true;
    if (this.store) this.store.set('discordRPC', true);
    await this.connect();
  }

  disable() {
    this.enabled = false;
    if (this.store) this.store.set('discordRPC', false);
    this.disconnect();
  }

  async connect() {
    if (this.connected || !this.enabled) return;

    const cid = this.getClientId();
    if (!cid || cid === 'YOUR_DISCORD_APP_ID') {
      console.log('Discord RPC: No client ID configured');
      return;
    }

    try {
      this.client = new RPC.Client({ transport: 'ipc' });

      this.client.on('ready', () => {
        console.log('Discord RPC connected as', this.client.user?.username);
        this.connected = true;
      });

      this.client.on('disconnected', () => {
        console.log('Discord RPC disconnected');
        this.connected = false;
      });

      await this.client.login({ clientId: cid });
    } catch (e) {
      console.log('Discord RPC connect failed:', e.message);
      this.connected = false;
    }
  }

  disconnect() {
    if (this.client) {
      try {
        this.client.clearActivity();
        this.client.destroy();
      } catch (e) { /* ignore */ }
      this.client = null;
      this.connected = false;
    }
  }

  async updatePresence(track, source) {
    if (!this.connected || !this.enabled || !this.client) return;
    if (!track || !track.title) {
      this.clearPresence();
      return;
    }

    // Don't update if same track
    const trackKey = `${track.title}::${track.artist}`;
    if (trackKey === this.lastTrack) return;
    this.lastTrack = trackKey;

    try {
      const activity = {
        details: track.title,
        state: track.artist || 'Unknown Artist',
        largeImageKey: 'harmoni_logo',
        largeImageText: track.album || 'Harmoni',
        smallImageKey: 'play',
        smallImageText: source || 'Playing',
        instance: false,
      };

      // Add timestamps if we have duration
      const duration = this._parseDuration(track.duration);
      if (duration > 0) {
        const position = this._parseDuration(track.position);
        activity.startTimestamp = Math.floor(Date.now() / 1000) - position;
        activity.endTimestamp = Math.floor(Date.now() / 1000) + (duration - position);
      }

      await this.client.setActivity(activity);
    } catch (e) {
      console.log('Discord RPC update failed:', e.message);
    }
  }

  clearPresence() {
    if (this.client && this.connected) {
      try { this.client.clearActivity(); } catch (e) { /* ignore */ }
    }
    this.lastTrack = '';
  }

  _parseDuration(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const parts = String(val).split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }
}

module.exports = DiscordService;
