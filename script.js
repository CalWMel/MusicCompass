// --- MOBILE DEBUGGING CONSOLE ---
(function() {
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
    console.log = function(msg) { logToScreen(msg); oldLog.apply(console, arguments); };

    var oldError = console.error;
    console.error = function(msg) { logToScreen(msg, '#ff4444'); oldError.apply(console, arguments); };
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

    // NEW FLAGS
    isLoading: false,  
    lastTapTime: 0,        
};

// --- DOM ELEMENTS ---
const startBtn = document.getElementById('btn-start');
const uiContainer = document.getElementById('ui-container');
const statusDiv = document.getElementById('status');
const sectorDiv = document.getElementById('sector-display');

// --- INITIALIZATION ---
startBtn.addEventListener('click', async () => {
    // 1. CAPTURE THE SELECTED MODE
    const selector = document.getElementById('mode-select');
    state.experimentMode = selector.value;
    
    // Hide the setup controls
    document.getElementById('setup-controls').style.display = 'none';

    await initAudio();
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') initApp();
            else alert("Permission denied.");
        } catch (error) { initApp(); }
    } else { initApp(); }
});

function initApp() {
    startBtn.style.display = 'none';
    uiContainer.style.display = 'block';
    
    // EXPERIMENT SETUP
    if (state.experimentMode === 'ALWAYS_ON') {
        state.isBrowsing = true; // Compass is active by default
        statusDiv.textContent = "Always-On Mode. Tap to Select.";
    } else {
        state.isBrowsing = false; // Wait for clutch
    }

    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('devicemotion', handleShake); 
    
    const engage = (e) => engageClutch(e);
    const disengage = (e) => disengageClutch(e);

    window.addEventListener('touchstart', engage, {passive: false});
    window.addEventListener('touchend', disengage);
    window.addEventListener('mousedown', engage);
    window.addEventListener('mouseup', disengage);

    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        
        state.isSystemSuspended = !state.isSystemSuspended;

        if (state.isSystemSuspended) {
            // --- GOING IDLE (STOP) ---
            
            // 1. Save current playback time so we don't restart songs
            if (state.activeSource) {
                 state.pauseOffset = state.audioContext.currentTime - state.playbackStartTime;
            }

            stopSound();
            
            toggleBtn.textContent = "Resume Browsing";
            toggleBtn.style.background = "#4CAF50"; // Green
            statusDiv.textContent = "System Paused (Idle)";
            statusDiv.style.color = "#888";
            
            if (navigator.vibrate) navigator.vibrate(50);

        } else {
            // --- WAKING UP (RESUME) ---
            toggleBtn.textContent = "Stop Browsing";
            toggleBtn.style.background = "#ff4444"; // Red
            
            // 1. RESTORE CORRECT TEXT UI
            // We check the state flags to decide what to show
            if (state.navigationLevel === 2) {
                // We are in Track Layer
                const item = state.currentDataNode[state.currentSector];
                const name = item ? item.name : "Unknown";
                
                if (state.isLocked) {
                    statusDiv.textContent = `Locked: ${name}`;
                    statusDiv.style.color = "#00FF00";
                } else if (state.isManualPause) {
                    statusDiv.textContent = `Paused: ${name}`;
                    statusDiv.style.color = "yellow";
                } else {
                    statusDiv.textContent = `Now Playing: ${name}`;
                    statusDiv.style.color = "#00FF00";
                }
            } else {
                // We are in Genre/Artist Layer
                if (state.experimentMode === 'ALWAYS_ON') {
                    statusDiv.textContent = `${state.parentName}. Tap to Select.`;
                } else {
                    statusDiv.textContent = `${state.parentName}. Hold to Browse.`;
                }
                statusDiv.style.color = "#fff";
            }

            // 2. RESUME AUDIO (If allowed)
            // CRITICAL: Do NOT play if the user had Manually Paused the track.
            if (!state.isManualPause && state.currentSector !== -1) {
                playSectorSound(state.currentSector, state.pauseOffset);
            }
            
            // Note: We removed 'state.hasCalibrated = false' so no more jumping!
        }
    });
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
    // FIX: Hard Lock. If locked, ignore all compass movement.
    // This keeps the song playing even if you turn 180 degrees.
    if (state.isLocked) return;

    // (Keep the isManualPause check if you want, but isLocked covers it)
    if (state.isManualPause) return;

    if (state.currentSector !== newSector) {
        state.currentSector = newSector;
        
        const item = state.currentDataNode[newSector];
        const name = item ? item.name : "Empty";
        
        sectorDiv.textContent = `${newSector} (${name})`;
        
        if (navigator.vibrate) navigator.vibrate(15);
        playSectorSound(newSector);
    }
}

function engageClutch(e) {

    if (e.target.closest('#btn-system-toggle')) return;

    if (state.isSystemSuspended) return;

    if (e.cancelable) e.preventDefault(); 
    
    // --- BRANCH 1: ALWAYS-ON MODE ---
    if (state.experimentMode === 'ALWAYS_ON') {
        const now = Date.now();
        // FIX: Debounce to prevent double-firing (Touch + Mouse)
        if (now - state.lastTapTime < 200) return; 
        state.lastTapTime = now;

        handleSelection();
        return;
    }

    // --- BRANCH 2: CLUTCH MODE (Original Logic) ---
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

    // SCENARIO 1: DRILL DOWN (Genres/Artists)
    if (currentFacingItem.children && currentFacingItem.children.length > 0) {
        stopSound(); 
        state.isManualPause = false; 
        state.isLocked = false; // Reset lock
        
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
            
            statusDiv.textContent = `Locked: ${currentFacingItem.name}`;
            statusDiv.style.color = "#00FF00"; // Green
            playConfirmationSound();
            // Note: We don't need to start/stop audio. It's already playing.
            // Now it just won't change when you move.
            return;
        }

        // --- B. IF LOCKED -> TOGGLE PAUSE ---
        
        if (state.isManualPause) {
            // RESUME (Still Locked)
            state.isManualPause = false;
            playConfirmationSound();
            
            setTimeout(() => {
                // Since we are locked, currentSector is still the correct song
                playSectorSound(state.currentSector, state.pauseOffset);
                statusDiv.textContent = `Locked: ${currentFacingItem.name}`;
                statusDiv.style.color = "#00FF00";
            }, 100);
        } else {
            // PAUSE (Still Locked)
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
            playSectorSound(state.currentSector); // Restart audio tracking
            statusDiv.textContent = "Unlocked. Tilt to Browse.";
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