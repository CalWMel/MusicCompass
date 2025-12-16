// --- CONFIGURATION ---
const SECTOR_COUNT = 8;
const SECTOR_SIZE = 360 / SECTOR_COUNT; // 45 degrees
const HYSTERESIS_THRESHOLD = 8; // Degrees of "stickiness" to prevent jitter

// Your specific filenames
const AUDIO_FILES = [
    'assets/rock.mp3',       // Sector 0
    'assets/pop.mp3',        // Sector 1
    'assets/hiphop.mp3',     // Sector 2
    'assets/jazz.mp3',       // Sector 3
    'assets/classical.mp3',  // Sector 4
    'assets/metal.mp3',      // Sector 5
    'assets/electronic.mp3', // Sector 6
    'assets/folk.mp3'        // Sector 7
];
const SELECT_SOUND_FILE = 'assets/select.mp3';

// --- STATE MANAGEMENT ---
const state = {
    audioContext: null,
    audioBuffers: [],
    selectBuffer: null,
    isAudioInitialized: false,
    
    isClutched: false,
    currentSector: -1,
    
    // NEW: Calibration State
    hasCalibrated: false,   // Have we set the "Front" yet?
    lastRawAngle: 0,        // Always tracks phone angle (even when paused)
    calibratedOffset: 0,    // The angle we treat as "North" (Sector 0)
    
    touchStartTime: 0,
    activeSource: null,
    activeGain: null
};

// --- DOM ELEMENTS ---
const startBtn = document.getElementById('btn-start');
const uiContainer = document.getElementById('ui-container');
const statusDiv = document.getElementById('status');
const sectorDiv = document.getElementById('sector-display');

// --- INITIALIZATION ---
startBtn.addEventListener('click', async () => {
    console.log("Start button clicked");
    
    // Initialize Audio (User Gesture Required)
    await initAudio();
    
    // Request Sensors (iOS/Android specific)
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                initApp();
            } else {
                alert("Permission denied. The app needs orientation sensors.");
            }
        } catch (error) {
            console.error(error);
            // On some Android devices, requestPermission exists but throws error
            // We try to init anyway.
            initApp();
        }
    } else {
        // Non-iOS devices (Standard Android)
        initApp();
    }
});

function initApp() {
    startBtn.style.display = 'none';
    uiContainer.style.display = 'block';
    
    window.addEventListener('deviceorientation', handleOrientation);
    
    // Touch Handlers
    const engage = (e) => engageClutch(e);
    const disengage = (e) => disengageClutch(e);

    window.addEventListener('touchstart', engage, {passive: false});
    window.addEventListener('touchend', disengage);
    
    // Mouse fallbacks for PC testing
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
    
    try {
        await loadAllBuffers();
        statusDiv.textContent = "Audio Ready. Hold screen to explore.";
        state.isAudioInitialized = true;
    } catch (e) {
        statusDiv.textContent = "Error loading audio. Check console.";
        console.error("Audio Load Error:", e);
    }
}

