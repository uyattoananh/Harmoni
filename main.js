const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage, globalShortcut, Notification, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const { exec } = require('child_process');
const path = require('path');
const SonosService = require('./sonos-service');
const LyricsService = require('./lyrics-service');
const MediaSessionService = require('./media-session-service');
const LocalFilesService = require('./local-files-service');
const SpotifyService = require('./spotify-service');
const Store = require('./store');

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });
}

let mainWindow = null;
let locketWindow = null;
let minibarWindow = null;
let tray = null;
let store = null;
const sonosService = new SonosService();
const lyricsService = new LyricsService();
const mediaSessionService = new MediaSessionService();
const localFilesService = new LocalFilesService();
let spotifyService = null; // initialized after store is ready

// Track change detection for notifications
let lastTrackTitle = '';

// ── QoL 1: Auto-launch Sonos app (cross-platform) ──
function launchSonosApp() {
  const plat = process.platform;
  let cmd;
  if (plat === 'win32') {
    cmd = 'powershell -Command "Start-Process \'shell:AppsFolder\\{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}\\SonosV2\\Sonos.exe\'"';
  } else if (plat === 'darwin') {
    cmd = 'open -a Sonos 2>/dev/null || true';
  } else {
    cmd = 'which sonos >/dev/null 2>&1 && sonos &';
  }
  exec(cmd, (err) => {
    if (err) console.log('Could not launch Sonos app (may not be installed):', err.message);
    else console.log('Sonos app launched');
  });
}

// ── Create a 16x16 tray icon programmatically ──
function createTrayIcon() {
  const size = 16;
  const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16">
    <rect x="3" y="5" width="3" height="6" rx="0.5" fill="white"/>
    <polygon points="6,5 10,2 10,14 6,11" fill="white"/>
    <path d="M12 5.5c0.8 0.8 1.2 1.8 1.2 2.5s-0.4 1.7-1.2 2.5" stroke="white" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </svg>`;
  const encoded = Buffer.from(canvas).toString('base64');
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${encoded}`);
}

function createMainWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;

  // QoL 4: Restore saved position
  const savedPos = store.get('mainWindowPos', null);
  const x = savedPos ? savedPos.x : screenW - 420;
  const y = savedPos ? savedPos.y : Math.floor((screenH - 700) / 2);

  mainWindow = new BrowserWindow({
    width: 380,
    height: 700,
    minWidth: 340,
    minHeight: 550,
    frame: false,
    transparent: true,
    resizable: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    x, y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('renderer/index.html');

  // Save position on move
  mainWindow.on('moved', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const [px, py] = mainWindow.getPosition();
      store.set('mainWindowPos', { x: px, y: py });
    }
  });

  // Let minimize work normally (don't hide — hiding suspends the renderer)

  mainWindow.on('closed', () => {
    mainWindow = null;
    updateTrayMenu();
  });

  mainWindow.on('show', () => {
    updateTrayMenu();
  });

  // QoL 2: If we have a saved last device, tell renderer to auto-select it
  mainWindow.webContents.on('did-finish-load', () => {
    const savedTheme = store.get('theme', 'default');
    mainWindow.webContents.send('theme-changed', savedTheme);
    const lastDevice = store.get('lastDevice', null);
    if (lastDevice) {
      mainWindow.webContents.send('auto-select-device', lastDevice);
    }
  });
}

