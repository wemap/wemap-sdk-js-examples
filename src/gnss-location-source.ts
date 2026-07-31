/**
 * GnssWifiLocationSource — GNSS/WiFi + PDR + AbsoluteAttitude.
 *
 * The SDK surface is the whole story: init core, create the source, listen for
 * pose updates, start/stop it. All demo DOM rendering lives behind
 * `LocationSourcePanel`, so this file reads as the integration recipe.
 */
import { CoreConfig } from '@wemap/core';
import { GnssWifiLocationSource, type Pose } from '@wemap/positioning';
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
const source = new GnssWifiLocationSource({
  usePositionSmoother: true,
  enableAttitude: true,
});

// 3. Demo state + panel. The panel owns every DOM write; we just hand it state.
let running = false;
let updateCount = 0;
let pose: Pose = {};
let error: string | null = null;

const panel = new LocationSourcePanel({
  onStart: () => void start(),
  onStop: () => void stop(),
});

function render(): void {
  panel.render({ coreReady, running, updateCount, error, pose });
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

// 5. Start / stop, wired to the panel buttons.
async function start(): Promise<void> {
  try {
    await source.start();
    running = true;
    error = null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    console.error('Failed to start GnssWifiLocationSource:', err);
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
    console.error('Failed to stop GnssWifiLocationSource:', err);
  }
  render();
}

render();