async function loadAllBuffers() {
    // Load Genre Sounds
    const genrePromises = AUDIO_FILES.map(async (url, index) => {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to load ${url}`);
            const arrayBuffer = await response.arrayBuffer();
            state.audioBuffers[index] = await state.audioContext.decodeAudioData(arrayBuffer);
        } catch (err) {
            console.error(err);
        }
    });

    // Load Selection Sound
    const selectPromise = (async () => {
        try {
            const response = await fetch(SELECT_SOUND_FILE);
            if (!response.ok) throw new Error(`Failed to load ${SELECT_SOUND_FILE}`);
            const arrayBuffer = await response.arrayBuffer();
            state.selectBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
        } catch (err) {
            console.error("Select sound missing", err);
        }
    })();

    await Promise.all([...genrePromises, selectPromise]);
}

function playSectorSound(sectorIndex) {
    if (!state.audioContext || !state.audioBuffers[sectorIndex]) return;

    // --- FIX: Removed the "Safety Check" that was blocking the sound ---
    // The setSector function guarantees we only get here if the sector changed.
    
    stopSound(); // Crossfade out old sound

    const ctx = state.audioContext;
    const source = ctx.createBufferSource();
    source.buffer = state.audioBuffers[sectorIndex];
    source.loop = true;

    // Spatial Audio (HRTF)
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    
    // Position sound based on sector (0 = North, 2 = East, etc.)
    const angleRad = (sectorIndex * SECTOR_SIZE) * (Math.PI / 180);
    const x = Math.sin(angleRad) * 3;
    const z = -Math.cos(angleRad) * 3;
    panner.setPosition(x, 0, z);

    // Fade In
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 0.1);

    source.connect(panner);
    panner.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    source.start();
    
    state.activeSource = source;
    state.activeGain = gainNode;
}

function stopSound() {
    if (state.activeSource) {
        const oldSource = state.activeSource;
        const oldGain = state.activeGain;
        const ctx = state.audioContext;
        
        // Fade out
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
    let alpha = event.alpha;
    if (alpha === null) return;

    // 1. Always calculate raw angle (Inverted for natural feel)
    let angle = 360 - alpha;
    angle = angle % 360;
    if (angle < 0) angle += 360;

    // Store it so we can calibrate instantly on touch
    state.lastRawAngle = angle;

    // 2. Only navigate if clutched
    if (!state.isClutched) return;

    // Apply Calibration
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
    // 1. Determine "Raw" Sector (where we are currently pointing)
    const rawSector = Math.floor(angle / SECTOR_SIZE) % SECTOR_COUNT;
    
    // 2. Initial state: Just take the raw sector
    if (state.currentSector === -1) {
        setSector(rawSector);
        return;
    }

    // 3. Hysteresis: Only change if we are DEEP inside the new sector
    // This prevents flickering at the edges
    const currentCenter = state.currentSector * SECTOR_SIZE;
    let diff = angle - currentCenter;
    
    // Wrap-around math
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    // Threshold: We must go past the boundary by HYSTERESIS_THRESHOLD degrees
    const boundary = (SECTOR_SIZE / 2) + HYSTERESIS_THRESHOLD;

    if (Math.abs(diff) > boundary) {
        setSector(rawSector);
    }
}

function setSector(newSector) {
    if (state.currentSector !== newSector) {
        state.currentSector = newSector;
        
        // Visuals
        const genreNames = ["Rock", "Pop", "HipHop", "Jazz", "Classical", "Metal", "Electronic", "Folk"];
        sectorDiv.textContent = `${newSector} (${genreNames[newSector]})`;
        
        // Haptics
        if (navigator.vibrate) navigator.vibrate(15);
        
        // Audio
        playSectorSound(newSector);
    }
}

function engageClutch(e) {
    if (e.cancelable) e.preventDefault(); 
    
    state.touchStartTime = Date.now();

    // FIX 2: Calibration (Fixes "HipHop is Front")
    // If this is the first touch, set "Front" to be "Rock" (Sector 0)
    if (!state.hasCalibrated) {
        state.calibratedOffset = state.lastRawAngle;
        state.hasCalibrated = true;
        console.log("Calibrated North to: " + state.lastRawAngle);
    }

    state.isClutched = true;
    statusDiv.textContent = "Browsing...";
    statusDiv.style.color = "#4CAF50";

    // FIX 1: Resume Playback (Fixes "Silence on re-touch")
    // If we are already in a sector (e.g., let go on Rock, pressed again on Rock),
    // we must manually restart the sound because the sensor won't detect a "change."
    if (state.currentSector !== -1) {
        playSectorSound(state.currentSector);
    }
}

function disengageClutch(e) {
    state.isClutched = false;
    
    const touchDuration = Date.now() - state.touchStartTime;
    const TAP_THRESHOLD = 250; 

    if (touchDuration < TAP_THRESHOLD) {
        // --- TAP = SELECT ---
        if (state.currentSector !== -1) {
            stopSound(); // <--- ADD THIS LINE (Stops the genre loop)
            
            statusDiv.textContent = `Selected: ${state.currentSector}`;
            statusDiv.style.color = "cyan";
            
            playConfirmationSound(); // Plays the "ding"
            if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
        }
    } else {
        // --- HOLD RELEASE = PAUSE ---
        statusDiv.textContent = "Paused";
        statusDiv.style.color = "#fff";
        stopSound(); // This was already here
    }
}