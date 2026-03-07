# SerendipiTV

SerendipiTV is a personal media app built around a simple idea: sometimes you do not want infinite choice.

Instead of asking you to browse an endless wall of thumbnails, SerendipiTV turns your own library into a small set of always-on channels. You flip, land on something already in progress, and either keep watching or move on. It is meant to feel closer to television than a streaming catalog: lighter, faster, and a little more serendipitous.

## What it is

- **A retro TV-style interface** for your personal media
- **A channel-based playback model** built from your movie, TV, and standup folders
- **A rolling schedule generator** that keeps each channel feeling live
- **A browser-based player** with channel flipping, pause, restart, info, guide, volume, and power controls

## Current feature set

- **Dynamic channel generation** from configurable category counts
- **Channel groups** for movies, television, and standup
- **TV Guide** grouped by content type
- **Clickable guide entries** that jump directly to a channel
- **Persistent side rail** with fixed `Settings` and `TV Guide` buttons plus a scrollable channel list
- **On-screen now playing HUD** with title and live playback info for the currently loaded media
- **Status pills** for current title, content type, and `Channel X/total`
- **Pause / resume** and **Play / Restart** behavior
- **Autoplay-gate handling** so the first user interaction starts playback correctly
- **Timestamped server logs** for easier debugging

## Important limitations

- **No transcoding**
- **No subtitle rendering**
- **No library-wide real-duration scheduling**
- **No guaranteed playback for every scanned file format**

SerendipiTV can scan more file types than the browser can actually play. Files such as many `.mkv`, `.avi`, and `.divx` videos may still appear in the schedule, but the browser may not be able to decode them.

## How scheduling works today

Each channel gets a rolling timeline generated from one media category.

- **Movies channels** pull from your movies folder
- **TV channels** pull from your TV folder
- **Standup channels** pull from your standup folder

The current scheduler is **slot-based**, not fully duration-aware.

That means a channel is built from fixed slots such as `30` minutes, rather than the exact runtime of every file in your library. The app does still show **actual live playback timing for the media currently loaded in the browser player** when that information is available from the video element.

## Requirements

- **Node.js 18+** recommended
- A readable local or external drive with media files

## Installation

```bash
npm install
```

If you prefer `make`:

```bash
make install
```

## Running the app

Using npm:

```bash
npm start
```

Using the Makefile:

```bash
make start
```

For development with auto-reload:

```bash
make dev
```

Then open:

```text
http://localhost:3000
```

## Configuration

You can edit `config.json` directly or use the in-app settings UI.

Example:

```json
{
  "mediaFolders": {
    "tvSeries": "/Volumes/18TB-MEDIA-1/Television/",
    "standup": "/Volumes/18TB-MEDIA-1/Stand Up",
    "movies": "/Volumes/18TB-MEDIA-1/Movies/"
  },
  "channelCounts": {
    "movies": 3,
    "tvSeries": 3,
    "standup": 3
  },
  "port": 3000,
  "slotMinutes": 30,
  "scheduleHours": 12,
  "retroMode": true,
  "autoFlip": false,
  "flipInterval": 30
}
```

### Config fields

- **`mediaFolders`**
  - absolute paths to your libraries

- **`channelCounts`**
  - how many channels to create for each category

- **`port`**
  - the web server port

- **`slotMinutes`**
  - fixed slot duration used by the schedule generator

- **`scheduleHours`**
  - how far ahead to build the rolling schedule

- **`retroMode`**
  - retained config flag for the retro presentation mode

- **`autoFlip` / `flipInterval`**
  - configurable channel auto-flip behavior

## Controls

### On-screen controls

- **Info**
  - toggles the now playing display

- **Pause**
  - pauses or resumes the current playback

- **Play / Restart**
  - starts playback or restarts the current channel item

- **Chan - / Chan +**
  - move backward or forward through channels

- **Mute / Vol - / Vol +**
  - audio controls

- **Power**
  - turns the TV on or off

### Keyboard controls

- **Up / Down**
  - channel up / down

- **Left / Right**
  - volume down / up

- **Space**
  - power toggle

- **M**
  - mute toggle

- **1-9**
  - direct channel jump for the first nine channels

## TV Guide behavior

The guide is grouped by category, so you can scan what is currently airing without seeing redundant type labels on each row.

Guide entries show the currently scheduled title and supporting info, and selecting one changes channels immediately.

## Playback notes

Running through `localhost` solves the browser security problem of trying to play local files from `file://`, but it does **not** solve codec support.

Examples that often work in browsers:

- `.mp4`
- some `.mov`
- `.webm`

Examples that commonly fail without transcoding:

- many `.mkv`
- many `.avi`
- many `.divx`

If a file cannot be decoded by the browser, SerendipiTV will still know about it, but playback may fail for that scheduled item.

## Project structure

```text
tv/
├── config.json
├── package.json
├── server.js
├── public/
│   ├── app.js
│   ├── index.html
│   └── style.css
└── README.md
```

## Why the name?

**SerendipiTV** is a play on *serendipity* and television.

The point is not optimization. The point is removing just enough choice that discovery becomes enjoyable again.
