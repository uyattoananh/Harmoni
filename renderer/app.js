// State
let activeDevice = null;
let isPlaying = false;
let isSeeking = false; // kept for local files player
let isSettingVolume = false;

// Elements
const $ = (s) => document.querySelector(s);
const discoveryScreen = $('#discovery-screen');
const playerScreen = $('#player-screen');
const deviceList = $('#device-list');
const loading = $('#loading');

// Title bar
$('#minimize-btn').onclick = () => windowControls.minimize();
$('#close-btn').onclick = () => windowControls.close();
$('#locket-toggle').onclick = () => windowControls.toggleLocket();
$('#minibar-toggle').onclick = () => windowControls.toggleMinibar();

// Theme system
function applyTheme(theme) {
  if (theme && theme !== 'default') {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
  // Update picker active state
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.themeId === (theme || 'default'));
  });
}

$('#settings-btn').onclick = () => {
  $('#theme-overlay').classList.toggle('open');
};
$('#theme-close').onclick = () => {
  $('#theme-overlay').classList.remove('open');
};
$('#theme-overlay').onclick = (e) => {
  if (e.target === e.currentTarget) $('#theme-overlay').classList.remove('open');
};

// Settings tabs: Themes | Positions | Startup
document.getElementById('settings-tab-themes').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('settings-tab-themes').classList.add('active');
  document.getElementById('settings-tab-settings').classList.remove('active');
  document.getElementById('settings-panel-themes').style.display = 'grid';
  document.getElementById('settings-panel-settings').style.display = 'none';
});
document.getElementById('settings-tab-settings').addEventListener('click', async (e) => {
  e.stopPropagation();
  document.getElementById('settings-tab-settings').classList.add('active');
  document.getElementById('settings-tab-themes').classList.remove('active');
  document.getElementById('settings-panel-themes').style.display = 'none';
  document.getElementById('settings-panel-settings').style.display = 'flex';
  // Highlight tabs based on what's already open
  const minibarOpen = await windowControls.isMinibarOpen();
  const locketOpen = await windowControls.isLocketOpen();
  if (minibarOpen) document.getElementById('pos-tab-minibar').classList.add('active');
  else document.getElementById('pos-tab-minibar').classList.remove('active');
  if (locketOpen) document.getElementById('pos-tab-locket').classList.add('active');
  else document.getElementById('pos-tab-locket').classList.remove('active');
  // Show the grid for whichever is open (prefer minibar)
  if (minibarOpen) {
    activePositionTarget = 'minibar';
    document.getElementById('pos-grid-minibar').style.display = 'grid';
    document.getElementById('pos-grid-locket').style.display = 'none';
  } else if (locketOpen) {
    activePositionTarget = 'locket';
    document.getElementById('pos-grid-minibar').style.display = 'none';
    document.getElementById('pos-grid-locket').style.display = 'grid';
  }
});

// Startup toggle button
document.getElementById('startup-toggle-btn').addEventListener('click', async () => {
  const checkbox = document.getElementById('auto-launch-toggle');
  checkbox.checked = !checkbox.checked;
  sonos.setAutoLaunch(checkbox.checked);
  document.getElementById('startup-toggle-btn').textContent = 'Launch on Startup: ' + (checkbox.checked ? 'On' : 'Off');
});

// Position widget tabs: Minibar | Locket
let activePositionTarget = 'minibar';

document.getElementById('pos-tab-minibar').addEventListener('click', () => {
  activePositionTarget = 'minibar';
  document.getElementById('pos-tab-minibar').classList.add('active');
  document.getElementById('pos-tab-locket').classList.remove('active');
  document.getElementById('pos-grid-minibar').style.display = 'grid';
  document.getElementById('pos-grid-locket').style.display = 'none';
  windowControls.ensureMinibar();
});

// Deselect tab when widget is closed
windowControls.onWidgetClosed((target) => {
  if (target === 'minibar' && activePositionTarget === 'minibar') {
    document.getElementById('pos-tab-minibar').classList.remove('active');
  }
  if (target === 'locket' && activePositionTarget === 'locket') {
    document.getElementById('pos-tab-locket').classList.remove('active');
  }
});

document.getElementById('pos-tab-locket').addEventListener('click', () => {
  activePositionTarget = 'locket';
  document.getElementById('pos-tab-locket').classList.add('active');
  document.getElementById('pos-tab-minibar').classList.remove('active');
  document.getElementById('pos-grid-minibar').style.display = 'none';
  document.getElementById('pos-grid-locket').style.display = 'grid';
  windowControls.ensureLocket();
});

document.querySelectorAll('.theme-card').forEach(card => {
  card.onclick = () => {
    const theme = card.dataset.themeId;
    applyTheme(theme);
    sonos.setTheme(theme);
  };
});

sonos.onThemeChanged((theme) => {
  applyTheme(theme);
});

// Auto-launch toggle
(async () => {
  const toggle = $('#auto-launch-toggle');
  const thumb = $('#auto-launch-thumb');
  const track = $('#auto-launch-track');
  const isEnabled = await sonos.getAutoLaunch();
  toggle.checked = isEnabled;
  if (isEnabled) { thumb.style.left = '18px'; thumb.style.background = 'var(--text)'; track.style.background = 'var(--text-dim)'; }
  toggle.onchange = () => {
    sonos.setAutoLaunch(toggle.checked);
    if (toggle.checked) { thumb.style.left = '18px'; thumb.style.background = 'var(--text)'; track.style.background = 'var(--text-dim)'; }
    else { thumb.style.left = '2px'; thumb.style.background = 'var(--text-dim)'; track.style.background = 'var(--surface)'; }
  };
})();

// Position presets — use whichever tab is active
document.querySelectorAll('.pos-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = activePositionTarget;
    if (target === 'minibar') {
      windowControls.ensureMinibar();
    } else {
      windowControls.ensureLocket();
    }
    setTimeout(() => {
      windowControls.setWidgetPosition(target, btn.dataset.pos);
    }, 500);
  });
});

