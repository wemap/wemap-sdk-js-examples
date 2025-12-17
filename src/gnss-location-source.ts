/**
 * Example page for GnssWifiLocationSource
 * 
 * Demonstrates GnssWifiLocationSource: GNSS/WiFi + PDR + AbsoluteAttitude
 */
import { CoreConfig } from '@wemap/core';
import { 
  GnssWifiLocationSource,
  type Pose 
} from '@wemap/positioning';

// Initialize core
const core = new CoreConfig();
let coreInitialized = false;

try {
  await core.init({
    emmid: '30265',
    token: 'WEMAP_TOKEN',
  });
  coreInitialized = true;
} catch (error) {
  console.warn('Core initialization failed, continuing without it:', error);
}

// Create GnssWifiLocationSource instance
const gnssWifiLocationSource = new GnssWifiLocationSource({
  usePositionSmoother: true,
  enableAttitude: true,
});

// State for GnssWifiLocationSource
let gnssPose: Pose = {};
let gnssUpdateCount = 0;
let gnssRunning = false;
let gnssError: string | null = null;

// Set up GnssWifiLocationSource listeners
gnssWifiLocationSource.onUpdate((pose: Pose) => {
  gnssPose = pose;
  gnssUpdateCount++;
  updateUI();
  console.log('[GnssWifiLocationSource] Pose update:', pose);
});

gnssWifiLocationSource.onError((error: Error) => {
  gnssError = error.message;
  updateUI();
  console.error('[GnssWifiLocationSource] Error:', error);
});

// Function to render pose data
function renderPose(pose: Pose): string {
  const position = pose.position;
  const attitude = pose.attitude;
  const inclination = pose.inclination;

  return `
    <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
      <h4>Current Pose</h4>
      
      ${position ? `
        <div style="margin-left: 1rem; margin-top: 0.5rem;">
          <h5 style="margin: 0.5rem 0;">Position</h5>
          <p><strong>Latitude:</strong> ${'latitude' in position ? position.latitude.toFixed(6) : 'N/A'}</p>
          <p><strong>Longitude:</strong> ${'longitude' in position ? position.longitude.toFixed(6) : 'N/A'}</p>
          ${'altitude' in position && position.altitude !== null && typeof position.altitude === 'number' 
            ? `<p><strong>Altitude:</strong> ${position.altitude.toFixed(2)}m</p>` 
            : ''}
          ${'level' in position && position.level !== null 
            ? `<p><strong>Level:</strong> ${position.level}</p>` 
            : ''}
          ${pose.accuracy !== undefined && typeof pose.accuracy === 'number' 
            ? `<p><strong>Accuracy:</strong> ${pose.accuracy.toFixed(2)}m</p>` 
            : ''}
          ${pose.time && typeof pose.time === 'number' 
            ? `<p><strong>Timestamp:</strong> ${new Date(pose.time).toLocaleTimeString()}</p>` 
            : ''}
        </div>
      ` : '<p style="color: #999; margin-left: 1rem;">No position data yet</p>'}
      
      ${attitude ? `
        <div style="margin-left: 1rem; margin-top: 0.5rem;">
          <h5 style="margin: 0.5rem 0;">Attitude</h5>
          ${'heading' in attitude && typeof attitude.heading === 'number' 
            ? `<p><strong>Heading:</strong> ${attitude.heading.toFixed(3)} rad (${(attitude.heading * 180 / Math.PI).toFixed(1)}°)</p>` 
            : ''}
          ${'pitch' in attitude && typeof attitude.pitch === 'number' 
            ? `<p><strong>Pitch:</strong> ${attitude.pitch.toFixed(3)} rad</p>` 
            : ''}
          ${'roll' in attitude && typeof attitude.roll === 'number' 
            ? `<p><strong>Roll:</strong> ${attitude.roll.toFixed(3)} rad</p>` 
            : ''}
        </div>
      ` : '<p style="color: #999; margin-left: 1rem;">No attitude data yet</p>'}
      
      ${inclination !== undefined ? `
        <div style="margin-left: 1rem; margin-top: 0.5rem;">
          <h5 style="margin: 0.5rem 0;">Inclination</h5>
          <p>${inclination.toFixed(3)} rad (${(inclination * 180 / Math.PI).toFixed(1)}°)</p>
        </div>
      ` : ''}
      
      <details style="margin-top: 0.5rem;">
        <summary style="cursor: pointer; font-weight: bold; color: #666;">Raw Pose Data</summary>
        <pre style="margin-top: 0.5rem; font-size: 0.875rem; overflow-x: auto; background: #f5f5f5; padding: 0.5rem; border-radius: 4px;">${JSON.stringify(pose, null, 2)}</pre>
      </details>
    </div>
  `;
}

