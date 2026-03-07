class TVController {
    constructor() {
        this.socket = io();
        this.currentChannel = 0;
        this.channels = [];
        this.videoPlayer = document.getElementById('videoPlayer');
        this.channelBadge = document.getElementById('channelBadge');
        this.channelNumber = document.getElementById('channelNumber');
        this.channelName = document.getElementById('channelName');
        this.currentTitle = document.getElementById('currentTitle');
        this.currentMeta = document.getElementById('currentMeta');
        this.nowPlaying = document.querySelector('.now-playing');
        this.guideContent = document.getElementById('guideContent');
        this.channelButtons = document.querySelector('.channel-buttons');
        this.playButton = document.getElementById('ok');
        this.currentTitlePill = document.getElementById('currentTitlePill');
        this.channelTypePill = document.getElementById('channelTypePill');
        this.channelIndexPill = document.getElementById('channelIndexPill');
        this.screenContent = document.querySelector('.screen-content');
        this.volume = 0.5;
        this.isPowerOn = true;
        this.hasUserInteracted = false;
        this.isPaused = false;
        this.isNowPlayingPinned = true;
        this.staticCanvas = null;
        this.channelNumberTimeout = null;
        this.scheduleRefreshTimeout = null;
        this.nowPlayingTimeout = null;
        this.infoRefreshInterval = null;

        this.initializeEventListeners();
        this.initializeSocketListeners();
        this.loadConfiguration();
        this.fetchChannels();
        this.updateVolume();
        this.updatePlayButtonLabel();
    }

    initializeEventListeners() {
        document.querySelectorAll('#configPanel input, #configPanel textarea, #configPanel select, #guidePanel input, #guidePanel textarea, #guidePanel select').forEach((element) => {
            element.addEventListener('keydown', (event) => {
                event.stopPropagation();
            });
        });

        document.getElementById('channelUp').addEventListener('click', () => {
            this.markUserInteracted();
            this.channelUp();
        });

        document.getElementById('channelDown').addEventListener('click', () => {
            this.markUserInteracted();
            this.channelDown();
        });

        document.getElementById('volumeUp').addEventListener('click', () => {
            this.markUserInteracted();
            this.volumeUp();
        });

        document.getElementById('volumeDown').addEventListener('click', () => {
            this.markUserInteracted();
            this.volumeDown();
        });

        document.getElementById('ok').addEventListener('click', () => {
            this.markUserInteracted();
            this.playButtonAction();
        });

        document.getElementById('powerKnob').addEventListener('click', () => {
            this.markUserInteracted();
            this.togglePower();
        });

        document.getElementById('volumeKnob').addEventListener('click', () => {
            this.markUserInteracted();
            this.muteToggle();
        });

        document.getElementById('infoBtn').addEventListener('click', () => {
            this.markUserInteracted();
            this.showNowPlayingDetails();
        });

        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.markUserInteracted();
            this.pauseToggle();
        });

        document.addEventListener('keydown', (e) => {
            if (this.shouldIgnoreGlobalKeydown(e)) {
                return;
            }

            this.markUserInteracted();
            switch (e.key) {
                case 'ArrowUp':
                    this.channelUp();
                    break;
                case 'ArrowDown':
                    this.channelDown();
                    break;
                case 'ArrowLeft':
                    this.volumeDown();
                    break;
                case 'ArrowRight':
                    this.volumeUp();
                    break;
                case ' ':
                    e.preventDefault();
                    this.togglePower();
                    break;
                case 'm':
                    this.muteToggle();
                    break;
                default:
                    if (/^[1-9]$/.test(e.key)) {
                        const index = Number(e.key) - 1;
                        if (index < this.channels.length) {
                            this.changeChannel(index);
                        }
                    }
                    break;
            }
        });

        this.videoPlayer.addEventListener('error', () => {
            const activeChannel = this.channels[this.currentChannel];
            if (activeChannel) {
                this.showPlaybackError(activeChannel);
            } else {
                this.showStatic();
            }
        });

        this.videoPlayer.addEventListener('playing', () => {
            this.clearPlaybackMessage();
            this.removeStatic();
            this.startInfoRefresh();
            this.updateChannelDisplay();
        });

        this.videoPlayer.addEventListener('loadeddata', () => {
            this.clearPlaybackMessage();
            this.updateChannelDisplay();
        });

        this.videoPlayer.addEventListener('pause', () => {
            this.updateChannelDisplay();
        });

        this.videoPlayer.addEventListener('ended', () => {
            this.stopInfoRefresh();
            this.updateChannelDisplay();
        });

        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showConfigPanel();
        });

        document.getElementById('guideBtn').addEventListener('click', () => {
            this.showGuidePanel();
        });

        document.getElementById('saveConfig').addEventListener('click', () => {
            this.saveConfiguration();
        });

        document.getElementById('testConnection').addEventListener('click', () => {
            this.testConnection();
        });

        document.getElementById('closeConfig').addEventListener('click', () => {
            this.hideConfigPanel();
        });

        document.getElementById('closeGuide').addEventListener('click', () => {
            this.hideGuidePanel();
        });

        document.addEventListener('click', (event) => {
            const configPanel = document.getElementById('configPanel');
            const guidePanel = document.getElementById('guidePanel');

            if (configPanel.style.display === 'block' && !configPanel.contains(event.target) && !event.target.closest('#settingsBtn')) {
                this.hideConfigPanel();
            }

            if (guidePanel.style.display === 'block' && !guidePanel.contains(event.target) && !event.target.closest('#guideBtn')) {
                this.hideGuidePanel();
            }
        });
    }

    shouldIgnoreGlobalKeydown(event) {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
            return true;
        }

        const target = event.target;
        if (!target) {
            return false;
        }

        const tagName = target.tagName ? target.tagName.toLowerCase() : '';
        return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select' || !!target.closest('#configPanel') || !!target.closest('#guidePanel');
    }

    initializeSocketListeners() {
        this.socket.on('channels', (channels) => {
            this.setChannels(channels);
        });

        this.socket.on('channelChanged', (media) => {
            this.updateActiveChannel(media);
            this.playMedia(media);
        });

        this.socket.on('connect', () => {
            this.fetchChannels();
        });

        this.socket.on('disconnect', () => {
            this.showStatic();
        });
    }

    async fetchChannels() {
        try {
            const response = await fetch('/api/channels');
            const channels = await response.json();
            this.setChannels(channels);
        } catch (error) {
            console.error('Failed to fetch channels:', error);
        }
    }

    setChannels(channels) {
        this.channels = Array.isArray(channels) ? channels : [];

        if (this.currentChannel >= this.channels.length) {
            this.currentChannel = 0;
        }

        this.renderChannelButtons();
        this.updateChannelDisplay();
        this.renderGuide();

        if (this.isPowerOn && this.hasUserInteracted && this.channels.length > 0) {
            this.playMedia(this.channels[this.currentChannel]);
            return;
        }

        if (!this.hasUserInteracted && this.channels.length > 0) {
            this.showInteractionRequired(this.channels[this.currentChannel]);
        }
    }

    renderChannelButtons() {
        this.channelButtons.innerHTML = '';

        this.channels.forEach((channel, index) => {
            const button = document.createElement('button');
            button.className = 'channel-btn';
            button.dataset.channel = String(index);
            button.textContent = String(index + 1);
            button.addEventListener('click', () => {
                this.markUserInteracted();
                this.changeChannel(index);
            });
            this.channelButtons.appendChild(button);
        });
    }

    markUserInteracted() {
        const wasWaitingForInteraction = !this.hasUserInteracted;
        this.hasUserInteracted = true;

        if (!wasWaitingForInteraction || !this.isPowerOn) {
            return;
        }

        this.clearPlaybackMessage();
        this.removeStatic();

        const activeChannel = this.channels[this.currentChannel];
        if (activeChannel && !this.isPaused) {
            this.playMedia(activeChannel);
        }
    }

    updateActiveChannel(media) {
        const index = this.channels.findIndex((channel) => String(channel.id) === String(media.id));
        if (index >= 0) {
            this.channels[index] = media;
        }
        this.updateChannelDisplay();
        this.scheduleNextRefresh(media);
        this.scheduleNowPlayingHide();
        this.renderGuide();
    }

    changeChannel(channelIndex) {
        if (!this.isPowerOn || this.channels.length === 0) {
            return;
        }

        this.currentChannel = Number(channelIndex);
        this.showChannelNumber();
        this.updateChannelDisplay();
        this.addChannelChangeEffect();
        this.socket.emit('changeChannel', this.channels[this.currentChannel].id);
    }

    showChannelNumber() {
        this.channelBadge.style.display = 'block';
        window.clearTimeout(this.channelNumberTimeout);
        this.channelNumberTimeout = window.setTimeout(() => {
            this.channelBadge.style.display = 'none';
        }, 2000);
    }

    channelUp() {
        if (!this.isPowerOn || this.channels.length === 0) {
            return;
        }

        this.changeChannel((this.currentChannel + 1) % this.channels.length);
    }

    channelDown() {
        if (!this.isPowerOn || this.channels.length === 0) {
            return;
        }

        this.changeChannel((this.currentChannel - 1 + this.channels.length) % this.channels.length);
    }

    volumeUp() {
        if (!this.isPowerOn) {
            return;
        }

        this.volume = Math.min(1, this.volume + 0.1);
        this.updateVolume();
    }

    volumeDown() {
        if (!this.isPowerOn) {
            return;
        }

        this.volume = Math.max(0, this.volume - 0.1);
        this.updateVolume();
    }

    muteToggle() {
        if (!this.isPowerOn) {
            return;
        }

        this.volume = this.volume > 0 ? 0 : 0.5;
        this.updateVolume();
    }

    pauseToggle() {
        if (!this.isPowerOn) {
            return;
        }

        if (this.videoPlayer.paused || this.videoPlayer.ended) {
            this.isPaused = false;
            this.updateChannelDisplay();
            this.showNowPlayingDetails();
            this.videoPlayer.play().catch((error) => {
                console.error('Failed to resume media:', error);
                const activeChannel = this.channels[this.currentChannel];
                if (activeChannel) {
                    this.playMedia(activeChannel);
                }
            });
            this.scheduleNextRefresh(this.channels[this.currentChannel]);
            this.updatePlayButtonLabel();
            return;
        }

        this.videoPlayer.pause();
        this.isPaused = true;
        window.clearTimeout(this.scheduleRefreshTimeout);
        this.showNowPlayingDetails(true);
        this.currentMeta.textContent = 'Paused';
        this.updatePlayButtonLabel();
    }

    playButtonAction() {
        if (!this.isPowerOn) {
            this.togglePower();
            this.updatePlayButtonLabel();
            return;
        }

        if (this.isPaused) {
            this.pauseToggle();
            return;
        }

        const activeChannel = this.channels[this.currentChannel];
        if (activeChannel) {
            this.playMedia(activeChannel);
        }
        this.updatePlayButtonLabel();
    }

    togglePower() {
        this.isPowerOn = !this.isPowerOn;

        if (this.isPowerOn) {
            this.isPaused = false;
            this.videoPlayer.style.display = 'block';
            this.powerOnEffect();
            if (this.channels.length > 0) {
                this.changeChannel(this.currentChannel);
            }
            this.updatePlayButtonLabel();
            return;
        }

        this.videoPlayer.pause();
        this.isPaused = false;
        this.videoPlayer.removeAttribute('src');
        this.videoPlayer.load();
        this.videoPlayer.style.display = 'none';
        this.stopInfoRefresh();
        this.showStatic();
        this.powerOffEffect();
        this.updatePlayButtonLabel();
    }

    updateVolume() {
        this.videoPlayer.volume = this.volume;
        this.updateVolumeIndicator();
    }

    updateVolumeIndicator() {
        const bars = document.querySelectorAll('.volume-bars .bar');
        const activeBars = Math.max(0, Math.ceil(this.volume * bars.length));

        bars.forEach((bar, index) => {
            bar.style.opacity = index < activeBars ? `${0.3 + (index * 0.15)}` : '0.1';
        });
    }

    updateChannelDisplay() {
        if (this.channels.length === 0) {
            this.channelNumber.textContent = '-';
            this.channelName.textContent = 'No channels configured';
            this.currentTitle.textContent = 'No media loaded';
            this.currentMeta.textContent = 'Configure folders to generate channels';
            if (this.channelTypePill) {
                this.channelTypePill.textContent = 'No Signal';
            }
            if (this.currentTitlePill) {
                this.currentTitlePill.textContent = 'No media';
            }
            if (this.channelIndexPill) {
                this.channelIndexPill.textContent = 'Channel -/-';
            }
            this.setNowPlayingVisible(true);
            return;
        }

        const channel = this.channels[this.currentChannel];
        this.channelNumber.textContent = this.currentChannel + 1;
        this.channelName.textContent = channel.channelName || `Channel ${this.currentChannel + 1}`;
        this.currentTitle.textContent = channel.title || channel.file || 'Untitled media';
        this.currentMeta.textContent = this.isPaused ? 'Paused' : this.getNowPlayingMeta(channel);
        if (this.currentTitlePill) {
            this.currentTitlePill.textContent = channel.title || channel.file || 'Untitled media';
        }
        if (this.channelTypePill) {
            this.channelTypePill.textContent = this.getChannelTypeLabel(channel.type);
        }
        if (this.channelIndexPill) {
            this.channelIndexPill.textContent = `Channel ${this.currentChannel + 1}/${this.channels.length}`;
        }
        this.setNowPlayingVisible(true);

        this.channelButtons.querySelectorAll('.channel-btn').forEach((button, index) => {
            button.classList.toggle('active', index === this.currentChannel);
        });

        this.updatePlayButtonLabel();
    }

    updatePlayButtonLabel() {
        if (!this.playButton) {
            return;
        }

        if (!this.isPowerOn || this.isPaused || this.videoPlayer.paused || !this.videoPlayer.currentSrc) {
            this.playButton.textContent = 'Play';
            return;
        }

        this.playButton.textContent = 'Restart';
    }

    getChannelTypeLabel(channelType) {
        if (channelType === 'tvSeries') {
            return 'Television';
        }

        if (channelType === 'standup') {
            return 'Standup';
        }

        if (channelType === 'movies') {
            return 'Movies';
        }

        return 'Channel';
    }

    formatDuration(durationMs) {
        const totalSeconds = Math.max(0, Math.floor(Number(durationMs || 0) / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    setNowPlayingVisible(visible) {
        if (!this.nowPlaying) {
            return;
        }

        this.nowPlaying.style.opacity = visible ? '1' : '0';
        this.nowPlaying.style.pointerEvents = visible ? 'auto' : 'none';
    }

    scheduleNowPlayingHide() {
        window.clearTimeout(this.nowPlayingTimeout);

        if (!this.nowPlaying || this.isPaused || this.isNowPlayingPinned) {
            return;
        }

        this.setNowPlayingVisible(true);
        this.nowPlayingTimeout = window.setTimeout(() => {
            const hasOverlayMessage = !!this.screenContent.querySelector('.playback-message');
            if (!hasOverlayMessage) {
                this.setNowPlayingVisible(false);
            }
        }, 15000);
    }

    showNowPlayingDetails(persistent = false) {
        if (!persistent && this.nowPlaying && this.nowPlaying.style.opacity === '1' && !this.isNowPlayingPinned) {
            this.setNowPlayingVisible(false);
            window.clearTimeout(this.nowPlayingTimeout);
            return;
        }

        this.isNowPlayingPinned = persistent;
        this.setNowPlayingVisible(true);
        window.clearTimeout(this.nowPlayingTimeout);

        if (!persistent) {
            this.scheduleNowPlayingHide();
        }
    }

    getNowPlayingMeta(channel) {
        if (!channel) {
            return 'Waiting for schedule';
        }

        if (channel.loading) {
            return 'Loading channel schedule';
        }

        if (channel.browserPlayable === false) {
            return `${channel.extension || channel.contentType || 'format'} is scheduled but not browser-playable`;
        }

        const timing = this.getTimingText(channel);
        if (timing) {
            return timing;
        }

        if (channel.file && channel.file !== channel.title) {
            return channel.file;
        }

        return channel.channelName || 'Channel ready';
    }

    getTimingText(channel) {
        if (!channel || this.channels[this.currentChannel] !== channel) {
            return '';
        }

        const durationSeconds = Number(this.videoPlayer.duration);
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
            return '';
        }

        const elapsed = this.formatDuration(this.getLiveElapsedMs());
        const duration = this.formatDuration(durationSeconds * 1000);

        if (channel.file && channel.file !== channel.title) {
            return `${elapsed} / ${duration} • ${channel.file}`;
        }

        return `${elapsed} / ${duration}`;
    }

    getLiveElapsedMs() {
        if (!this.videoPlayer) {
            return 0;
        }

        return Math.max(0, this.videoPlayer.currentTime || 0) * 1000;
    }

    startInfoRefresh() {
        this.stopInfoRefresh();
        this.infoRefreshInterval = window.setInterval(() => {
            if (!this.isPowerOn || this.channels.length === 0) {
                return;
            }

            const channel = this.channels[this.currentChannel];
            if (!channel) {
                return;
            }

            this.currentMeta.textContent = this.isPaused ? 'Paused' : this.getNowPlayingMeta(channel);
        }, 1000);
    }

    stopInfoRefresh() {
        window.clearInterval(this.infoRefreshInterval);
        this.infoRefreshInterval = null;
    }

    playMedia(media) {
        if (!this.isPowerOn || !media || media.loading || !media.streamUrl) {
            this.showStatic();
            return;
        }

        this.isPaused = false;
        this.isNowPlayingPinned = false;
        this.updatePlayButtonLabel();

        if (!this.hasUserInteracted) {
            this.showInteractionRequired(media);
            return;
        }

        if (media.browserPlayable === false) {
            this.videoPlayer.pause();
            this.videoPlayer.removeAttribute('src');
            this.videoPlayer.load();
            this.showPlaybackError(media, true);
            this.scheduleNextRefresh(media);
            return;
        }

        this.clearPlaybackMessage();
        this.removeStatic();
        this.videoPlayer.style.display = 'block';
        this.videoPlayer.src = `${media.streamUrl}?t=${media.startedAt || Date.now()}`;
        this.videoPlayer.load();
        this.videoPlayer.play().catch((error) => {
            console.error('Failed to play media:', error);
            if (error && error.name === 'NotAllowedError') {
                this.showInteractionRequired(media);
                this.updatePlayButtonLabel();
                return;
            }
            this.showPlaybackError(media, false, error);
            this.updatePlayButtonLabel();
        });
        this.scheduleNextRefresh(media);
    }

    renderGuide() {
        if (!this.guideContent) {
            return;
        }

        if (this.channels.length === 0) {
            this.guideContent.innerHTML = '<div class="guide-section"><div class="guide-line">No channels available yet.</div></div>';
            return;
        }

        const grouped = this.channels.reduce((accumulator, channel, index) => {
            const label = channel.type === 'movies'
                ? 'Movie Channels'
                : channel.type === 'standup'
                    ? 'Standup Channels'
                    : channel.type === 'tvSeries'
                        ? 'TV Channels'
                        : 'Other Channels';

            if (!accumulator[label]) {
                accumulator[label] = [];
            }

            accumulator[label].push({ channel, index });
            return accumulator;
        }, {});

        this.guideContent.innerHTML = Object.entries(grouped).map(([label, entries]) => `
            <div class="guide-group">
                <div class="guide-group-title">${label}</div>
                ${entries.map(({ channel, index }) => `
                    <button class="guide-section guide-channel-row guide-channel-button" data-guide-channel="${index}">
                        <div class="guide-channel-number">${index + 1}</div>
                        <div class="guide-channel-body">
                            <div class="guide-channel-title">${channel.title || channel.file || 'Untitled media'}</div>
                            <div class="guide-channel-meta">${channel.file || channel.channelName || 'Channel ready'}</div>
                        </div>
                    </button>
                `).join('')}
            </div>
        `).join('');

        this.guideContent.querySelectorAll('[data-guide-channel]').forEach((element) => {
            element.addEventListener('click', () => {
                const index = Number(element.getAttribute('data-guide-channel'));
                this.markUserInteracted();
                this.hideGuidePanel();
                this.changeChannel(index);
            });
        });
    }

    clearPlaybackMessage() {
        const existing = this.screenContent.querySelector('.playback-message');
        if (existing) {
            existing.remove();
        }
    }

    showInteractionRequired(media) {
        window.clearTimeout(this.nowPlayingTimeout);
        this.isNowPlayingPinned = true;
        this.videoPlayer.style.display = 'none';
        this.videoPlayer.pause();
        this.videoPlayer.removeAttribute('src');
        this.videoPlayer.load();
        this.removeStatic();
        this.clearPlaybackMessage();

        const message = document.createElement('div');
        message.className = 'playback-message';
        message.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:24px;text-align:center;color:#00ff00;background:rgba(0,0,0,0.85);z-index:9;';
        message.innerHTML = `<div style="font-size:22px;margin-bottom:12px;">${media?.channelName || 'TV'}</div><div style="font-size:16px;margin-bottom:10px;">Press OK or change the channel to start playback.</div><div style="font-size:11px;color:#7fbf7f;max-width:85%;">Your browser blocked autoplay until you interact with the page.</div>`;
        this.screenContent.appendChild(message);
        this.currentTitle.textContent = media?.title || media?.file || 'Playback paused';
        this.currentMeta.textContent = 'Waiting for your first interaction';
        this.setNowPlayingVisible(true);
        this.updatePlayButtonLabel();
    }

    scheduleNextRefresh(media) {
        window.clearTimeout(this.scheduleRefreshTimeout);

        if (!media || !media.endedAt || this.isPaused) {
            return;
        }

        const delay = Math.max(1000, media.endedAt - Date.now() + 250);
        this.scheduleRefreshTimeout = window.setTimeout(() => {
            if (!this.isPowerOn || this.channels.length === 0) {
                return;
            }

            const activeChannel = this.channels[this.currentChannel];
            if (activeChannel) {
                this.socket.emit('changeChannel', activeChannel.id);
            }
        }, delay);
    }

    showPlaybackError(media, unsupportedFormat = false, error = null) {
        window.clearTimeout(this.nowPlayingTimeout);
        this.isNowPlayingPinned = true;
        this.videoPlayer.style.display = 'none';
        this.removeStatic();
        this.clearPlaybackMessage();

        const message = document.createElement('div');
        message.className = 'playback-message';
        message.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:24px;text-align:center;color:#00ff00;background:rgba(0,0,0,0.85);z-index:9;';
        const reason = unsupportedFormat
            ? 'This file is scheduled, but your browser cannot decode this format.'
            : 'Unable to play this channel right now.';
        const detail = unsupportedFormat
            ? `${media.extension || media.contentType || 'unknown format'} is not browser-playable in this app yet.`
            : (error && error.message ? error.message : (media.contentType || 'Playback failed'));
        const nextUp = media.nextUp
            ? `<div style="font-size:12px;color:#9ae69a;margin-top:14px;">Next up: ${media.nextUp.file}${media.nextUp.browserPlayable === false ? ' (may also fail in-browser)' : ''}</div>`
            : '';

        message.innerHTML = `<div style="font-size:22px;margin-bottom:12px;">${media.channelName}</div><div style="font-size:16px;margin-bottom:10px;">${reason}</div><div style="font-size:12px;color:#9ae69a;word-break:break-word;max-width:85%;">${media.file || ''}</div><div style="font-size:11px;color:#7fbf7f;margin-top:10px;max-width:85%;">${detail}</div>${nextUp}`;
        this.screenContent.appendChild(message);
        this.currentTitle.textContent = media.title || media.file || 'Playback error';
        this.currentMeta.textContent = unsupportedFormat ? 'Unsupported browser format' : 'Playback failed';
        this.setNowPlayingVisible(true);
        this.updatePlayButtonLabel();
    }

    showStatic() {
        const message = this.screenContent.querySelector('.playback-message');
        if (message) {
            message.remove();
        }

        if (this.staticCanvas) {
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 450;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.borderRadius = '16px';
        canvas.style.zIndex = '8';

        const ctx = canvas.getContext('2d');
        const animate = () => {
            if (!this.staticCanvas || this.staticCanvas !== canvas) {
                return;
            }

            const imageData = ctx.createImageData(canvas.width, canvas.height);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                const value = Math.random() * 255;
                data[i] = value;
                data[i + 1] = value;
                data[i + 2] = value;
                data[i + 3] = 255;
            }

            ctx.putImageData(imageData, 0, 0);
            requestAnimationFrame(animate);
        };

        this.staticCanvas = canvas;
        this.screenContent.appendChild(canvas);
        animate();
    }

    removeStatic() {
        if (this.staticCanvas && this.staticCanvas.parentNode) {
            this.staticCanvas.parentNode.removeChild(this.staticCanvas);
        }
        this.staticCanvas = null;
    }

    addChannelChangeEffect() {
        const screen = document.querySelector('.tv-screen');
        screen.style.transition = 'transform 0.3s';
        screen.style.transform = 'scale(0.95)';

        setTimeout(() => {
            screen.style.transform = 'scale(1)';
        }, 300);
    }

    powerOnEffect() {
        const screen = document.querySelector('.tv-screen');
        screen.style.animation = 'powerOn 0.5s ease-out';

        setTimeout(() => {
            screen.style.animation = '';
        }, 500);
    }

    powerOffEffect() {
        const screen = document.querySelector('.tv-screen');
        screen.style.animation = 'powerOff 0.3s ease-in';

        setTimeout(() => {
            screen.style.animation = '';
        }, 300);
    }

    async loadConfiguration() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();

            document.getElementById('tvSeriesFolder').value = config.mediaFolders?.tvSeries || '';
            document.getElementById('standupFolder').value = config.mediaFolders?.standup || '';
            document.getElementById('moviesFolder').value = config.mediaFolders?.movies || '';
        } catch (error) {
            console.error('Failed to load configuration:', error);
        }
    }

    async testConnection() {
        const testResults = document.getElementById('testResults');
        const testButton = document.getElementById('testConnection');

        testButton.textContent = 'Testing...';
        testButton.disabled = true;
        testResults.className = 'test-results';
        testResults.innerHTML = '<div class="folder-result">Testing connections...</div>';

        const config = {
            mediaFolders: {
                tvSeries: document.getElementById('tvSeriesFolder').value,
                standup: document.getElementById('standupFolder').value,
                movies: document.getElementById('moviesFolder').value
            }
        };

        try {
            const response = await fetch('/api/test-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            const results = await response.json();
            let resultsHTML = '';
            let hasError = false;
            let hasWarning = false;

            Object.keys(results).forEach((folderType) => {
                const result = results[folderType];
                const statusClass = result.status === 'success'
                    ? 'folder-found'
                    : result.status === 'error'
                        ? 'folder-error'
                        : 'folder-warning';
                const statusEmoji = result.status === 'success'
                    ? '✅'
                    : result.status === 'error'
                        ? '❌'
                        : '⚠️';

                resultsHTML += `<div class="folder-result ${statusClass}"><strong>${statusEmoji} ${folderType.toUpperCase()}:</strong> ${result.message}`;

                if (result.path) {
                    resultsHTML += `<br><small>${result.path}</small>`;
                }

                resultsHTML += '</div>';

                if (result.status === 'error') {
                    hasError = true;
                }

                if (result.status === 'warning') {
                    hasWarning = true;
                }
            });

            testResults.innerHTML = resultsHTML;
            testResults.className = hasError ? 'test-results error' : hasWarning ? 'test-results warning' : 'test-results success';
        } catch (error) {
            console.error('Test connection failed:', error);
            testResults.className = 'test-results error';
            testResults.innerHTML = `<div class="folder-result folder-error"><strong>ERROR:</strong> Failed to test connections - ${error.message}</div>`;
        } finally {
            testButton.textContent = 'Test Connection';
            testButton.disabled = false;
        }
    }

    async saveConfiguration() {
        const config = {
            mediaFolders: {
                tvSeries: document.getElementById('tvSeriesFolder').value,
                standup: document.getElementById('standupFolder').value,
                movies: document.getElementById('moviesFolder').value
            }
        };

        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            if (!response.ok) {
                throw new Error('Failed to save configuration');
            }

            this.hideConfigPanel();
            this.showNotification('Configuration saved successfully!');
            await this.fetchChannels();
        } catch (error) {
            console.error('Failed to save configuration:', error);
            this.showNotification('Failed to save configuration', 'error');
        }
    }

    showConfigPanel() {
        document.getElementById('configPanel').style.display = 'block';
    }

    hideConfigPanel() {
        document.getElementById('configPanel').style.display = 'none';
    }

    showGuidePanel() {
        this.renderGuide();
        document.getElementById('guidePanel').style.display = 'block';
    }

    hideGuidePanel() {
        document.getElementById('guidePanel').style.display = 'none';
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: ${type === 'success' ? '#00ff00' : '#ff0000'}; color: #000; padding: 15px 30px; border-radius: 5px; font-family: 'Orbitron', monospace; font-weight: 700; z-index: 10000; animation: slideDown 0.3s ease-out;`;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideUp 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

const style = document.createElement('style');
style.textContent = `
    @keyframes powerOn {
        0% { transform: scale(0); opacity: 0; }
        50% { transform: scale(1.1); opacity: 0.5; }
        100% { transform: scale(1); opacity: 1; }
    }

    @keyframes powerOff {
        0% { transform: scale(1); opacity: 1; }
        100% { transform: scale(0); opacity: 0; }
    }

    @keyframes slideDown {
        from { transform: translate(-50%, -100%); opacity: 0; }
        to { transform: translate(-50%, 0); opacity: 1; }
    }

    @keyframes slideUp {
        from { transform: translate(-50%, 0); opacity: 1; }
        to { transform: translate(-50%, -100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => {
    new TVController();
});
