// --- MOBILE DEBUGGING CONSOLE ---
(function () {
    var debugDiv = document.createElement('div');
    debugDiv.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:150px; background:rgba(0,0,0,0.8); color:#0f0; font-family:monospace; font-size:12px; overflow-y:scroll; z-index:9999; pointer-events:none; padding:5px;';
    document.body.appendChild(debugDiv);

    function logToScreen(message, color) {
        var line = document.createElement('div');
        line.style.color = color || '#0f0';
        line.textContent = "> " + message;
        debugDiv.appendChild(line);
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }

    var oldLog = console.log;
    console.log = function (msg) { logToScreen(msg); oldLog.apply(console, arguments); };

    var oldError = console.error;
    console.error = function (msg) { logToScreen(msg, '#ff4444'); oldError.apply(console, arguments); };
})();

// --- CONFIGURATION ---
const SECTOR_COUNT = 8;
const SECTOR_SIZE = 360 / SECTOR_COUNT;
const HYSTERESIS_THRESHOLD = 8;
const SELECT_SOUND_FILE = 'assets/select.mp3';
const BACK_SOUND_FILE = 'assets/back.mp3';
const ERROR_SOUND_FILE = 'assets/error.mp3';

// --- STATE MANAGEMENT ---
const state = {

    // Mode
    experimentMode: 'CLUTCH',

    // Audio Engine
    audioContext: null,
    currentBufferSet: [],
    bufferCache: {},
    selectBuffer: null,
    backBuffer: null,
    isAudioInitialized: false,

    // Navigation State
    navigationLevel: 0,
    currentDataNode: MUSIC_LIBRARY,
    parentName: "Library",
    historyStack: [],

    // Interaction State
    isClutched: false,
    currentSector: -1,
    touchStartTime: 0,
    clutchDebounce: null,
    isBrowsing: false,
    isManualPause: false,
    isLocked: false,
    isSystemSuspended: false,

    // Calibration
    hasCalibrated: false,
    lastRawAngle: 0,
    calibratedOffset: 0,

    // Playback
    activeSource: null,
    activeGain: null,

    // Playback Memory
    playbackStartTime: 0,
    pauseOffset: 0,
    pausedSector: -1,

    // New Flags
    isLoading: false,
    lastTapTime: 0,
    isModalOpen: false,

    // Evaluation Config
    taskMode: 'FAMILIARIZATION', // 'ARTIST', 'TRACK_MJ_DP'
    obscureScreen: false,

    // Evaluation Runtime
    currentTarget: null,
    taskStartTime: 0,
    isTaskActive: false,
    timerInterval: null
};

// --- DOM ELEMENTS ---
const uiContainer = document.getElementById('ui-container');
const statusDiv = document.getElementById('status');
const sectorDiv = document.getElementById('sector-display');

// --- INITIALIZATION ---
// Ensure we are grabbing the correct new button ID
const startBtn = document.getElementById('btn-start');

startBtn.addEventListener('click', async () => {
    // 1. CAPTURE SETTINGS
    const modeSelect = document.getElementById('mode-select');
    const taskSelect = document.getElementById('task-select');
    const visionToggle = document.getElementById('vision-toggle');

    if (modeSelect) state.experimentMode = modeSelect.value;
    if (taskSelect) state.taskMode = taskSelect.value;
    if (visionToggle) state.obscureScreen = visionToggle.checked;

    // 2. HIDE SETUP CONTROLS (The critical part)
    const setupDiv = document.getElementById('setup-controls');
    if (setupDiv) setupDiv.style.display = 'none';

    // 3. APPLY SCREEN BLUR IF REQUESTED
    const ui = document.getElementById('ui-container');
    if (state.obscureScreen && ui) {
        ui.style.filter = "blur(8px)";
        ui.style.opacity = "0.6";
    }

    // 4. RANDOMIZE & LOAD AUDIO
    console.log("Starting... Randomizing Data");
    if (typeof musicData !== 'undefined') {
        randomizeData(musicData);
        state.currentDataNode = musicData.children;
    } else if (typeof MUSIC_LIBRARY !== 'undefined') {
        randomizeData(MUSIC_LIBRARY);
        state.currentDataNode = MUSIC_LIBRARY;
    }

    await initAudio();

    // 5. START SENSORS
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') initApp();
            else alert("Permission denied. App may not work.");
        } catch (error) {
            console.error(error);
            initApp();
        }
    } else {
        initApp();
    }
});

