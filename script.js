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
    lastInteractionTime: 0
};

// --- CONFIGURATION ---
// Task 5: Oscillator configurations
const SECTOR_SOUNDS = [
    { type: 'sawtooth', freq: 110 }, // Sector 0 (Rock)
    { type: 'sine',     freq: 261 }, // Sector 1 (Pop)
    { type: 'square',   freq: 293 }, // Sector 2 (HipHop)
    { type: 'triangle', freq: 329 }, // Sector 3 (Jazz)
    { type: 'sawtooth', freq: 392 }, // Sector 4 (Classical)
    { type: 'sine',     freq: 440 }, // Sector 5 (Metal)
    { type: 'square',   freq: 493 }, // Sector 6 (Electronic)
    { type: 'triangle', freq: 523 }  // Sector 7 (Folk)
];

// --- DOM ELEMENTS ---
const startBtn = document.getElementById('btn-start');
const uiContainer = document.getElementById('ui-container');
const statusDiv = document.getElementById('status');
const sectorDiv = document.getElementById('sector-display');

// --- INITIALIZATION ---
startBtn.addEventListener('click', async () => {
    initAudio();
    // iOS Permission Request (Safe to keep for compatibility)
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
    
    // Using passive: false to prevent scrolling/zooming while clutching
    window.addEventListener('touchstart', engageClutch, {passive: false});
    window.addEventListener('touchend', disengageClutch);
    window.addEventListener('mousedown', engageClutch);
    window.addEventListener('mouseup', disengageClutch);
    
    // Selection listener
    window.addEventListener('click', handleSelectionClick);
}

// --- AUDIO ENGINE ---
function initAudio() {
    if (state.isAudioInitialized) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContext();
    if (state.audioContext.state === 'suspended') state.audioContext.resume();
    state.isAudioInitialized = true;
}

function playSectorSound(sectorIndex) {
    if (!state.audioContext) return;
    stopSound(); // Sequential Mode: stop previous first

    const soundConfig = SECTOR_SOUNDS[sectorIndex];
    const ctx = state.audioContext;

    const osc = ctx.createOscillator();
    osc.type = soundConfig.type;
    osc.frequency.setValueAtTime(soundConfig.freq, ctx.currentTime);

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10000;
    
    // FIX: Ensure sectors are positioned logically clockwise
    // Sector 0 = North (0,0,-1)
    // Sector 2 = East (1,0,0)
    const angleRad = (sectorIndex * 45) * (Math.PI / 180);
    const x = Math.sin(angleRad) * 2;
    const z = -Math.cos(angleRad) * 2;
    panner.setPosition(x, 0, z);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.1);

    osc.connect(panner);
    panner.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    state.activeOscillator = { node: osc, gain: gainNode };
}

function stopSound() {
    if (state.activeOscillator) {
        const { node, gain } = state.activeOscillator;
        const now = state.audioContext.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        node.stop(now + 0.1);
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
    
    // FIX 1: INVERT ROTATION
    // If rotating right counted down (7,6,5), we invert the input angle.
    // 360 - event.alpha makes clockwise rotation increase the value.
    let angle = 360 - event.alpha; 
    
    // Normalize to 0-360
    angle = angle % 360;
    if (angle < 0) angle += 360;

    if (state.isClutched) {
        state.rawAlpha = angle;
        // Update listener to match the inverted logic
        updateListener(angle - state.calibratedOffset);
        calculateSector(angle);
    }
}

function updateListener(relativeAngle) {
    if (!state.audioContext) return;
    const rad = relativeAngle * (Math.PI / 180);
    // Listener faces the relative angle
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
    if (e.cancelable) e.preventDefault(); 
    
    // Calibration on first touch
    // This sets "Forward" to wherever you are currently facing
    if (state.calibratedOffset === 0 && state.rawAlpha !== 0) {
        state.calibratedOffset = state.rawAlpha;
    }

    if (state.audioContext && state.audioContext.state === 'suspended') {
        state.audioContext.resume();
    }

    state.isClutched = true;
    statusDiv.textContent = "Clutch ENGAGED (Browsing)";
    statusDiv.style.color = "#4CAF50";
    
    calculateSector(state.rawAlpha, true);
}

function disengageClutch(e) {
    state.isClutched = false;
    // Don't change text immediately to "Paused" if we just selected
    // We let the selection logic handle text if it was a tap
    setTimeout(() => {
        // Only show "Paused" if we haven't just triggered a selection
        if (!statusDiv.textContent.includes("SELECTED")) {
            statusDiv.textContent = "Clutch DISENGAGED (Paused)";
            statusDiv.style.color = "#fff";
        }
    }, 50); // Short delay to allow click event to process first
    
    stopSound();
}

function handleSelectionClick(e) {
    // Logic: If we are NOT holding the screen (isClutched = false)
    // AND we have a valid sector selected, confirm it.
    if (!state.isClutched && state.currentSector !== -1) {
        confirmSelection(state.currentSector);
    }
}

function confirmSelection(sector) {
    statusDiv.textContent = `SELECTED: Sector ${sector}`;
    statusDiv.style.color = "cyan"; // Bright feedback
    
    // Feedback
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    playConfirmationSound();
    
    console.log(`Selection Confirmed: ${sector}`);
}

function calculateSector(angle, forcePlay = false) {
    // 1. Apply Calibration
    let calibratedAngle = angle - state.calibratedOffset;
    
    // 2. Normalize 0-360
    while (calibratedAngle < 0) calibratedAngle += 360;
    while (calibratedAngle >= 360) calibratedAngle -= 360;

    // FIX 2: CENTERING SECTORS
    // Sector 0 is 45deg wide. We want "Forward" (0deg) to be the CENTER.
    // So Sector 0 should span from -22.5 to +22.5.
    // We shift the angle by +22.5 before dividing.
    // effectively: floor((angle + 22.5) / 45)
    let sector = Math.floor((calibratedAngle + 22.5) / 45) % 8;
    
    if (sector !== state.currentSector || forcePlay) {
        state.currentSector = sector;
        updateUI();
        
        if (navigator.vibrate) navigator.vibrate(15); // Light tick
        playSectorSound(sector);
    }
}

function updateUI() {
    const genreNames = ["Rock", "Pop", "HipHop", "Jazz", "Classical", "Metal", "Electronic", "Folk"];
    sectorDiv.textContent = `${state.currentSector} (${genreNames[state.currentSector]})`;
}