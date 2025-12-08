/**
 * Example page for VPSLocationSource
 * 
 * Demonstrates VPSLocationSource: VPS + PDR + AbsoluteAttitude
 */
import { CoreConfig } from '@wemap-sdk/core';
import { 
  VPSLocationSource, 
  type Pose 
} from '@wemap-sdk/positioning';
import { Camera } from '@wemap-sdk/camera';

// Display example info
const app = document.querySelector<HTMLDivElement>('#app')!;

// Initialize core
const core = new CoreConfig();
let coreInitialized = false;

try {
  await core.init({
    emmid: '23270',
    token: 'UG509QQDZGP6YBC98XIRB5ZBU',
  });
  coreInitialized = true;
} catch (error) {
  console.warn('Core initialization failed, continuing without it:', error);
}

// Create VPSLocationSource instance
const vpsLocationSource = new VPSLocationSource({
  usePositionSmoother: true
});

// State for VPSLocationSource
let vpsPose: Pose = {};
let vpsUpdateCount = 0;
let vpsError: string | null = null;
let isScanning = false;

// Camera state (for VPS)
let camera: Camera | null = null;
let cameraContainer: HTMLElement | null = null;

// Set up VPSLocationSource listeners
vpsLocationSource.onUpdate((pose: Pose) => {
  vpsPose = pose;
  vpsUpdateCount++;
  updateUI();
  console.log('[VPSLocationSource] Pose update:', pose);
});

