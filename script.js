// --- STATE MANAGEMENT ---
const state = {
    isClutched: false,      // Task 2: Clutch mechanism
    rawAlpha: 0,            // Raw compass heading (0-360)
    calibratedOffset: 0,    // Reference point for "North" (Task 1 Refinement)
    currentSector: -1,      // Task 3: 0-7
    sectorCount: 8,
    audioContext: null,
    activeOscillator: null, // The currently playing sound source
    isAudioInitialized: false
};

// --- CONFIGURATION ---
// 8 distinct "Musicons" using simple oscillators (Task 5)
const SECTOR_SOUNDS = [
    { type: 'sawtooth', freq: 110 }, // Sector 0 (North) - Low Buzz
    { type: 'sine',     freq: 261 }, // Sector 1 (NE)    - C4
    { type: 'square',   freq: 293 }, // Sector 2 (East)  - D4
    { type: 'triangle', freq: 329 }, // Sector 3 (SE)    - E4
    { type: 'sawtooth', freq: 392 }, // Sector 4 (South) - G4
    { type: 'sine',     freq: 440 }, // Sector 5 (SW)    - A4
    { type: 'square',   freq: 493 }, // Sector 6 (West)  - B4
    { type: 'triangle', freq: 523 }  // Sector 7 (NW)    - C5
];

// --- DOM ELEMENTS ---
const startBtn = document.getElementById('btn-start');
const uiContainer = document.getElementById('ui-container');
const statusDiv = document.getElementById('status');
const sectorDiv = document.getElementById('sector-display');

// --- INITIALIZATION ---
startBtn.addEventListener('click', async () => {
    // 1. Initialize Audio Context (Must be done on user gesture)
    initAudio();

    // 2. Request Sensors (iOS 13+ requirement, ignored by Android/Firefox usually)
    if (typeof DeviceOrientationEvent !== 'undefined' && 
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                initApp();
            } else {
                alert("Permission denied. Compass won't work.");
            }
        } catch (error) {
            console.error(error);
            // Fallback if requestPermission fails but API exists
            initApp(); 
        }
    } else {
        // Android / Firefox / Non-iOS
        initApp();
    }
});

function initApp() {
    startBtn.style.display = 'none';
    uiContainer.style.display = 'block';
    
    // Listen for device orientation (Task 1)
    window.addEventListener('deviceorientation', handleOrientation);
    
    // Setup Clutch Listeners (Task 2)
    window.addEventListener('touchstart', engageClutch, {passive: false});
    window.addEventListener('touchend', disengageClutch);
    window.addEventListener('mousedown', engageClutch);
    window.addEventListener('mouseup', disengageClutch);

    // Setup Selection Listener (Task 6)
    // We bind a click to the window to detect "taps"
    window.addEventListener('click', handleSelectionClick);
}

// --- AUDIO ENGINE (Tasks 4 & 5) ---
function initAudio() {
    if (state.isAudioInitialized) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContext();
    
    // Resume context if suspended (browser policy)
    if (state.audioContext.state === 'suspended') {
        state.audioContext.resume();
    }
    
    state.isAudioInitialized = true;
    console.log("Audio Engine Initialized");
}

function playSectorSound(sectorIndex) {
    if (!state.audioContext) return;

    // Stop any currently playing sound first (Sequential Mode)
    stopSound();

    const soundConfig = SECTOR_SOUNDS[sectorIndex];
    const ctx = state.audioContext;

    // 1. Create Oscillator (Source)
    const osc = ctx.createOscillator();
    osc.type = soundConfig.type;
    osc.frequency.setValueAtTime(soundConfig.freq, ctx.currentTime);

    // 2. Create Panner (Spatialization)
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    
    // Calculate Position of this Sector's "Speaker" in 3D space
    const angleRad = (sectorIndex * 45) * (Math.PI / 180);
    // Convert polar to cartesian (Web Audio: +X is Right, -Z is Front)
    const x = Math.sin(angleRad) * 2;
    const z = -Math.cos(angleRad) * 2;
    panner.setPosition(x, 0, z);

    // 3. Create Gain (Volume Control)
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1); // Fade in

    // 4. Connect Graph
    osc.connect(panner);
    panner.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start();
    state.activeOscillator = { node: osc, gain: gainNode };
}

