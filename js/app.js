/* ============================================================
   FDR ANALYSIS SYSTEM — Application Logic
   ============================================================ */

(function () {
    'use strict';

    // ── Color palette for parameter traces ──
    const TRACE_COLORS = [
        '#3ddc84', '#4a9eff', '#f5a623', '#e74c3c', '#00d4ff',
        '#9b59b6', '#1abc9c', '#e67e22', '#2ecc71', '#3498db',
        '#e91e63', '#ff9800', '#00bcd4', '#8bc34a', '#ff5722',
        '#607d8b', '#cddc39', '#795548', '#9e9e9e', '#ffeb3b'
    ];

    // ── Parameter definitions for FDR data ──
    // Maps column indices to parameter info (based on the Excel format)
    const PARAM_DEFS = {
        10: { name: 'Ground Speed',     unit: 'kt',  abbr: 'GD SPD'  },
        11: { name: 'Wind Speed',       unit: 'kt',  abbr: 'WDSPD'   },
        12: { name: 'Wind Direction',   unit: 'deg', abbr: 'WDDIR'   },
        13: { name: 'Drift Angle',      unit: 'deg', abbr: 'DRIFT'   },
        14: { name: 'Impact Temp',      unit: '°C',  abbr: 'IMP TMP' },
        15: { name: 'Static Temp',      unit: '°C',  abbr: 'STA TMP' },
        16: { name: 'Sel Course',       unit: 'deg', abbr: 'SEL CRS' },
        17: { name: 'Desired Track',    unit: 'deg', abbr: 'DES TRK' },
        20: { name: 'Radar Altitude',   unit: 'm',   abbr: 'RADALT'  }
    };

    // ── Application State ──
    const state = {
        rawData: null,          // Parsed FDR data
        timeLabels: [],         // Time strings for x-axis
        timeSeconds: [],        // Time in seconds for playback
        parameters: {},         // { colIndex: { ...def, data: [], visible: true } }
        activeParams: new Set(),
        playback: {
            isPlaying: false,
            currentIndex: 0,
            speed: 1,
            intervalId: null,
            rafId: null,
            lastFrameTime: 0,
            baseInterval: 50
        },
        chart: null,
        metadata: {
            filename: '',
            date: '',
            duration: '',
            records: 0
        }
    };

    // ── DOM References ──
    const dom = {
        uploadSection:    document.getElementById('upload-section'),
        dashboardSection: document.getElementById('dashboard-section'),
        fileInput:        document.getElementById('file-input'),
        fileInputReload:  document.getElementById('file-input-reload'),
        dropZone:         document.getElementById('drop-zone'),
        loadingOverlay:   document.getElementById('loading-overlay'),
        fileIndicator:    document.getElementById('file-indicator'),
        clock:            document.getElementById('clock'),
        mainChart:        document.getElementById('main-chart'),
        paramList:        document.getElementById('param-list'),
        liveReadout:      document.getElementById('live-readout'),
        timelineSlider:   document.getElementById('timeline-slider'),
        currentTime:      document.getElementById('current-time'),
        totalTime:        document.getElementById('total-time'),
        cursorTime:       document.getElementById('cursor-time'),
        btnPlay:          document.getElementById('btn-play'),
        btnPause:         document.getElementById('btn-pause'),
        btnRewind:        document.getElementById('btn-rewind'),
        btnForward:       document.getElementById('btn-forward'),
        btnRewindStart:   document.getElementById('btn-rewind-start'),
        btnForwardEnd:    document.getElementById('btn-forward-end'),
        playbackSpeed:    document.getElementById('playback-speed'),
        yAxisMode:        document.getElementById('y-axis-mode'),
        manualScale:      document.getElementById('manual-scale-controls'),
        yMin:             document.getElementById('y-min'),
        yMax:             document.getElementById('y-max'),
        btnApplyScale:    document.getElementById('btn-apply-scale'),
        chartType:        document.getElementById('chart-type'),
        btnSelectAll:     document.getElementById('btn-select-all'),
        btnSelectNone:    document.getElementById('btn-select-none'),
        btnExport:        document.getElementById('btn-export'),
        btnViewAll:       document.getElementById('btn-view-all'),
        infoFilename:     document.getElementById('info-filename'),
        infoDate:         document.getElementById('info-date'),
        infoDuration:     document.getElementById('info-duration'),
        infoRecords:      document.getElementById('info-records')
    };

    // ============================================================
    // INITIALIZATION
    // ============================================================

    function init() {
        bindEvents();
        startClock();
    }

    function bindEvents() {
        // File upload
        dom.fileInput.addEventListener('change', handleFileSelect);
        dom.fileInputReload.addEventListener('change', handleFileSelect);

        // Drag & drop
        dom.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dom.dropZone.classList.add('drag-over');
        });
        dom.dropZone.addEventListener('dragleave', () => {
            dom.dropZone.classList.remove('drag-over');
        });
        dom.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dom.dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) {
                processFile(e.dataTransfer.files[0]);
            }
        });
        dom.dropZone.addEventListener('click', (e) => {
            if (e.target.tagName !== 'LABEL') dom.fileInput.click();
        });

        // Playback controls
        dom.btnPlay.addEventListener('click', play);
        dom.btnPause.addEventListener('click', pause);
        dom.btnRewind.addEventListener('click', rewind);
        dom.btnForward.addEventListener('click', fastForward);
        dom.btnRewindStart.addEventListener('click', goToStart);
        dom.btnForwardEnd.addEventListener('click', goToEnd);
        dom.playbackSpeed.addEventListener('change', updateSpeed);

        // Timeline
        dom.timelineSlider.addEventListener('input', onTimelineSeek);

        // Parameter controls
        dom.btnSelectAll.addEventListener('click', selectAllParams);
        dom.btnSelectNone.addEventListener('click', selectNoParams);

        // Scaling
        dom.yAxisMode.addEventListener('change', onYAxisModeChange);
        dom.btnApplyScale.addEventListener('click', updateChart);
        dom.chartType.addEventListener('change', updateChart);

        // Export
        dom.btnExport.addEventListener('click', exportChart);

        // View all
        dom.btnViewAll.addEventListener('click', showFullChart);

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);
    }

    function startClock() {
        function tick() {
            const now = new Date();
            dom.clock.textContent = now.toTimeString().slice(0, 8);
        }
        tick();
        setInterval(tick, 1000);
    }

    // ============================================================
    // FILE HANDLING
    // ============================================================

    function handleFileSelect(e) {
        if (e.target.files.length) {
            processFile(e.target.files[0]);
        }
    }

    function processFile(file) {
        if (!file.name.match(/\.xlsx?$/i)) {
            alert('ERROR: Please select a valid Excel file (.xlsx or .xls)');
            return;
        }

        showLoading();

        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                parseExcelData(e.target.result, file.name);
            } catch (err) {
                hideLoading();
                alert('ERROR: Failed to parse FDR data.\n' + err.message);
                console.error(err);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function parseExcelData(arrayBuffer, filename) {
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: false });

        if (rawRows.length < 5) {
            throw new Error('Insufficient data rows in the Excel file.');
        }

        // Extract metadata from row 1
        state.metadata.filename = filename;
        const metaRow = rawRows[0];
        state.metadata.date = metaRow[1] || '';

        // Rows 2-4 are headers/units (indices 1-3), data starts at row index 4
        // Row 1 (index 1): parameter abbreviations
        // Row 2 (index 2): parameter name continuation
        // Row 3 (index 3): units

        const headerRow = rawRows[1] || [];
        const unitRow = rawRows[3] || [];

        // Build parameter definitions dynamically
        // Use predefined PARAM_DEFS but also detect any additional columns
        state.parameters = {};
        state.activeParams = new Set();

        for (let col = 0; col < headerRow.length; col++) {
            const headerVal = String(headerRow[col] || '').trim();
            if (!headerVal || col < 10) continue; // Skip time-related columns (0-9)

            const unitVal = String(unitRow[col] || '').trim();
            const def = PARAM_DEFS[col] || {
                name: headerVal,
                unit: unitVal,
                abbr: headerVal.substring(0, 7)
            };

            state.parameters[col] = {
                ...def,
                colIndex: col,
                data: [],
                visible: true,
                color: TRACE_COLORS[(Object.keys(state.parameters).length) % TRACE_COLORS.length]
            };
            state.activeParams.add(col);
        }

        // Parse data rows
        state.timeLabels = [];
        state.timeSeconds = [];

        const dataStartRow = 4;
        for (let i = dataStartRow; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length === 0) continue;

            // Parse time code (column 0)
            const timeVal = row[0];
            let timeStr = '';
            let timeSec = 0;

            if (timeVal instanceof Date) {
                const h = timeVal.getUTCHours ? timeVal.getUTCHours() : timeVal.getHours();
                const m = timeVal.getUTCMinutes ? timeVal.getUTCMinutes() : timeVal.getMinutes();
                const s = timeVal.getUTCSeconds ? timeVal.getUTCSeconds() : timeVal.getSeconds();
                timeStr = formatTime(h, m, s);
                timeSec = h * 3600 + m * 60 + s;
            } else if (typeof timeVal === 'number') {
                // Excel stores times as fractional days
                const totalSeconds = Math.round(timeVal * 86400);
                const h = Math.floor(totalSeconds / 3600);
                const m = Math.floor((totalSeconds % 3600) / 60);
                const s = totalSeconds % 60;
                timeStr = formatTime(h, m, s);
                timeSec = totalSeconds;
            } else if (typeof timeVal === 'string') {
                // Handle multiple time string formats
                let parts = timeVal.trim().match(/(\d+):(\d+):(\d+)/);
                if (!parts) {
                    // Try parsing date-time strings like "1899-12-30T00:00:01.000Z"
                    const d = new Date(timeVal);
                    if (!isNaN(d.getTime())) {
                        const h = d.getUTCHours();
                        const m = d.getUTCMinutes();
                        const s = d.getUTCSeconds();
                        timeStr = formatTime(h, m, s);
                        timeSec = h * 3600 + m * 60 + s;
                    } else {
                        continue;
                    }
                } else {
                    timeStr = formatTime(+parts[1], +parts[2], +parts[3]);
                    timeSec = (+parts[1]) * 3600 + (+parts[2]) * 60 + (+parts[3]);
                }
            } else {
                continue;
            }

            state.timeLabels.push(timeStr);
            state.timeSeconds.push(timeSec);

            // Extract parameter values
            for (const colStr of Object.keys(state.parameters)) {
                const col = parseInt(colStr);
                let val = row[col];

                // Handle blank / whitespace-only values - use null (will create gaps)
                if (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) {
                    val = null;
                } else {
                    val = parseFloat(val);
                    if (isNaN(val)) val = null;
                }

                state.parameters[col].data.push(val);
            }
        }

        // Fill nulls with previous values for smoother charts
        for (const colStr of Object.keys(state.parameters)) {
            const data = state.parameters[colStr].data;
            let lastVal = null;
            for (let i = 0; i < data.length; i++) {
                if (data[i] !== null) {
                    lastVal = data[i];
                } else if (lastVal !== null) {
                    data[i] = lastVal;
                }
            }
        }

        // Update metadata
        state.metadata.records = state.timeLabels.length;
        if (state.timeLabels.length > 0) {
            state.metadata.duration = state.timeLabels[state.timeLabels.length - 1];
        }

        // Setup UI
        setupDashboard();
        hideLoading();
    }

    // ============================================================
    // DASHBOARD SETUP
    // ============================================================

    function setupDashboard() {
        dom.uploadSection.classList.add('hidden');
        dom.dashboardSection.classList.remove('hidden');

        // Update header
        dom.fileIndicator.textContent = state.metadata.filename;
        dom.fileIndicator.classList.add('loaded');

        // Update flight info
        dom.infoFilename.textContent = state.metadata.filename;
        dom.infoDate.textContent = state.metadata.date;
        dom.infoDuration.textContent = state.metadata.duration;
        dom.infoRecords.textContent = state.metadata.records.toLocaleString();

        // Setup timeline
        dom.timelineSlider.max = state.timeLabels.length - 1;
        dom.timelineSlider.value = 0;
        dom.totalTime.textContent = state.metadata.duration;
        dom.currentTime.textContent = '00:00:00';

        // Build parameter list
        buildParamList();

        // Set default: show first 3 parameters
        let count = 0;
        state.activeParams.clear();
        for (const colStr of Object.keys(state.parameters)) {
            const col = parseInt(colStr);
            if (count < 3) {
                state.parameters[col].visible = true;
                state.activeParams.add(col);
                count++;
            } else {
                state.parameters[col].visible = false;
            }
        }
        updateParamListUI();

        // Initial chart render
        createChart();
        updateLiveReadout(0);

        // Reset playback
        state.playback.currentIndex = 0;
        state.playback.isPlaying = false;
    }

    function buildParamList() {
        dom.paramList.innerHTML = '';

        for (const colStr of Object.keys(state.parameters)) {
            const col = parseInt(colStr);
            const param = state.parameters[col];

            const item = document.createElement('div');
            item.className = 'param-item' + (param.visible ? ' active' : '');
            item.dataset.col = col;

            item.innerHTML = `
                <div class="param-check"></div>
                <div class="param-color" style="background:${param.color}"></div>
                <span class="param-name" title="${param.name} (${param.unit})">${param.name}</span>
                <span class="param-unit">${param.unit}</span>
            `;

            item.addEventListener('click', () => toggleParam(col));
            dom.paramList.appendChild(item);
        }
    }

    function updateParamListUI() {
        const items = dom.paramList.querySelectorAll('.param-item');
        items.forEach((item) => {
            const col = parseInt(item.dataset.col);
            if (state.activeParams.has(col)) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    function toggleParam(col) {
        if (state.activeParams.has(col)) {
            state.activeParams.delete(col);
            state.parameters[col].visible = false;
        } else {
            state.activeParams.add(col);
            state.parameters[col].visible = true;
        }
        updateParamListUI();
        updateChart();
    }

    function selectAllParams() {
        for (const colStr of Object.keys(state.parameters)) {
            const col = parseInt(colStr);
            state.activeParams.add(col);
            state.parameters[col].visible = true;
        }
        updateParamListUI();
        updateChart();
    }

    function selectNoParams() {
        state.activeParams.clear();
        for (const colStr of Object.keys(state.parameters)) {
            state.parameters[colStr].visible = false;
        }
        updateParamListUI();
        updateChart();
    }

    // ── Playback window config ──
    // During playback, we show a sliding window of time around the cursor.
    // WINDOW_SECONDS controls how many seconds of data are visible at once.
    const WINDOW_SECONDS = 120; // 2-minute window during playback

    // ============================================================
    // CHART RENDERING (Plotly)
    // ============================================================

    function createChart() {
        const traces = buildTraces(false);
        const layout = buildLayout(false, 0);
        const config = {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['sendDataToCloud', 'lasso2d', 'select2d'],
            displaylogo: false,
            scrollZoom: true
        };

        Plotly.newPlot(dom.mainChart, traces, layout, config);

        // Hover event for cursor info
        dom.mainChart.on('plotly_hover', function (eventData) {
            if (eventData.points && eventData.points.length > 0) {
                const sec = eventData.points[0].x;
                dom.cursorTime.textContent = secondsToHMS(sec);
            }
        });
    }

    function updateChart() {
        const isPlaying = state.playback.isPlaying;
        const idx = state.playback.currentIndex;
        const traces = buildTraces(isPlaying, idx);
        const layout = buildLayout(isPlaying, idx);
        Plotly.react(dom.mainChart, traces, layout);
    }

    /**
     * Build Plotly traces.
     * @param {boolean} clipToPlayhead - If true, only show data up to the current playback index
     * @param {number} playheadIdx - Current playback index (only used when clipToPlayhead=true)
     */
    function buildTraces(clipToPlayhead, playheadIdx) {
        const traces = [];
        const mode = dom.chartType.value;
        const yMode = dom.yAxisMode.value;
        const endIdx = clipToPlayhead ? playheadIdx + 1 : state.timeSeconds.length;

        for (const col of state.activeParams) {
            const param = state.parameters[col];
            if (!param) continue;

            // Slice data up to the playhead (or full data if not clipping)
            const xData = state.timeSeconds.slice(0, endIdx);
            let yData = param.data.slice(0, endIdx);

            // Normalize if needed
            if (yMode === 'normalized') {
                // Use full-range min/max for stable normalization
                const fullValid = param.data.filter(v => v !== null);
                const min = Math.min(...fullValid);
                const max = Math.max(...fullValid);
                const range = max - min || 1;
                yData = yData.map(v => v !== null ? (v - min) / range : null);
            }

            traces.push({
                x: xData,
                y: yData,
                name: `${param.name} (${param.unit})`,
                type: 'scatter',
                mode: mode,
                line: {
                    color: param.color,
                    width: 1.5,
                    shape: 'linear'
                },
                marker: {
                    size: 3,
                    color: param.color
                },
                hovertemplate: `<b>${param.name}</b><br>Time: %{text}<br>Value: %{y:.2f} ${param.unit}<extra></extra>`,
                text: state.timeLabels.slice(0, endIdx),
                connectgaps: true
            });
        }

        return traces;
    }

    /**
     * Build Plotly layout.
     * @param {boolean} followPlayhead - Whether to lock x-axis range to a window around the cursor
     * @param {number} playheadIdx - Current playback index
     */
    function buildLayout(followPlayhead, playheadIdx) {
        const yMode = dom.yAxisMode.value;
        let yAxisConfig = {
            gridcolor: '#1e2d3d',
            zerolinecolor: '#2a3545',
            tickfont: { family: 'Consolas, monospace', size: 10, color: '#8a96a6' },
            titlefont: { family: 'Segoe UI, sans-serif', size: 11, color: '#8a96a6' }
        };

        if (yMode === 'normalized') {
            yAxisConfig.range = [0, 1];
            yAxisConfig.title = 'NORMALIZED VALUE';
        } else if (yMode === 'manual') {
            const yMin = parseFloat(dom.yMin.value) || 0;
            const yMax = parseFloat(dom.yMax.value) || 100;
            yAxisConfig.range = [yMin, yMax];
        } else {
            yAxisConfig.autorange = true;
        }

        // X-axis range
        const totalSec = state.timeSeconds.length > 0 ? state.timeSeconds[state.timeSeconds.length - 1] : 0;
        let xRange;
        if (followPlayhead && playheadIdx > 0) {
            const curSec = state.timeSeconds[playheadIdx] || 0;
            // Sliding window: cursor stays at ~80% from the left
            const winStart = Math.max(0, curSec - WINDOW_SECONDS * 0.8);
            const winEnd = winStart + WINDOW_SECONDS;
            xRange = [winStart, Math.min(winEnd, totalSec + 5)];
        } else {
            xRange = [0, totalSec + 5];
        }

        // Playback cursor line
        const shapes = [];
        if (playheadIdx >= 0 && playheadIdx < state.timeSeconds.length) {
            const curSec = state.timeSeconds[playheadIdx] || 0;
            shapes.push({
                type: 'line',
                x0: curSec,
                x1: curSec,
                y0: 0,
                y1: 1,
                yref: 'paper',
                line: {
                    color: '#f5a623',
                    width: 3
                }
            });
        }

        // Build custom tick values (every ~10 seconds for windowed, sparser for full)
        const tickStep = followPlayhead ? 10 : Math.max(10, Math.round(totalSec / 30));
        const tickvals = [];
        const ticktext = [];
        for (let s = 0; s <= totalSec; s += tickStep) {
            tickvals.push(s);
            ticktext.push(secondsToHMS(s));
        }

        return {
            paper_bgcolor: '#0a0e13',
            plot_bgcolor: '#0d1219',
            font: { family: 'Segoe UI, sans-serif', color: '#d4dce8' },
            margin: { l: 60, r: 20, t: 20, b: 50 },
            xaxis: {
                title: 'RELATIVE TIME (HH:MM:SS)',
                gridcolor: '#1e2d3d',
                zerolinecolor: '#2a3545',
                tickfont: { family: 'Consolas, monospace', size: 10, color: '#8a96a6' },
                titlefont: { family: 'Segoe UI, sans-serif', size: 11, color: '#8a96a6' },
                rangeslider: { visible: false },
                tickangle: -45,
                range: xRange,
                tickvals: tickvals,
                ticktext: ticktext,
                type: 'linear'
            },
            yaxis: yAxisConfig,
            legend: {
                bgcolor: 'rgba(20, 28, 40, 0.9)',
                bordercolor: '#2a3545',
                borderwidth: 1,
                font: { size: 10, color: '#d4dce8' },
                orientation: 'h',
                y: -0.2
            },
            hovermode: 'x unified',
            hoverlabel: {
                bgcolor: '#141c28',
                bordercolor: '#3a4a5a',
                font: { family: 'Consolas, monospace', size: 11, color: '#d4dce8' }
            },
            shapes: shapes
        };
    }

    /** Convert total seconds to HH:MM:SS string */
    function secondsToHMS(totalSec) {
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = Math.floor(totalSec % 60);
        return formatTime(h, m, s);
    }

    // ============================================================
    // PLAYBACK CONTROLS
    // ============================================================

    function play() {
        if (state.playback.isPlaying) return;
        if (state.playback.currentIndex >= state.timeLabels.length - 1) {
            state.playback.currentIndex = 0; // restart if at end
        }
        state.playback.isPlaying = true;

        dom.btnPlay.style.opacity = '0.5';
        dom.btnPlay.classList.add('playing');
        dom.btnPause.style.opacity = '1';

        // Use requestAnimationFrame for smooth playback
        state.playback.lastFrameTime = performance.now();
        state.playback.rafId = requestAnimationFrame(playbackTick);
    }

    function playbackTick(timestamp) {
        if (!state.playback.isPlaying) return;

        const elapsed = timestamp - state.playback.lastFrameTime;
        // Advance by the number of data points that correspond to elapsed real-time
        // Data is ~2 samples/sec, so at 1x speed, 1 real second = 2 data points
        const pointsPerMs = (2 * state.playback.speed) / 1000;
        const advance = Math.floor(elapsed * pointsPerMs);

        if (advance >= 1) {
            state.playback.lastFrameTime = timestamp;
            state.playback.currentIndex = Math.min(
                state.timeLabels.length - 1,
                state.playback.currentIndex + advance
            );

            if (state.playback.currentIndex >= state.timeLabels.length - 1) {
                state.playback.currentIndex = state.timeLabels.length - 1;
                updatePlaybackVisuals();
                pause();
                // Show full chart when playback ends
                showFullChart();
                return;
            }

            updatePlaybackVisuals();
        }

        state.playback.rafId = requestAnimationFrame(playbackTick);
    }

    function pause() {
        state.playback.isPlaying = false;
        if (state.playback.rafId) {
            cancelAnimationFrame(state.playback.rafId);
            state.playback.rafId = null;
        }
        if (state.playback.intervalId) {
            clearInterval(state.playback.intervalId);
            state.playback.intervalId = null;
        }
        dom.btnPlay.style.opacity = '1';
        dom.btnPlay.classList.remove('playing');
        dom.btnPause.style.opacity = '0.5';

        // When paused, redraw with data up to current point but full x-range visible
        updatePlaybackVisuals();
    }

    function rewind() {
        const wasPlaying = state.playback.isPlaying;
        pause();
        state.playback.currentIndex = Math.max(0, state.playback.currentIndex - Math.floor(state.timeLabels.length * 0.02));
        updatePlaybackVisuals();
        if (wasPlaying) play();
    }

    function fastForward() {
        const wasPlaying = state.playback.isPlaying;
        pause();
        state.playback.currentIndex = Math.min(state.timeLabels.length - 1, state.playback.currentIndex + Math.floor(state.timeLabels.length * 0.02));
        updatePlaybackVisuals();
        if (wasPlaying) play();
    }

    function goToStart() {
        pause();
        state.playback.currentIndex = 0;
        updatePlaybackVisuals();
    }

    function goToEnd() {
        pause();
        state.playback.currentIndex = state.timeLabels.length - 1;
        showFullChart();
    }

    function updateSpeed() {
        state.playback.speed = parseFloat(dom.playbackSpeed.value);
        // Speed change takes effect on next frame automatically
    }

    function onTimelineSeek() {
        const wasPlaying = state.playback.isPlaying;
        if (wasPlaying) pause();
        state.playback.currentIndex = parseInt(dom.timelineSlider.value);
        updatePlaybackVisuals();
        if (wasPlaying) play();
    }

    /** Show the full dataset (all data, full x-range, with cursor at current position) */
    function showFullChart() {
        const idx = state.playback.currentIndex;
        dom.timelineSlider.value = idx;
        dom.currentTime.textContent = state.timeLabels[idx] || '00:00:00';

        const traces = buildTraces(false, idx);
        const layout = buildLayout(false, idx);
        Plotly.react(dom.mainChart, traces, layout);
        updateLiveReadout(idx);
    }

    // Throttle chart redraws during playback
    let lastPlaybackRedraw = 0;
    const PLAYBACK_REDRAW_INTERVAL = 150; // ms — balance smoothness vs performance

    /** Update all playback visuals: chart (with progressive reveal + scrolling window), slider, time, readout */
    function updatePlaybackVisuals() {
        const idx = state.playback.currentIndex;

        // Update slider & time display (these are cheap, always update)
        dom.timelineSlider.value = idx;
        dom.currentTime.textContent = state.timeLabels[idx] || '00:00:00';

        // Throttle expensive Plotly redraws when playing
        const now = performance.now();
        if (state.playback.isPlaying && now - lastPlaybackRedraw < PLAYBACK_REDRAW_INTERVAL) {
            updateLiveReadout(idx);
            return;
        }
        lastPlaybackRedraw = now;

        // During playback: clip data to current index and use sliding window
        // When paused: show data up to current index but with full x-range
        const isScrolling = state.playback.isPlaying;
        const traces = buildTraces(true, idx);
        const layout = buildLayout(isScrolling, idx);
        Plotly.react(dom.mainChart, traces, layout);

        updateLiveReadout(idx);
    }

    function updateLiveReadout(idx) {
        let html = '';

        for (const col of state.activeParams) {
            const param = state.parameters[col];
            if (!param) continue;
            const val = param.data[idx];
            const displayVal = val !== null && val !== undefined ? val.toFixed(2) : '—';

            html += `
                <div class="readout-item" style="border-left-color:${param.color}">
                    <span class="readout-name">${param.abbr}</span>
                    <span>
                        <span class="readout-value">${displayVal}</span>
                        <span class="readout-unit">${param.unit}</span>
                    </span>
                </div>
            `;
        }

        dom.liveReadout.innerHTML = html || '<p class="readout-placeholder">No parameters selected</p>';
    }

    // ============================================================
    // SCALING
    // ============================================================

    function onYAxisModeChange() {
        const mode = dom.yAxisMode.value;
        if (mode === 'manual') {
            dom.manualScale.classList.remove('hidden');
        } else {
            dom.manualScale.classList.add('hidden');
        }
        updateChart();
    }

    // ============================================================
    // EXPORT
    // ============================================================

    function exportChart() {
        Plotly.downloadImage(dom.mainChart, {
            format: 'png',
            width: 1920,
            height: 1080,
            filename: 'FDR_Chart_' + (state.metadata.filename || 'export')
        });
    }

    // ============================================================
    // KEYBOARD SHORTCUTS
    // ============================================================

    function handleKeyboard(e) {
        if (!state.rawData && state.timeLabels.length === 0) return;

        switch (e.key) {
            case ' ':
                e.preventDefault();
                state.playback.isPlaying ? pause() : play();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                rewind();
                break;
            case 'ArrowRight':
                e.preventDefault();
                fastForward();
                break;
            case 'Home':
                e.preventDefault();
                goToStart();
                break;
            case 'End':
                e.preventDefault();
                goToEnd();
                break;
        }
    }

    // ============================================================
    // UTILITY FUNCTIONS
    // ============================================================

    function formatTime(h, m, s) {
        return String(h).padStart(2, '0') + ':' +
               String(m).padStart(2, '0') + ':' +
               String(s).padStart(2, '0');
    }

    function showLoading() {
        dom.loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        dom.loadingOverlay.classList.add('hidden');
    }

    // ── Start ──
    init();
})();
