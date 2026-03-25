/**
 * Combined features page: VPSLocationSource + Router + Map Matching
 * 
 * Features:
 * - Start VPSLocationSource (automatically starts scan)
 * - Click on map to choose destination
 * - Start itinerary (calls router)
 * - Shows itinerary on map + sets for map matching
 */
import { CoreConfig } from '@wemap/core';
import { 
  VPSLocationSource,
  MapMatching,
  requestSensorPermissions,
  type Pose 
} from '@wemap/positioning';
import { Camera } from '@wemap/camera';
import { 
  Router,
  Coordinates,
  ItineraryInfoManager,
  type Itinerary as ItineraryType
} from '@wemap/routing';
import { createMapSection, type DestinationCoords } from './combined/mapSection';
import { createInitialParamsForm, type InitialParamsConfig } from './combined/initialParamsForm';
import { updateNavigationInfo } from './combined/navigationSection';
import { MapMatchingHandler } from '@wemap/providers';

// Get DOM elements
const mapContainer = document.getElementById('map-container') as HTMLDivElement;
const currentLatEl = document.getElementById('current-lat') as HTMLSpanElement;
const currentLonEl = document.getElementById('current-lon') as HTMLSpanElement;
const currentLevelEl = document.getElementById('current-level') as HTMLSpanElement;
const locationStateEl = document.getElementById('location-state') as HTMLSpanElement;
const startVpsBtn = document.getElementById('start-vps') as HTMLButtonElement;
const startItineraryBtn = document.getElementById('start-itinerary') as HTMLButtonElement;
const updateLevelBtn = document.getElementById('update-destination-level') as HTMLButtonElement;
const destinationLevelInput = document.getElementById('destination-level') as HTMLInputElement;
const errorMessageEl = document.getElementById('error-message') as HTMLDivElement;
const routeErrorMessageEl = document.getElementById('route-error-message') as HTMLDivElement;
const destinationInfoEl = document.getElementById('destination-info') as HTMLDivElement;
const itineraryInfoEl = document.getElementById('itinerary-info') as HTMLDivElement;
const navigationInfoEl = document.getElementById('navigation-info') as HTMLDivElement;
const backgroundScanStatusEl = document.getElementById('background-scan-status') as HTMLSpanElement | null;

const initialParamsDefaults: InitialParamsConfig = {
  core: {
    emmid: '30265',
    token: 'WEMAP_TOKEN',
  },
  map: {
    styleUrl: 'https://tiles.getwemap.com/styles/wemap-v2-fr.json',
    center: { lat: 48.8566, lon: 2.3522 }, // Paris
    zoom: 13,
  },
  routing: {
    initialDestinationLevel: null,
  },
  locationSource: {
    useStrict: true,
  },
};

let initialParams: InitialParamsConfig = initialParamsDefaults;

// Initialize core
const core = new CoreConfig();

// Mount the reusable initial params form (so `combined.html` doesn't need changes).
const mainContainerEl = document.querySelector<HTMLDivElement>('.main-container');
if (mainContainerEl) {
  const paramsContainer = document.createElement('div');
  paramsContainer.id = 'initial-params-container';

  const firstSection = mainContainerEl.querySelector<HTMLElement>('.section');
  if (firstSection) {
    mainContainerEl.insertBefore(paramsContainer, firstSection);
  } else {
    mainContainerEl.appendChild(paramsContainer);
  }

  createInitialParamsForm({
    container: paramsContainer,
    defaults: initialParamsDefaults,
    onApply: (config) => {
      initialParams = config;

      // Re-init core with updated credentials (best-effort).
      void (async () => {
        try {
          await core.init(config.core);
          console.log('[Core] Re-initialized with updated form params.');
        } catch (error) {
          console.warn('[Core] Re-initialization failed, continuing with previous state:', error);
        }
      })();

      // Strictness affects map matching behavior globally.
      MapMatchingHandler.useStrict = config.locationSource.useStrict;

      // Update map defaults if map is already initialized.
      mapSection?.updateMapDefaults();

      // Update destination level input + state if the user already selected a destination.
      destinationLevelInput.value = config.routing.initialDestinationLevel === null ? '' : String(config.routing.initialDestinationLevel);
      if (destinationCoords) {
        destinationCoords.level = config.routing.initialDestinationLevel;
        updateDestinationInfo();
        updateButtonStates();
      }
    },
  });
}

try {
  await core.init(initialParams.core);
} catch (error) {
  console.warn('Core initialization failed, continuing without it:', error);
}