function initApp() {
    // --- UI SETUP ---
    startBtn.style.display = 'none';
    uiContainer.style.display = 'block';

    // Note: Randomization has already happened in the Start Button handler.

    // --- TRIGGER FIRST TASK (Updated for Pre-Task Modal) ---
    // We wait 1 second to let the audio engine settle, then trigger the preparation logic.
    setTimeout(() => {
        if (typeof prepareNextTask === 'function') {
            prepareNextTask();
        } else {
            console.warn("Evaluation logic (prepareNextTask) not found.");
        }
    }, 1000);

    // --- 1. SETUP MODE & BUTTON VISIBILITY ---
    const toggleBtn = document.getElementById('btn-system-toggle');

    if (state.experimentMode === 'ALWAYS_ON') {
        state.isBrowsing = true;
        statusDiv.textContent = "Always-On Mode. Tap to Select.";
        if (toggleBtn) toggleBtn.style.display = 'inline-block';
    } else {
        state.isBrowsing = false;
        if (toggleBtn) toggleBtn.style.display = 'none';
    }

    // --- 2. DEFINE BUTTON CLICK LOGIC (Hardened) ---
    if (toggleBtn) {
        // Remove old listeners to prevent duplicates
        const newBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);

        let lastToggleTime = 0;

        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            const now = Date.now();
            if (now - lastToggleTime < 500) return;
            lastToggleTime = now;

            state.isSystemSuspended = !state.isSystemSuspended;

            if (state.isSystemSuspended) {
                // === STOP BROWSING ===
                if (state.activeSource && state.audioContext) {
                    state.pauseOffset = state.audioContext.currentTime - state.playbackStartTime;
                }
                stopSound();

                // Pause timer if active so user isn't penalized for taking a break
                if (state.timerInterval) clearInterval(state.timerInterval);

                newBtn.textContent = "Resume Browsing";
                newBtn.style.backgroundColor = "#4CAF50"; // Green
                statusDiv.textContent = "System Paused (Idle)";
                statusDiv.style.color = "#888";

                if (navigator.vibrate) navigator.vibrate(50);

            } else {
                // === RESUME BROWSING ===
                newBtn.textContent = "Stop Browsing";
                newBtn.style.backgroundColor = "#ff4444"; // Red

                state.isManualPause = false;

                // Resume timer if a task is currently active
                if (state.isTaskActive) {
                    state.timerInterval = setInterval(() => {
                        const elapsed = (Date.now() - state.taskStartTime) / 1000;
                        document.getElementById('timer-display').textContent = elapsed.toFixed(1) + "s";
                    }, 100);
                }

                // RESTORE CORRECT UI TEXT
                const item = state.currentDataNode[state.currentSector];
                const name = item ? item.name : "Unknown";

                if (state.navigationLevel === 2) {
                    if (state.isLocked) {
                        statusDiv.textContent = `Locked: ${name}`;
                        statusDiv.style.color = "#00FF00";
                    } else {
                        statusDiv.textContent = "Locating...";
                        statusDiv.style.color = "#fff";
                    }
                } else {
                    statusDiv.textContent = state.experimentMode === 'ALWAYS_ON'
                        ? `${state.parentName}. Tap to Select.`
                        : `${state.parentName}. Hold to Browse.`;
                    statusDiv.style.color = "#fff";
                }

                if (state.isLocked) {
                    if (state.currentSector !== -1) {
                        playSectorSound(state.currentSector, state.pauseOffset);
                    }
                } else {
                    state.currentSector = -1;
                }
            }
        });
    }

    // --- 3. ATTACH SENSOR LISTENERS ---
    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('devicemotion', handleShake);

    const engage = (e) => engageClutch(e);
    const disengage = (e) => disengageClutch(e);

    window.addEventListener('touchstart', engage, { passive: false });
    window.addEventListener('touchend', disengage);
    window.addEventListener('mousedown', engage);
    window.addEventListener('mouseup', disengage);
}

