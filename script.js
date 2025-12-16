// --- STATE MANAGEMENT ---
const state = {
    isClutched: false,
    rawAlpha: 0,
    calibratedOffset: 0,
    currentSector: -1,
    sectorCount: 8,
    audioContext: null,
    activeOscillator: null,
    isAudioInitialized: false,
    // NEW: Interaction Timing
    touchStartTime: 0
};

// --- CONFIGURATION ---
// Map sector indices to file paths
const AUDIO_FILES = [
    'assets/rock.mp3', // Rock
    'assets/pop.mp3', // Pop
    'assets/hiphop.mp3', // HipHop
    'assets/jazz.mp3', // Jazz
    'assets/classical.mp3', // Classical
    'assets/metal.mp3', // Metal
    'assets/electronic.mp3', // Electronic
    'assets/folk.mp3'  // Folk
];

const audioBuffers = []; // We will store loaded sounds here

// --- DOM ELEMENTS ---
const startBtn = document.getElementById('btn-start');
const uiContainer = document.getElementById('ui-container');
const statusDiv = document.getElementById('status');
const sectorDiv = document.getElementById('sector-display');

// --- INITIALIZATION ---
startBtn.addEventListener('click', async () => {
    initAudio();
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') initApp();
            else alert("Permission denied.");
        } catch (error) { initApp(); }
    } else {
        initApp();
    }
});

function initApp() {
    startBtn.style.display = 'none';
    uiContainer.style.display = 'block';
    
    window.addEventListener('deviceorientation', handleOrientation);
    
    // Unified Touch/Mouse Handlers
    // We strictly control the events to avoid conflicts
    const engage = (e) => engageClutch(e);
    const disengage = (e) => disengageClutch(e);

    window.addEventListener('touchstart', engage, {passive: false});
    window.addEventListener('touchend', disengage);
    
    // Mouse fallbacks for testing on PC
    window.addEventListener('mousedown', engage);
    window.addEventListener('mouseup', disengage);
}

// --- AUDIO ENGINE ---
async function initAudio() {
    if (state.isAudioInitialized) return;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContext({ latencyHint: 'interactive' }); // Optimize for latency
    
    if (state.audioContext.state === 'suspended') state.audioContext.resume();
    
    // Pre-load all audio files
    statusDiv.textContent = "Loading Audio...";
    try {
        await loadAllBuffers();
        statusDiv.textContent = "Audio Loaded. Ready.";
        state.isAudioInitialized = true;
    } catch (e) {
        statusDiv.textContent = "Error loading audio.";
        console.error(e);
    }
}

async function loadAllBuffers() {
    const promises = AUDIO_FILES.map(async (url, index) => {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
        audioBuffers[index] = audioBuffer;
    });
    await Promise.all(promises);
}

function playSectorSound(sectorIndex) {
    if (!state.audioContext || !audioBuffers[sectorIndex]) return;

    stopSound(); // Ensure overlap doesn't get messy (Sequential Mode)

    const ctx = state.audioContext;
    
    // Create Source from Buffer
    const source = ctx.createBufferSource();
    source.buffer = audioBuffers[sectorIndex];
    source.loop = true; // Loop the musicon while hovering

    // Create Panner (HRTF)
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    panner.coneInnerAngle = 360;

    // Position logic (Same as before)
    const angleRad = (sectorIndex * 45) * (Math.PI / 180);
    const x = Math.sin(angleRad) * 2;
    const z = -Math.cos(angleRad) * 2;
    panner.setPosition(x, 0, z);

    // Gain for Fade In/Out
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1); // 100ms Fade in

    // Connect Graph
    source.connect(panner);
    panner.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start();
    
    // Store active node to stop it later
    state.activeOscillator = { node: source, gain: gainNode };
}

function stopSound() {
    if (state.activeOscillator) {
        const { node, gain } = state.activeOscillator;
        const now = state.audioContext.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.05); // Fast release
        node.stop(now + 0.05);
        state.activeOscillator = null;
    }
}

function playConfirmationSound() {
    if (!state.audioContext) return;
    const ctx = state.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); 
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
}

// --- INTERACTION LOGIC ---

function handleOrientation(event) {
    if (event.alpha === null) return;
    
    // Invert Rotation: 360 - alpha
    let angle = 360 - event.alpha; 
    
    angle = angle % 360;
    if (angle < 0) angle += 360;

    if (state.isClutched) {
        state.rawAlpha = angle;
        updateListener(angle - state.calibratedOffset);
        calculateSector(angle);
    }
}

function updateListener(relativeAngle) {
    if (!state.audioContext) return;
    const rad = relativeAngle * (Math.PI / 180);
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

function engageClutch(e) {
    if (e.cancelable) e.preventDefault(); // Prevents scroll & system click
    
    // 1. Record start time
    state.touchStartTime = Date.now();

    // 2. Calibration (First time only)
    if (state.calibratedOffset === 0 && state.rawAlpha !== 0) {
        state.calibratedOffset = state.rawAlpha;
    }

    if (state.audioContext && state.audioContext.state === 'suspended') {
        state.audioContext.resume();
    }

    // 3. Start Browsing
    state.isClutched = true;
    statusDiv.textContent = "Clutch ENGAGED (Browsing)";
    statusDiv.style.color = "#4CAF50";
    
    calculateSector(state.rawAlpha, true);
}

function disengageClutch(e) {
    state.isClutched = false;
    
    // 1. Calculate how long the user held the screen
    const touchDuration = Date.now() - state.touchStartTime;
    const TAP_THRESHOLD = 250; // ms

    if (touchDuration < TAP_THRESHOLD) {
        // --- IT WAS A TAP (SELECT) ---
        stopSound(); // Cut the browsing sound
        if (state.currentSector !== -1) {
            confirmSelection(state.currentSector);
        }
    } else {
        // --- IT WAS A HOLD (STOP BROWSING) ---
        statusDiv.textContent = "Clutch DISENGAGED (Paused)";
        statusDiv.style.color = "#fff";
        stopSound();
    }
}

function confirmSelection(sector) {
    // Visual Feedback
    statusDiv.textContent = `SELECTED: Sector ${sector}`;
    statusDiv.style.color = "cyan";
    
    // Haptic Feedback
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    
    // Audio Feedback
    playConfirmationSound();
    
    console.log(`Selection Confirmed: ${sector}`);
}

function calculateSector(angle, forcePlay = false) {
    // 1. Apply Calibration
    let calibratedAngle = angle - state.calibratedOffset;
    
    // 2. Normalize
    while (calibratedAngle < 0) calibratedAngle += 360;
    while (calibratedAngle >= 360) calibratedAngle -= 360;

    // 3. Center the sector (Offset by +22.5 deg)
    let sector = Math.floor((calibratedAngle + 22.5) / 45) % 8;
    
    if (sector !== state.currentSector || forcePlay) {
        state.currentSector = sector;
        updateUI();
        
        if (navigator.vibrate) navigator.vibrate(15);
        playSectorSound(sector);
    }
}

function updateUI() {
    const genreNames = ["Rock", "Pop", "HipHop", "Jazz", "Classical", "Metal", "Electronic", "Folk"];
    sectorDiv.textContent = `${state.currentSector} (${genreNames[state.currentSector]})`;
}