// Function to update the UI
function updateUI() {
  // Update core status
  const coreStatusEl = document.getElementById('core-status');
  if (coreStatusEl) {
    coreStatusEl.textContent = coreInitialized ? '✓ Yes' : '✗ No';
    coreStatusEl.style.color = coreInitialized ? '#28a745' : '#dc3545';
  }
  
  const uiUpdateTimeEl = document.getElementById('ui-update-time');
  if (uiUpdateTimeEl) {
    uiUpdateTimeEl.textContent = new Date().toISOString();
  }

  // Update GNSS status
  const gnssStatusEl = document.getElementById('gnss-status');
  if (gnssStatusEl) {
    gnssStatusEl.textContent = gnssRunning ? '● Running' : '○ Stopped';
    gnssStatusEl.style.color = gnssRunning ? '#28a745' : '#dc3545';
  }

  const updateCountEl = document.getElementById('update-count');
  if (updateCountEl) {
    updateCountEl.textContent = gnssUpdateCount.toString();
  }

  // Update error display
  const errorDisplayEl = document.getElementById('error-display');
  const errorMessageEl = document.getElementById('error-message');
  if (errorDisplayEl && errorMessageEl) {
    if (gnssError) {
      errorDisplayEl.style.display = 'inline';
      errorMessageEl.textContent = gnssError;
    } else {
      errorDisplayEl.style.display = 'none';
    }
  }

  // Update pose container
  const poseContainerEl = document.getElementById('pose-container');
  if (poseContainerEl) {
    poseContainerEl.innerHTML = renderPose(gnssPose);
  }

  // Update button states
  const startGnssBtn = document.getElementById('start-gnss-source') as HTMLButtonElement;
  const stopGnssBtn = document.getElementById('stop-gnss-source') as HTMLButtonElement;
  
  if (startGnssBtn) {
    startGnssBtn.disabled = gnssRunning;
    if (!startGnssBtn.onclick) {
      startGnssBtn.onclick = handleStartGnss;
    }
  }
  if (stopGnssBtn) {
    stopGnssBtn.disabled = !gnssRunning;
    if (!stopGnssBtn.onclick) {
      stopGnssBtn.onclick = handleStopGnss;
    }
  }
}

// Handle GnssWifiLocationSource start
async function handleStartGnss() {
  try {
    await gnssWifiLocationSource.start();
    gnssRunning = true;
    gnssError = null;
    updateUI();
    console.log('GnssWifiLocationSource started');
  } catch (error) {
    gnssError = error instanceof Error ? error.message : String(error);
    updateUI();
    console.error('Failed to start GnssWifiLocationSource:', error);
    alert(`Failed to start GnssWifiLocationSource: ${gnssError}`);
  }
}

// Handle GnssWifiLocationSource stop
async function handleStopGnss() {
  try {
    await gnssWifiLocationSource.stop();
    gnssRunning = false;
    gnssError = null;
    updateUI();
    console.log('GnssWifiLocationSource stopped');
  } catch (error) {
    gnssError = error instanceof Error ? error.message : String(error);
    updateUI();
    console.error('Failed to stop GnssWifiLocationSource:', error);
  }
}

// Initialize
(async () => {
  try {
    // Initial UI render
    updateUI();
    
    console.log('GnssWifiLocationSource example page initialized.');
  } catch (error) {
    console.error('Failed to initialize example page:', error);
    const errorDisplayEl = document.getElementById('error-display');
    const errorMessageEl = document.getElementById('error-message');
    if (errorDisplayEl && errorMessageEl) {
      errorDisplayEl.style.display = 'inline';
      errorMessageEl.textContent = `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
})();

