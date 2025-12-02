// --- STATE MANAGEMENT ---
const state = {
    isClutched: false,      // Task 2: Clutch mechanism
    rawAlpha: 0,            // Raw compass heading (0-360)
    calibratedZero: 0,      // Reference point for "North"
    currentSector: -1,      // Task 3: 0-7
    sectorCount: 8
};

// --- DOM ELEMENTS ---
const startBtn = document.getElementById('btn-start');
const uiContainer = document.getElementById('ui-container');
const statusDiv = document.getElementById('status');
const sectorDiv = document.getElementById('sector-display');

// --- INITIALIZATION ---
startBtn.addEventListener('click', async () => {
    // Request permission (Required for iOS 13+, good practice for Android)
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
        }// --- STATE MANAGEMENT ---
const state = {
    isClutched: false,
    rawAlpha: 0,
    calibratedOffset: 0, // Used to set "Forward" on first click
    currentSector: -1,
    sectorCount: 8,
    audioContext: null,
    activeOscillator: null, // The currently playing sound source
    isAudioInitialized: false
};

// --- CONFIGURATION ---
// 8 distinct "Musicons" using simple oscillators
// Frequencies roughly mimic a scale; types vary to help distinction
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

    // 2. Request Sensors
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
        }
    } else {
        initApp();
    }
});

function initApp() {
    startBtn.style.display = 'none';
    uiContainer.style.display = 'block';
    
    // Calibrate "North" to wherever the user is currently facing
    // We'll grab the first event to set this.
    window.addEventListener('deviceorientation', handleOrientation);
    
    window.addEventListener('touchstart', engageClutch);
    window.addEventListener('touchend', disengageClutch);
    window.addEventListener('mousedown', engageClutch);
    window.addEventListener('mouseup', disengageClutch);
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
    panner.panningModel = 'HRTF'; // High quality head-related transfer function
    panner.distanceModel = 'inverse';
    
    // Calculate Position of this Sector's "Speaker" in 3D space
    // Sector 0 is North (0 deg) -> (0, 0, -1) in Web Audio
    // We place it 2 meters away
    const angleRad = (sectorIndex * 45) * (Math.PI / 180);
    // Convert polar to cartesian (Web Audio: +X is Right, -Z is Front)
    const x = Math.sin(angleRad) * 2;
    const z = -Math.cos(angleRad) * 2;
    panner.setPosition(x, 0, z);

    // 3. Create Gain (Volume Control) to avoid clicking
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1); // Fade in

    // 4. Connect Graph: Oscillator -> Panner -> Gain -> Output
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
        gain.gain.setValueAtTime(gain.gain.value, state.audioContext.currentTime);
        gain.gain.linearRampToValueAtTime(0, state.audioContext.currentTime + 0.1);
        node.stop(state.audioContext.currentTime + 0.1);
        state.activeOscillator = null;
    }
}

function updateListenerOrientation(alphaDeg) {
    if (!state.audioContext) return;
    
    // Convert compass angle (0=North, 90=East) to Web Audio Forward Vector
    // Web Audio: Front is -Z, Right is +X.
    const rad = alphaDeg * (Math.PI / 180);
    const x = Math.sin(rad);
    const z = -Math.cos(rad);

    const listener = state.audioContext.listener;
    
    // Modern API: setOrientation(forwardX, forwardY, forwardZ, upX, upY, upZ)
    if (listener.forwardX) {
        listener.forwardX.value = x;
        listener.forwardY.value = 0;
        listener.forwardZ.value = z;
        listener.upX.value = 0;
        listener.upY.value = 1;
        listener.upZ.value = 0;
    } else {
        // Fallback for older browsers
        listener.setOrientation(x, 0, z, 0, 1, 0);
    }
}

// --- INTERACTION LOGIC ---

