const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.mov', '.avi', '.divx']);
const BROWSER_PLAYABLE_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm']);
const DEFAULT_SLOT_MINUTES = 30;
const DEFAULT_SCHEDULE_HOURS = 12;
const CONFIG_PATH = path.join(__dirname, 'config.json');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let config = {};
let mediaLibrary = { movies: [], tvSeries: [], standup: [], all: [] };
let channelSchedule = {};

function logWithTimestamp(level, ...args) {
  const timestamp = new Date().toISOString();
  console[level](`[${timestamp}]`, ...args);
}

function scanDirectory(dir, fileList = []) {
  if (!dir || !fs.existsSync(dir)) {
    return fileList;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  entries.forEach((entry) => {
    const filePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(filePath, fileList);
      return;
    }

    if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function getExtension(filePath) {
  return path.extname(filePath || '').toLowerCase();
}

function isBrowserPlayable(filePath) {
  return BROWSER_PLAYABLE_EXTENSIONS.has(getExtension(filePath));
}

function getContentType(filePath) {
  const extension = getExtension(filePath);

  if (extension === '.mp4' || extension === '.m4v') {
    return 'video/mp4';
  }

  if (extension === '.mov') {
    return 'video/quicktime';
  }

  if (extension === '.webm') {
    return 'video/webm';
  }

  if (extension === '.avi' || extension === '.divx') {
    return 'video/x-msvideo';
  }

  if (extension === '.mkv') {
    return 'video/x-matroska';
  }

  return 'application/octet-stream';
}

function loadConfig() {
  try {
    const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(configData);
    logWithTimestamp('log', 'Configuration loaded successfully');
  } catch (error) {
    logWithTimestamp('error', 'Error loading config:', error);
    process.exit(1);
  }
}

function persistConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function getConfiguredChannels() {
  if (config.channels && Object.keys(config.channels).length > 0) {
    return Object.keys(config.channels)
      .sort((left, right) => Number(left) - Number(right))
      .map((channelId) => ({ id: channelId, ...config.channels[channelId] }));
  }

  const channelCounts = {
    movies: Number(config.channelCounts?.movies ?? 3),
    tvSeries: Number(config.channelCounts?.tvSeries ?? 3),
    standup: Number(config.channelCounts?.standup ?? 3)
  };

  const channelDefinitions = [];
  let nextId = 0;

  [
    { type: 'movies', label: 'Movie' },
    { type: 'tvSeries', label: 'TV' },
    { type: 'standup', label: 'Standup' }
  ].forEach(({ type, label }) => {
    const count = Math.max(0, channelCounts[type] || 0);
    for (let index = 0; index < count; index += 1) {
      channelDefinitions.push({
        id: String(nextId),
        name: `${label} Channel ${index + 1}`,
        type
      });
      nextId += 1;
    }
  });

  return channelDefinitions;
}

function scanMediaFolders() {
  logWithTimestamp('log', 'Scanning media folders...');
  const startTime = Date.now();
  const nextLibrary = { movies: [], tvSeries: [], standup: [], all: [] };

  Object.keys(config.mediaFolders || {}).forEach((folderType) => {
    const folderPath = config.mediaFolders[folderType];

    if (!folderPath || folderPath.trim() === '') {
      return;
    }

    if (!fs.existsSync(folderPath)) {
      logWithTimestamp('warn', `Media folder not found: ${folderPath}`);
      return;
    }

    try {
      const files = scanDirectory(folderPath);
      const mediaFiles = files.map((fullPath, index) => ({
        id: `${folderType}:${index}:${path.relative(folderPath, fullPath)}`,
        type: folderType,
        title: path.basename(fullPath, path.extname(fullPath)),
        filename: path.basename(fullPath),
        extension: getExtension(fullPath),
        fullPath,
        relativePath: path.relative(folderPath, fullPath),
        browserPlayable: isBrowserPlayable(fullPath)
      }));

      nextLibrary[folderType] = mediaFiles;
      nextLibrary.all = nextLibrary.all.concat(mediaFiles);
      logWithTimestamp('log', `Found ${mediaFiles.length} files in ${folderType}`);
    } catch (error) {
      logWithTimestamp('error', `Error reading ${folderType} folder:`, error.message);
    }
  });

  mediaLibrary = nextLibrary;
  generateChannelSchedule();

  const scanTime = Date.now() - startTime;
  logWithTimestamp('log', `Total: ${mediaLibrary.all.length} media files found in ${scanTime}ms`);
}

function getSchedulablePlaylist(channelType) {
  const typedLibrary = mediaLibrary[channelType] && mediaLibrary[channelType].length > 0
    ? mediaLibrary[channelType]
    : mediaLibrary.all;

  if (!typedLibrary || typedLibrary.length === 0) {
    return { playlist: [], browserPlayableOnly: false };
  }

  const preferredPlayable = typedLibrary.filter((media) => media.browserPlayable);
  if (preferredPlayable.length > 0) {
    return {
      playlist: preferredPlayable,
      browserPlayableOnly: preferredPlayable.length !== typedLibrary.length
    };
  }

  return {
    playlist: typedLibrary,
    browserPlayableOnly: false
  };
}

function generateChannelSchedule() {
  const now = Date.now();
  const nextSchedule = {};

  getConfiguredChannels().forEach((channel, index) => {
    const schedulable = getSchedulablePlaylist(channel.type);
    const playlist = shuffle(schedulable.playlist);
    const slotMinutes = Number(channel.slotMinutes || config.slotMinutes || DEFAULT_SLOT_MINUTES);
    const scheduleHours = Number(channel.scheduleHours || config.scheduleHours || DEFAULT_SCHEDULE_HOURS);
    const timeline = [];
    const slotDurationMs = slotMinutes * 60 * 1000;
    const horizonMs = Math.max(slotDurationMs, scheduleHours * 60 * 60 * 1000);

    if (playlist.length > 0) {
      let cursor = now;
      let playlistIndex = 0;

      while ((cursor - now) < horizonMs) {
        const media = playlist[playlistIndex % playlist.length];
        const entryDurationMs = Math.max(1, Number(slotDurationMs));
        timeline.push({
          scheduleIndex: timeline.length,
          playlistIndex: playlistIndex % playlist.length,
          mediaId: media.id,
          startsAt: cursor,
          endsAt: cursor + entryDurationMs,
          durationMs: entryDurationMs
        });
        cursor += entryDurationMs;
        playlistIndex += 1;
      }
    }

    nextSchedule[channel.id] = {
      id: channel.id,
      name: channel.name || `Channel ${index + 1}`,
      type: channel.type || 'all',
      playlist,
      timeline,
      startTime: now,
      durationMs: slotDurationMs,
      slotMinutes,
      scheduleHours,
      browserPlayableOnly: schedulable.browserPlayableOnly
    };
  });

  channelSchedule = nextSchedule;
  io.emit('channels', getChannelsPayload());
}

function getScheduledItem(channelId) {
  const channel = channelSchedule[channelId];

  if (!channel || !channel.playlist || channel.playlist.length === 0) {
    return { channel, media: null, index: -1, elapsed: 0 };
  }

  const now = Date.now();
  if (!channel.timeline || channel.timeline.length === 0) {
    return { channel, media: null, index: -1, elapsed: 0 };
  }

  const lastEntry = channel.timeline[channel.timeline.length - 1];
  if (lastEntry && now >= lastEntry.endsAt) {
    generateChannelSchedule();
    return getScheduledItem(channelId);
  }

  const elapsed = Math.max(0, now - channel.startTime);
  const entry = channel.timeline.find((item) => now >= item.startsAt && now < item.endsAt) || channel.timeline[0];
  const index = entry ? entry.scheduleIndex : -1;
  const media = entry ? channel.playlist[entry.playlistIndex] : null;

  return {
    channel,
    media,
    entry,
    index,
    elapsed
  };
}

function getCurrentMedia(channelId) {
  const { channel, media, elapsed, index, entry } = getScheduledItem(channelId);

  if (!channel || !media) {
    return {
      id: channelId,
      channelName: channel?.name || 'Channel',
      type: channel?.type || 'all',
      file: 'No media found',
      title: 'No media found',
      relativePath: null,
      fullPath: null,
      progress: 0,
      loading: true,
      streamUrl: null,
      startedAt: null
    };
  }

  const startedAt = entry ? entry.startsAt : Date.now();
  const slotElapsed = entry ? Math.max(0, Date.now() - entry.startsAt) : elapsed;
  const nextEntry = entry
    ? channel.timeline.find((item) => item.startsAt === entry.endsAt)
    : null;
  const nextMedia = nextEntry ? channel.playlist[nextEntry.playlistIndex] : null;

  return {
    id: channelId,
    channelName: channel.name,
    type: channel.type,
    file: media.filename,
    title: media.title,
    extension: media.extension,
    relativePath: media.relativePath,
    fullPath: media.fullPath,
    progress: entry && entry.durationMs > 0 ? slotElapsed / entry.durationMs : 0,
    loading: false,
    browserPlayable: media.browserPlayable,
    contentType: getContentType(media.fullPath),
    streamUrl: `/api/stream/${channelId}`,
    startedAt,
    endedAt: entry ? entry.endsAt : null,
    slotDurationMs: entry ? entry.durationMs : null,
    elapsedMs: entry ? slotElapsed : elapsed,
    remainingMs: entry ? Math.max(0, entry.endsAt - Date.now()) : null,
    scheduleIndex: index,
    slotMinutes: channel.slotMinutes,
    channelBrowserPlayableOnly: channel.browserPlayableOnly,
    nextUp: nextMedia ? {
      title: nextMedia.title,
      file: nextMedia.filename,
      browserPlayable: nextMedia.browserPlayable,
      extension: nextMedia.extension
    } : null
  };
}

function getChannelsPayload() {
  return Object.keys(channelSchedule)
    .sort((left, right) => Number(left) - Number(right))
    .map((channelId) => getCurrentMedia(channelId));
}

function streamFile(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const contentType = getContentType(filePath);

  if (!range) {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const [startText, endText] = range.replace(/bytes=/, '').split('-');
  const start = Number(startText);
  const end = endText ? Number(endText) : fileSize - 1;
  const chunkSize = (end - start) + 1;

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': contentType
  });

  fs.createReadStream(filePath, { start, end }).pipe(res);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/config', (req, res) => {
  res.json(config);
});

app.post('/api/config', (req, res) => {
  config = {
    ...config,
    ...req.body,
    mediaFolders: {
      ...(config.mediaFolders || {}),
      ...(req.body.mediaFolders || {})
    },
    channels: req.body.channels || config.channels,
    channelCounts: {
      ...(config.channelCounts || {}),
      ...(req.body.channelCounts || {})
    }
  };

  persistConfig();
  scanMediaFolders();
  res.json({ success: true, channelCount: Object.keys(channelSchedule).length });
});

app.post('/api/test-connection', (req, res) => {
  const testFolders = req.body.mediaFolders || {};
  const results = {};

  Object.keys(testFolders).forEach((folderType) => {
    const folderPath = testFolders[folderType];

    if (!folderPath || folderPath.trim() === '') {
      results[folderType] = {
        status: 'warning',
        message: 'No path specified',
        count: 0
      };
      return;
    }

    if (!fs.existsSync(folderPath)) {
      results[folderType] = {
        status: 'error',
        message: 'Folder does not exist',
        count: 0,
        path: folderPath
      };
      return;
    }

    try {
      const files = scanDirectory(folderPath);
      results[folderType] = {
        status: files.length > 0 ? 'success' : 'warning',
        message: files.length > 0 ? `Found ${files.length} media files` : 'Folder is reachable but no supported media files were found',
        count: files.length,
        path: folderPath
      };
    } catch (error) {
      results[folderType] = {
        status: 'error',
        message: `Error reading folder: ${error.message}`,
        count: 0,
        path: folderPath
      };
    }
  });

  res.json(results);
});

app.get('/api/channels', (req, res) => {
  res.json(getChannelsPayload());
});

app.get('/api/channel/:channelId', (req, res) => {
  res.json(getCurrentMedia(req.params.channelId));
});

app.get('/api/stream/:channelId', (req, res) => {
  const media = getCurrentMedia(req.params.channelId);

  if (!media.fullPath || !fs.existsSync(media.fullPath)) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  streamFile(req, res, media.fullPath);
});

io.on('connection', (socket) => {
  logWithTimestamp('log', 'Client connected');
  socket.emit('channels', getChannelsPayload());

  socket.on('changeChannel', (channelId) => {
    socket.emit('channelChanged', getCurrentMedia(String(channelId)));
  });

  socket.on('disconnect', () => {
    logWithTimestamp('log', 'Client disconnected');
  });
});

loadConfig();
scanMediaFolders();

const PORT = config.port || 3000;
server.listen(PORT, () => {
  logWithTimestamp('log', `TV server running on port ${PORT}`);
  logWithTimestamp('log', `Open http://localhost:${PORT} to start watching!`);
});
