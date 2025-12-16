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

// Display example info
const app = document.querySelector<HTMLDivElement>('#app')!;

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
  app.innerHTML = `
    <div style="padding: 2rem; font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto;">
      <div style="margin-bottom: 1rem; padding: 0.75rem; background: #e7f3ff; border-radius: 4px; border: 1px solid #b3d9ff;">
        <strong>📋 Example Pages:</strong>
        <a href="/index.html" style="margin-left: 1rem; color: #0066cc;">PositioningProvider</a>
        <a href="/vps-location-source.html" style="margin-left: 1rem; color: #0066cc;">VPSLocationSource</a>
        <a href="/gnss-location-source.html" style="margin-left: 1rem; color: #0066cc; font-weight: bold;">GnssWifiLocationSource</a>
      </div>
      
      <h1>GnssWifiLocationSource Example</h1>
      
      <div style="background: #e3f2fd; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
        <h3>Core Status</h3>
        <p><strong>Initialized:</strong> <span style="color: ${coreInitialized ? '#28a745' : '#dc3545'}">${coreInitialized ? '✓ Yes' : '✗ No'}</span></p>
        <p><strong>UI update timestamp:</strong> ${new Date().toISOString()}</p>
      </div>

      <div style="background: #f5f5f5; padding: 1.5rem; border-radius: 8px; margin-top: 2rem;">
        <h2 style="margin-top: 0;">GnssWifiLocationSource</h2>
        <p style="color: #666; font-size: 0.9rem;">
          Combines GNSS/WiFi + PDR (via AbsolutePositionProvider) + AbsoluteAttitude
        </p>
        
        <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
            <div>
              <strong>Status:</strong> <span style="color: ${gnssRunning ? '#28a745' : '#dc3545'}">${gnssRunning ? '● Running' : '○ Stopped'}</span>
              <span style="margin-left: 1rem;"><strong>Updates:</strong> ${gnssUpdateCount}</span>
              ${gnssError ? `
                <span style="margin-left: 1rem; color: #dc3545;">
                  <strong>⚠️ Error:</strong> ${gnssError}
                </span>
              ` : ''}
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button 
                id="start-gnss-source" 
                style="padding: 0.5rem 1rem; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;"
                ${gnssRunning ? 'disabled' : ''}
              >
                Start GNSS Source
              </button>
              <button 
                id="stop-gnss-source" 
                style="padding: 0.5rem 1rem; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;"
                ${!gnssRunning ? 'disabled' : ''}
              >
                Stop GNSS Source
              </button>
            </div>
          </div>
          
          ${renderPose(gnssPose)}
        </div>
      </div>

      <div style="margin-top: 2rem; padding: 1rem; background: #fff3cd; border-radius: 8px; border: 1px solid #ffc107;">
        <p><strong>💡 GnssWifiLocationSource:</strong></p>
        <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
          <li>Requires location permissions (GPS/WiFi)</li>
          <li>Uses AbsolutePositionProvider which integrates GNSS/WiFi + PDR</li>
          <li>Includes AbsoluteAttitude for device orientation</li>
          <li>Uses PositionSmoother by default for smoother position updates</li>
          <li>Works best outdoors or in areas with WiFi coverage</li>
        </ul>
        <p style="margin-top: 0.5rem;"><strong>Note:</strong> Check the browser console for detailed logs.</p>
      </div>
    </div>
  `;

  // Attach event listeners
  const startGnssBtn = document.getElementById('start-gnss-source');
  const stopGnssBtn = document.getElementById('stop-gnss-source');
  
  if (startGnssBtn) {
    startGnssBtn.onclick = handleStartGnss;
  }
  if (stopGnssBtn) {
    stopGnssBtn.onclick = handleStopGnss;
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
    app.innerHTML = `
      <div style="padding: 2rem; font-family: system-ui, sans-serif;">
        <h1>GnssWifiLocationSource Example</h1>
        <div style="margin-top: 2rem; padding: 1rem; background: #f8d7da; border-radius: 8px; border: 1px solid #dc3545;">
          <h2>Error</h2>
          <p><strong>Failed to initialize:</strong> ${error instanceof Error ? error.message : String(error)}</p>
        </div>
      </div>
    `;
  }
})();