function handleOrientation(event) {
    if (event.alpha === null) return;
    
    // Normalize absolute alpha
    let angle = event.alpha; 
    
    // Update the Audio Listener's head position continuously
    // This allows the spatial effect (panning) to work even within a sector
    if (state.isClutched) {
        state.rawAlpha = angle;
        updateListenerOrientation(angle);
        calculateSector(angle);
    }
}

function engageClutch(e) {
    e.preventDefault();
    
    // Ensure Audio Context is running (browsers sometimes pause it)
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

function calculateSector(angle, forcePlay = false) {
    // Simple discretization: map 360 to 0-7
    // Using a calibrated offset would go here, but keeping it raw for testing first.
    let sector = Math.floor(angle / 45) % 8;

    // Hysteresis: Don't switch if we just jittered? 
    // For now, we trust the floor math.
    
    if (sector !== state.currentSector || forcePlay) {
        state.currentSector = sector;
        updateUI();
        
        // Haptic "Click" on boundary crossing (Task 9 - Early Bonus)
        if (navigator.vibrate) navigator.vibrate(20);

        // Play the new sector's sound
        playSectorSound(sector);
    }
}

function updateUI() {
    const genreNames = ["Rock (Low)", "Pop", "HipHop", "Jazz", "Classical", "Metal", "Electronic", "Folk (High)"];
    sectorDiv.textContent = `${state.currentSector} (${genreNames[state.currentSector]})`;
}
    } else {
        // Android / Non-iOS typically works immediately via HTTPS
        initApp();
    }
});

function initApp() {
    startBtn.style.display = 'none';
    uiContainer.style.display = 'block';
    
    // Listen for device orientation (Task 1)
    window.addEventListener('deviceorientation', handleOrientation);
    
    // Setup Clutch Listeners (Task 2)
    // We use both touch and mouse events for easier debugging on PC
    window.addEventListener('touchstart', engageClutch);
    window.addEventListener('touchend', disengageClutch);
    window.addEventListener('mousedown', engageClutch);
    window.addEventListener('mouseup', disengageClutch);
}

// --- LOGIC ---

function handleOrientation(event) {
    // alpha is the compass direction (0 to 360)
    // On Android Chrome, this is usually absolute north-referenced
    if (event.alpha === null) return;

    // Only update logic if clutch is engaged (Task 2)
    if (state.isClutched) {
        state.rawAlpha = event.alpha;
        calculateSector();
    }
}

function engageClutch(e) {
    e.preventDefault(); // Prevent scrolling/selecting
    state.isClutched = true;
    statusDiv.textContent = "Clutch ENGAGED (Tracking)";
    statusDiv.style.color = "#4CAF50";
    
    // Optional: Set current facing direction as 'Forward' on first click?
    // For now, we just enable tracking.
}

function disengageClutch(e) {
    state.isClutched = false;
    statusDiv.textContent = "Clutch DISENGAGED (Paused)";
    statusDiv.style.color = "#fff";
}

function calculateSector() {
    // Task 3: Map 360 degrees to 8 sectors (45 degrees each)
    // Simple math: angle / 45 -> floor
    
    // Normalize angle (handle any negative values if they occur)
    let angle = state.rawAlpha;
    if (angle < 0) angle += 360;
    
    // Calculate sector index (0 to 7)
    // We flip the direction because rotating device Left increases Alpha, 
    // but usually we visualize sectors clockwise. 
    // For now, let's keep it raw: 0 is North.
    let sector = Math.floor(angle / 45) % 8;

    if (sector !== state.currentSector) {
        state.currentSector = sector;
        updateUI();
        // TODO: This is where we will trigger Audio in the next step
        console.log(`Sector changed to: ${sector}`); 
    }
}

function updateUI() {
    // Visual feedback for debugging
    const genreNames = ["Rock", "Pop", "HipHop", "Jazz", "Classical", "Metal", "Electronic", "Folk"];
    sectorDiv.textContent = `${state.currentSector} (${genreNames[state.currentSector]})`;
}