function createLocketWindow() {
  const { width: screenW } = screen.getPrimaryDisplay().workAreaSize;
  const savedPos = store.get('locketWindowPos', null);

  const lkSize = LOCKET_SIZES[currentTheme] || LOCKET_SIZES.default;
  locketWindow = new BrowserWindow({
    width: lkSize.w,
    height: lkSize.h,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    x: savedPos ? savedPos.x : screenW - 320,
    y: savedPos ? savedPos.y : 20,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  locketWindow.loadFile('renderer/locket.html');
  locketWindow.setAlwaysOnTop(true, 'pop-up-menu');
  locketWindow.setIgnoreMouseEvents(false);
  locketWindow.webContents.on('did-finish-load', () => {
    locketWindow.webContents.send('theme-changed', store.get('theme', 'default'));
  });

  locketWindow.on('moved', () => {
    if (locketWindow && !locketWindow.isDestroyed()) {
      const [px, py] = locketWindow.getPosition();
      store.set('locketWindowPos', { x: px, y: py });
    }
  });

  locketWindow.on('closed', () => {
    locketWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('widget-closed', 'locket');
  });
}

// ── Minibar overlay ──
function createMinibarWindow() {
  const { width: screenW } = screen.getPrimaryDisplay().workAreaSize;
  const savedPos = store.get('minibarWindowPos2', null);

  const mbSize = MINIBAR_SIZES[currentTheme] || MINIBAR_SIZES.default;
  minibarWindow = new BrowserWindow({
    width: mbSize.w,
    height: mbSize.h,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    x: savedPos ? savedPos.x : Math.floor((screenW - 360) / 2),
    y: savedPos ? savedPos.y : 12,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  minibarWindow.loadFile('renderer/minibar.html');
  minibarWindow.setAlwaysOnTop(true, 'pop-up-menu');
  minibarWindow.setIgnoreMouseEvents(false);
  minibarWindow.webContents.on('did-finish-load', () => {
    minibarWindow.webContents.send('theme-changed', store.get('theme', 'default'));
  });
  minibarWindow.setVisibleOnAllWorkspaces(true);

  minibarWindow.on('moved', () => {
    if (minibarWindow && !minibarWindow.isDestroyed()) {
      const [px, py] = minibarWindow.getPosition();
      store.set('minibarWindowPos2', { x: px, y: py });
    }
  });

  minibarWindow.on('closed', () => {
    minibarWindow = null;
    updateTrayMenu();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('widget-closed', 'minibar');
  });

  updateTrayMenu();
}

// ── System Tray ──
function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Harmoni');

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    } else {
      createMainWindow();
    }
  });

  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;

  const isVisible = mainWindow && mainWindow.isVisible();
  const hasDevice = !!activeDeviceIp;

  const menuItems = [
    {
      label: isVisible ? 'Hide Window' : 'Show Window',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        } else {
          createMainWindow();
        }
        updateTrayMenu();
      },
    },
    {
      label: 'Locket Widget',
      type: 'checkbox',
      checked: !!locketWindow,
      click: () => {
        if (locketWindow) {
          locketWindow.close();
        } else {
          createLocketWindow();
        }
      },
    },
    {
      label: 'Mini Bar',
      type: 'checkbox',
      checked: !!minibarWindow,
      click: () => {
        if (minibarWindow) {
          minibarWindow.close();
        } else {
          createMinibarWindow();
        }
      },
    },
    { type: 'separator' },
  ];

  if (hasDevice) {
    menuItems.push(
      {
        label: 'Play / Pause',
        click: async () => {
          try {
            const state = await sonosService.getState(activeDeviceIp);
            if (state.state === 'playing') {
              await sonosService.pause(activeDeviceIp);
            } else {
              await sonosService.play(activeDeviceIp);
            }
          } catch (e) { /* ignore */ }
        },
      },
      {
        label: 'Next Track',
        click: async () => {
          try { await sonosService.next(activeDeviceIp); } catch (e) { /* ignore */ }
        },
      },
      {
        label: 'Previous Track',
        click: async () => {
          try { await sonosService.previous(activeDeviceIp); } catch (e) { /* ignore */ }
        },
      },
      { type: 'separator' },
    );
  }

  menuItems.push({
    label: 'Quit',
    click: () => {
      app.isQuitting = true;
      app.quit();
    },
  });

  tray.setContextMenu(Menu.buildFromTemplate(menuItems));
}

// ── IPC Handlers ──
ipcMain.handle('discover', async () => {
  return sonosService.discover();
});

ipcMain.handle('get-state', async (_, ip) => {
  return sonosService.getState(ip);
});

ipcMain.handle('play', async (_, ip) => {
  if (sourceMode === 'local') return mediaSessionService.controlMedia('play');
  return sonosService.play(ip);
});

ipcMain.handle('pause', async (_, ip) => {
  if (sourceMode === 'local') return mediaSessionService.controlMedia('pause');
  return sonosService.pause(ip);
});

ipcMain.handle('next', async (_, ip) => {
  if (sourceMode === 'local') return mediaSessionService.controlMedia('next');
  return sonosService.next(ip);
});

ipcMain.handle('previous', async (_, ip) => {
  if (sourceMode === 'local') return mediaSessionService.controlMedia('previous');
  return sonosService.previous(ip);
});

ipcMain.handle('set-volume', async (_, ip, volume) => {
  return sonosService.setVolume(ip, volume);
});

ipcMain.handle('toggle-mute', async (_, ip) => {
  return sonosService.toggleMute(ip);
});

ipcMain.handle('seek', async (_, ip, position) => {
  return sonosService.seek(ip, position);
});

ipcMain.handle('get-queue', async (_, ip) => {
  return sonosService.getQueue(ip);
});

ipcMain.handle('get-play-mode', async (_, ip) => {
  return sonosService.getPlayMode(ip);
});

ipcMain.handle('set-play-mode', async (_, ip, mode) => {
  return sonosService.setPlayMode(ip, mode);
});

ipcMain.handle('select-track', async (_, ip, trackNum) => {
  return sonosService.selectTrack(ip, trackNum);
});

ipcMain.handle('get-lyrics', async (_, title, artist) => {
  return lyricsService.getLyrics(title, artist);
});

