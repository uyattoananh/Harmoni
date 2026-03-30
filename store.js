const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Store {
  constructor() {
    this.path = path.join(app.getPath('userData'), 'sonos-ui-prefs.json');
    this.data = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.path, 'utf8'));
    } catch (e) {
      return {};
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('Store save error:', e.message);
    }
  }

  get(key, defaultVal) {
    return this.data[key] !== undefined ? this.data[key] : defaultVal;
  }

  set(key, value) {
    this.data[key] = value;
    this._save();
  }
}

module.exports = Store;