// --- AUDIO ENGINE ---
async function initAudio() {
    if (state.isAudioInitialized) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContext({ latencyHint: 'interactive' });
    if (state.audioContext.state === 'suspended') state.audioContext.resume();

    statusDiv.textContent = "Loading Audio...";

    // Initial Load: Load Level 0 (Genres)
    await loadCurrentLevelBuffers();
    await loadSelectSound();

    statusDiv.textContent = "Ready. Hold to Browse.";
    state.isAudioInitialized = true;
}

async function getAudioBuffer(url) {
    // 1. Check if we already have it
    if (state.bufferCache[url]) {
        return state.bufferCache[url];
    }

    // 2. If not, fetch and decode it
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const decodedBuffer = await state.audioContext.decodeAudioData(arrayBuffer);

        // 3. Save it for next time
        state.bufferCache[url] = decodedBuffer;
        return decodedBuffer;
    } catch (err) {
        console.error(`Failed to load ${url}`, err);
        return null;
    }
}

async function loadCurrentLevelBuffers() {
    // Map the current items to their audio using the cache helper
    const promises = state.currentDataNode.map(async (item) => {
        // Use the new helper function instead of raw fetch
        return await getAudioBuffer(item.audio);
    });

    state.currentBufferSet = await Promise.all(promises);
}

async function loadSelectSound() {
    try {
        // 1. Load Selection Sound
        let response = await fetch(SELECT_SOUND_FILE);
        let arrayBuffer = await response.arrayBuffer();
        state.selectBuffer = await state.audioContext.decodeAudioData(arrayBuffer);

        // 2. Load Back Sound
        response = await fetch(BACK_SOUND_FILE);
        arrayBuffer = await response.arrayBuffer();
        state.backBuffer = await state.audioContext.decodeAudioData(arrayBuffer);

        // 3. Load Error Sound
        response = await fetch(ERROR_SOUND_FILE);
        arrayBuffer = await response.arrayBuffer();
        state.errorBuffer = await state.audioContext.decodeAudioData(arrayBuffer);

        console.log("UI Sounds Loaded");
    } catch (err) {
        console.error("UI sounds missing or failed to decode", err);
    }
}

function playSectorSound(sectorIndex, startOffset = 0) {

    if (state.isLoading || !state.audioContext || !state.currentBufferSet[sectorIndex]) return;

    stopSound();

    const ctx = state.audioContext;
    const source = ctx.createBufferSource();
    source.buffer = state.currentBufferSet[sectorIndex];

    state.playbackStartTime = ctx.currentTime - startOffset;

    if (state.navigationLevel === 0) {
        source.loop = true;
    } else {
        source.loop = false;
    }

    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';

    const angleRad = (sectorIndex * SECTOR_SIZE) * (Math.PI / 180);
    const x = Math.sin(angleRad) * 3;
    const z = -Math.cos(angleRad) * 3;
    panner.setPosition(x, 0, z);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 0.1);

    source.connect(panner);
    panner.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(0, startOffset);

    state.activeSource = source;
    state.activeGain = gainNode;
}

function stopSound() {
    if (state.activeSource) {
        const oldSource = state.activeSource;
        const oldGain = state.activeGain;
        const ctx = state.audioContext;

        oldGain.gain.cancelScheduledValues(ctx.currentTime);
        oldGain.gain.setValueAtTime(oldGain.gain.value, ctx.currentTime);
        oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);

        setTimeout(() => { oldSource.stop(); oldSource.disconnect(); }, 150);
        state.activeSource = null;
        state.activeGain = null;
    }
}

function playConfirmationSound() {
    if (!state.audioContext || !state.selectBuffer) return;
    const ctx = state.audioContext;
    const source = ctx.createBufferSource();
    source.buffer = state.selectBuffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
}

// --- INTERACTION LOGIC ---