// Content browsing
ipcMain.handle('get-favorites', async (_, ip) => {
  return sonosService.getFavorites(ip);
});

ipcMain.handle('get-playlists', async (_, ip) => {
  return sonosService.getPlaylists(ip);
});

ipcMain.handle('play-favorite', async (_, ip, favorite) => {
  return sonosService.playFavorite(ip, favorite);
});

ipcMain.handle('play-playlist', async (_, ip, playlist) => {
  return sonosService.playPlaylist(ip, playlist);
});

ipcMain.handle('remove-from-queue', async (_, ip, index) => {
  return sonosService.removeTrackFromQueue(ip, index);
});

ipcMain.handle('reorder-track', async (_, ip, from, to) => {
  return sonosService.reorderTrack(ip, from, to);
});

// ── Local Files ──
ipcMain.handle('pick-music-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Music Folder',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const folder = result.filePaths[0];
  store.set('musicFolder', folder);
  return folder;
});

ipcMain.handle('scan-music-folder', async (_, folder) => {
  const lib = await localFilesService.scanFolder(folder);
  // Return without base64 art for the list (too large), art fetched per track
  return lib.map(t => ({
    path: t.path,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration: t.duration,
    hasArt: !!t.artBase64,
  }));
});

ipcMain.handle('get-track-art', async (_, trackPath) => {
  const track = localFilesService.getLibrary().find(t => t.path === trackPath);
  if (track && track.artBase64) {
    return `data:${track.artMime};base64,${track.artBase64}`;
  }
  return '';
});

ipcMain.handle('get-music-folder', () => {
  return store.get('musicFolder', null);
});

ipcMain.handle('search-local-files', async (_, query) => {
  return localFilesService.search(query).map(t => ({
    path: t.path,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration: t.duration,
    hasArt: !!t.artBase64,
  }));
});

ipcMain.handle('get-local-albums', async () => {
  return localFilesService.getAlbums().map(a => ({
    album: a.album,
    artist: a.artist,
    trackCount: a.tracks.length,
    hasArt: !!a.artBase64,
    artDataUrl: a.artBase64 ? `data:${a.artMime};base64,${a.artBase64}` : '',
    tracks: a.tracks.map(t => ({ path: t.path, title: t.title, artist: t.artist, duration: t.duration })),
  }));
});

