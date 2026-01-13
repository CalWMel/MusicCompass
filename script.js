// --- CONFIGURATION ---
const SECTOR_COUNT = 8;
const SECTOR_SIZE = 360 / SECTOR_COUNT; 
const HYSTERESIS_THRESHOLD = 8; 
const SELECT_SOUND_FILE = 'assets/select.mp3';
const BACK_SOUND_FILE = 'assets/back.mp3';

// --- STATE MANAGEMENT ---
const state = {
    // Audio Engine
    audioContext: null,
    currentBufferSet: [],   // The sounds for the CURRENT level (Genre or Artist)
    selectBuffer: null,
    backBuffer: null,
    isAudioInitialized: false,
    
    // Navigation State
    navigationLevel: 0,     // 0 = Genres, 1 = Artists
    currentDataNode: MUSIC_LIBRARY, // Points to the current list of items
    parentName: "Library",  // For UI display ("Library" or "Rock")

    // Interaction State
    isClutched: false,
    currentSector: -1,
    touchStartTime: 0,
    
    // Calibration
    hasCalibrated: false,
    lastRawAngle: 0,
    calibratedOffset: 0,
    
    // Playback
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

async function loadCurrentLevelBuffers() {
    // Map the current data node (e.g., list of genres) to their audio URLs
    const promises = state.currentDataNode.map(async (item, index) => {
        try {
            // In a real app, you might want to cache these
            const response = await fetch(item.audio);
            const arrayBuffer = await response.arrayBuffer();
            return await state.audioContext.decodeAudioData(arrayBuffer);
        } catch (err) {
            console.error(`Missing audio for ${item.name}`, err);
            return null; // Handle missing files gracefully
        }
    });
    
    state.currentBufferSet = await Promise.all(promises);
}

async function loadSelectSound() {
    try {
        // 1. Load Selection Sound
        let response = await fetch(SELECT_SOUND_FILE);
        let arrayBuffer = await response.arrayBuffer();
        state.selectBuffer = await state.audioContext.decodeAudioData(arrayBuffer);

        // 2. Load Back Sound (CHECK THIS PART)
        response = await fetch(BACK_SOUND_FILE);
        arrayBuffer = await response.arrayBuffer();
        state.backBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
        
        console.log("UI Sounds Loaded"); // Check console for this!
    } catch (err) {
        console.error("UI sounds missing or failed to decode", err);
    }
}

function playSectorSound(sectorIndex) {
    if (!state.audioContext || !state.currentBufferSet[sectorIndex]) return;

    stopSound(); 

    const ctx = state.audioContext;
    const source = ctx.createBufferSource();
    source.buffer = state.currentBufferSet[sectorIndex];
    source.loop = true;

    // HRTF Panner
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
    source.start();
    
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
    let alpha = event.alpha;
    if (alpha === null) return;

    let angle = 360 - alpha;
    angle = angle % 360;
    if (angle < 0) angle += 360;

    state.lastRawAngle = angle;

    if (!state.isClutched) return;

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

    if (!state.hasCalibrated) {
        state.calibratedOffset = state.lastRawAngle;
        state.hasCalibrated = true;
    }

    state.isClutched = true;
    statusDiv.textContent = `Browsing ${state.parentName}...`;
    statusDiv.style.color = "#4CAF50";

    if (state.currentSector !== -1) {
        playSectorSound(state.currentSector);
    }
}

function disengageClutch(e) {
    state.isClutched = false;
    const touchDuration = Date.now() - state.touchStartTime;

    if (touchDuration < 250) {
        // --- TAP = SELECT / DRILL DOWN ---
        handleSelection();
    } else {
        // --- HOLD RELEASE = PAUSE ---
        statusDiv.textContent = "Paused";
        statusDiv.style.color = "#fff";
        stopSound();
    }
}

async function handleSelection() {
    stopSound();
    
    const selectedItem = state.currentDataNode[state.currentSector];
    if (!selectedItem) return;

    // Visual & Audio Feedback
    statusDiv.textContent = `Selected: ${selectedItem.name}`;
    statusDiv.style.color = "cyan";
    playConfirmationSound();
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);

    // LOGIC: Drill Down vs Play
    if (state.navigationLevel === 0) {
        // We are at Root (Genres) -> Go to Level 1 (Artists)
        if (selectedItem.children && selectedItem.children.length > 0) {
            enterLevel(selectedItem.children, selectedItem.name);
        } else {
            console.log("No children for this genre.");
        }
    } else {
        // We are at Level 1 (Artists) -> Just Play (Leaf node)
        console.log(`Playing Track: ${selectedItem.name}`);
        // Here you would trigger the full song player in the future
    }
}

async function enterLevel(newData, title) {
    // 1. Update State
    state.navigationLevel++;
    state.currentDataNode = newData;
    state.parentName = title;
    state.currentSector = -1; // Reset sector so we don't start playing instantly

    // 2. Load New Audio
    statusDiv.textContent = `Loading ${title}...`;
    await loadCurrentLevelBuffers();
    
    statusDiv.textContent = `Inside ${title}. Hold to Browse.`;
    
    // 3. Re-Calibrate?
    // Design Choice: Do we keep the same "North" or reset it?
    // Let's keep "North" (Absolute) for spatial memory consistency.
}

// --- BACK GESTURE (SHAKE) ---
let lastX = 0, lastY = 0, lastZ = 0;
let lastShakeTime = 0;

function handleShake(event) {
    // Simple Shake Detection
    const current = event.accelerationIncludingGravity;
    if (!current) return;
    
    const now = Date.now();
    if ((now - lastShakeTime) < 1000) return; // Debounce 1s

    const deltaX = Math.abs(lastX - current.x);
    const deltaY = Math.abs(lastY - current.y);
    const deltaZ = Math.abs(lastZ - current.z);

    if ((deltaX + deltaY + deltaZ) > 25) { // Threshold
        goBack();
        lastShakeTime = now;
    }

    lastX = current.x;
    lastY = current.y;
    lastZ = current.z;
}

async function goBack() {
    if (state.navigationLevel > 0) {
        // Debugging line: tells us if the function is even running
        console.log("Going Back..."); 

        stopSound();
        
        // --- PLAY BACK SOUND ---
        if (state.backBuffer) {
            const src = state.audioContext.createBufferSource();
            src.buffer = state.backBuffer;
            src.connect(state.audioContext.destination);
            src.start();
        } else {
            console.warn("Back sound not loaded yet!");
        }
        
        // Haptic Feedback
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]); 
        
        // Navigation Logic
        state.navigationLevel = 0;
        state.currentDataNode = MUSIC_LIBRARY;
        state.parentName = "Library";
        state.currentSector = -1;

        statusDiv.textContent = "Returning to Library...";
        await loadCurrentLevelBuffers();
        statusDiv.textContent = "Library. Hold to Browse.";
    }
}