// Player menu dropdown
$('#player-menu-btn').onclick = (e) => {
  e.stopPropagation();
  const menu = $('#player-menu');
  menu.style.display = menu.style.display === 'none' ? '' : 'none';
};
document.addEventListener('click', () => {
  $('#player-menu').style.display = 'none';
});
$('#player-menu').onclick = (e) => e.stopPropagation();

// Quit button
$('#quit-btn').onclick = () => windowControls.quit();

// Feedback form
let feedbackType = 'bug';

$('#feedback-btn').onclick = () => {
  $('#feedback-overlay').classList.add('open');
  $('#fb-title').value = '';
  $('#fb-desc').value = '';
  $('#fb-status').style.display = 'none';
};
$('#feedback-close').onclick = () => $('#feedback-overlay').classList.remove('open');
$('#feedback-overlay').onclick = (e) => { if (e.target === e.currentTarget) $('#feedback-overlay').classList.remove('open'); };

$('#fb-type-bug').onclick = () => {
  feedbackType = 'bug';
  $('#fb-type-bug').classList.add('active');
  $('#fb-type-feature').classList.remove('active');
};
$('#fb-type-feature').onclick = () => {
  feedbackType = 'feature';
  $('#fb-type-feature').classList.add('active');
  $('#fb-type-bug').classList.remove('active');
};

$('#fb-submit').onclick = async () => {
  const title = $('#fb-title').value.trim();
  const desc = $('#fb-desc').value.trim();
  if (!title) { $('#fb-title').focus(); return; }

  $('#fb-submit').textContent = 'Sending...';
  $('#fb-submit').disabled = true;

  try {
    await windowControls.sendFeedback(feedbackType, title, desc);
    $('#fb-status').textContent = 'Sent! Thank you for your feedback.';
    $('#fb-status').style.display = '';
    $('#fb-status').style.color = '#4cd964';
    $('#fb-title').value = '';
    $('#fb-desc').value = '';
    setTimeout(() => $('#feedback-overlay').classList.remove('open'), 1500);
  } catch (e) {
    $('#fb-status').textContent = 'Failed to send. Try again later.';
    $('#fb-status').style.display = '';
    $('#fb-status').style.color = '#e74c3c';
  }
  $('#fb-submit').textContent = 'Submit';
  $('#fb-submit').disabled = false;
};

// Close menu when any menu item is clicked
document.querySelectorAll('.player-menu-item').forEach(item => {
  item.addEventListener('click', () => {
    $('#player-menu').style.display = 'none';
  });
});

// Escape key closes all overlays
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('#theme-overlay').classList.remove('open');
    $('#queue-overlay').classList.remove('open');
    $('#browse-overlay').classList.remove('open');
    $('#sleep-overlay').classList.remove('open');
    $('#history-overlay').classList.remove('open');
    $('#shortcuts-overlay').classList.remove('open');
  }
  // Space for play/pause (when not typing in an input)
  const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
  const overlayOpen = document.querySelector('.theme-overlay.open, .queue-overlay.open');
  if (e.key === ' ' && !isTyping && !overlayOpen) {
    e.preventDefault();
    if ($('#files-player').style.display !== 'none' && audioPlayer.src) {
      $('#files-play-pause').click();
    } else if ($('#play-pause-btn')) {
      $('#play-pause-btn').click();
    }
  }
});

// Discovery
async function discover() {
  loading.style.display = 'flex';
  deviceList.querySelectorAll('.device-card').forEach(el => el.remove());

  try {
    const devices = await sonos.discover();
    loading.style.display = 'none';

    if (devices.length === 0) {
      deviceList.innerHTML = '<div class="loading-spinner"><p>No speakers found</p></div>';
      return;
    }

    devices.forEach(d => {
      const card = document.createElement('div');
      card.className = 'device-card';

      const stateLabel = d.state === 'playing' ? 'Playing' :
                         d.state === 'paused' ? 'Paused' : 'Idle';
      const stateClass = d.state === 'playing' ? 'playing' :
                          d.state === 'paused' ? 'paused' : 'stopped';

      card.innerHTML = `
        <div class="device-icon">
          <svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><circle cx="12" cy="6" r="1.5"/></svg>
        </div>
        <div class="device-info">
          <div class="device-name">${d.name}</div>
          <div class="device-model">${d.modelName}</div>
        </div>
        <span class="device-status ${stateClass}">${stateLabel}</span>
      `;

      card.onclick = () => selectDevice(d);
      deviceList.appendChild(card);
    });
  } catch (err) {
    loading.style.display = 'none';
    deviceList.innerHTML = '<div class="loading-spinner"><p>Error scanning network</p></div>';
  }
}

$('#refresh-btn').onclick = discover;

// Local media mode
let localMediaMode = false;

$('#local-media-btn').onclick = () => {
  localMediaMode = true;
  sonos.setSourceMode('local');
  $('#room-name').textContent = 'Local Media';
  discoveryScreen.classList.remove('active');
  playerScreen.classList.add('active');
};

function selectDevice(device) {
  activeDevice = device;
  $('#room-name').textContent = device.name;

  // Save last device for auto-reconnect
  sonos.saveLastDevice({ ip: device.ip, name: device.name });

  discoveryScreen.classList.remove('active');
  playerScreen.classList.add('active');

  // Start watching for state updates
  sonos.watchDevice(device.ip);
  updateUI(device);
}

$('#back-btn').onclick = () => {
  if (localMediaMode) {
    localMediaMode = false;
    sonos.setSourceMode('sonos');
  } else {
    sonos.stopWatching();
  }
  activeDevice = null;
  playerScreen.classList.remove('active');
  discoveryScreen.classList.add('active');
  discover();
};

// Player controls
$('#play-pause-btn').onclick = async () => {
  if (!activeDevice && !localMediaMode) return;
  if (isPlaying) {
    await sonos.pause(activeDevice ? activeDevice.ip : null);
  } else {
    await sonos.play(activeDevice ? activeDevice.ip : null);
  }
};