// ── Spotify ──
ipcMain.handle('spotify-login', async () => {
  try {
    await spotifyService.login();
    const me = await spotifyService.getMe();
    return { ok: true, user: me ? me.display_name || 'Spotify User' : 'Spotify User' };
  } catch (e) {
    console.error('Spotify login error:', e);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('spotify-logout', () => {
  spotifyService.logout();
  return { ok: true };
});

ipcMain.handle('spotify-is-logged-in', () => {
  return spotifyService.isLoggedIn();
});

ipcMain.handle('spotify-get-me', async () => {
  try { return await spotifyService.getMe(); } catch (e) { return null; }
});

ipcMain.handle('spotify-get-playlists', async () => {
  try {
    const data = await spotifyService.getPlaylists();
    console.log('Spotify playlists:', data ? `${data.total} total, ${data.items?.length} items` : 'null');
    if (data && data.error) console.log('Spotify error:', JSON.stringify(data.error));
    return data;
  } catch (e) {
    console.error('Spotify playlists error:', e.message);
    return null;
  }
});

ipcMain.handle('spotify-get-playlist-tracks', async (_, id) => {
  try { return await spotifyService.getPlaylistTracks(id); } catch (e) { return null; }
});

ipcMain.handle('spotify-get-liked', async () => {
  try { return await spotifyService.getLikedSongs(); } catch (e) { return null; }
});

ipcMain.handle('spotify-search', async (_, query) => {
  try { return await spotifyService.search(query); } catch (e) { return null; }
});

ipcMain.handle('spotify-get-playback', async () => {
  try { return await spotifyService.getCurrentPlayback(); } catch (e) { return null; }
});

ipcMain.handle('spotify-play', async (_, contextUri, trackUri) => {
  try { return await spotifyService.play(contextUri, trackUri); } catch (e) { return false; }
});

ipcMain.handle('spotify-pause', async () => {
  try { return await spotifyService.pause(); } catch (e) { return false; }
});

ipcMain.handle('spotify-next', async () => {
  try { return await spotifyService.next(); } catch (e) { return false; }
});

ipcMain.handle('spotify-previous', async () => {
  try { return await spotifyService.previous(); } catch (e) { return false; }
});

ipcMain.handle('spotify-set-volume', async (_, vol) => {
  try { return await spotifyService.setVolume(vol); } catch (e) { return false; }
});

ipcMain.handle('spotify-get-client-id', () => {
  return spotifyService.getClientId();
});

ipcMain.on('spotify-set-client-id', (_, id) => {
  spotifyService.setClientId(id);
});

// Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.hide();
  updateTrayMenu();
});

ipcMain.on('minibar-resize', (_, mode) => {
  if (!minibarWindow || minibarWindow.isDestroyed()) return;
  const [w] = minibarWindow.getSize();
  const heights = MINIBAR_LYRICS_HEIGHTS[currentTheme] || MINIBAR_LYRICS_HEIGHTS.default;
  const newHeight = heights[mode] || heights.off;
  minibarWindow.setSize(w, newHeight, true);
});

ipcMain.on('toggle-minibar', () => {
  if (minibarWindow) {
    minibarWindow.close();
  } else {
    createMinibarWindow();
  }
});

ipcMain.on('close-minibar', () => {
  if (minibarWindow) minibarWindow.close();
});

ipcMain.on('minibar-play-pause', async (_, action) => {
  if (sourceMode === 'local') {
    try { await mediaSessionService.controlMedia(action === 'pause' ? 'pause' : 'play'); } catch (e) { /* ignore */ }
    return;
  }
  if (!activeDeviceIp) return;
  try {
    if (action === 'pause') await sonosService.pause(activeDeviceIp);
    else await sonosService.play(activeDeviceIp);
  } catch (e) { /* ignore */ }
});

ipcMain.on('minibar-action', async (_, action) => {
  if (sourceMode === 'local') {
    try { await mediaSessionService.controlMedia(action); } catch (e) { /* ignore */ }
    return;
  }
  if (!activeDeviceIp) return;
  try {
    if (action === 'next') await sonosService.next(activeDeviceIp);
    else if (action === 'previous') await sonosService.previous(activeDeviceIp);
  } catch (e) { /* ignore */ }
});

ipcMain.handle('ensure-minibar', () => {
  if (!minibarWindow) createMinibarWindow();
  return true;
});

ipcMain.handle('ensure-locket', () => {
  if (!locketWindow) createLocketWindow();
  return true;
});

ipcMain.handle('is-minibar-open', () => !!minibarWindow);
ipcMain.handle('is-locket-open', () => !!locketWindow);

ipcMain.on('toggle-locket', () => {
  if (locketWindow) {
    locketWindow.close();
  } else {
    createLocketWindow();
  }
});

ipcMain.on('open-main', () => {
  if (!mainWindow) {
    createMainWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.on('launch-sonos', () => {
  launchSonosApp();
});

ipcMain.on('app-quit', () => {
  app.isQuitting = true;
  app.quit();
});

ipcMain.on('open-external', (_, url) => {
  const { shell } = require('electron');
  shell.openExternal(url);
});

// Feedback via Discord webhook
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1488316345283248289/2fBu7a32h4x6qvGs-JZBufXjQuXl0osSSoVr7RJ6cegVT8kRfksYmR95G0_1R4vzLATg';

ipcMain.handle('send-feedback', async (_, type, title, desc) => {
  const https = require('https');
  let version = '?';
  try { version = require(path.join(__dirname, 'package.json')).version; } catch (e) {}
  const label = type === 'bug' ? '🐛 Bug Report' : '💡 Feature Request';
  const color = type === 'bug' ? 16007990 : 5025616;
  const body = JSON.stringify({
    embeds: [{
      title: `${label}: ${title}`,
      description: desc || 'No description provided.',
      color,
      footer: { text: `Harmoni v${version} | ${process.platform}` },
      timestamp: new Date().toISOString(),
    }],
  });

  return new Promise((resolve, reject) => {
    const webhookUrl = new URL(DISCORD_WEBHOOK);
    const req = https.request({
      hostname: webhookUrl.hostname,
      path: webhookUrl.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode < 300) resolve(true);
        else { console.error('Webhook error:', res.statusCode, data); reject(new Error('Failed')); }
      });
    });
    req.on('error', (e) => { console.error('Webhook request error:', e.message); reject(e); });
    req.write(body);
    req.end();
  });
});

// Widget position presets
ipcMain.on('set-widget-position', (_, target, pos) => {
  const win = target === 'minibar' ? minibarWindow : locketWindow;
  if (!win || win.isDestroyed()) return;

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const [winW, winH] = win.getSize();
  const margin = 12;

  const positions = {
    'top-left':      [margin, margin],
    'top-center':    [Math.floor((screenW - winW) / 2), margin],
    'top-right':     [screenW - winW - margin, margin],
    'bottom-left':   [margin, screenH - winH - margin],
    'bottom-center': [Math.floor((screenW - winW) / 2), screenH - winH - margin],
    'bottom-right':  [screenW - winW - margin, screenH - winH - margin],
  };

  const [x, y] = positions[pos] || positions['top-center'];
  win.setPosition(x, y, true);
});

// Theme system
const MINIBAR_SIZES = {
  default: { w: 360, h: 68 },
  light:   { w: 360, h: 74 },
  xp:      { w: 360, h: 72 },
  vinyl:   { w: 360, h: 68 },
  neon:    { w: 380, h: 74 },
  radio:   { w: 340, h: 100 },
  retro:   { w: 360, h: 60 },
  terminal:  { w: 360, h: 60 },
  bloom:     { w: 360, h: 74 },
  starry:    { w: 360, h: 68 },
  ziro:      { w: 360, h: 68 },
};
const MINIBAR_LYRICS_HEIGHTS = {
  default: { off: 68, mini: 186, full: 368 },
  light:   { off: 74, mini: 192, full: 374 },
  xp:      { off: 72, mini: 190, full: 372 },
  vinyl:   { off: 68, mini: 186, full: 368 },
  neon:    { off: 74, mini: 192, full: 374 },
  radio:   { off: 100, mini: 218, full: 400 },
  retro:   { off: 60, mini: 178, full: 360 },
  terminal:  { off: 60, mini: 178, full: 360 },
  bloom:     { off: 74, mini: 192, full: 374 },
  starry:    { off: 68, mini: 186, full: 368 },
  ziro:      { off: 68, mini: 186, full: 368 },
};

const LOCKET_SIZES = {
  default: { w: 300, h: 100 },
  light:   { w: 320, h: 90 },
  xp:      { w: 300, h: 80 },
  vinyl:   { w: 280, h: 110 },
  neon:    { w: 320, h: 100 },
  radio:   { w: 300, h: 100 },
  retro:   { w: 300, h: 90 },
  terminal:  { w: 300, h: 90 },
  bloom:     { w: 300, h: 100 },
  starry:    { w: 300, h: 100 },
  ziro:      { w: 300, h: 100 },
};

let currentTheme = 'default';

let themeDebounce = null;
ipcMain.on('set-theme', (_, theme) => {
  store.set('theme', theme);
  currentTheme = theme || 'default';

  // Debounce resize to prevent rapid switching crashes
  if (themeDebounce) clearTimeout(themeDebounce);
  themeDebounce = setTimeout(() => {
    try {
      if (minibarWindow && !minibarWindow.isDestroyed()) {
        const size = MINIBAR_SIZES[currentTheme] || MINIBAR_SIZES.default;
        minibarWindow.setSize(size.w, size.h, true);
      }
      if (locketWindow && !locketWindow.isDestroyed()) {
        const size = LOCKET_SIZES[currentTheme] || LOCKET_SIZES.default;
        locketWindow.setSize(size.w, size.h, true);
      }
    } catch (e) { /* window might be mid-close */ }
  }, 150);

  // Broadcast to all windows
  const allWindows = [mainWindow, locketWindow, minibarWindow];
  for (const win of allWindows) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('theme-changed', theme);
    }
  }
});

