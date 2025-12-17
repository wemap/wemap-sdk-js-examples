/**
 * Example page for VPSLocationSource
 * 
 * Demonstrates VPSLocationSource: VPS + PDR + AbsoluteAttitude
 */
import { CoreConfig } from '@wemap/core';
import { 
  requestSensorPermissions,
  VPSLocationSource, 
  type Pose 
} from '@wemap/positioning';
import { Camera } from '@wemap/camera';

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

  // Update VPS status
  const vpsStatusEl = document.getElementById('vps-status');
  if (vpsStatusEl) {
    vpsStatusEl.textContent = vpsLocationSource.isStarted ? '● Running' : '○ Stopped';
    vpsStatusEl.style.color = vpsLocationSource.isStarted ? '#28a745' : '#dc3545';
  }

  const scanStatusEl = document.getElementById('scan-status');
  if (scanStatusEl) {
    scanStatusEl.textContent = isScanning ? '● Running' : '○ Stopped';
    scanStatusEl.style.color = isScanning ? '#28a745' : '#dc3545';
  }

  const updateCountEl = document.getElementById('update-count');
  if (updateCountEl) {
    updateCountEl.textContent = vpsUpdateCount.toString();
  }

  // Update error display
  const errorDisplayEl = document.getElementById('error-display');
  const errorMessageEl = document.getElementById('error-message');
  if (errorDisplayEl && errorMessageEl) {
    if (vpsError) {
      errorDisplayEl.style.display = 'inline';
      errorMessageEl.textContent = vpsError;
    } else {
      errorDisplayEl.style.display = 'none';
    }
  }

  // Update pose container
  const poseContainerEl = document.getElementById('pose-container');
  if (poseContainerEl) {
    poseContainerEl.innerHTML = renderPose(vpsPose);
  }

  // Update camera section
  const cameraSectionEl = document.getElementById('camera-section');
  const cameraStatusEl = document.getElementById('camera-status');
  const cameraFovEl = document.getElementById('camera-fov');
  
  if (camera) {
    if (cameraSectionEl) {
      cameraSectionEl.style.display = 'block';
    }
    if (cameraStatusEl) {
      cameraStatusEl.textContent = camera.state;
      cameraStatusEl.style.color = camera.state === 'started' ? '#28a745' : camera.state === 'starting' ? '#ffc107' : '#dc3545';
    }
    if (cameraFovEl && camera.fov) {
      cameraFovEl.innerHTML = `<p><strong>FOV:</strong> Vertical: ${camera.fov.vertical.toFixed(2)}°, Horizontal: ${camera.fov.horizontal.toFixed(2)}°</p>`;
    } else if (cameraFovEl) {
      cameraFovEl.innerHTML = '';
    }
  } else {
    if (cameraSectionEl) {
      cameraSectionEl.style.display = 'none';
    }
  }

  // Attach event listeners (only if not already attached)
  const startVpsBtn = document.getElementById('start-vps-source');
  const stopVpsBtn = document.getElementById('stop-vps-source');
  const startVpsScanBtn = document.getElementById('start-vps-scan');
  const stopVpsScanBtn = document.getElementById('stop-vps-scan');
  
  if (startVpsBtn && !startVpsBtn.onclick) {
    startVpsBtn.onclick = handleStartVPS;
  }
  if (stopVpsBtn && !stopVpsBtn.onclick) {
    stopVpsBtn.onclick = handleStopVPS;
  }
  if (startVpsScanBtn && !startVpsScanBtn.onclick) {
    startVpsScanBtn.onclick = handleStartVPSScan;
  }
  if (stopVpsScanBtn && !stopVpsScanBtn.onclick) {
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
    await requestSensorPermissions();
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
    
    // Get camera container from HTML
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
      cameraContainer.style.display = 'block';
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
      if (cameraContainer) {
        cameraContainer.style.display = 'none';
      }
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
    const errorDisplayEl = document.getElementById('error-display');
    const errorMessageEl = document.getElementById('error-message');
    if (errorDisplayEl && errorMessageEl) {
      errorDisplayEl.style.display = 'inline';
      errorMessageEl.textContent = `Failed to initialize: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
})();

