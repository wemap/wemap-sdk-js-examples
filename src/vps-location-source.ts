/**
 * VPSLocationSource — Visual Positioning System + PDR + AbsoluteAttitude.
 *
 * Same shape as the GNSS example (init → create → listen → start/stop), with two
 * VPS-specific pieces kept inline because they are themselves SDK usage: the
 * scan lifecycle (`startScan`/`stopScan`) and the `@wemap/camera` feed the scan
 * consumes. All generic demo DOM rendering lives behind `LocationSourcePanel`.
 */
import { CoreConfig } from '@wemap/core';
import { requestSensorPermissions, VPSLocationSource, type Pose } from '@wemap/positioning';
import { Camera } from '@wemap/camera';
import { LocationSourcePanel } from './shared/LocationSourcePanel';

// 1. Initialize the SDK. Replace emmid/token with your own Wemap credentials.
const core = new CoreConfig();
let coreReady = false;
try {
  await core.init({ emmid: '31668', token: 'WEMAP_TOKEN' });
  coreReady = true;
} catch (error) {
  console.warn('Core initialization failed, continuing without it:', error);
}

// 2. Create the location source.
const source = new VPSLocationSource({ usePositionSmoother: true });

// 3. Demo state + panel.
let running = false;
let scanning = false;
let updateCount = 0;
let pose: Pose = {};
let error: string | null = null;

const panel = new LocationSourcePanel({
  onStart: () => void start(),
  onStop: () => void stop(),
  onStartScan: () => void startScan(),
  onStopScan: () => void stopScan(),
});

function render(): void {
  panel.render({ coreReady, running, scanning, updateCount, error, pose });
}

// 4. React to the source's pose stream and errors.
source.onUpdate((next: Pose) => {
  pose = next;
  updateCount++;
  render();
});

source.onError((err: Error) => {
  error = err.message;
  render();
});

// 5. Start / stop the source.
async function start(): Promise<void> {
  try {
    await source.start();
    running = true;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error('Failed to start VPSLocationSource:', err);
  }
  render();
}

async function stop(): Promise<void> {
  try {
    await source.stop();
    running = false;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error('Failed to stop VPSLocationSource:', err);
  }
  render();
}

// 6. Scan lifecycle. A scan needs a running camera; it stops once VPS locks on.
async function startScan(): Promise<void> {
  try {
    await requestSensorPermissions();
    await startCamera();

    scanning = true;
    error = null;
    render();

    const success = await source.startScan();
    scanning = false;
    if (!success) {
      throw new Error('VPS scan failed');
    }
    await stopCamera();
  } catch (err) {
    scanning = false;
    error = err instanceof Error ? err.message : String(err);
    console.error('Failed to start VPSLocationSource scan:', err);
  }
  render();
}

async function stopScan(): Promise<void> {
  try {
    await stopCamera();
    await source.stopScan();
    scanning = false;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error('Failed to stop VPSLocationSource scan:', err);
  }
  render();
}

// --- Camera (for VPS): shown while scanning, released afterwards. ---
let camera: Camera | null = null;

async function startCamera(): Promise<void> {
  if (camera) {
    return;
  }
  await Camera.checkAvailability();

  const container = document.getElementById('camera-container');
  if (container) {
    container.innerHTML = '';
    container.style.display = 'block';
    camera = new Camera(container, { width: 640, height: 480, resizeOnWindowChange: true });
    camera.on('started', renderCamera);
    camera.on('stopped', renderCamera);
    camera.on('fov.changed', renderCamera);
    await camera.start();
  }
}

async function stopCamera(): Promise<void> {
  if (!camera) {
    return;
  }
  await camera.stop();
  camera.release();
  camera = null;
  const container = document.getElementById('camera-container');
  if (container) {
    container.style.display = 'none';
  }
  renderCamera();
}

function renderCamera(): void {
  const section = document.getElementById('camera-section');
  const status = document.getElementById('camera-status');
  const fov = document.getElementById('camera-fov');

  if (section) {
    section.style.display = camera ? 'block' : 'none';
  }
  if (status && camera) {
    status.textContent = camera.state;
    status.style.color =
      camera.state === 'started' ? '#28a745' : camera.state === 'starting' ? '#ffc107' : '#dc3545';
  }
  if (fov) {
    fov.innerHTML =
      camera && camera.fov
        ? `<p><strong>FOV:</strong> Vertical: ${camera.fov.vertical.toFixed(2)}°, Horizontal: ${camera.fov.horizontal.toFixed(2)}°</p>`
        : '';
  }
}

render();