$('#next-btn').onclick = async () => {
  if (activeDevice || localMediaMode) await sonos.next(activeDevice ? activeDevice.ip : null);
};

$('#prev-btn').onclick = async () => {
  if (activeDevice || localMediaMode) await sonos.previous(activeDevice ? activeDevice.ip : null);
};

// Sonos play modes: NORMAL, SHUFFLE_NOREPEAT, SHUFFLE, REPEAT_ALL, REPEAT_ONE, SHUFFLE_REPEAT_ONE
let currentPlayMode = 'NORMAL';

function isShuffle(mode) {
  return mode.includes('SHUFFLE');
}
// 'none' | 'all' | 'one'
function getRepeatState(mode) {
  if (mode.includes('REPEAT_ONE')) return 'one';
  if (mode.includes('REPEAT_ALL') || mode === 'SHUFFLE') return 'all';
  // SHUFFLE without NOREPEAT means repeat all is on
  return 'none';
}
function buildMode(shuffle, repeatState) {
  // repeatState: 'none' | 'all' | 'one'
  if (shuffle && repeatState === 'one') return 'SHUFFLE_REPEAT_ONE';
  if (shuffle && repeatState === 'all') return 'SHUFFLE';
  if (shuffle) return 'SHUFFLE_NOREPEAT';
  if (repeatState === 'one') return 'REPEAT_ONE';
  if (repeatState === 'all') return 'REPEAT_ALL';
  return 'NORMAL';
}

let modeChangeUntil = 0;

function updateRepeatUI(repeatState) {
  const btn = $('#repeat-btn');
  const badge = $('#repeat-one-badge');
  btn.classList.toggle('active', repeatState !== 'none');
  badge.style.display = repeatState === 'one' ? '' : 'none';
}

async function forceQueueRefresh() {
  cachedQueue = null;
  lastUpNextTrack = '';
  setTimeout(() => { cachedQueue = null; lastUpNextTrack = ''; }, 800);
}

$('#shuffle-btn').onclick = async () => {
  if (!activeDevice && !localMediaMode) return;
  const ip = activeDevice ? activeDevice.ip : null;
  if (!ip) return;
  const newShuffle = !isShuffle(currentPlayMode);
  const newMode = buildMode(newShuffle, getRepeatState(currentPlayMode));
  currentPlayMode = newMode;
  $('#shuffle-btn').classList.toggle('active', newShuffle);
  modeChangeUntil = Date.now() + 2000;
  await sonos.setPlayMode(ip, newMode);
  forceQueueRefresh();
};

// Repeat cycles: none → all → one → none (like Spotify/YT Music)
$('#repeat-btn').onclick = async () => {
  if (!activeDevice && !localMediaMode) return;
  const ip = activeDevice ? activeDevice.ip : null;
  if (!ip) return;
  const current = getRepeatState(currentPlayMode);
  const next = current === 'none' ? 'all' : current === 'all' ? 'one' : 'none';
  const newMode = buildMode(isShuffle(currentPlayMode), next);
  currentPlayMode = newMode;
  updateRepeatUI(next);
  modeChangeUntil = Date.now() + 2000;
  await sonos.setPlayMode(ip, newMode);
  forceQueueRefresh();
};

// Volume
const volumeSlider = $('#volume-slider');
let volumeTimeout = null;
volumeSlider.addEventListener('input', () => {
  $('#vol-label').textContent = volumeSlider.value;
  isSettingVolume = true;
  clearTimeout(volumeTimeout);
  volumeTimeout = setTimeout(async () => {
    if (activeDevice) {
      await sonos.setVolume(activeDevice.ip, parseInt(volumeSlider.value));
    }
    isSettingVolume = false;
  }, 100);
});

$('#mute-btn').onclick = async () => {
  if (activeDevice) await sonos.toggleMute(activeDevice.ip);
};

// Progress — display only, no seeking
const progressBar = $('#progress-bar');
progressBar.style.pointerEvents = 'none';

// Queue
$('#queue-btn').onclick = async () => {
  if (!activeDevice) return;
  $('#queue-overlay').classList.add('open');
  loadQueue();
};

$('#queue-close').onclick = () => {
  $('#queue-overlay').classList.remove('open');
};

// Improved Queue — add remove buttons
async function loadQueue() {
  if (!activeDevice) return;
  const list = $('#queue-list');
  list.innerHTML = '<div class="loading-spinner"><p>Loading...</p></div>';

  try {
    const queue = await sonos.getQueue(activeDevice.ip);
    list.innerHTML = '';

    if (!queue || !queue.items || queue.items.length === 0) {
      list.innerHTML = '<div class="loading-spinner"><p>Queue is empty — streaming mode</p></div>';
      return;
    }

    queue.items.forEach((item, i) => {
      const el = document.createElement('div');
      el.className = 'queue-item';
      el.style.cursor = 'pointer';
      el.innerHTML = `
        <span class="queue-item-num">${i + 1}</span>
        <div class="queue-item-art">
          ${item.albumArtURI ? `<img src="${item.albumArtURI}" onerror="this.style.display='none'">` : ''}
        </div>
        <div class="queue-item-info">
          <div class="queue-item-title">${item.title || 'Unknown'}</div>
          <div class="queue-item-artist">${item.artist || ''}</div>
        </div>
        <button class="queue-item-remove" title="Remove" data-idx="${i + 1}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      `;

      // Click track to play it
      el.querySelector('.queue-item-info').onclick = async () => {
        await sonos.selectTrack(activeDevice.ip, i + 1);
        await sonos.play(activeDevice.ip);
      };

      // Remove button
      el.querySelector('.queue-item-remove').onclick = async (e) => {
        e.stopPropagation();
        await sonos.removeFromQueue(activeDevice.ip, i + 1);
        loadQueue(); // refresh
        cachedQueue = null; lastUpNextTrack = ''; // refresh up next
      };

      list.appendChild(el);
    });
  } catch (e) {
    list.innerHTML = '<div class="loading-spinner"><p>Could not load queue</p></div>';
  }
}

// Browse Panel
let browseTab = 'favorites';