vpsLocationSource.onError((error: Error) => {
  vpsError = error.message;
  updateUI();
  console.error('[VPSLocationSource] Error:', error);
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
            ? `<p><strong>time:</strong> ${new Date(pose.time).toLocaleTimeString()}</p>` 
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
        <a href="/vps-location-source.html" style="margin-left: 1rem; color: #0066cc; font-weight: bold;">VPSLocationSource</a>
        <a href="/gnss-location-source.html" style="margin-left: 1rem; color: #0066cc;">GnssWifiLocationSource</a>
      </div>
      
      <h1>VPSLocationSource Example</h1>
      
      <div style="background: #e3f2fd; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
        <h3>Core Status</h3>
        <p><strong>Initialized:</strong> <span style="color: ${coreInitialized ? '#28a745' : '#dc3545'}">${coreInitialized ? '✓ Yes' : '✗ No'}</span></p>
        <p><strong>UI update time:</strong> ${new Date().toISOString()}</p>
      </div>

      <div style="background: #f5f5f5; padding: 1.5rem; border-radius: 8px; margin-top: 2rem;">
        <h2 style="margin-top: 0;">VPSLocationSource</h2>
        <p style="color: #666; font-size: 0.9rem;">
          Combines VPS (Visual Positioning System) + PDR (Pedestrian Dead Reckoning) + AbsoluteAttitude
        </p>
        
        <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
            <div>
              <strong>Status:</strong> <span style="color: ${vpsLocationSource.isStarted ? '#28a745' : '#dc3545'}">${vpsLocationSource.isStarted ? '● Running' : '○ Stopped'}</span>
              <strong>Scan Status:</strong> <span style="color: ${isScanning ? '#28a745' : '#dc3545'}">${isScanning ? '● Running' : '○ Stopped'}</span>
              <span style="margin-left: 1rem;"><strong>Updates:</strong> ${vpsUpdateCount}</span>
              ${vpsError ? `
                <span style="margin-left: 1rem; color: #dc3545;">
                  <strong>⚠️ Error:</strong> ${vpsError}
                </span>
              ` : ''}
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <button 
                id="start-vps-source" 
                style="padding: 0.5rem 1rem; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;"
              >
                Start VPS Source
              </button>
              <button 
                id="stop-vps-source" 
                style="padding: 0.5rem 1rem; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;"
              >
                Stop VPS Source
              </button>

              <button 
                id="start-vps-scan" 
                style="padding: 0.5rem 1rem; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;"
              >
                Start VPS Scan
              </button>
              <button 
                id="stop-vps-scan" 
                style="padding: 0.5rem 1rem; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;"
              >
                Stop VPS Scan
              </button>
            </div>
          </div>
          
          ${renderPose(vpsPose)}
        </div>
      </div>

      ${camera ? `
        <div style="margin-top: 2rem;">
          <h2>Camera (for VPS)</h2>
          <div style="background: #f5f5f5; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
            <p><strong>Status:</strong> <span style="color: ${camera.state === 'started' ? '#28a745' : camera.state === 'starting' ? '#ffc107' : '#dc3545'}">${camera.state}</span></p>
            ${camera.fov ? `
              <p><strong>FOV:</strong> Vertical: ${camera.fov.vertical.toFixed(2)}°, Horizontal: ${camera.fov.horizontal.toFixed(2)}°</p>
            ` : ''}
            <p style="color: #6c757d; font-size: 0.875rem; margin-top: 0.5rem;">
              Camera feed is displayed below (if started). The VPSLocationSource will automatically detect and use this camera.
            </p>
          </div>
        </div>
      ` : ''}

      <div style="margin-top: 2rem; padding: 1rem; background: #fff3cd; border-radius: 8px; border: 1px solid #ffc107;">
        <p><strong>💡 VPSLocationSource:</strong></p>
        <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
          <li>Requires camera permissions and VPS endpoint (from CoreConfig)</li>
          <li>Combines VPS positioning with PDR for continuous updates</li>
          <li>Includes AbsoluteAttitude for device orientation</li>
          <li>Uses PositionSmoother by default for smoother position updates</li>
        </ul>
        <p style="margin-top: 0.5rem;"><strong>Note:</strong> Check the browser console for detailed logs.</p>
      </div>
    </div>
  `;

  // Attach event listeners
  const startVpsBtn = document.getElementById('start-vps-source');
  const stopVpsBtn = document.getElementById('stop-vps-source');
  const startVpsScanBtn = document.getElementById('start-vps-scan');
  const stopVpsScanBtn = document.getElementById('stop-vps-scan');
  
  if (startVpsBtn) {
    startVpsBtn.onclick = handleStartVPS;
  }
  if (stopVpsBtn) {
    stopVpsBtn.onclick = handleStopVPS;
  }

  if (startVpsScanBtn) {
    startVpsScanBtn.onclick = handleStartVPSScan;
  }

  if (stopVpsScanBtn) {
    stopVpsScanBtn.onclick = handleStopVPSScan;
  }
}

// Handle VPSLocationSource start
async function handleStartVPS() {
  try {
    
    await vpsLocationSource.start();
    vpsError = null;
    updateUI();
    console.log('VPSLocationSource started');
  } catch (error) {
    vpsError = error instanceof Error ? error.message : String(error);
    updateUI();
    console.error('Failed to start VPSLocationSource:', error);
    alert(`Failed to start VPSLocationSource: ${vpsError}`);
  }
}

// Handle VPSLocationSource stop
async function handleStopVPS() {
  try {
    await vpsLocationSource.stop();
    vpsError = null;
    
    updateUI();

    console.log('VPSLocationSource stopped');
  } catch (error) {
    vpsError = error instanceof Error ? error.message : String(error);
    updateUI();
    console.error('Failed to stop VPSLocationSource:', error);
  }
}

async function handleStartVPSScan() {
  try {
    await (DeviceOrientationEvent as any).requestPermission();
    // Set up camera first if not already set up
    if (!camera) {
      await setupCamera();
    }
    

    const scanPromise = vpsLocationSource.startScan();
    isScanning = true;
    vpsError = null;
    updateUI();

    console.log('VPSLocationSource scan started');

    const success = await scanPromise;
    isScanning = false;
    if (!success) {
      throw new Error('Failed to start VPSLocationSource scan');
    }

    if (camera) {
      await stopCamera();
    }

    updateUI();
  } catch (error) {
    vpsError = error instanceof Error ? error.message : String(error);
    updateUI();
    console.error('Failed to start VPSLocationSource scan:', error);
    alert(`Failed to start VPSLocationSource scan: ${vpsError}`);
  }
}

async function handleStopVPSScan() {
  try {
    // Stop camera
    if (camera) {
      await stopCamera();
    }

    await vpsLocationSource.stopScan();
    isScanning = false;
    vpsError = null;
    updateUI();
    console.log('VPSLocationSource scan stopped');
  }
  catch (error) {
    vpsError = error instanceof Error ? error.message : String(error);
    updateUI();
    console.error('Failed to stop VPSLocationSource scan:', error);
    alert(`Failed to stop VPSLocationSource scan: ${vpsError}`);
  }
}

// Set up camera for VPS
async function setupCamera(): Promise<void> {
  try {
    // Check camera availability
    await Camera.checkAvailability();
    
    // Get or create camera container
    cameraContainer = document.getElementById('camera-container');
    if (!cameraContainer) {
      cameraContainer = document.createElement('div');
      cameraContainer.id = 'camera-container';
      cameraContainer.style.cssText = 'width: 100%; max-width: 640px; margin: 1rem auto; background: #000; border-radius: 8px; overflow: hidden; position: relative; min-height: 360px;';
      // Insert after app div
      app.parentNode?.insertBefore(cameraContainer, app.nextSibling);
    } else {
      // Clear container if it already exists
      cameraContainer.innerHTML = '';
    }
    
    // Create camera instance
    camera = new Camera(cameraContainer, {
      width: 640,
      height: 480,
      resizeOnWindowChange: true,
    });
    
    // Set up camera event listeners
    camera.on('started', ({ videoElement, stream }) => {
      console.log('Camera started:', { videoElement, stream });
      updateUI();
    });
    
    camera.on('stopped', () => {
      console.log('Camera stopped');
      updateUI();
    });
    
    camera.on('fov.changed', ({ vertical, horizontal }) => {
      console.log('Camera FOV changed:', { vertical, horizontal });
      updateUI();
    });
    
    // Start the camera
    await camera.start();
    console.log('Camera setup complete');
  } catch (error) {
    console.error('Failed to set up camera:', error);
    throw error;
  }
}

// Stop camera
async function stopCamera(): Promise<void> {
  if (camera) {
    try {
      await camera.stop();
      camera.release();
      camera = null;
      console.log('Camera stopped and released');
    } catch (error) {
      console.error('Failed to stop camera:', error);
    }
  }
}

// Initialize
(async () => {
  try {
    // Initial UI render
    updateUI();
    
    console.log('VPSLocationSource example page initialized.');
  } catch (error) {
    console.error('Failed to initialize example page:', error);
    app.innerHTML = `
      <div style="padding: 2rem; font-family: system-ui, sans-serif;">
        <h1>VPSLocationSource Example</h1>
        <div style="margin-top: 2rem; padding: 1rem; background: #f8d7da; border-radius: 8px; border: 1px solid #dc3545;">
          <h2>Error</h2>
          <p><strong>Failed to initialize:</strong> ${error instanceof Error ? error.message : String(error)}</p>
        </div>
      </div>
    `;
  }
})();