function handleOrientation(event) {

    if (state.isModalOpen) return;
    if (state.isSystemSuspended) return;

    let alpha = event.alpha;
    if (alpha === null) return;
    let angle = 360 - alpha;
    angle = angle % 360;
    if (angle < 0) angle += 360;
    state.lastRawAngle = angle;

    // --- NEW: Calibration Logic ---
    if (!state.hasCalibrated) {
        // In Always-On, calibrate immediately. 
        if (state.experimentMode === 'ALWAYS_ON') {
            state.calibratedOffset = angle;
            state.hasCalibrated = true;
        }
    }

    if (!state.isBrowsing) return;

    let calibratedAngle = angle - state.calibratedOffset;
    if (calibratedAngle < 0) calibratedAngle += 360;
    if (calibratedAngle >= 360) calibratedAngle -= 360;

    updateListener(calibratedAngle);
    calculateSector(calibratedAngle);
}

function updateListener(angle) {
    if (!state.audioContext) return;
    const rad = angle * (Math.PI / 180);
    const x = Math.sin(rad);
    const z = -Math.cos(rad);

    const listener = state.audioContext.listener;
    if (listener.forwardX) {
        listener.forwardX.value = x;
        listener.forwardZ.value = z;
        listener.upY.value = 1;
    } else {
        listener.setOrientation(x, 0, z, 0, 1, 0);
    }
}

function calculateSector(angle) {
    const rawSector = Math.floor(angle / SECTOR_SIZE) % SECTOR_COUNT;

    if (state.currentSector === -1) {
        setSector(rawSector);
        return;
    }

    const currentCenter = state.currentSector * SECTOR_SIZE;
    let diff = angle - currentCenter;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    const boundary = (SECTOR_SIZE / 2) + HYSTERESIS_THRESHOLD;

    if (Math.abs(diff) > boundary) {
        setSector(rawSector);
    }
}

function setSector(newSector) {
    // 1. If Locked, ignore compass changes
    if (state.isLocked) return;

    // 2. Only update if the sector actually changed
    if (state.currentSector !== newSector) {
        state.currentSector = newSector;

        const item = state.currentDataNode[newSector];
        const name = item ? item.name : "Empty";

        // --- CHANGED HERE ---
        // Old: sectorDiv.textContent = `${newSector} (${name})`;
        // New: Just show the name
        sectorDiv.textContent = name;

        // 3. Feedback
        if (navigator.vibrate) navigator.vibrate(15);
        playSectorSound(newSector);
    }
}

function engageClutch(e) {

    // BLOCK if modal is open
    if (state.isModalOpen) return;

    // 1. IGNORE THE BUTTON (Let the click happen normally)
    if (e.target.closest('#btn-system-toggle')) return;

    // 2. PREVENT GHOST CLICKS
    // If this is a touch event on the background, kill it so it doesn't 
    // turn into a mouse event later.
    if (e.cancelable) e.preventDefault();

    // 3. Ignore if system is suspended
    if (state.isSystemSuspended) return;

    // --- BRANCH 1: ALWAYS-ON MODE ---
    if (state.experimentMode === 'ALWAYS_ON') {
        const now = Date.now();
        // Increased debounce to 300ms to be safe against slow taps
        if (now - state.lastTapTime < 300) return;
        state.lastTapTime = now;

        handleSelection();
        return;
    }

    // --- BRANCH 2: CLUTCH MODE ---
    state.touchStartTime = Date.now();
    state.isClutched = true;
    state.isBrowsing = false;

    if (!state.hasCalibrated) {
        state.calibratedOffset = state.lastRawAngle;
        state.hasCalibrated = true;
    }

    if (state.clutchDebounce) clearTimeout(state.clutchDebounce);

    state.clutchDebounce = setTimeout(() => {
        if (state.isClutched) {
            state.isBrowsing = true;
            statusDiv.textContent = `Browsing ${state.parentName}...`;
            statusDiv.style.color = "#4CAF50";
            if (state.currentSector !== -1) playSectorSound(state.currentSector);
        }
    }, 200);
}