$('#browse-btn').onclick = () => {
  if (!activeDevice) return;
  $('#browse-overlay').classList.add('open');
  loadBrowseTab(browseTab);
};

$('#browse-close').onclick = () => {
  $('#browse-overlay').classList.remove('open');
};
$('#browse-overlay').onclick = (e) => { if (e.target === e.currentTarget) $('#browse-overlay').classList.remove('open'); };

document.querySelectorAll('.browse-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.browse-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    browseTab = tab.dataset.tab;
    loadBrowseTab(browseTab);
  };
});

async function loadBrowseTab(tab) {
  const list = $('#browse-list');
  list.innerHTML = '<div class="loading-spinner"><p>Loading...</p></div>';

  try {
    if (tab === 'favorites') {
      const favs = await sonos.getFavorites(activeDevice.ip);
      list.innerHTML = '';

      if (!favs || !favs.items || favs.items.length === 0) {
        list.innerHTML = '<div class="loading-spinner"><p>No favorites saved</p></div>';
        return;
      }

      favs.items.forEach(fav => {
        const el = document.createElement('div');
        el.className = 'queue-item';
        el.style.cursor = 'pointer';
        el.innerHTML = `
          <div class="queue-item-art">
            ${fav.albumArtURI ? `<img src="${fav.albumArtURI}" onerror="this.style.display='none'">` : ''}
          </div>
          <div class="queue-item-info">
            <div class="queue-item-title">${fav.title || 'Unknown'}</div>
            <div class="queue-item-artist">${fav.description || ''}</div>
          </div>
        `;
        el.onclick = async () => {
          await sonos.playFavorite(activeDevice.ip, fav);
          $('#browse-overlay').classList.remove('open');
        };
        list.appendChild(el);
      });
    } else if (tab === 'playlists') {
      const pls = await sonos.getPlaylists(activeDevice.ip);
      list.innerHTML = '';

      if (!pls || !pls.items || pls.items.length === 0) {
        list.innerHTML = '<div class="loading-spinner"><p>No playlists found</p></div>';
        return;
      }

      pls.items.forEach(pl => {
        const el = document.createElement('div');
        el.className = 'queue-item';
        el.style.cursor = 'pointer';
        el.innerHTML = `
          <div class="queue-item-art">
            ${pl.albumArtURI ? `<img src="${pl.albumArtURI}" onerror="this.style.display='none'">` : ''}
          </div>
          <div class="queue-item-info">
            <div class="queue-item-title">${pl.title || 'Unknown'}</div>
            <div class="queue-item-artist">${pl.items ? pl.items.length + ' tracks' : ''}</div>
          </div>
        `;
        el.onclick = async () => {
          await sonos.playPlaylist(activeDevice.ip, pl);
          $('#browse-overlay').classList.remove('open');
        };
        list.appendChild(el);
      });
    }
  } catch (e) {
    list.innerHTML = '<div class="loading-spinner"><p>Error loading content</p></div>';
  }
}

// Up Next
let cachedQueue = null;
let lastUpNextTrack = '';

async function refreshUpNext(currentTitle) {
  if (localMediaMode || !activeDevice) {
    $('#up-next').style.display = 'none';
    return;
  }

  // Only refresh queue when track changes
  if (currentTitle !== lastUpNextTrack) {
    lastUpNextTrack = currentTitle;
    try {
      cachedQueue = await sonos.getQueue(activeDevice.ip);
    } catch (e) {
      cachedQueue = null;
    }
  }

  const upNextEl = $('#up-next');
  const listEl = $('#up-next-list');

  if (!cachedQueue || !cachedQueue.items || cachedQueue.items.length === 0) {
    upNextEl.style.display = 'none';
    return;
  }

  // Find current track index
  let currentIdx = cachedQueue.items.findIndex(t =>
    t.title === currentTitle
  );
  if (currentIdx === -1) currentIdx = 0;

  // Get all remaining tracks after current
  const upcoming = [];
  for (let i = 1; i < cachedQueue.items.length; i++) {
    const idx = (currentIdx + i) % cachedQueue.items.length;
    if (cachedQueue.items[idx]) {
      upcoming.push({ ...cachedQueue.items[idx], _idx: idx });
    }
  }

  if (upcoming.length === 0) {
    upNextEl.style.display = 'none';
    return;
  }

  upNextEl.style.display = '';
  listEl.innerHTML = '';
  upcoming.forEach(t => {
    const el = document.createElement('div');
    el.className = 'up-next-item';
    el.style.cursor = 'pointer';
    el.innerHTML = `
      <div class="up-next-item-art">
        ${t.albumArtURI ? `<img src="${t.albumArtURI}" onerror="this.style.display='none'">` : ''}
      </div>
      <span class="up-next-item-title">${t.title || 'Unknown'}</span>
      <span class="up-next-item-artist">${t.artist || ''}</span>
    `;
    el.onclick = async () => {
      if (activeDevice) {
        await sonos.selectTrack(activeDevice.ip, t._idx + 1);
        await sonos.play(activeDevice.ip);
      }
    };
    listEl.appendChild(el);
  });
}

// State updates
let currentDuration = '0:00:00';
let lastArtUrl = '';

