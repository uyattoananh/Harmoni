# Harmoni

A unified music controller with themes, Sonos, Spotify, local files, and more.

## Features

- **Sonos** — Auto-discover and control Sonos speakers on your network
- **Local Media Detection** — Controls Spotify, YouTube Music, or any media playing in your browser/apps
- **Local File Playback** — Play MP3, FLAC, M4A, OGG files with metadata, search, shuffle, and repeat
- **Spotify Integration** — Browse playlists, liked songs, search, and control playback (requires Premium)
- **Synced Lyrics** — Real-time synced lyrics via LRCLIB
- **11 Themes** — Default, Light, Windows XP, Vinyl, Neon, Radio, Retro, Terminal, Bloom, Starry Night, Ziro
- **Minibar** — Always-on-top compact overlay with lyrics support
- **Locket Widget** — Tiny widget showing current track with progress bar
- **System Tray** — Quick controls from the tray icon
- **Global Media Keys** — Play/pause/next/prev from your keyboard
- **Sleep Timer** — Auto-stop playback after a set time
- **Cross-Platform** — Windows, macOS, Linux

## Download

Download the latest version from [Releases](https://github.com/uyattoananh/Harmoni/releases).

| Platform | File | Auto-updates? |
|---|---|---|
| **Windows** | `Harmoni-Setup-x.x.x.exe` | Yes |
| **macOS** | `Harmoni-x.x.x-universal.zip` | Yes |
| **Linux** | `Harmoni-x.x.x.AppImage` | Yes |

- **Windows**: Run the `.exe` installer. Future updates download and install automatically.
- **macOS**: Extract the zip, drag `Harmoni.app` to Applications. Supports both Intel and Apple Silicon.
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
| `Space` | Play/pause (when not in search) |
| `Escape` | Close any overlay |
| `Scroll wheel` (on minibar) | Adjust volume |

## Spotify Setup

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create an app with redirect URI `http://127.0.0.1:8888/callback`
3. Copy your Client ID into `spotify-service.js`
4. Note: Spotify API requires the app owner to have Spotify Premium

## Themes

| Theme | Style |
|---|---|
| Default | Dark glassmorphism with blurred album art background |
| Light | Clean white, Apple Music inspired |
| Windows XP | Authentic Luna Blue with title bar and fieldset sections |
| Vinyl | Warm brown turntable feel with spinning circular album art |
| Neon | Cyberpunk synthwave with glowing magenta/cyan |
| Radio | Vintage AM/FM with amber LCD and monospace font |
| Retro | Cream paper with black borders and fieldset labels |
| Terminal | Dark hacker terminal with green accent and CRT scanlines |
| Bloom | Soft purple Fluent Design with blurred backgrounds |
| Starry Night | Deep space with animated twinkling and shooting stars |
| Ziro | Clean geometric with bold blue accent stripes |

## Tech Stack

- **Electron** — Desktop framework
- **Node.js** — Backend services
- **sonos** — Sonos device control via UPnP
- **music-metadata** — Local file metadata parsing
- **electron-updater** — Auto-update via GitHub Releases

## License

ISC