function stopSound() {
    if (state.activeOscillator) {
        const { node, gain } = state.activeOscillator;
        // Fade out to avoid "pop"
        const now = state.audioContext.currentTime;
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
    // High pitch "Ding"
    osc.frequency.setValueAtTime(880, ctx.currentTime); 
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
}

function updateListenerOrientation(alphaDeg) {
    if (!state.audioContext) return;
    
    // Convert compass angle (0=North, 90=East) to Web Audio Forward Vector
    // NOTE: This assumes calibrated "North" is -Z
    const rad = alphaDeg * (Math.PI / 180);
    const x = Math.sin(rad);
    const z = -Math.cos(rad);

    const listener = state.audioContext.listener;
    
    if (listener.forwardX) {
        listener.forwardX.value = x;
        listener.forwardY.value = 0;
        listener.forwardZ.value = z;
        listener.upX.value = 0;
        listener.upY.value = 1;
        listener.upZ.value = 0;
    } else {
        listener.setOrientation(x, 0, z, 0, 1, 0);
    }
}

// --- INTERACTION LOGIC ---

function handleOrientation(event) {
    if (event.alpha === null) return;
    
    // Normalize absolute alpha
    let angle = event.alpha; 
    
    // Update the Audio Listener's head position continuously
    if (state.isClutched) {
        state.rawAlpha = angle;
        updateListenerOrientation(angle - state.calibratedOffset);
        calculateSector(angle);
    }
}

function engageClutch(e) {
    // If it's a touch event, prevent default scrolling
    if (e.cancelable) e.preventDefault(); 
    
    // On the very first clutch, define "Forward" as current facing (Task 1 Calibration)
    if (state.calibratedOffset === 0 && state.rawAlpha !== 0) {
        state.calibratedOffset = state.rawAlpha;
        console.log("Calibrated Forward to: " + state.calibratedOffset);
    }

    // Ensure Audio Context is running
    if (state.audioContext && state.audioContext.state === 'suspended') {
        state.audioContext.resume();
    }

    state.isClutched = true;
    statusDiv.textContent = "Clutch ENGAGED (Tracking)";
    statusDiv.style.color = "#4CAF50";
    
    // Play sound for current sector immediately
    calculateSector(state.rawAlpha, true);
}

function disengageClutch(e) {
    state.isClutched = false;
    statusDiv.textContent = "Clutch DISENGAGED (Paused)";
    statusDiv.style.color = "#fff";
    
    // Stop sound when not interacting (Task 5 requirement)
    stopSound();
}

function handleSelectionClick(e) {
    // Task 6: Selection Logic
    // If we are NOT clutched (finger up) and have a valid sector, select it.
    // This allows "Lift and Tap" interaction.
    if (!state.isClutched && state.currentSector !== -1) {
        confirmSelection(state.currentSector);
    }
}

function confirmSelection(sector) {
    // Task 6 Feedback: Visual, Haptic, Audio
    statusDiv.textContent = `SELECTED: Sector ${sector}`;
    statusDiv.style.color = "cyan";
    
    // Haptic: Double Buzz
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);

    // Audio: Ding
    playConfirmationSound();
    
    console.log(`User confirmed selection of Sector ${sector}`);
}

function calculateSector(angle, forcePlay = false) {
    // 1. Apply Calibration Offset
    let calibratedAngle = angle - state.calibratedOffset;
    
    // 2. Normalize to 0-360
    while (calibratedAngle < 0) calibratedAngle += 360;
    while (calibratedAngle >= 360) calibratedAngle -= 360;

    // 3. Map to 0-7
    let sector = Math.floor(calibratedAngle / 45) % 8;
    
    if (sector !== state.currentSector || forcePlay) {
        state.currentSector = sector;
        updateUI();
        
        // Haptic "Click" on boundary crossing (Task 9 - Early Bonus)
        if (navigator.vibrate) navigator.vibrate(15);

        // Play the new sector's sound
        playSectorSound(sector);
    }
}

function updateUI() {
    const genreNames = ["Rock", "Pop", "HipHop", "Jazz", "Classical", "Metal", "Electronic", "Folk"];
    sectorDiv.textContent = `${state.currentSector} (${genreNames[state.currentSector]})`;
}