function updateUI(data) {
  if (!data) return;

  // Show source name in room label when in local mode
  if (data._sourceMode === 'local' && data._source) {
    $('#room-name').textContent = data._source;
  }

  // Shuffle/repeat state — skip if we just toggled (avoid flicker)
  if (data.playMode && Date.now() > modeChangeUntil) {
    currentPlayMode = data.playMode;
    $('#shuffle-btn').classList.toggle('active', isShuffle(data.playMode));
    updateRepeatUI(getRepeatState(data.playMode));
  }

  // Play/pause state
  isPlaying = data.state === 'playing';
  $('#icon-play').style.display = isPlaying ? 'none' : 'block';
  $('#icon-pause').style.display = isPlaying ? 'block' : 'none';

  // Volume — hide in local mode
  const isLocal = data._sourceMode === 'local';
  $('.volume-section').style.display = isLocal ? 'none' : '';

  if (!isLocal && !isSettingVolume) {
    volumeSlider.value = data.volume;
    $('#vol-label').textContent = data.volume;
  }

  // Mute icons
  if (!isLocal) {
    if (data.muted) {
      $('#vol-on').style.display = 'none';
      $('#vol-off').style.display = 'block';
    } else {
      $('#vol-on').style.display = 'block';
      $('#vol-off').style.display = 'none';
    }
  }

  // Track info
  const track = data.currentTrack || {};
  $('#track-title').textContent = track.title || 'No Track';
  $('#track-artist').textContent = track.artist || '—';

  // XP status bar
  const xpStatus = document.getElementById('xp-status');
  if (xpStatus) {
    xpStatus.textContent = track.title ? `Now Playing — ${track.artist || 'Unknown'} - ${track.title}` : 'Ready';
  }

  // Up Next
  refreshUpNext(track.title || '');

  // Album art
  const artEl = $('#album-art');
  const bgArt = $('#bg-art');
  const artUrl = track.albumArtURI || '';

  if (artUrl && artUrl !== lastArtUrl) {
    lastArtUrl = artUrl;
    // Resolve relative URIs against the device IP
    let fullArtUrl = artUrl;
    if (artUrl.startsWith('/')) {
      fullArtUrl = `http://${activeDevice.ip}:1400${artUrl}`;
    }

    artEl.innerHTML = `<img src="${fullArtUrl}" onerror="this.parentElement.classList.remove('has-art')">`;
    artEl.classList.add('has-art');

    bgArt.style.backgroundImage = `url('${fullArtUrl}')`;
    bgArt.classList.add('visible');
  } else if (!artUrl) {
    artEl.innerHTML = '<svg class="placeholder-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>';
    artEl.classList.remove('has-art');
    bgArt.classList.remove('visible');
    lastArtUrl = '';
  }

  // Progress (display only)
  currentDuration = track.duration != null ? track.duration : '0:00:00';
  if (!isSeeking) {
    const total = parseDuration(currentDuration);
    const pos = parseDuration(track.position != null ? track.position : '0:00:00');
    if (track._noPosition) {
      // Source doesn't report position (Chrome) — show bar but no progress
      progressBar.value = 0;
      $('#time-current').textContent = '';
      $('#time-total').textContent = formatTime(total);
    } else {
      if (total > 0) {
        progressBar.value = (pos / total) * 100;
      } else {
        progressBar.value = 0;
      }
      $('#time-current').textContent = formatTime(pos);
      $('#time-total').textContent = formatTime(total);
    }
  }
}

// Listen for real-time state updates from main process
sonos.onStateUpdate((data) => {
  updateUI(data);
});

