const https = require('https');

class LyricsService {
  constructor() {
    this.cache = new Map();
  }

  async getLyrics(title, artist) {
    if (!title) return null;

    const key = `${title}::${artist}`;
    if (this.cache.has(key)) return this.cache.get(key);

    try {
      const result = await this._fetchLRCLIB(title, artist);
      this.cache.set(key, result);
      return result;
    } catch (e) {
      console.error('Lyrics fetch error:', e.message);
      return null;
    }
  }

  _fetchLRCLIB(title, artist) {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        track_name: title,
        artist_name: artist || '',
      });

      const url = `https://lrclib.net/api/search?${params}`;

      https.get(url, {
        headers: { 'User-Agent': 'SonosUI/1.0' },
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const results = JSON.parse(data);
            if (!results || results.length === 0) {
              resolve(null);
              return;
            }

            // Pick best match — prefer synced lyrics
            const best = results.find(r => r.syncedLyrics) || results[0];

            if (best.syncedLyrics) {
              // Parse synced LRC format
              const lines = this._parseLRC(best.syncedLyrics);
              resolve({ type: 'synced', lines, plain: best.plainLyrics || '' });
            } else if (best.plainLyrics) {
              resolve({ type: 'plain', lines: [], plain: best.plainLyrics });
            } else {
              resolve(null);
            }
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  // Parse LRC format: [mm:ss.xx] lyrics line
  _parseLRC(lrc) {
    const lines = [];
    for (const line of lrc.split('\n')) {
      const match = line.match(/\[(\d+):(\d+)\.(\d+)\]\s*(.*)/);
      if (match) {
        const minutes = parseInt(match[1]);
        const seconds = parseInt(match[2]);
        const centis = parseInt(match[3]);
        const time = minutes * 60 + seconds + centis / 100;
        const text = match[4].trim();
        if (text) {
          lines.push({ time, text });
        }
      }
    }
    return lines;
  }
}

module.exports = LyricsService;