// Local media session detection
ipcMain.handle('get-media-sessions', async () => {
  return mediaSessionService.getSessions();
});

ipcMain.handle('get-current-media-session', async () => {
  return mediaSessionService.getCurrentSession();
});

// Source mode: 'sonos' or 'local'
let sourceMode = 'sonos';
let localPollInterval = null;

ipcMain.on('set-source-mode', (_, mode) => {
  sourceMode = mode;
  if (mode === 'local') {
    autoSwitchSuppressed = false;
    startLocalPolling();
  } else {
    // User manually left local mode — suppress auto-switch
    autoSwitchSuppressed = true;
    stopLocalPolling();
  }
});

// Local media state (module-level for interpolation)
let localSession = null;    // last PS result
let localAnchorPos = 0;     // position from last PS poll
let localAnchorTime = 0;    // Date.now() of last PS poll
let localArtCache = {};     // { "title::artist": artUrl }
let localPsFetchInterval = null;
let localUiPushInterval = null;

function startLocalPolling() {
  stopLocalPolling();

  // Slow loop: fetch from PowerShell every 3s
  const psFetch = async () => {
    try {
      const session = await mediaSessionService.getCurrentSession();
      if (session) {
        // Detect track change
        if (!localSession || localSession.title !== session.title || localSession.artist !== session.artist) {
          // New track
          localAnchorPos = session.position;
          localAnchorTime = Date.now();
          // Fetch album art
          fetchLocalAlbumArt(session.title, session.artist);
          addToHistory({ title: session.title, artist: session.artist, album: session.album });
          // Track change notification
          if (localSession && localSession.title) {
            showTrackNotification({ title: session.title, artist: session.artist, album: session.album });
          }
        } else {
          // Same track — handle position sync carefully
          // Some sources (Chrome) always report position=0, so ignore those
          const psPos = session.position || 0;
          const currentInterp = localAnchorPos + (Date.now() - localAnchorTime) / 1000;

          if (localSession && localSession.state !== session.state) {
            // State change (pause ↔ play, or seek flicker) — reset interpolation
            if (psPos > 0) {
              localAnchorPos = psPos;
            } else {
              // Chrome seek: state flickers, position stays 0
              // Reset to 0 since we can't know the real position after seek
              localAnchorPos = 0;
            }
            localAnchorTime = Date.now();
          } else if (psPos > 0) {
            // PS reports real position — only correct on big drift
            const drift = Math.abs(currentInterp - psPos);
            if (drift > 5) {
              localAnchorPos = psPos;
              localAnchorTime = Date.now();
            }
          }
          // If psPos is 0 (Chrome), just let interpolation run uninterrupted
        }
        localSession = session;
      } else {
        localSession = null;
      }
    } catch (e) { /* ignore */ }
  };

  psFetch(); // immediate first fetch
  localPsFetchInterval = setInterval(psFetch, 3000);

  // Fast loop: push interpolated state to renderers every 500ms
  localUiPushInterval = setInterval(() => {
    let interpPosition = 0;
    if (localSession && localSession.state === 'playing') {
      const elapsed = (Date.now() - localAnchorTime) / 1000;
      interpPosition = localAnchorPos + elapsed;
      if (localSession.duration > 0) interpPosition = Math.min(interpPosition, localSession.duration);
    } else if (localSession) {
      interpPosition = localSession.position || 0;
    }

    const artKey = localSession ? `${localSession.title}::${localSession.artist}` : '';
    const artUrl = localArtCache[artKey] || '';

    // Check if source reports real position (Chrome always reports 0)
    const hasRealPosition = localSession && localSession.position > 0;

    const state = localSession ? {
      state: localSession.state,
      volume: 0,
      muted: false,
      currentTrack: {
        title: localSession.title,
        artist: localSession.artist,
        album: localSession.album,
        albumArtURI: artUrl,
        duration: localSession.duration,
        position: hasRealPosition ? interpPosition : 0,
        _noPosition: !hasRealPosition,
      },
      _source: localSession.sourceName,
      _sourceMode: 'local',
    } : {
      state: 'stopped',
      volume: 0,
      muted: false,
      currentTrack: {},
      _source: 'None',
      _sourceMode: 'local',
    };

    const newTitle = state.currentTrack?.title || '';
    if (newTitle) lastTrackTitle = newTitle;
    if (tray && newTitle) tray.setToolTip(`${state._source} — ${newTitle}`);

    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('state-update', state);
    if (locketWindow && !locketWindow.isDestroyed()) locketWindow.webContents.send('state-update', state);
    if (minibarWindow && !minibarWindow.isDestroyed()) minibarWindow.webContents.send('state-update', state);
  }, 500);
}