function disengageClutch(e) {
    // --- BRANCH 1: ALWAYS-ON MODE ---
    if (state.experimentMode === 'ALWAYS_ON') {
        return;
    }

    // --- BRANCH 2: CLUTCH MODE (Original Logic) ---
    state.isClutched = false;
    state.isBrowsing = false;

    if (state.clutchDebounce) {
        clearTimeout(state.clutchDebounce);
        state.clutchDebounce = null;
    }

    const touchDuration = Date.now() - state.touchStartTime;

    if (touchDuration < 250) {
        handleSelection();
    } else {
        if (state.navigationLevel === 2) {
            statusDiv.textContent = "Playing... (Tap to Pause)";
            statusDiv.style.color = "#00FF00";
        } else {
            statusDiv.textContent = "Paused";
            statusDiv.style.color = "#fff";
            stopSound();
        }
    }
}

async function handleSelection() {
    const currentFacingItem = state.currentDataNode[state.currentSector];
    if (!currentFacingItem) return;

    // --- NEW: CHECK EVALUATION SUCCESS (Step 4B) ---
    // Check if the item we just interacted with is the target
    if (typeof checkSuccess === 'function') {
        checkSuccess(currentFacingItem.name);
    }
    // -----------------------------------------------

    // SCENARIO 1: DRILL DOWN (Genres/Artists)
    if (currentFacingItem.children && currentFacingItem.children.length > 0) {
        stopSound();
        state.isManualPause = false;
        state.isLocked = false;

        statusDiv.textContent = `Selected: ${currentFacingItem.name}`;
        statusDiv.style.color = "cyan";
        playConfirmationSound();
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);

        enterLevel(currentFacingItem.children, currentFacingItem.name);
        return;
    }

    // SCENARIO 2: TRACK LAYER (Lock / Pause / Resume)
    if (state.navigationLevel === 2) {

        // --- A. IF BROWSING -> LOCK IT ---
        if (!state.isLocked) {
            state.isLocked = true; // FREEZE COMPASS
            state.isManualPause = false;

            // --- ALSO CHECK SUCCESS HERE ---
            // Users might "Lock" the target to signal they found it
            if (typeof checkSuccess === 'function') {
                checkSuccess(currentFacingItem.name);
            }
            // -------------------------------

            statusDiv.textContent = `Locked: ${currentFacingItem.name}`;
            statusDiv.style.color = "#00FF00"; // Green
            playConfirmationSound();
            return;
        }

        // --- B. IF LOCKED -> TOGGLE PAUSE ---
        if (state.isManualPause) {
            // RESUME
            state.isManualPause = false;
            playConfirmationSound();
            setTimeout(() => {
                playSectorSound(state.currentSector, state.pauseOffset);
                statusDiv.textContent = `Locked: ${currentFacingItem.name}`;
                statusDiv.style.color = "#00FF00";
            }, 100);
        } else {
            // PAUSE
            state.isManualPause = true;
            state.pauseOffset = state.audioContext.currentTime - state.playbackStartTime;
            stopSound();
            statusDiv.textContent = `Paused: ${currentFacingItem.name}`;
            statusDiv.style.color = "yellow";
        }
        return;
    }

    // SCENARIO 3: DEAD END
    stopSound();
    playErrorSound();
    statusDiv.textContent = `No tracks for ${currentFacingItem.name}`;
    statusDiv.style.color = "red";
    if (navigator.vibrate) navigator.vibrate([200]);
}

function playErrorSound() {
    if (state.errorBuffer) {
        const src = state.audioContext.createBufferSource();
        src.buffer = state.errorBuffer;
        src.connect(state.audioContext.destination);
        src.start();
    }
}

