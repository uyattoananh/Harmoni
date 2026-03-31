# Harmoni

A unified music controller with themes, Sonos, Spotify, local files, and more.

## Features

- **Sonos** — Auto-discover and control Sonos speakers on your network
- **Local Media Detection** — Controls Spotify, YouTube Music, or any media playing in your browser/apps (Windows/macOS/Linux)
- **Local File Playback** — Play MP3, FLAC, M4A, OGG, WAV files with metadata, search, shuffle, repeat, and volume
- **Spotify Integration** — Browse playlists, liked songs, search the catalog (see [Spotify Setup](#spotify-setup))
- **Synced Lyrics** — Real-time synced lyrics via LRCLIB
- **11 Themes** — Each with unique layouts, animations, and visual identity
- **Minibar** — Always-on-top compact overlay with lyrics (3 modes: off, 2-line, full)
- **Locket Widget** — Tiny floating widget with album art, progress bar, and controls
- **System Tray** — Quick controls from the tray icon
- **Global Media Keys** — Play/pause/next/prev from your keyboard
- **Sleep Timer** — 15/30/60/90 min presets
- **In-app Feedback** — Bug reports and suggestions sent via Discord webhook
- **Play History** — Recently played tracks with timestamps
- **Auto-update** — Checks GitHub Releases on launch, installs on restart
- **Single Instance** — Prevents multiple windows
- **Cross-Platform** — Windows, macOS, Linux

## Download

Download the latest version from [Releases](https://github.com/uyattoananh/Harmoni/releases).

| Platform | File | Auto-updates? |
|---|---|---|
| **Windows** | `Harmoni-Setup-x.x.x.exe` | Yes |
| **macOS (Apple Silicon)** | `Harmoni-x.x.x-arm64-mac.zip` | Yes |
| **macOS (Intel)** | `Harmoni-x.x.x-x64-mac.zip` | Yes |
| **Linux** | `Harmoni-x.x.x.AppImage` | Yes |

- **Windows**: Run the `.exe` installer. Future updates download and install automatically.
- **macOS (M1/M2/M3/M4)**: Download the `arm64` zip. Extract, drag `Harmoni.app` to Applications.
- **macOS (Intel)**: Download the `x64` zip. Extract, drag `Harmoni.app` to Applications.
- **Linux**: `chmod +x Harmoni-*.AppImage && ./Harmoni-*.AppImage`

### Build from source
```bash
git clone https://github.com/uyattoananh/Harmoni.git
cd Harmoni
npm install
npm start
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+M` | Toggle minibar |
| `Media Play/Pause` | Play or pause |
| `Media Next` | Next track |
| `Media Previous` | Previous track |
| `Space` | Play/pause (when not typing) |
| `Escape` | Close any overlay |
| `Scroll wheel` (on minibar) | Adjust volume |
| `Double-click mute` | Set volume to 50% |
| `Right-click mute` | Volume presets (25/50/75/100%) |

## Themes

Each theme features unique layouts, animations, and visual elements — not just color swaps.

| Theme | Style |
|---|---|
| Default | Dark glassmorphism with blurred album art background |
| Light | Clean white, Apple Music inspired, pill-shaped play button |
| Windows XP | Authentic Luna Blue with 3D inset panels and gradient buttons |
| Vinyl | Warm turntable feel with spinning circular art and vinyl grooves |
| Neon | Cyberpunk synthwave with scanlines, glowing borders, and pulsing buttons |
| Radio | Vintage AM/FM receiver with amber LCD text and monospace fonts |
| Retro | Cream paper with fieldset-style labeled sections and sharp corners |
| Terminal | Dark hacker terminal with green accent, CRT scanlines, and monospace |
| Bloom | Soft purple Fluent Design with blurred backgrounds and extra rounding |
| Starry Night | Deep space with twinkling stars, shooting stars, and cosmic glow |
| Ziro | Clean geometric with bold blue accent stripes and modern flat design |

## Spotify Setup

Spotify has stopped approving API access for small developer apps, so this feature is limited. If you want to use it:

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create an app with redirect URI `http://127.0.0.1:8888/callback`
3. Copy your Client ID into `spotify-service.js`
4. Add yourself under User Management in the app settings
5. Requires Spotify Premium

## Gaming

The minibar and locket work with **borderless windowed** and **windowed** games. For **fullscreen exclusive** games, the overlay cannot be displayed on top. Position the minibar where you want it before launching the game. To reposition, Alt+Tab out of the game, move the minibar, then switch back.

## Platform Support

| | Windows | macOS | Linux |
|---|---|---|---|
| **Media Detection** | GSMTC (all apps) | AppleScript (Spotify, Apple Music) | playerctl / MPRIS2 |
| **Sonos** | Yes | Yes | Yes |
| **Local Files** | Yes | Yes | Yes |
| **Auto-update** | Yes (NSIS installer) | Yes (.app) | Yes (AppImage) |

## Tech Stack

- **Electron** — Desktop framework
- **Node.js** — Backend services
- **sonos** — Sonos device control via UPnP
- **music-metadata** — Local file metadata parsing
- **electron-updater** — Auto-update via GitHub Releases
- **LRCLIB** — Synced lyrics API

## Credits

- **uy/nikki** — design, development
- **gian/donnygi** — macOS environment tester

## License

ISC