// Fetch album art from iTunes Search API
function fetchLocalAlbumArt(title, artist) {
  const key = `${title}::${artist}`;
  if (localArtCache[key]) return;

  const https = require('https');
  const query = encodeURIComponent(`${artist} ${title}`);
  const url = `https://itunes.apple.com/search?term=${query}&media=music&limit=1`;

  console.log('Fetching album art for:', title, '-', artist);
  https.get(url, (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        if (result.results && result.results.length > 0) {
          const art = result.results[0].artworkUrl100;
          if (art) {
            localArtCache[key] = art.replace('100x100', '600x600');
            console.log('Album art found:', localArtCache[key].substring(0, 60) + '...');
          }
        } else {
          console.log('No album art results from iTunes');
        }
      } catch (e) { console.log('Album art parse error:', e.message); }
    });
  }).on('error', (e) => { console.log('Album art fetch error:', e.message); });
}

function stopLocalPolling() {
  if (localPsFetchInterval) { clearInterval(localPsFetchInterval); localPsFetchInterval = null; }
  if (localUiPushInterval) { clearInterval(localUiPushInterval); localUiPushInterval = null; }
  localSession = null;
}

// QoL 2: Save last selected device
ipcMain.on('save-last-device', (_, device) => {
  store.set('lastDevice', device);
});

// ── State polling ──
let pollInterval = null;
let activeDeviceIp = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