async function enterLevel(newData, title) {

    // 1. LOCK & CLEANUP
    stopSound(); // Stop the Artist music immediately
    state.isManualPause = false; // Reset Pause State
    state.isLocked = false; // Reset Lock State
    state.isLoading = true; // Prevent compass from triggering sounds during load
    state.currentBufferSet = []; // Clear old buffers (Fixes "Ghost Audio")
    state.currentSector = -1; // Reset sector

    state.historyStack.push({
        node: state.currentDataNode,
        name: state.parentName,
        level: state.navigationLevel
    });

    state.navigationLevel++;
    state.currentDataNode = newData;
    state.parentName = title;

    statusDiv.textContent = `Loading ${title}...`;

    // 2. LOAD
    await loadCurrentLevelBuffers();

    // 3. UNLOCK & RESTART
    state.isLoading = false;

    // FIX: Force the compass to "re-discover" the sector.
    // By resetting to -1 AFTER load, the next compass update triggers a "change",
    // causing the new track to start playing immediately.
    state.currentSector = -1;

    if (state.experimentMode === 'ALWAYS_ON') {
        statusDiv.textContent = `${title}. Tap to Select.`;
    } else {
        statusDiv.textContent = `${title}. Hold to Browse.`;
    }
}

// --- BACK GESTURE (SHAKE) ---
let lastX = 0, lastY = 0; // We don't track Z anymore
let shakeCount = 0;
let lastShakeTime = 0;
let debounceTimer = 0;

function handleShake(event) {

    if (state.isModalOpen) return;
    const current = event.acceleration || event.accelerationIncludingGravity;
    if (!current) return;

    const now = Date.now();

    // 1. GLOBAL COOLDOWN (2s)
    if ((now - debounceTimer) < 2000) return;

    // 2. CALCULATE FORCE (IGNORE Z-AXIS)
    // We only look at X (Side-to-Side) and Y (Up/Down).
    // The Z-axis (Depth) creates false positives when putting the phone on a table.
    const deltaX = Math.abs(lastX - current.x);
    const deltaY = Math.abs(lastY - current.y);

    // Update history
    lastX = current.x;
    lastY = current.y;

    // 3. THRESHOLD
    // Since we removed Z, we can lower this slightly for a comfortable flick.
    const threshold = event.acceleration ? 6 : 15;

    if ((deltaX + deltaY) > threshold) {

        const timeSinceLastShake = now - lastShakeTime;

        // A. NOISE FILTER (100ms)
        // Ignores ultra-fast vibration from impact.
        if (timeSinceLastShake < 100) return;

        // B. COMBO WINDOW (Tightened to 600ms)
        // You must shake rhythmically. If you stop for 0.6s, the count resets.
        // This stops "Pick up -> Pause -> Tilt" from triggering back.
        if (timeSinceLastShake < 600) {
            shakeCount++;
        } else {
            shakeCount = 1;
        }

        lastShakeTime = now;
    }

    // 4. TRIGGER ACTION
    if (shakeCount >= 3) {

        // NEW: Check if we are locked first
        if (state.isLocked) {
            // UNLOCK Action
            state.isLocked = false;
            state.isManualPause = false;

            // --- CRITICAL FIX START ---
            if (state.experimentMode === 'ALWAYS_ON') {
                // Always-On: Resume playing immediately
                playSectorSound(state.currentSector);
                statusDiv.textContent = "Unlocked. Tilt to Browse.";
            } else {
                // Clutch Mode: STOP playing. User must hold screen to resume.
                stopSound();
                statusDiv.textContent = "Unlocked. Hold to Browse.";
            }
            // --- CRITICAL FIX END ---

            statusDiv.style.color = "#fff";
            if (navigator.vibrate) navigator.vibrate([50, 50]);
        } else {
            // Standard Back Action
            goBack();
        }

        shakeCount = 0;
        debounceTimer = now;
    }
}

async function goBack() {
    // Check if there is history to go back to
    if (state.historyStack.length > 0) {
        console.log("Going Back one level...");
        stopSound();

        // Play Back Sound
        if (state.backBuffer) {
            const src = state.audioContext.createBufferSource();
            src.buffer = state.backBuffer;
            src.connect(state.audioContext.destination);
            src.start();
        }
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        // --- NEW: Reset Logic Flags ---
        // Ensure we aren't paused or locked when we arrive at the previous level
        state.isManualPause = false;
        state.isLocked = false;

        // 1. Pop the previous state
        const previousState = state.historyStack.pop();

        // 2. Restore State
        state.currentDataNode = previousState.node;
        state.parentName = previousState.name;
        state.navigationLevel = previousState.level;
        state.currentSector = -1;

        // 3. Reload Audio for that level
        statusDiv.textContent = `Returning to ${state.parentName}...`;
        await loadCurrentLevelBuffers();

        // --- UPDATED: Show correct instruction based on Mode ---
        if (state.experimentMode === 'ALWAYS_ON') {
            statusDiv.textContent = `${state.parentName}. Tap to Select.`;
        } else {
            statusDiv.textContent = `${state.parentName}. Hold to Browse.`;
        }
    }
}

