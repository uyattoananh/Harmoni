const { execFile, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const platform = process.platform; // 'win32', 'darwin', 'linux'

// ── Windows GSMTC PowerShell scripts ──
const WIN_SESSION_SCRIPT = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`" + `1' })[0]
Function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$results = @()
$sessions = $mgr.GetSessions()
foreach ($s in $sessions) {
    try {
        $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $pb = $s.GetPlaybackInfo()
        $tl = $s.GetTimelineProperties()
        $obj = @{
            source = $s.SourceAppUserModelId
            title = $props.Title
            artist = $props.Artist
            album = $props.AlbumTitle
            status = [string]$pb.PlaybackStatus
            position = [math]::Round($tl.Position.TotalSeconds)
            duration = [math]::Round($tl.EndTime.TotalSeconds)
        }
        $results += $obj
    } catch {}
}
$results | ConvertTo-Json -Compress
`;

const WIN_CONTROL_SCRIPT = `
param([string]$Action)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`" + `1' })[0]
Function Await($WinRtTask, $ResultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$session = $mgr.GetCurrentSession()
if (-not $session) { Write-Output 'false'; exit }
switch ($Action) {
    'playpause' { $r = Await ($session.TryTogglePlayPauseAsync()) ([bool]); Write-Output $r }
    'play'      { $r = Await ($session.TryPlayAsync()) ([bool]); Write-Output $r }
    'pause'     { $r = Await ($session.TryPauseAsync()) ([bool]); Write-Output $r }
    'next'      { $r = Await ($session.TrySkipNextAsync()) ([bool]); Write-Output $r }
    'previous'  { $r = Await ($session.TrySkipPreviousAsync()) ([bool]); Write-Output $r }
    default     { Write-Output 'false' }
}
`;

// Source name mapping
const SOURCE_NAMES = {
  'chrome': 'Chrome', 'msedge': 'Edge', 'firefox': 'Firefox',
  'spotify': 'Spotify', 'brave': 'Brave', 'opera': 'Opera',
  'vlc': 'VLC', 'rhythmbox': 'Rhythmbox', 'elisa': 'Elisa',
  'amberol': 'Amberol', 'lollypop': 'Lollypop',
};

function friendlySourceName(sourceId) {
  if (!sourceId) return 'Unknown';
  const lower = sourceId.toLowerCase();
  for (const [key, name] of Object.entries(SOURCE_NAMES)) {
    if (lower.includes(key)) return name;
  }
  const parts = sourceId.split(/[\\/.]+/).pop();
  return parts || sourceId;
}

class MediaSessionService {
  constructor() {
    this._cache = null;
    this._lastPoll = 0;
    this._polling = false;
    this._scriptPath = null;
    this._controlScriptPath = null;
  }

  _ensureScripts() {
    if (platform !== 'win32') return;
    if (!this._scriptPath || !fs.existsSync(this._scriptPath)) {
      this._scriptPath = path.join(os.tmpdir(), 'sonos-ui-media-session.ps1');
      fs.writeFileSync(this._scriptPath, WIN_SESSION_SCRIPT, 'utf8');
    }
    if (!this._controlScriptPath || !fs.existsSync(this._controlScriptPath)) {
      this._controlScriptPath = path.join(os.tmpdir(), 'sonos-ui-media-control.ps1');
      fs.writeFileSync(this._controlScriptPath, WIN_CONTROL_SCRIPT, 'utf8');
    }
  }

  getSessions() {
    const now = Date.now();
    if (this._cache && now - this._lastPoll < 1500) return Promise.resolve(this._cache);
    if (this._polling) return Promise.resolve(this._cache || []);
    this._polling = true;

    if (platform === 'win32') return this._getSessionsWindows();
    if (platform === 'darwin') return this._getSessionsMac();
    if (platform === 'linux') return this._getSessionsLinux();
    this._polling = false;
    return Promise.resolve([]);
  }

  // ── Windows: GSMTC via PowerShell ──
  _getSessionsWindows() {
    this._ensureScripts();
    return new Promise((resolve) => {
      execFile('powershell.exe', [
        '-Version', '5.1', '-NoProfile', '-NonInteractive',
        '-ExecutionPolicy', 'Bypass', '-File', this._scriptPath,
      ], { encoding: 'utf8', timeout: 8000, windowsHide: true }, (err, stdout) => {
        this._polling = false;
        if (err) { resolve(this._cache || []); return; }
        try {
          const raw = (stdout || '').trim();
          if (!raw || raw === 'null') { this._cache = []; this._lastPoll = Date.now(); resolve([]); return; }
          let parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) parsed = [parsed];
          this._cache = parsed.map(s => ({
            source: s.source, sourceName: friendlySourceName(s.source),
            title: s.title || '', artist: s.artist || '', album: s.album || '',
            state: s.status === 'Playing' ? 'playing' : s.status === 'Paused' ? 'paused' : 'stopped',
            position: s.position || 0, duration: s.duration || 0,
          }));
          this._lastPoll = Date.now();
          resolve(this._cache);
        } catch (e) { resolve(this._cache || []); }
      });
    });
  }

  // ── macOS: osascript to query Now Playing ──
  _getSessionsMac() {
    return new Promise((resolve) => {
      // Use AppleScript to get current media info from Music/Spotify/browsers
      const script = `
        set output to ""
        try
          tell application "System Events"
            set appList to name of every process whose background only is false
          end tell
          if appList contains "Spotify" then
            tell application "Spotify"
              if player state is playing or player state is paused then
                set t to name of current track
                set a to artist of current track
                set al to album of current track
                set d to duration of current track / 1000
                set p to player position
                set s to player state as string
                set output to "{\\"title\\":\\"" & t & "\\",\\"artist\\":\\"" & a & "\\",\\"album\\":\\"" & al & "\\",\\"duration\\":" & (round d) & ",\\"position\\":" & (round p) & ",\\"status\\":\\"" & s & "\\",\\"source\\":\\"Spotify\\"}"
              end if
            end tell
          else if appList contains "Music" then
            tell application "Music"
              if player state is playing or player state is paused then
                set t to name of current track
                set a to artist of current track
                set al to album of current track
                set d to duration of current track
                set p to player position
                set s to player state as string
                set output to "{\\"title\\":\\"" & t & "\\",\\"artist\\":\\"" & a & "\\",\\"album\\":\\"" & al & "\\",\\"duration\\":" & (round d) & ",\\"position\\":" & (round p) & ",\\"status\\":\\"" & s & "\\",\\"source\\":\\"Apple Music\\"}"
              end if
            end tell
          end if
        end try
        return output
      `;
      exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { encoding: 'utf8', timeout: 5000 }, (err, stdout) => {
        this._polling = false;
        if (err || !stdout || !stdout.trim()) { resolve(this._cache || []); return; }
        try {
          const s = JSON.parse(stdout.trim());
          this._cache = [{
            source: s.source, sourceName: s.source,
            title: s.title || '', artist: s.artist || '', album: s.album || '',
            state: s.status === 'playing' || s.status === 'Playing' ? 'playing' : 'paused',
            position: s.position || 0, duration: s.duration || 0,
          }];
          this._lastPoll = Date.now();
          resolve(this._cache);
        } catch (e) { resolve(this._cache || []); }
      });
    });
  }

  // ── Linux: playerctl ──
  _getSessionsLinux() {
    return new Promise((resolve) => {
      exec('playerctl metadata --format \'{"title":"{{title}}","artist":"{{artist}}","album":"{{album}}","status":"{{status}}","position":{{position}},"duration":{{mpris:length}},"source":"{{playerName}}"}\'',
        { encoding: 'utf8', timeout: 3000 }, (err, stdout) => {
        this._polling = false;
        if (err || !stdout || !stdout.trim()) { resolve(this._cache || []); return; }
        try {
          const s = JSON.parse(stdout.trim());
          this._cache = [{
            source: s.source, sourceName: friendlySourceName(s.source),
            title: s.title || '', artist: s.artist || '', album: s.album || '',
            state: s.status === 'Playing' ? 'playing' : s.status === 'Paused' ? 'paused' : 'stopped',
            position: Math.round((s.position || 0) / 1000000), // microseconds to seconds
            duration: Math.round((s.duration || 0) / 1000000),
          }];
          this._lastPoll = Date.now();
          resolve(this._cache);
        } catch (e) { resolve(this._cache || []); }
      });
    });
  }

  async getCurrentSession() {
    const sessions = await this.getSessions();
    if (sessions.length === 0) return null;
    return sessions.find(s => s.state === 'playing') || sessions.find(s => s.state === 'paused') || sessions[0];
  }

  // ── Media Control ──
  controlMedia(action) {
    if (platform === 'win32') return this._controlWindows(action);
    if (platform === 'darwin') return this._controlMac(action);
    if (platform === 'linux') return this._controlLinux(action);
    return Promise.resolve(false);
  }

  _controlWindows(action) {
    this._ensureScripts();
    return new Promise((resolve) => {
      execFile('powershell.exe', [
        '-Version', '5.1', '-NoProfile', '-NonInteractive',
        '-ExecutionPolicy', 'Bypass', '-File', this._controlScriptPath, '-Action', action,
      ], { encoding: 'utf8', timeout: 5000, windowsHide: true }, (err, stdout) => {
        resolve(!err && (stdout || '').trim().toLowerCase() === 'true');
      });
    });
  }

  _controlMac(action) {
    return new Promise((resolve) => {
      // Try Spotify first, then Music
      const cmdMap = {
        play: 'play', pause: 'pause', playpause: 'playpause',
        next: 'next track', previous: 'previous track',
      };
      const cmd = cmdMap[action] || 'playpause';
      const script = `
        try
          tell application "System Events"
            set appList to name of every process whose background only is false
          end tell
          if appList contains "Spotify" then
            tell application "Spotify" to ${cmd}
          else if appList contains "Music" then
            tell application "Music" to ${cmd}
          end if
        end try
      `;
      exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, { timeout: 3000 }, (err) => {
        resolve(!err);
      });
    });
  }

  _controlLinux(action) {
    return new Promise((resolve) => {
      const cmdMap = {
        play: 'play', pause: 'pause', playpause: 'play-pause',
        next: 'next', previous: 'previous',
      };
      const cmd = cmdMap[action] || 'play-pause';
      exec(`playerctl ${cmd}`, { timeout: 3000 }, (err) => {
        resolve(!err);
      });
    });
  }
}

module.exports = MediaSessionService;