ipcMain.on('watch-device', (_, ip) => {
  activeDeviceIp = ip;
  reconnectAttempts = 0;
  if (pollInterval) clearInterval(pollInterval);
  updateTrayMenu();

  pollInterval = setInterval(async () => {
    if (!activeDeviceIp) return;
    try {
      const state = await sonosService.getState(activeDeviceIp);
      reconnectAttempts = 0; // reset on success

      // Track change notification + history
      const newTitle = state.currentTrack?.title || '';
      if (newTitle && newTitle !== lastTrackTitle) {
        if (lastTrackTitle !== '') showTrackNotification(state.currentTrack);
        addToHistory(state.currentTrack);
      }
      lastTrackTitle = newTitle;

      // Update tray tooltip
      if (tray && newTitle) {
        tray.setToolTip(`Sonos — ${newTitle}`);
      }

      // Attach device IP so renderers can resolve relative album art URIs
      state._deviceIp = activeDeviceIp;

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('state-update', state);
      }
      if (locketWindow && !locketWindow.isDestroyed()) {
        locketWindow.webContents.send('state-update', state);
      }
      if (minibarWindow && !minibarWindow.isDestroyed()) {
        minibarWindow.webContents.send('state-update', state);
      }
    } catch (e) {
      // QoL 5: Auto-reconnect — keep trying for a while
      reconnectAttempts++;
      console.log(`Device poll failed (attempt ${reconnectAttempts}/${MAX_RECONNECT}):`, e.message);

      if (reconnectAttempts >= MAX_RECONNECT) {
        console.log('Device unreachable, stopping poll');
        clearInterval(pollInterval);
        pollInterval = null;
        // Notify renderers
        const offlineState = { state: 'stopped', volume: 0, muted: false, currentTrack: {}, _offline: true };
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('state-update', offlineState);
        }
      }
      // Otherwise just keep retrying silently
    }
  }, 1000);
});

ipcMain.on('stop-watching', () => {
  if (pollInterval) clearInterval(pollInterval);
  activeDeviceIp = null;
  reconnectAttempts = 0;
  updateTrayMenu();
});

// ── Global Media Keys ──
function registerMediaKeys() {
  const mediaKeyActions = {
    'MediaPlayPause': async () => {
      if (sourceMode === 'local') {
        try { await mediaSessionService.controlMedia('playpause'); } catch (e) { /* ignore */ }
        return;
      }
      if (!activeDeviceIp) return;
      try {
        const state = await sonosService.getState(activeDeviceIp);
        if (state.state === 'playing') {
          await sonosService.pause(activeDeviceIp);
        } else {
          await sonosService.play(activeDeviceIp);
        }
      } catch (e) { /* ignore */ }
    },
    'MediaNextTrack': async () => {
      if (sourceMode === 'local') {
        try { await mediaSessionService.controlMedia('next'); } catch (e) { /* ignore */ }
        return;
      }
      if (!activeDeviceIp) return;
      try { await sonosService.next(activeDeviceIp); } catch (e) { /* ignore */ }
    },
    'MediaPreviousTrack': async () => {
      if (sourceMode === 'local') {
        try { await mediaSessionService.controlMedia('previous'); } catch (e) { /* ignore */ }
        return;
      }
      if (!activeDeviceIp) return;
      try { await sonosService.previous(activeDeviceIp); } catch (e) { /* ignore */ }
    },
    'MediaStop': async () => {
      if (sourceMode === 'local') {
        try { await mediaSessionService.controlMedia('pause'); } catch (e) { /* ignore */ }
        return;
      }
      if (!activeDeviceIp) return;
      try { await sonosService.pause(activeDeviceIp); } catch (e) { /* ignore */ }
    },
  };

  for (const [key, handler] of Object.entries(mediaKeyActions)) {
    try {
      globalShortcut.register(key, handler);
    } catch (e) {
      console.log(`Could not register ${key}:`, e.message);
    }
  }

  // QoL 3: Ctrl+Shift+M to toggle minibar
  try {
    globalShortcut.register('CommandOrControl+Shift+M', () => {
      if (minibarWindow) {
        minibarWindow.close();
      } else {
        createMinibarWindow();
      }
    });
    console.log('Minibar hotkey registered (Ctrl+Shift+M)');
  } catch (e) {
    console.log('Could not register minibar hotkey:', e.message);
  }

  console.log('Media keys registered');
}

// ── Track Change Notifications ──
function showTrackNotification(track) {
  if (!Notification.isSupported()) return;
  if (!track || !track.title) return;

  const notif = new Notification({
    title: track.title,
    body: [track.artist, track.album].filter(Boolean).join(' — ') || 'Now Playing',
    silent: true,
    timeoutType: 'default',
  });

  notif.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });

  notif.show();
}

// ── Sleep Timer ──
let sleepTimer = null;
let sleepTimerEnd = 0;

ipcMain.on('set-sleep-timer', (_, minutes) => {
  if (sleepTimer) clearTimeout(sleepTimer);
  if (minutes <= 0) {
    sleepTimer = null;
    sleepTimerEnd = 0;
    return;
  }
  sleepTimerEnd = Date.now() + minutes * 60000;
  sleepTimer = setTimeout(async () => {
    try {
      if (sourceMode === 'local') {
        await mediaSessionService.controlMedia('pause');
      } else if (activeDeviceIp) {
        await sonosService.pause(activeDeviceIp);
      }
    } catch (e) { /* ignore */ }
    sleepTimer = null;
    sleepTimerEnd = 0;
    // Notify renderers
    const allWindows = [mainWindow, locketWindow, minibarWindow];
    for (const win of allWindows) {
      if (win && !win.isDestroyed()) win.webContents.send('sleep-timer-done');
    }
  }, minutes * 60000);
});