// Create VPSLocationSource instance
const vpsLocationSource = new VPSLocationSource({
  usePositionSmoother: true,
  useStrict: initialParams.locationSource.useStrict,
});

// Create Router instance
const router = new Router();

// Create ItineraryInfoManager instance
const itineraryInfoManager = new ItineraryInfoManager();

// State for VPSLocationSource
let vpsPose: Pose = {};
let vpsRunning = false;
let vpsError: string | null = null;

// Camera state (for VPS)
let camera: Camera | null = null;
let cameraContainer: HTMLElement | null = null;

// State for Router and Map Matching
let currentItinerary: ItineraryType | null = null;
let destinationCoords: { lat: number; lon: number; level: number | null } | null = null;
let isCalculatingRoute = false;
let routeError: string | null = null;

// VPS status state (kept in sync via listeners)
let scanStatus: string = 'stopped';
let backgroundScanStatus: string = 'disabled';

// Map state/behavior is encapsulated in a reusable module.
let mapSection = createMapSection({
  mapContainer,
  getMapParams: () => initialParams.map,
  getCurrentPose: () => vpsPose,
  getCurrentItinerary: () => currentItinerary,
  getCanPickDestination: () => {
    if (!vpsRunning) return { ok: false, reason: 'Please start VPSLocationSource first' };
    if (!vpsPose.position || !('latitude' in vpsPose.position)) {
      return { ok: false, reason: 'Waiting for VPS position. Please wait for the scan to complete.' };
    }
    return { ok: true };
  },
  getDestinationLevel: () => {
    if (!destinationLevelInput.value) return null;
    const parsed = parseInt(destinationLevelInput.value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  },
  onDestinationSelected: (destination: DestinationCoords) => {
    destinationCoords = { lat: destination.lat, lon: destination.lon, level: destination.level };
    updateDestinationInfo();
    updateButtonStates();
  },
});

// Set up VPSLocationSource listeners
vpsLocationSource.onUpdate((pose: Pose) => {
  vpsPose = pose;
  updatePositionDisplay();
  updateMapUserPosition();
  updateButtonStates();
  updateVpsStatusDisplay();
  updateNavigationInfo({
    navigationInfoEl,
    vpsPose: pose,
    currentItinerary,
    itineraryInfoManager,
  });
});

vpsLocationSource.onError((error: Error) => {
  vpsError = error.message;
  updateErrorDisplay();
  updateVpsStatusDisplay();
  console.error('[VPSLocationSource] Error:', error);
});

// Listen to scan status changes to update UI (using VPSLocationSource listeners directly)
vpsLocationSource.onScanStatusChange((status: string) => {
  scanStatus = status;
  updateVpsStatusDisplay();
});

vpsLocationSource.onBackgroundScanStatusChange((status: string) => {
  backgroundScanStatus = status;
  updateVpsStatusDisplay();
});

vpsLocationSource.onLocationStateChange((state) => {
  if (locationStateEl) {
    locationStateEl.textContent = state;
  }
});

// Map click + markers + route rendering are handled by `mapSection`.

// Calculate route from current position to destination
async function calculateRoute(): Promise<void> {
  if (!vpsPose.position || !('latitude' in vpsPose.position)) {
    alert('No VPS position available. Please start VPSLocationSource first.');
    return;
  }

  if (!destinationCoords) {
    alert('Please click on the map to set a destination first.');
    return;
  }

  isCalculatingRoute = true;
  routeError = null;
  updateButtonStates();
  updateErrorDisplay();

  try {
    const origin = new Coordinates(
      vpsPose.position.latitude,
      vpsPose.position.longitude,
      null,
      vpsPose.position.level
    );
    
    const destination = new Coordinates(destinationCoords.lat, destinationCoords.lon);
    
    // Set level if provided
    if (destinationCoords.level !== null && destinationCoords.level !== undefined) {
      destination.level = destinationCoords.level;
    }

    const itineraries = await router.directions(origin, destination, 'WALK');
    
    if (itineraries.length === 0) {
      throw new Error('No route found');
    }

    currentItinerary = itineraries[0];
    
    // Set itinerary for map matching
    MapMatching.setItinerary(currentItinerary);
    
    // Set itinerary for ItineraryInfoManager
    itineraryInfoManager.itinerary = currentItinerary;
    
    console.log('Route calculated and set for map matching:', currentItinerary);
    updateItineraryInfo();
    updateMapRoute();
    updateNavigationInfo({
      navigationInfoEl,
      vpsPose,
      currentItinerary,
      itineraryInfoManager,
    });
  } catch (error) {
    routeError = error instanceof Error ? error.message : String(error);
    console.error('Failed to calculate route:', error);
    alert(`Failed to calculate route: ${routeError}`);
  } finally {
    isCalculatingRoute = false;
    updateButtonStates();
    updateErrorDisplay();
  }
}

// Map updates are delegated to the reusable module.
function updateMapUserPosition(): void {
  mapSection.updateUserPosition(vpsPose);
}

function updateMapRoute(): void {
  mapSection.updateRoute(currentItinerary);
}

// Update position display only
function updatePositionDisplay(): void {
  const position = vpsPose.position;
  const hasPosition = position && 'latitude' in position;
  
  if (currentLatEl) {
    currentLatEl.textContent = hasPosition ? position.latitude.toFixed(6) : 'N/A';
  }
  if (currentLonEl) {
    currentLonEl.textContent = hasPosition ? position.longitude.toFixed(6) : 'N/A';
  }
  if (currentLevelEl) {
    currentLevelEl.textContent = hasPosition && 'level' in position && position.level !== null ? String(position.level) : 'N/A';
  }
}

// Update error display
function updateErrorDisplay(): void {
  if (errorMessageEl) {
    if (vpsError) {
      errorMessageEl.style.display = 'block';
      errorMessageEl.style.color = '#dc3545';
      errorMessageEl.style.fontSize = '0.875rem';
      errorMessageEl.innerHTML = `<strong>⚠️ Error:</strong> ${vpsError}`;
    } else {
      errorMessageEl.style.display = 'none';
    }
  }
  
  if (routeErrorMessageEl) {
    if (routeError) {
      routeErrorMessageEl.style.display = 'block';
      routeErrorMessageEl.style.color = '#dc3545';
      routeErrorMessageEl.style.fontSize = '0.875rem';
      routeErrorMessageEl.innerHTML = `<strong>⚠️ Route Error:</strong> ${routeError}`;
    } else {
      routeErrorMessageEl.style.display = 'none';
    }
  }
}

// Update VPS / background scan status display
function updateVpsStatusDisplay(): void {
  if (!backgroundScanStatusEl) {
    return;
  }

  backgroundScanStatusEl.textContent = `${scanStatus} / ${backgroundScanStatus}`;
}

// Update destination info display
function updateDestinationInfo(): void {
  if (destinationInfoEl) {
    if (destinationCoords) {
      destinationInfoEl.style.display = 'block';
      const levelText = destinationCoords.level !== null && destinationCoords.level !== undefined ? `, Level: ${destinationCoords.level}` : '';
      destinationInfoEl.innerHTML = `<strong>✓ Destination set:</strong> ${destinationCoords.lat.toFixed(6)}, ${destinationCoords.lon.toFixed(6)}${levelText}`;
    } else {
      destinationInfoEl.style.display = 'none';
    }
  }
}

// Update itinerary info display
function updateItineraryInfo(): void {
  if (itineraryInfoEl) {
    if (currentItinerary) {
      itineraryInfoEl.style.display = 'block';
      itineraryInfoEl.innerHTML = '<strong>✓ Itinerary calculated and set for map matching</strong>';
    } else {
      itineraryInfoEl.style.display = 'none';
    }
  }
}

// Update button states
function updateButtonStates(): void {

  if (startItineraryBtn) {
    startItineraryBtn.disabled = !vpsRunning || !destinationCoords || isCalculatingRoute;
    startItineraryBtn.textContent = isCalculatingRoute ? 'Calculating...' : 'Start Itinerary';
  }
  if (updateLevelBtn) {
    updateLevelBtn.disabled = !destinationCoords;
  }
}

// Handle VPS start (automatically starts scan)
async function handleStartVPS() {
  try {
    // Request device orientation permission (iOS)
    const hasPermission = await requestSensorPermissions();
    if (!hasPermission) {
      throw new Error('Permission denied');
    }
    
    // Start VPS source
    await vpsLocationSource.start();
    vpsRunning = true;
    vpsError = null;
    updateButtonStates();
    updateErrorDisplay();
    updateVpsStatusDisplay();
    
    // Set up camera
    if (!camera) {
      await setupCamera();
    }
    
    // Start scan immediately
    const scanPromise = vpsLocationSource.startScan();
    updateButtonStates();

    console.log('VPSLocationSource started and scan initiated');

    const success = await scanPromise;
    if (!success) {
      throw new Error('VPS scan failed');
    }

    // Stop camera after successful scan
    if (camera) {
      await hideCamera();
    }

    updateButtonStates();
    updateVpsStatusDisplay();
  } catch (error) {
    vpsError = error instanceof Error ? error.message : String(error);
    updateErrorDisplay();
    updateButtonStates();
    updateVpsStatusDisplay();
    console.error('Failed to start VPSLocationSource:', error);
    alert(`Failed to start VPSLocationSource: ${vpsError}`);
  }
}

// Handle start itinerary
async function handleStartItinerary() {
  await calculateRoute();
}

// Handle update destination level
function handleUpdateDestinationLevel() {
  if (!destinationCoords) {
    alert('Please click on the map to set a destination first.');
    return;
  }

  const level = destinationLevelInput && destinationLevelInput.value !== '' ? parseInt(destinationLevelInput.value, 10) : null;
  
  if (destinationLevelInput && destinationLevelInput.value !== '' && isNaN(level as number)) {
    alert('Please enter a valid number for the level.');
    return;
  }

  destinationCoords.level = isNaN(level as number) ? null : level;
  updateDestinationInfo();
}

// Set up camera for VPS
async function setupCamera(): Promise<void> {
  try {
    await Camera.checkAvailability();
    
    cameraContainer = document.getElementById('camera-container');
    if (!cameraContainer) {
      cameraContainer = document.createElement('div');
      cameraContainer.id = 'camera-container';
      cameraContainer.style.cssText = 'width: 100%; max-width: 640px; margin: 1rem auto; background: #000; border-radius: 8px; overflow: hidden; position: relative; min-height: 360px;';
      // Insert after the actions section
      const actionsSection = document.querySelector('.section:nth-of-type(2)');
      if (actionsSection && actionsSection.nextSibling) {
        actionsSection.parentNode?.insertBefore(cameraContainer, actionsSection.nextSibling);
      } else if (actionsSection) {
        actionsSection.parentNode?.appendChild(cameraContainer);
      }
    } else {
      cameraContainer.innerHTML = '';
    }
    
    camera = new Camera(cameraContainer, {
      width: 640,
      height: 480,
      resizeOnWindowChange: true,
    });
    
    await camera.start();
    console.log('Camera setup complete');
  } catch (error) {
    console.error('Failed to set up camera:', error);
    throw error;
  }
}

// Stop camera
// async function stopCamera(): Promise<void> {
//   if (camera) {
//     try {
//       await camera.stop();
//       camera.release();
//       camera = null;
//       console.log('Camera stopped and released');
//     } catch (error) {
//       console.error('Failed to stop camera:', error);
//     }
//   }
// }

async function hideCamera(): Promise<void> {
  if (cameraContainer) {
    cameraContainer.style.display = 'none';
  }
}

// Initialize
(async () => {
  try {
    // Set up event listeners
    if (startVpsBtn) {
      startVpsBtn.onclick = handleStartVPS;
    }
    if (startItineraryBtn) {
      startItineraryBtn.onclick = handleStartItinerary;
    }
    if (updateLevelBtn) {
      updateLevelBtn.onclick = handleUpdateDestinationLevel;
    }
    
    // Initialize position display
    updatePositionDisplay();
    updateButtonStates();
    updateErrorDisplay();
    updateDestinationInfo();
    updateItineraryInfo();
    updateNavigationInfo({
      navigationInfoEl,
      vpsPose,
      currentItinerary,
      itineraryInfoManager,
    });
    
    // Initialize map after UI is rendered and MapLibre is loaded.
    setTimeout(() => {
      mapSection.initWhenMapLibreReady().catch((err) => console.error('Map initialization failed:', err));
    }, 100);
    
    console.log('Combined features page initialized.');
  } catch (error) {
    console.error('Failed to initialize page:', error);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding: 2rem; font-family: system-ui, sans-serif;';
    errorDiv.innerHTML = `
      <h1>Combined Features</h1>
      <div style="margin-top: 2rem; padding: 1rem; background: #f8d7da; border-radius: 8px; border: 1px solid #dc3545;">
        <h2>Error</h2>
        <p><strong>Failed to initialize:</strong> ${error instanceof Error ? error.message : String(error)}</p>
      </div>
    `;
    document.body.appendChild(errorDiv);
  }
})();

