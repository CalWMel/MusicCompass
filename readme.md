# Music Compass: A Non-Visual Spatial Audio Interface

**Author:** Calum Woods  
**Course:** Level 4 Honours Project / Dissertation  

## 📌 Project Overview
The *Music Compass* is a Progressive Web Application (PWA) designed to explore eyes-free, casual music discovery using spatial proprioception. By mapping a hierarchical music library to a continuous $360^{\circ}$ auditory environment, users can navigate genres, artists, and tracks by physically rotating their mobile device. 

This codebase contains the functional prototype utilized for the $N=12$ formal user evaluation discussed in the dissertation, testing two distinct interaction paradigms: "Clutch" (hold-to-browse) and "Always-On" (continuous tracking).

---

## 🚀 How to Run the Application

The application relies heavily on mobile hardware sensors (gyroscope and accelerometer). **It must be run on a mobile device to function correctly.**

### Live Deployment
The most reliable method to test the prototype is via the live GitHub Pages deployment.
1. On your smartphone, navigate to: **https://calwmel.github.io/MusicCompass/**
2. *Note: The system has been optimized and formally evaluated using Mozilla Firefox on Android (Google Pixel 7 Pro), but modern Chrome or Safari mobile browsers are also supported.*
3. Tap the screen to initialize the Audio Context.
4. **Important:** When prompted by the browser, you must grant permission for the site to access your device's motion and orientation sensors.

---

## 🎧 Quick Interaction Guide

* **Initialization:** Tap anywhere on the start screen to begin. Use the dropdown to select between the two experimental modes (Clutch vs. Always-On).
* **Browsing (Clutch Mode):** Hold your thumb on the screen to engage the sensor engine. Rotate your body/device to scan the audio sectors. Release your thumb to lock onto the current audio node.
* **Browsing (Always-On Mode):** The sensor engine is continuously active. Rotate to scan the audio sectors.
* **Drilling Down:** Tap the screen once to select the currently focused node (e.g., tap while hearing "Rock" to load the Rock Artists layer).
* **Backtracking (Error Recovery):** Physically **shake** the device to trigger a kinetic backtrack, returning you to the previous hierarchical layer.

---

## 🗂️ Archive Contents & Evaluation Data

In accordance with the project submission guidelines, voluminous participant data and evaluation logs are included in this digital archive rather than the main dissertation PDF.

* `/` (Root): The HTML, CSS, and vanilla JavaScript source code.
* `/assets/`: The raw audio files used for the spatial soundscape.
* `Master Data Log.csv`: The aggregated quantitative dataset containing all task completion times and error rates for the $N=12$ evaluation.
* `/Evaluation_Data/`: A directory containing the individual `.md` raw observation and interview sheets for all 12 participants.

---

## 🛠️ Built With
* **HTML5 / CSS3** (UI and visual experimental scaffolding)
* **Vanilla JavaScript (ES6)** (Application logic and state management)
* **Web Audio API** (Stereo panning, crossfading, and buffer caching)
* **DeviceOrientation & DeviceMotion APIs** (IMU sensor fusion for navigation and shake detection)