ipcMain.handle('get-sleep-timer', () => {
  if (!sleepTimer) return 0;
  return Math.max(0, Math.ceil((sleepTimerEnd - Date.now()) / 60000));
});

// ── Speaker Grouping ──
ipcMain.handle('get-groups', async () => {
  try {
    const device = sonosService.getDevice(activeDeviceIp || '10.0.0.147');
    return await device.getAllGroups();
  } catch (e) { return []; }
});

ipcMain.handle('join-group', async (_, ip, coordinatorIp) => {
  try {
    const device = sonosService.getDevice(ip);
    await device.joinGroup(coordinatorIp);
  } catch (e) { console.log('Join group error:', e.message); }
});

ipcMain.handle('leave-group', async (_, ip) => {
  try {
    const device = sonosService.getDevice(ip);
    await device.leaveGroup();
  } catch (e) { console.log('Leave group error:', e.message); }
});

// ── Auto-switch to local media ──
let autoSwitchInterval = null;
let autoSwitchSuppressed = false;

function startAutoSwitch() {
  if (autoSwitchInterval) return;
  autoSwitchInterval = setInterval(async () => {
    // Don't auto-switch if user manually backed out, or already in local/sonos mode
    if (autoSwitchSuppressed || activeDeviceIp || sourceMode === 'local') return;
    try {
      const session = await mediaSessionService.getCurrentSession();
      if (session && session.state === 'playing') {
        console.log('Auto-switching to local media:', session.sourceName);
        sourceMode = 'local';
        startLocalPolling();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auto-switch-local', session.sourceName);
        }
      }
    } catch (e) { /* ignore */ }
  }, 3000);
}

// ── Start with Windows ──
ipcMain.handle('get-auto-launch', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.on('set-auto-launch', (_, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
});

// ── Minibar volume scroll ──
ipcMain.on('minibar-volume-scroll', async (_, delta) => {
  if (sourceMode === 'local' || !activeDeviceIp) return;
  try {
    const current = await sonosService.getDevice(activeDeviceIp).getVolume();
    const newVol = Math.max(0, Math.min(100, current + delta));
    await sonosService.setVolume(activeDeviceIp, newVol);
  } catch (e) { /* ignore */ }
});

// ── Quick volume presets ──
ipcMain.on('set-volume-preset', async (_, volume) => {
  if (sourceMode === 'local' || !activeDeviceIp) return;
  try {
    await sonosService.setVolume(activeDeviceIp, volume);
  } catch (e) { /* ignore */ }
});

// ── Play history ──
const playHistory = [];
const MAX_HISTORY = 20;

function addToHistory(track) {
  if (!track || !track.title) return;
  // Don't add duplicates at the top
  if (playHistory.length > 0 && playHistory[0].title === track.title && playHistory[0].artist === track.artist) return;
  playHistory.unshift({ title: track.title, artist: track.artist, album: track.album, time: Date.now() });
  if (playHistory.length > MAX_HISTORY) playHistory.pop();
}

ipcMain.handle('get-history', () => playHistory);

// ── App lifecycle ──
app.whenReady().then(() => {
  store = new Store();
  currentTheme = store.get('theme', 'default');
  spotifyService = new SpotifyService(store);

  createMainWindow();
  createTray();
  registerMediaKeys();
  startAutoSwitch();

  // ── Auto-Updater ──
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    const notif = new Notification({
      title: 'Harmoni Update Available',
      body: `Version ${info.version} is downloading...`,
      silent: true,
    });
    notif.show();
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    const notif = new Notification({
      title: 'Harmoni Update Ready',
      body: `Version ${info.version} will install on next restart.`,
      silent: true,
    });
    notif.on('click', () => {
      autoUpdater.quitAndInstall();
    });
    notif.show();
  });

  autoUpdater.on('error', (err) => {
    console.log('Auto-updater error:', err.message);
  });

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

function cleanupAndQuit() {
  if (pollInterval) clearInterval(pollInterval);
  if (localPsFetchInterval) clearInterval(localPsFetchInterval);
  if (localUiPushInterval) clearInterval(localUiPushInterval);
  if (autoSwitchInterval) clearInterval(autoSwitchInterval);
  globalShortcut.unregisterAll();
  if (tray) { tray.destroy(); tray = null; }
}

app.on('will-quit', () => {
  cleanupAndQuit();
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    // macOS: keep running in tray
  } else {
    // Windows/Linux: don't quit, keep tray
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  cleanupAndQuit();
});