// --- RANDOMIZATION HELPER FUNCTIONS ---
// Paste this at the very bottom of script.js

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function randomizeData(node) {
    // Safety check: if node is null/undefined, do nothing
    if (!node) return;

    // Case 1: Root Object (musicData) containing .children
    if (node.children) {
        shuffleArray(node.children);
        node.children.forEach(child => randomizeData(child));
    }
    // Case 2: Array (MUSIC_LIBRARY)
    else if (Array.isArray(node)) {
        shuffleArray(node);
        node.forEach(child => randomizeData(child));
    }
}

// --- ADVANCED EVALUATION HARNESS ---

// --- 1. Prepare (Show Modal) ---
function prepareNextTask() {
    console.log("Preparing task. Mode:", state.taskMode);

    // --- 1. HANDLE FAMILIARIZATION ---
    if (state.taskMode === 'FAMILIARIZATION') {
        document.getElementById('target-display').textContent = "Free Play (No Target)";
        document.getElementById('target-display').style.color = "#aaa";
        const modal = document.getElementById('task-modal');
        if (modal) modal.style.display = 'none';
        state.isModalOpen = false;
        return;
    }

    // --- 2. RESET & RANDOMIZE DATA ---
    // A. Reset Logic State
    state.navigationPath = [];
    state.navigationLevel = 0;
    state.currentSector = -1;
    state.isLocked = false;
    state.isManualPause = false;

    // B. Reset Data to Root
    if (typeof musicData !== 'undefined') {
        state.currentDataNode = musicData.children;
    } else if (typeof MUSIC_LIBRARY !== 'undefined') {
        state.currentDataNode = MUSIC_LIBRARY;
    }

    // C. Shuffle the Root (Genres)
    console.log("Reshuffling Data...");
    if (state.currentDataNode && Array.isArray(state.currentDataNode)) {
        // Fisher-Yates Shuffle
        for (let i = state.currentDataNode.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [state.currentDataNode[i], state.currentDataNode[j]] =
                [state.currentDataNode[j], state.currentDataNode[i]];
        }
    }

    // --- 3. PICK THE TARGET ---
    let targetName = "Any Song";
    let libraryRoot = state.currentDataNode;

    if (!libraryRoot || !Array.isArray(libraryRoot)) {
        targetName = "Error: Data Missing";
    } else {
        try {
            if (state.taskMode === 'ARTIST') {
                const randomGenre = libraryRoot[Math.floor(Math.random() * libraryRoot.length)];
                if (randomGenre && randomGenre.children) {
                    const randomArtist = randomGenre.children[Math.floor(Math.random() * randomGenre.children.length)];
                    targetName = randomArtist.name;
                }
            }
            else if (state.taskMode === 'TRACK_MJ_DP') {
                const potentialArtists = [];
                libraryRoot.forEach(genre => {
                    if (genre.children) {
                        genre.children.forEach(artist => {
                            const n = artist.name.toLowerCase();
                            if (n.includes("michael") || n.includes("daft") || n.includes("punk")) {
                                potentialArtists.push(artist);
                            }
                        });
                    }
                });
                if (potentialArtists.length > 0) {
                    const chosenArtist = potentialArtists[Math.floor(Math.random() * potentialArtists.length)];
                    const chosenTrack = chosenArtist.children[Math.floor(Math.random() * chosenArtist.children.length)];
                    targetName = chosenTrack ? chosenTrack.name : chosenArtist.name;
                } else {
                    targetName = "Michael Jackson (Fallback)";
                }
            }
        } catch (err) {
            console.error("Target Error:", err);
            targetName = "Retry Task";
        }
    }

    if (!targetName) targetName = "Target: Any";
    state.currentTarget = targetName;

    // --- 4. SHOW MODAL ---
    const modal = document.getElementById('task-modal');
    const modalText = document.getElementById('modal-target-text');
    const goBtn = document.getElementById('btn-start-task');

    if (modal && modalText && goBtn) {
        state.isModalOpen = true;
        if (typeof stopSound === 'function') stopSound();

        modalText.textContent = `Find: ${targetName}`;
        modal.style.display = 'block';

        // --- 5. THE "GO" HANDLER (WITH FIX) ---
        const handleGo = (e) => {
            e.stopPropagation();
            e.preventDefault();

            state.isModalOpen = false;
            modal.style.display = 'none';

            // A. Resume Audio Context
            if (state.audioContext && state.audioContext.state === 'suspended') {
                state.audioContext.resume();
            }

    
            if (typeof enterLevel === 'function') {
                console.log("Forcing Audio Sync for New Task...");

                // 1. Force Entry (updates audio buffers)
                enterLevel(state.currentDataNode, "Genres");

                // 2. Patch Navigation Stack (Fix the side-effect)
                // enterLevel usually adds to history, but we are at Root (Level 0).
                // So we manually reset the stack to keep it clean.
                state.navigationPath = [];
                state.navigationLevel = 0;

                // 3. Update Status Text
                const statusDiv = document.getElementById('status');
                if (statusDiv) {
                    statusDiv.textContent = state.experimentMode === 'ALWAYS_ON'
                        ? "Genres. Tap to Select."
                        : "Genres. Hold to Browse.";
                }
            }
            // ========================================================

            if (typeof startTaskTimer === 'function') startTaskTimer();
        };

        const newBtn = goBtn.cloneNode(true);
        goBtn.parentNode.replaceChild(newBtn, goBtn);
        newBtn.addEventListener('touchstart', handleGo, { passive: false });
        newBtn.addEventListener('click', handleGo);
    }
}