// Helpers
function parseDuration(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Auto-select last used device on startup
sonos.onAutoSelectDevice(async (savedDevice) => {
  if (!savedDevice || !savedDevice.ip) return;
  try {
    // Verify device is reachable
    const state = await sonos.getState(savedDevice.ip);
    selectDevice({
      ip: savedDevice.ip,
      name: savedDevice.name || 'Speaker',
      state: state.state,
      volume: state.volume,
      currentTrack: state.currentTrack,
    });
  } catch (e) {
    // Device not reachable, fall through to discovery
    console.log('Saved device not reachable, showing discovery');
  }
});

// ── Sleep Timer ──
$('#sleep-btn').onclick = () => $('#sleep-overlay').classList.toggle('open');
$('#sleep-close').onclick = () => $('#sleep-overlay').classList.remove('open');
$('#sleep-overlay').onclick = (e) => { if (e.target === e.currentTarget) $('#sleep-overlay').classList.remove('open'); };

document.querySelectorAll('.sleep-opt').forEach(btn => {
  btn.onclick = async () => {
    const mins = parseInt(btn.dataset.mins);
    sonos.setSleepTimer(mins);
    if (mins > 0) {
      $('#sleep-status').textContent = `Timer set for ${mins} min`;
      $('#sleep-cancel').style.display = '';
    } else {
      $('#sleep-status').textContent = 'Timer cancelled';
      $('#sleep-cancel').style.display = 'none';
    }
    setTimeout(() => $('#sleep-overlay').classList.remove('open'), 800);
  };
});

sonos.onSleepTimerDone(() => {
  $('#sleep-status').textContent = '';
  $('#sleep-cancel').style.display = 'none';
});

// ── History Panel ──
$('#history-btn').onclick = async () => {
  const overlay = $('#history-overlay');
  overlay.classList.add('open');
  const history = await sonos.getHistory();
  const list = $('#history-list');
  list.innerHTML = '';
  if (history.length === 0) {
    list.innerHTML = '<div class="loading-spinner"><p>No history yet</p></div>';
    return;
  }
  history.forEach(h => {
    const el = document.createElement('div');
    el.className = 'queue-item';
    const ago = Math.floor((Date.now() - h.time) / 60000);
    const agoText = ago < 1 ? 'just now' : ago < 60 ? `${ago}m ago` : `${Math.floor(ago/60)}h ago`;
    el.innerHTML = `
      <div class="queue-item-info">
        <div class="queue-item-title">${h.title}</div>
        <div class="queue-item-artist">${h.artist || ''}</div>
      </div>
      <span style="font-size:10px;color:var(--text-dim);flex-shrink:0">${agoText}</span>
    `;
    list.appendChild(el);
  });
};
$('#history-close').onclick = () => $('#history-overlay').classList.remove('open');
$('#history-overlay').onclick = (e) => { if (e.target === e.currentTarget) $('#history-overlay').classList.remove('open'); };

// ── Shortcuts Help ──
$('#shortcuts-btn').onclick = () => $('#shortcuts-overlay').classList.toggle('open');
$('#shortcuts-close').onclick = () => $('#shortcuts-overlay').classList.remove('open');
$('#shortcuts-overlay').onclick = (e) => { if (e.target === e.currentTarget) $('#shortcuts-overlay').classList.remove('open'); };

// ── Quick Volume Presets ──
$('#mute-btn').addEventListener('dblclick', () => {
  if (activeDevice) sonos.setVolumePreset(50);
});
$('#mute-btn').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const menu = document.createElement('div');
  menu.style.cssText = 'position:fixed;z-index:50;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:4px;display:flex;flex-direction:column;gap:2px;box-shadow:0 4px 16px rgba(0,0,0,0.3);';
  menu.style.left = e.clientX + 'px';
  // Open upward to avoid clipping at bottom
  const menuHeight = 4 * 32 + 12; // 4 buttons + padding
  menu.style.top = Math.max(8, e.clientY - menuHeight) + 'px';
  [25, 50, 75, 100].forEach(v => {
    const btn = document.createElement('button');
    btn.textContent = v + '%';
    btn.style.cssText = 'background:none;border:none;color:var(--text);padding:8px 20px;cursor:pointer;font-size:13px;border-radius:4px;text-align:left;font-family:inherit;';
    btn.onmouseenter = () => btn.style.background = 'var(--surface-hover)';
    btn.onmouseleave = () => btn.style.background = 'none';
    btn.onclick = () => { sonos.setVolumePreset(v); menu.remove(); };
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const dismiss = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
  setTimeout(() => document.addEventListener('click', dismiss), 10);
});

// ── Auto-switch to local media ──
sonos.onAutoSwitchLocal((source) => {
  localMediaMode = true;
  $('#room-name').textContent = source;
  discoveryScreen.classList.remove('active');
  playerScreen.classList.add('active');
});

// ── Spotify ──
$('#spotify-btn').onclick = async () => {
  const loggedIn = await sonos.spotifyIsLoggedIn();
  if (loggedIn) {
    openSpotifyScreen();
  } else {
    $('#spotify-btn').textContent = 'Logging in...';
    const result = await sonos.spotifyLogin();
    if (result.ok) {
      openSpotifyScreen();
    } else {
      $('#spotify-btn').textContent = 'Connect Spotify';
      alert('Spotify login failed: ' + (result.error || 'Unknown error'));
    }
  }
};

async function openSpotifyScreen() {
  discoveryScreen.classList.remove('active');
  $('#spotify-screen').classList.add('active');
  $('#spotify-btn').textContent = 'Connect Spotify';

  const me = await sonos.spotifyGetMe();
  if (me) $('#spotify-user').textContent = me.display_name || 'Spotify';

  await loadSpotifyPlaylists();
}

$('#spotify-back-btn').onclick = () => {
  $('#spotify-screen').classList.remove('active');
  discoveryScreen.classList.add('active');
};

$('#spotify-logout-btn').onclick = async () => {
  await sonos.spotifyLogout();
  $('#spotify-screen').classList.remove('active');
  discoveryScreen.classList.add('active');
};

async function loadSpotifyPlaylists() {
  const content = $('#spotify-content');
  content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading playlists...</p></div>';

  const data = await sonos.spotifyGetPlaylists();
  content.innerHTML = '';

  if (data && data.error && data.error.status === 403) {
    content.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:12px;line-height:1.6">
      <p style="font-size:14px;color:var(--text);margin-bottom:8px">Spotify API Restricted</p>
      <p>Your Spotify Developer app needs Extended Quota Mode.</p>
      <p style="margin-top:8px">Go to <strong>developer.spotify.com</strong> → your app → <strong>Request Extension</strong></p>
      <p style="margin-top:4px;color:var(--text-dim)">This is a Spotify requirement, not a Harmoni limitation.</p>
    </div>`;
    return;
  }

  if (!data || !data.items || data.items.length === 0) {
    content.innerHTML = '<div class="loading-spinner"><p>No playlists found</p></div>';
    return;
  }

  // Add Liked Songs at top
  const likedEl = document.createElement('div');
  likedEl.className = 'device-card';
  likedEl.style.cursor = 'pointer';
  likedEl.innerHTML = `
    <div class="device-icon" style="width:40px;height:40px;border-radius:6px;background:linear-gradient(135deg,#450af5,#c4efd9)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    </div>
    <div class="device-info">
      <div class="device-name" style="font-size:13px">Liked Songs</div>
      <div class="device-model">Your saved tracks</div>
    </div>
  `;
  likedEl.onclick = () => loadSpotifyLiked();
  content.appendChild(likedEl);

  data.items.forEach(pl => {
    const el = document.createElement('div');
    el.className = 'device-card';
    el.style.cursor = 'pointer';
    const img = pl.images && pl.images.length > 0 ? pl.images[pl.images.length - 1].url : '';
    el.innerHTML = `
      <div class="device-icon" style="width:40px;height:40px;border-radius:6px;overflow:hidden;background:var(--surface)">
        ${img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover">` : ''}
      </div>
      <div class="device-info">
        <div class="device-name" style="font-size:13px">${pl.name}</div>
        <div class="device-model">${pl.tracks.total} tracks</div>
      </div>
    `;
    el.onclick = () => loadSpotifyPlaylistTracks(pl.id, pl.name);
    content.appendChild(el);
  });
}

async function loadSpotifyPlaylistTracks(playlistId, name) {
  const content = $('#spotify-content');
  content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading tracks...</p></div>';

  const data = await sonos.spotifyGetPlaylistTracks(playlistId);
  content.innerHTML = '';

  // Back to playlists button
  const backEl = document.createElement('div');
  backEl.className = 'device-card';
  backEl.style.cursor = 'pointer';
  backEl.innerHTML = `
    <div class="device-icon" style="width:32px;height:32px;border-radius:6px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
    </div>
    <div class="device-info"><div class="device-name" style="font-size:12px">Back to playlists</div></div>
  `;
  backEl.onclick = () => loadSpotifyPlaylists();
  content.appendChild(backEl);

  content.insertAdjacentHTML('beforeend', `<p style="font-size:13px;font-weight:600;padding:8px 4px">${name}</p>`);

  if (!data || !data.items) return;

  data.items.forEach(item => {
    const t = item.track;
    if (!t) return;
    const el = document.createElement('div');
    el.className = 'device-card';
    el.style.cursor = 'pointer';
    const img = t.album && t.album.images && t.album.images.length > 0 ? t.album.images[t.album.images.length - 1].url : '';
    const dur = Math.floor((t.duration_ms || 0) / 1000);
    const m = Math.floor(dur / 60);
    const s = dur % 60;
    el.innerHTML = `
      <div class="device-icon" style="width:36px;height:36px;border-radius:4px;overflow:hidden;background:var(--surface)">
        ${img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover">` : ''}
      </div>
      <div class="device-info">
        <div class="device-name" style="font-size:12px">${t.name}</div>
        <div class="device-model">${t.artists ? t.artists.map(a => a.name).join(', ') : ''}</div>
      </div>
      <span style="font-size:10px;color:var(--text-dim);flex-shrink:0">${m}:${String(s).padStart(2, '0')}</span>
    `;
    el.onclick = async () => {
      await sonos.spotifyPlay(null, t.uri);
    };
    content.appendChild(el);
  });
}

async function loadSpotifyLiked() {
  const content = $('#spotify-content');
  content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading liked songs...</p></div>';

  const data = await sonos.spotifyGetLiked();
  content.innerHTML = '';

  const backEl = document.createElement('div');
  backEl.className = 'device-card';
  backEl.style.cursor = 'pointer';
  backEl.innerHTML = `
    <div class="device-icon" style="width:32px;height:32px;border-radius:6px">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
    </div>
    <div class="device-info"><div class="device-name" style="font-size:12px">Back to playlists</div></div>
  `;
  backEl.onclick = () => loadSpotifyPlaylists();
  content.appendChild(backEl);

  content.insertAdjacentHTML('beforeend', '<p style="font-size:13px;font-weight:600;padding:8px 4px">Liked Songs</p>');

  if (!data || !data.items) return;

  data.items.forEach(item => {
    const t = item.track;
    if (!t) return;
    const el = document.createElement('div');
    el.className = 'device-card';
    el.style.cursor = 'pointer';
    const img = t.album && t.album.images && t.album.images.length > 0 ? t.album.images[t.album.images.length - 1].url : '';
    const dur = Math.floor((t.duration_ms || 0) / 1000);
    const m = Math.floor(dur / 60);
    const s = dur % 60;
    el.innerHTML = `
      <div class="device-icon" style="width:36px;height:36px;border-radius:4px;overflow:hidden;background:var(--surface)">
        ${img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover">` : ''}
      </div>
      <div class="device-info">
        <div class="device-name" style="font-size:12px">${t.name}</div>
        <div class="device-model">${t.artists ? t.artists.map(a => a.name).join(', ') : ''}</div>
      </div>
      <span style="font-size:10px;color:var(--text-dim);flex-shrink:0">${m}:${String(s).padStart(2, '0')}</span>
    `;
    el.onclick = async () => {
      await sonos.spotifyPlay(null, t.uri);
    };
    content.appendChild(el);
  });
}

// Spotify search
let spotifySearchTimeout = null;
$('#spotify-search').addEventListener('input', (e) => {
  clearTimeout(spotifySearchTimeout);
  spotifySearchTimeout = setTimeout(async () => {
    const query = e.target.value.trim();
    if (!query) {
      loadSpotifyPlaylists();
      return;
    }
    const content = $('#spotify-content');
    content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Searching...</p></div>';

    const data = await sonos.spotifySearch(query);
    content.innerHTML = '';

    if (!data) return;

    // Show tracks
    if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
      content.insertAdjacentHTML('beforeend', '<p style="font-size:11px;font-weight:600;padding:4px 4px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px">Tracks</p>');
      data.tracks.items.slice(0, 10).forEach(t => {
        const el = document.createElement('div');
        el.className = 'device-card';
        el.style.cursor = 'pointer';
        const img = t.album && t.album.images && t.album.images.length > 0 ? t.album.images[t.album.images.length - 1].url : '';
        el.innerHTML = `
          <div class="device-icon" style="width:36px;height:36px;border-radius:4px;overflow:hidden;background:var(--surface)">
            ${img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover">` : ''}
          </div>
          <div class="device-info">
            <div class="device-name" style="font-size:12px">${t.name}</div>
            <div class="device-model">${t.artists ? t.artists.map(a => a.name).join(', ') : ''}</div>
          </div>
        `;
        el.onclick = async () => { await sonos.spotifyPlay(null, t.uri); };
        content.appendChild(el);
      });
    }

    // Show playlists
    if (data.playlists && data.playlists.items && data.playlists.items.length > 0) {
      content.insertAdjacentHTML('beforeend', '<p style="font-size:11px;font-weight:600;padding:8px 4px 4px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px">Playlists</p>');
      data.playlists.items.slice(0, 5).forEach(pl => {
        const el = document.createElement('div');
        el.className = 'device-card';
        el.style.cursor = 'pointer';
        const img = pl.images && pl.images.length > 0 ? pl.images[pl.images.length - 1].url : '';
        el.innerHTML = `
          <div class="device-icon" style="width:36px;height:36px;border-radius:4px;overflow:hidden;background:var(--surface)">
            ${img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover">` : ''}
          </div>
          <div class="device-info">
            <div class="device-name" style="font-size:12px">${pl.name}</div>
            <div class="device-model">${pl.tracks.total} tracks</div>
          </div>
        `;
        el.onclick = () => loadSpotifyPlaylistTracks(pl.id, pl.name);
        content.appendChild(el);
      });
    }
  }, 400);
});

// Check if already logged in on boot
(async () => {
  const loggedIn = await sonos.spotifyIsLoggedIn();
  if (loggedIn) {
    $('#spotify-btn').textContent = 'Open Spotify';
    $('#spotify-btn').style.color = '#1db954';
  }
})();

// ── Local Files Player ──
const audioPlayer = document.getElementById('audio-player');
let localFilesQueue = [];
let localFilesIndex = -1;
let localFilesSeeking = false;

$('#local-files-btn').onclick = async () => {
  let folder = await sonos.getMusicFolder();
  if (!folder) {
    folder = await sonos.pickMusicFolder();
    if (!folder) return;
  }
  discoveryScreen.classList.remove('active');
  $('#local-files-screen').classList.add('active');
  $('#files-folder-label').textContent = folder;
  await scanAndShowFiles(folder);
};

$('#files-back-btn').onclick = () => {
  audioPlayer.pause();
  $('#files-player').style.display = 'none';
  $('#local-files-screen').classList.remove('active');
  discoveryScreen.classList.add('active');
};

$('#files-pick-folder').onclick = async () => {
  const folder = await sonos.pickMusicFolder();
  if (!folder) return;
  $('#files-folder-label').textContent = folder;
  await scanAndShowFiles(folder);
};

async function scanAndShowFiles(folder) {
  const list = $('#files-list');
  list.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p id="scan-status">Scanning...</p></div>';
  const tracks = await sonos.scanMusicFolder(folder);
  localFilesQueue = tracks;
  renderFilesList(tracks);
}

function renderFilesList(tracks) {
  const list = $('#files-list');
  list.innerHTML = '';
  if (tracks.length === 0) {
    list.innerHTML = '<div class="loading-spinner"><p>No music files found</p></div>';
    return;
  }
  tracks.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'device-card';
    el.style.cursor = 'pointer';
    const dur = Math.floor(t.duration || 0);
    const m = Math.floor(dur / 60);
    const s = dur % 60;
    el.innerHTML = `
      <div class="device-icon" style="width:32px;height:32px;border-radius:6px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>
      </div>
      <div class="device-info">
        <div class="device-name" style="font-size:13px">${t.title}</div>
        <div class="device-model">${t.artist}</div>
      </div>
      <span style="font-size:10px;color:var(--text-dim);flex-shrink:0">${m}:${String(s).padStart(2, '0')}</span>
    `;
    el.onclick = () => playLocalFile(i);
    list.appendChild(el);
  });
  list.insertAdjacentHTML('afterbegin',
    `<p style="font-size:11px;color:var(--text-dim);padding:0 4px 6px">${tracks.length} tracks</p>`
  );
}

async function playLocalFile(index) {
  if (index < 0 || index >= localFilesQueue.length) return;
  localFilesIndex = index;
  const track = localFilesQueue[index];

  // Cross-platform file URI: Windows needs file:///C:/..., Unix needs file:///home/...
  const filePath = track.path.replace(/\\/g, '/');
  audioPlayer.src = filePath.startsWith('/') ? 'file://' + filePath : 'file:///' + filePath;
  audioPlayer.play();

  $('#files-player').style.display = '';
  $('#files-player-title').textContent = track.title;
  $('#files-player-artist').textContent = track.artist;
  $('#fp-play').style.display = 'none';
  $('#fp-pause').style.display = '';

  // Fetch art
  const art = await sonos.getTrackArt(track.path);
  const artEl = $('#files-player-art');
  if (art) {
    artEl.innerHTML = `<img src="${art}" style="width:100%;height:100%;object-fit:cover">`;
  } else {
    artEl.innerHTML = '';
  }

  // Highlight active track in list
  document.querySelectorAll('#files-list .device-card').forEach((el, i) => {
    el.style.background = i === index ? 'var(--surface-hover)' : '';
  });
}

// Playback controls
let filesShuffle = false;
let filesRepeat = false; // false = off, true = repeat all

$('#files-play-pause').onclick = () => {
  if (audioPlayer.paused) {
    audioPlayer.play();
    $('#fp-play').style.display = 'none';
    $('#fp-pause').style.display = '';
  } else {
    audioPlayer.pause();
    $('#fp-play').style.display = '';
    $('#fp-pause').style.display = 'none';
  }
};

$('#files-prev').onclick = () => {
  if (localFilesIndex > 0) playLocalFile(localFilesIndex - 1);
};

$('#files-next').onclick = () => {
  playNextLocalFile();
};

$('#files-shuffle').onclick = () => {
  filesShuffle = !filesShuffle;
  $('#files-shuffle').style.opacity = filesShuffle ? '1' : '0.4';
};

$('#files-repeat').onclick = () => {
  filesRepeat = !filesRepeat;
  $('#files-repeat').style.opacity = filesRepeat ? '1' : '0.4';
};

// Volume
$('#files-volume').addEventListener('input', (e) => {
  audioPlayer.volume = e.target.value / 100;
});

function playNextLocalFile() {
  if (filesShuffle) {
    const next = Math.floor(Math.random() * localFilesQueue.length);
    playLocalFile(next);
  } else if (localFilesIndex < localFilesQueue.length - 1) {
    playLocalFile(localFilesIndex + 1);
  } else if (filesRepeat) {
    playLocalFile(0);
  } else {
    $('#fp-play').style.display = '';
    $('#fp-pause').style.display = 'none';
  }
}

// Auto-next on track end
audioPlayer.addEventListener('ended', () => {
  playNextLocalFile();
});

// Progress bar + time display
const filesProgress = $('#files-progress');
filesProgress.addEventListener('mousedown', () => { localFilesSeeking = true; });
filesProgress.addEventListener('mouseup', () => {
  localFilesSeeking = false;
  if (audioPlayer.duration) {
    audioPlayer.currentTime = (filesProgress.value / 100) * audioPlayer.duration;
  }
});

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

audioPlayer.addEventListener('timeupdate', () => {
  if (!localFilesSeeking && audioPlayer.duration) {
    filesProgress.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    $('#files-time-cur').textContent = fmtTime(audioPlayer.currentTime);
    $('#files-time-total').textContent = fmtTime(audioPlayer.duration);
  }
});

// Search
let searchTimeout = null;
$('#files-search').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    const query = e.target.value.trim();
    if (!query) {
      renderFilesList(localFilesQueue);
      return;
    }
    const results = await sonos.searchLocalFiles(query);
    renderFilesList(results);
  }, 300);
});

// Boot
discover();
