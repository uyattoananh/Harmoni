const { DeviceDiscovery, Sonos } = require('sonos');
const { execFile } = require('child_process');
const http = require('http');

class SonosService {
  constructor() {
    this.devices = new Map();
  }

  getDevice(ip) {
    let device = this.devices.get(ip);
    if (!device) {
      device = new Sonos(ip);
      this.devices.set(ip, device);
    }
    return device;
  }

  // Try SSDP first, fall back to ARP table scan
  async discover() {
    console.log('Starting discovery...');

    // Run both in parallel — SSDP and ARP scan
    const [ssdpResults, arpResults] = await Promise.all([
      this._discoverSSDP().catch(() => []),
      this._discoverARP().catch(() => []),
    ]);

    // Merge results, deduplicate by IP
    const seen = new Set();
    const all = [];
    for (const d of [...ssdpResults, ...arpResults]) {
      if (!seen.has(d.ip)) {
        seen.add(d.ip);
        all.push(d);
      }
    }

    console.log(`Found ${all.length} device(s)`);
    return all;
  }

  // SSDP multicast discovery (may be blocked by firewall)
  _discoverSSDP() {
    return new Promise((resolve) => {
      const found = [];
      const search = DeviceDiscovery({ timeout: 4000 });

      search.on('DeviceAvailable', async (device) => {
        try {
          const info = await this._getDeviceInfo(device.host);
          if (info) {
            this.devices.set(device.host, device);
            found.push(info);
          }
        } catch (err) {
          console.error('SSDP device error:', err.message);
        }
      });

      search.on('timeout', () => resolve(found));
    });
  }

  // Scan ARP table for Sonos MAC prefixes, then probe port 1400
  async _discoverARP() {
    // Sonos MAC prefixes (both dash and colon separated)
    const sonosMacPrefixes = ['48-a6-b8', 'b8-e9-37', '78-28-ca', '54-2a-1b', '94-9f-3e', '34-7e-5c',
                               '48:a6:b8', 'b8:e9:37', '78:28:ca', '54:2a:1b', '94:9f:3e', '34:7e:5c'];
    let arpOutput = '';

    try {
      arpOutput = await new Promise((resolve, reject) => {
        const opts = { encoding: 'utf8', timeout: 5000 };
        if (process.platform === 'win32') opts.windowsHide = true;
        execFile('arp', ['-a'], opts, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });
    } catch (e) {
      console.error('ARP scan failed:', e.message);
      return [];
    }

    // Parse ARP table for Sonos MACs (handles both Windows and Unix formats)
    // Windows: 10.0.0.147  48-a6-b8-50-72-e0  dynamic
    // macOS/Linux: ? (10.0.0.147) at 48:a6:b8:50:72:e0 on en0
    const candidates = [];
    for (const line of arpOutput.split('\n')) {
      // Extract IP and MAC from either format
      const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
      const macMatch = line.match(/([\da-fA-F]{2}[:-][\da-fA-F]{2}[:-][\da-fA-F]{2}[:-][\da-fA-F]{2}[:-][\da-fA-F]{2}[:-][\da-fA-F]{2})/);
      if (!ipMatch || !macMatch) continue;
      const ip = ipMatch[1];
      const macLower = macMatch[1].toLowerCase();
      if (sonosMacPrefixes.some(prefix => macLower.startsWith(prefix))) {
        candidates.push(ip);
      }
    }

    console.log(`ARP found ${candidates.length} Sonos MAC(s):`, candidates);

    // Probe each candidate on port 1400
    const results = await Promise.all(
      candidates.map(ip => this._getDeviceInfo(ip).catch(() => null))
    );

    return results.filter(Boolean);
  }

  // Probe a single IP for Sonos device info
  async _getDeviceInfo(ip) {
    const device = this.getDevice(ip);

    const desc = await device.deviceDescription();
    const state = await device.getCurrentState();
    const volume = await device.getVolume();
    let currentTrack = {};
    try {
      currentTrack = await device.currentTrack();
    } catch (e) { /* no track */ }

    return {
      ip,
      port: 1400,
      name: desc.roomName,
      modelName: desc.modelName,
      modelNumber: desc.modelNumber,
      serialNum: desc.serialNum,
      state,
      volume,
      currentTrack: this._formatTrack(currentTrack),
    };
  }

  async getState(ip) {
    const device = this.getDevice(ip);
    const state = await device.getCurrentState();
    const volume = await device.getVolume();
    const muted = await device.getMuted();
    let currentTrack = {};
    let playMode = 'NORMAL';
    try {
      currentTrack = await device.currentTrack();
    } catch (e) { /* no track */ }
    try {
      playMode = await device.getPlayMode();
    } catch (e) { /* default */ }

    return {
      state,
      volume,
      muted,
      playMode,
      currentTrack: this._formatTrack(currentTrack),
    };
  }

  async play(ip) {
    await this.getDevice(ip).play();
  }

  async pause(ip) {
    await this.getDevice(ip).pause();
  }

  async next(ip) {
    await this.getDevice(ip).next();
  }

  async previous(ip) {
    await this.getDevice(ip).previous();
  }

  async setVolume(ip, vol) {
    await this.getDevice(ip).setVolume(vol);
  }

  async toggleMute(ip) {
    const device = this.getDevice(ip);
    const muted = await device.getMuted();
    await device.setMuted(!muted);
    return !muted;
  }

  async seek(ip, position) {
    await this.getDevice(ip).seek(position);
  }

  async getQueue(ip) {
    return this.getDevice(ip).getQueue();
  }

  async getPlayMode(ip) {
    return this.getDevice(ip).getPlayMode();
  }

  async setPlayMode(ip, mode) {
    await this.getDevice(ip).setPlayMode(mode);
  }

  async selectTrack(ip, trackNum) {
    await this.getDevice(ip).selectTrack(trackNum);
  }

  async getFavorites(ip) {
    return this.getDevice(ip).getFavorites();
  }

  async getPlaylists(ip) {
    return this.getDevice(ip).getMusicLibrary('sonos_playlists');
  }

  async playFavorite(ip, favorite) {
    const device = this.getDevice(ip);
    try {
      await device.setAVTransportURI({ uri: favorite.uri, metadata: favorite.metadata || '' });
      await device.play();
    } catch (e) {
      console.error('Play favorite error:', e.message);
    }
  }

  async playPlaylist(ip, playlist) {
    const device = this.getDevice(ip);
    try {
      await device.flush(); // clear current queue
      await device.setAVTransportURI(playlist.uri);
      await device.play();
    } catch (e) {
      console.error('Play playlist error:', e.message);
    }
  }

  async removeTrackFromQueue(ip, trackIndex) {
    await this.getDevice(ip).removeTracksFromQueue([trackIndex]);
  }

  async reorderTrack(ip, fromIndex, toIndex) {
    await this.getDevice(ip).reorderTracksInQueue(fromIndex, 1, toIndex);
  }

  _formatTrack(t) {
    return {
      title: t.title || '',
      artist: t.artist || '',
      album: t.album || '',
      albumArtURI: t.albumArtURI || '',
      duration: t.duration || 0,
      position: t.position || 0,
    };
  }
}

module.exports = SonosService;
