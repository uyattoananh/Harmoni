const { shell } = require('electron');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const url = require('url');

// ── Spotify PKCE OAuth ──
// Users need to create a Spotify app at https://developer.spotify.com/dashboard
// Set redirect URI to http://localhost:8888/callback
// Paste the Client ID below or in app settings

const SPOTIFY_CLIENT_ID = '8794efc93b8f476f8c8e5eaafcf3c1dc';
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
].join(' ');

class SpotifyService {
  constructor(store) {
    this.store = store;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = 0;
    this.clientId = null;

    // Load saved tokens
    this._loadTokens();
  }

  _loadTokens() {
    if (!this.store) return;
    this.accessToken = this.store.get('spotifyAccessToken', null);
    this.refreshToken = this.store.get('spotifyRefreshToken', null);
    this.tokenExpiry = this.store.get('spotifyTokenExpiry', 0);
    this.clientId = this.store.get('spotifyClientId', SPOTIFY_CLIENT_ID);
  }

  _saveTokens() {
    if (!this.store) return;
    this.store.set('spotifyAccessToken', this.accessToken);
    this.store.set('spotifyRefreshToken', this.refreshToken);
    this.store.set('spotifyTokenExpiry', this.tokenExpiry);
  }

  getClientId() {
    return this.clientId || SPOTIFY_CLIENT_ID;
  }

  setClientId(id) {
    this.clientId = id;
    if (this.store) this.store.set('spotifyClientId', id);
  }

  isLoggedIn() {
    return !!(this.accessToken && this.tokenExpiry > Date.now());
  }

  // ── PKCE Auth Flow ──
  async login() {
    const cid = this.getClientId();
    if (!cid || cid === 'YOUR_SPOTIFY_CLIENT_ID') {
      throw new Error('Spotify Client ID not configured');
    }

    // Generate PKCE challenge
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    const authUrl = `https://accounts.spotify.com/authorize?` +
      `client_id=${cid}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&code_challenge_method=S256` +
      `&code_challenge=${challenge}`;

    // Start local server to catch the callback, open auth in default browser
    const code = await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const parsed = url.parse(req.url, true);
        if (parsed.pathname === '/callback') {
          const authCode = parsed.query.code;
          const error = parsed.query.error;
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body style="font-family:Inter,sans-serif;text-align:center;padding:60px;background:#1a1a1a;color:#fff"><h2>Login successful!</h2><p style="color:#888">You can close this tab and return to the app.</p></body></html>');
          server.close();
          if (error) reject(new Error(error));
          else resolve(authCode);
        }
      });

      server.listen(8888, () => {
        // Open in the user's default browser (trusted context)
        shell.openExternal(authUrl);
      });

      // Timeout after 2 minutes
      setTimeout(() => {
        try { server.close(); } catch (e) {}
        reject(new Error('Login timed out'));
      }, 120000);
    });

    // Exchange code for tokens
    await this._exchangeCode(code, verifier);
  }

  async _exchangeCode(code, verifier) {
    const body = new URLSearchParams({
      client_id: this.getClientId(),
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }).toString();

    const data = await this._post('accounts.spotify.com', '/api/token', body);
    console.log('Spotify token response:', data.error || 'OK', data.access_token ? 'token received' : 'no token');
    if (data.error) {
      throw new Error(`Spotify auth error: ${data.error} - ${data.error_description || ''}`);
    }
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    this._saveTokens();
  }

  async _refreshAccessToken() {
    if (!this.refreshToken) throw new Error('No refresh token');

    const body = new URLSearchParams({
      client_id: this.getClientId(),
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    }).toString();

    const data = await this._post('accounts.spotify.com', '/api/token', body);
    this.accessToken = data.access_token;
    if (data.refresh_token) this.refreshToken = data.refresh_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    this._saveTokens();
  }

  async _ensureToken() {
    if (!this.accessToken) throw new Error('Not logged in');
    if (Date.now() >= this.tokenExpiry) {
      await this._refreshAccessToken();
    }
  }

  // ── API Methods ──
  async getMe() {
    await this._ensureToken();
    return this._api('/v1/me');
  }

  async getPlaylists(limit = 50) {
    await this._ensureToken();
    return this._api(`/v1/me/playlists?limit=${limit}`);
  }

  async getPlaylistTracks(playlistId, limit = 50) {
    await this._ensureToken();
    return this._api(`/v1/playlists/${playlistId}/tracks?limit=${limit}`);
  }

  async getLikedSongs(limit = 50) {
    await this._ensureToken();
    return this._api(`/v1/me/tracks?limit=${limit}`);
  }

  async search(query, types = 'track,album,playlist', limit = 20) {
    await this._ensureToken();
    return this._api(`/v1/search?q=${encodeURIComponent(query)}&type=${types}&limit=${limit}`);
  }

  async getCurrentPlayback() {
    await this._ensureToken();
    return this._api('/v1/me/player');
  }

  async play(contextUri, trackUri) {
    await this._ensureToken();
    const body = {};
    if (contextUri) body.context_uri = contextUri;
    if (trackUri) body.uris = [trackUri];
    return this._apiPut('/v1/me/player/play', body);
  }

  async pause() {
    await this._ensureToken();
    return this._apiPut('/v1/me/player/pause');
  }

  async next() {
    await this._ensureToken();
    return this._apiPost('/v1/me/player/next');
  }

  async previous() {
    await this._ensureToken();
    return this._apiPost('/v1/me/player/previous');
  }

  async setVolume(vol) {
    await this._ensureToken();
    return this._apiPut(`/v1/me/player/volume?volume_percent=${vol}`);
  }

  async getTopTracks(limit = 20) {
    await this._ensureToken();
    return this._api(`/v1/me/top/tracks?limit=${limit}&time_range=short_term`);
  }

  logout() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = 0;
    if (this.store) {
      this.store.set('spotifyAccessToken', null);
      this.store.set('spotifyRefreshToken', null);
      this.store.set('spotifyTokenExpiry', 0);
    }
  }

  // ── HTTP helpers ──
  _api(path) {
    return new Promise((resolve, reject) => {
      https.get({
        hostname: 'api.spotify.com', path,
        headers: { 'Authorization': `Bearer ${this.accessToken}` },
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          if (res.statusCode === 204) { resolve(null); return; }
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) { resolve({ error: parsed.error || { status: res.statusCode, message: data } }); return; }
            resolve(parsed);
          } catch (e) { resolve(null); }
        });
      }).on('error', reject);
    });
  }

  _apiPut(path, body) {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : '';
      const req = https.request({
        hostname: 'api.spotify.com', path, method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { resolve(res.statusCode < 300); });
      });
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }

  _apiPost(path) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.spotify.com', path, method: 'POST',
        headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Length': 0 },
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => { resolve(res.statusCode < 300); });
      });
      req.on('error', reject);
      req.end();
    });
  }

  _post(hostname, path, body) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname, path, method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid response')); }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

module.exports = SpotifyService;
