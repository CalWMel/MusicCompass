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