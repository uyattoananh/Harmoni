const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');

const SUPPORTED_EXTS = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.aac', '.wma', '.opus']);

class LocalFilesService {
  constructor() {
    this.library = []; // { path, title, artist, album, duration, artBase64, artMime }
    this.scanning = false;
  }

  async scanFolder(folderPath) {
    if (this.scanning) return this.library;
    this.scanning = true;
    this.library = [];

    try {
      await this._walkDir(folderPath);
    } catch (e) {
      console.error('Scan error:', e.message);
    }

    this.scanning = false;
    console.log(`Scanned ${this.library.length} tracks from ${folderPath}`);
    return this.library;
  }

  async _walkDir(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return; // permission denied, skip
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this._walkDir(fullPath);
      } else if (SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
        try {
          const meta = await mm.parseFile(fullPath, { duration: true, skipCovers: false });
          const common = meta.common || {};
          const format = meta.format || {};

          // Extract album art
          let artBase64 = '';
          let artMime = '';
          if (common.picture && common.picture.length > 0) {
            const pic = common.picture[0];
            artBase64 = pic.data.toString('base64');
            artMime = pic.format || 'image/jpeg';
          }

          this.library.push({
            path: fullPath,
            title: common.title || path.basename(fullPath, path.extname(fullPath)),
            artist: common.artist || 'Unknown Artist',
            album: common.album || 'Unknown Album',
            duration: format.duration || 0,
            trackNumber: common.track?.no || 0,
            year: common.year || 0,
            artBase64,
            artMime,
          });
        } catch (e) {
          // Skip files that can't be parsed
        }
      }
    }
  }

  getLibrary() {
    return this.library;
  }

  // Group by album
  getAlbums() {
    const albums = {};
    for (const track of this.library) {
      const key = `${track.album}::${track.artist}`;
      if (!albums[key]) {
        albums[key] = {
          album: track.album,
          artist: track.artist,
          artBase64: track.artBase64,
          artMime: track.artMime,
          tracks: [],
        };
      }
      albums[key].tracks.push(track);
    }
    // Sort tracks within albums
    for (const album of Object.values(albums)) {
      album.tracks.sort((a, b) => a.trackNumber - b.trackNumber);
    }
    return Object.values(albums);
  }

  // Group by artist
  getArtists() {
    const artists = {};
    for (const track of this.library) {
      if (!artists[track.artist]) {
        artists[track.artist] = { artist: track.artist, count: 0 };
      }
      artists[track.artist].count++;
    }
    return Object.values(artists).sort((a, b) => a.artist.localeCompare(b.artist));
  }

  // Search
  search(query) {
    const q = query.toLowerCase();
    return this.library.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
    ).slice(0, 50);
  }
}

module.exports = LocalFilesService;