// 2. Start Timer
function startTaskTimer() {
    state.isTaskActive = true;
    state.taskStartTime = Date.now();

    // Update HUD
    document.getElementById('target-display').textContent = `Find: ${state.currentTarget}`;
    document.getElementById('target-display').style.color = "cyan";

    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
        const elapsed = (Date.now() - state.taskStartTime) / 1000;
        document.getElementById('timer-display').textContent = elapsed.toFixed(1) + "s";
    }, 100);
}

// 3. Check Success
function checkSuccess(selectedItemName) {
    if (!state.isTaskActive) return;

    if (selectedItemName === state.currentTarget) {
        completeTask();
    }
}

// 4. Victory!
function completeTask() {
    state.isTaskActive = false;
    clearInterval(state.timerInterval);

    const finalTime = (Date.now() - state.taskStartTime) / 1000;

    // UI Feedback
    document.getElementById('target-display').textContent = "SUCCESS!";
    document.getElementById('target-display').style.color = "#00FF00";
    document.getElementById('timer-display').textContent = `Time: ${finalTime}s`;

    // Vibrate
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);

    // Play Victory Sound (Synthesized Major Triad)
    playVictorySound();

    // Allow user to relax before next task
    setTimeout(() => {
        alert(`Target Found!\nTime: ${finalTime}s\n\nClick OK to set up the next task.`);
        prepareNextTask();
    }, 500);
}

// 5. Synthesized Victory Sound (No file needed)
function playVictorySound() {
    if (!state.audioContext) return;
    const ctx = state.audioContext;

    const now = ctx.currentTime;
    // Play C - E - G (C Major)
    [261.63, 329.63, 392.00, 523.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'sine';

        gain.gain.setValueAtTime(0.1, now + (i * 0.1));
        gain.gain.exponentialRampToValueAtTime(0.001, now + (i * 0.1) + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + (i * 0.1));
        osc.stop(now + (i * 0.1) + 0.4);
    });
}