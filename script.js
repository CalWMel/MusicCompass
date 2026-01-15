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
    pausedSector: -1
};

// --- DOM ELEMENTS ---
const startBtn = document.getElementById('btn-start');
const uiContainer = document.getElementById('ui-container');
const statusDiv = document.getElementById('status');
const sectorDiv = document.getElementById('sector-display');

// --- INITIALIZATION ---
startBtn.addEventListener('click', async () => {
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
    
    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('devicemotion', handleShake); // For "Back" gesture
    
    const engage = (e) => engageClutch(e);
    const disengage = (e) => disengageClutch(e);

    window.addEventListener('touchstart', engage, {passive: false});
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

function playSectorSound(sectorIndex, startOffset = 0) { // <--- NEW PARAMETER
    if (!state.audioContext || !state.currentBufferSet[sectorIndex]) return;

    stopSound(); 

    const ctx = state.audioContext;
    const source = ctx.createBufferSource();
    source.buffer = state.currentBufferSet[sectorIndex];
    
    // Track when this specific playback started
    // (Current Clock Time minus how many seconds we skipped)
    state.playbackStartTime = ctx.currentTime - startOffset;

    if (state.navigationLevel === 0) {
        source.loop = true;
    } else {
        source.loop = false;
    }

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
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
    
    // --- START AT THE OFFSET ---
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
    // ... (keep alpha calculation code) ...
    let alpha = event.alpha;
    if (alpha === null) return;
    let angle = 360 - alpha;
    angle = angle % 360;
    if (angle < 0) angle += 360;
    state.lastRawAngle = angle;

    // FIX: Check isBrowsing instead of isClutched
    // This freezes the sector during a quick tap
    if (!state.isBrowsing) return; 

    // ... (rest of function is the same) ...
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
    // Check if the sector is valid in our data (e.g. if a genre has no children, we handle it?)
    // For now, we assume 8 items always exist or are undefined.
    
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
    if (e.cancelable) e.preventDefault(); 
    state.touchStartTime = Date.now();

    // 1. We are touching, but NOT browsing yet.
    state.isClutched = true;
    state.isBrowsing = false; 

    // Calibration (Keep this immediate so we have a reference)
    if (!state.hasCalibrated) {
        state.calibratedOffset = state.lastRawAngle;
        state.hasCalibrated = true;
    }

    // 2. Wait 200ms to see if it's a Hold
    if (state.clutchDebounce) clearTimeout(state.clutchDebounce);
    
    state.clutchDebounce = setTimeout(() => {
        if (state.isClutched) {
            // User held long enough -> START BROWSING
            state.isBrowsing = true; 
            
            // Visuals
            statusDiv.textContent = `Browsing ${state.parentName}...`;
            statusDiv.style.color = "#4CAF50";

            // Audio
            // Now that isBrowsing is true, handleOrientation will update the sector
            // But we might need to trigger the first sound manually
            if (state.currentSector !== -1) playSectorSound(state.currentSector);
        }
    }, 200); 
}

function disengageClutch(e) {
    state.isClutched = false;
    state.isBrowsing = false; // <--- Stop the compass immediately

    if (state.clutchDebounce) {
        clearTimeout(state.clutchDebounce);
        state.clutchDebounce = null;
    }

    const touchDuration = Date.now() - state.touchStartTime;

    if (touchDuration < 250) {
        handleSelection();
    } else {
        // --- HOLD RELEASE ---
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
    // 1. Grab the item for the sector you are CURRENTLY facing
    // (We use this for drilling down, but NOT for resuming if we moved)
    const currentFacingItem = state.currentDataNode[state.currentSector];
    if (!currentFacingItem) return;

    // SCENARIO 1: DRILL DOWN (Genres/Artists)
    if (currentFacingItem.children && currentFacingItem.children.length > 0) {
        stopSound(); 
        
        statusDiv.textContent = `Selected: ${currentFacingItem.name}`;
        statusDiv.style.color = "cyan";
        playConfirmationSound();
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
        
        enterLevel(currentFacingItem.children, currentFacingItem.name);
        return;
    } 
    
    // SCENARIO 2: TRACK LAYER (Toggle Pause/Resume)
    if (state.navigationLevel === 2) {
        
        if (state.activeSource) {
            // --- PAUSE ---
            state.pauseOffset = state.audioContext.currentTime - state.playbackStartTime;
            state.pausedSector = state.currentSector; // <--- LOCK THE SECTOR
            
            stopSound();
            statusDiv.textContent = `Paused: ${currentFacingItem.name}`;
            statusDiv.style.color = "yellow";
        } 
        else {
            // --- RESUME ---
            playConfirmationSound();
            
            setTimeout(() => {
                // Because we used isBrowsing, currentSector is safely pointing 
                // to the song we paused (or the one we last browsed to).
                
                // 1. Priority: Locked Sector -> Current Sector
                const targetSector = (state.pausedSector !== -1) ? state.pausedSector : state.currentSector;
                const targetItem = state.currentDataNode[targetSector];

                // 2. Play
                playSectorSound(targetSector, state.pauseOffset);
                
                statusDiv.textContent = `Now Playing: ${targetItem.name}`;
                statusDiv.style.color = "#00FF00";
            }, 100);
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
    // 1. Save Current State to History Stack
    state.historyStack.push({
        node: state.currentDataNode,
        name: state.parentName,
        level: state.navigationLevel
    });

    // 2. Update State
    state.navigationLevel++;
    state.currentDataNode = newData;
    state.parentName = title;
    state.currentSector = -1; 

    // 3. Load New Audio
    statusDiv.textContent = `Loading ${title}...`;
    await loadCurrentLevelBuffers();
    
    statusDiv.textContent = `${title}. Hold to Browse.`;
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
    // Requires 3 back-and-forth movements.
    if (shakeCount >= 3) {
        goBack();
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
        statusDiv.textContent = `${state.parentName}. Hold to Browse.`;
    }
}