/**
 * Combined features page: GnssWifiLocationSource + Router + Map Matching
 * 
 * Features:
 * - Start GnssWifiLocationSource
 * - Click on map to choose destination
 * - Start itinerary (calls router)
 * - Shows itinerary on map + sets for map matching
 */
import { CoreConfig } from '@wemap/core';
import { 
  GnssWifiLocationSource,
  MapMatching,
  type Pose 
} from '@wemap/positioning';
import { 
  Router,
  Coordinates,
  ItineraryInfoManager,
  type Itinerary as ItineraryType
} from '@wemap/routing';
import { createMapSection, type DestinationCoords } from './combined/mapSection';
import { createInitialParamsForm, type InitialParamsConfig } from './combined/initialParamsForm';
import { updateNavigationInfo as renderNavigationInfo } from './combined/navigationSection';
import { MapMatchingHandler } from '@wemap/providers';
// Get DOM elements
const mapContainer = document.getElementById('map-container') as HTMLDivElement;
const currentLatEl = document.getElementById('current-lat') as HTMLSpanElement;
const currentLonEl = document.getElementById('current-lon') as HTMLSpanElement;
const currentLevelEl = document.getElementById('current-level') as HTMLSpanElement;
const locationStateEl = document.getElementById('location-state') as HTMLSpanElement;
const startGnssBtn = document.getElementById('start-gnss') as HTMLButtonElement;
const startItineraryBtn = document.getElementById('start-itinerary') as HTMLButtonElement;
const updateLevelBtn = document.getElementById('update-destination-level') as HTMLButtonElement;
const destinationLevelInput = document.getElementById('destination-level') as HTMLInputElement;
const errorMessageEl = document.getElementById('error-message') as HTMLDivElement;
const routeErrorMessageEl = document.getElementById('route-error-message') as HTMLDivElement;
const destinationInfoEl = document.getElementById('destination-info') as HTMLDivElement;
const itineraryInfoEl = document.getElementById('itinerary-info') as HTMLDivElement;
const navigationInfoEl = document.getElementById('navigation-info') as HTMLDivElement;

// Initialize core
const core = new CoreConfig();

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

let mapSection: ReturnType<typeof createMapSection> | null = null;

// Mount the reusable initial params form (so `combined-gnss.html` doesn't need changes).
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

      MapMatchingHandler.useStrict = config.locationSource.useStrict;

      // Re-init core with updated credentials (best-effort).
      void (async () => {
        try {
          await core.init(config.core);
          console.log('[Core] Re-initialized with updated form params.');
        } catch (error) {
          console.warn('[Core] Re-initialization failed, continuing with previous state:', error);
        }
      })();

      // Update map defaults if map is already initialized.
      mapSection?.updateMapDefaults();

      // Update destination level input + state if the user already selected a destination.
      destinationLevelInput.value =
        config.routing.initialDestinationLevel === null ? '' : String(config.routing.initialDestinationLevel);

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

// Create GnssWifiLocationSource instance
const gnssLocationSource = new GnssWifiLocationSource({
  usePositionSmoother: true,
  enableAttitude: true,
  useStrict: initialParams.locationSource.useStrict,
});

// Create Router instance
const router = new Router();

// Create ItineraryInfoManager instance
const itineraryInfoManager = new ItineraryInfoManager();

// State for GnssWifiLocationSource
let gnssPose: Pose = {};
let gnssRunning = false;
let gnssError: string | null = null;

// State for Router and Map Matching
let currentItinerary: ItineraryType | null = null;
let destinationCoords: { lat: number; lon: number; level: number | null } | null = null;
let isCalculatingRoute = false;
let routeError: string | null = null;

mapSection = createMapSection({
  mapContainer,
  getMapParams: () => initialParams.map,
  getCurrentPose: () => gnssPose,
  getCurrentItinerary: () => currentItinerary,
  getCanPickDestination: () => {
    if (!gnssRunning) return { ok: false, reason: 'Please start GNSS Location Source first' };
    if (!gnssPose.position || !('latitude' in gnssPose.position)) {
      return { ok: false, reason: 'Waiting for GNSS position. Please wait for location to be acquired.' };
    }
    return { ok: true };
  },
  getDestinationLevel: () => {
    if (!destinationLevelInput.value) return null;
    const parsed = parseInt(destinationLevelInput.value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  },
  onDestinationSelected: (destination: DestinationCoords) => {
    setDestination(destination.lat, destination.lon, destination.level);
  },
});

// Set up GnssWifiLocationSource listeners
gnssLocationSource.onUpdate((pose: Pose) => {
  gnssPose = pose;
  updatePositionDisplay();
  updateMapUserPosition();
  updateButtonStates();
  updateNavigationInfo();
});

gnssLocationSource.onError((error: Error) => {
  gnssError = error.message;
  updateErrorDisplay();
  console.error('[GnssWifiLocationSource] Error:', error);
});

gnssLocationSource.onLocationStateChange((state) => {
  if (locationStateEl) {
    locationStateEl.textContent = state;
  }
});

// Initialize MapLibre map
function initializeMap(): void {
  if (!mapSection) return;
  // Delegate map creation/click handling to the reusable module.
  mapSection.initWhenMapLibreReady().catch((err) => console.error('Map initialization failed:', err));
}

// Set destination from map click
function setDestination(lat: number, lon: number, level: number | null = null): void {
  destinationCoords = { lat, lon, level };
  updateDestinationInfo();
  updateButtonStates();
}

// Calculate route from current position to destination
async function calculateRoute(): Promise<void> {
  if (!gnssPose.position || !('latitude' in gnssPose.position)) {
    alert('No GNSS position available. Please start GNSS Location Source first.');
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
      gnssPose.position.latitude,
      gnssPose.position.longitude,
      null,
      gnssPose.position.level
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
    updateNavigationInfo();
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

// Update user position marker on map
function updateMapUserPosition(): void {
  mapSection?.updateUserPosition(gnssPose);
}

// Update route on map
function updateMapRoute(): void {
  mapSection?.updateRoute(currentItinerary);
}

// Update position display only
function updatePositionDisplay(): void {
  const position = gnssPose.position;
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
    if (gnssError) {
      errorMessageEl.style.display = 'block';
      errorMessageEl.style.color = '#dc3545';
      errorMessageEl.style.fontSize = '0.875rem';
      errorMessageEl.innerHTML = `<strong>⚠️ Error:</strong> ${gnssError}`;
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
  if (startGnssBtn) {
    startGnssBtn.disabled = gnssRunning;
  }
  if (startItineraryBtn) {
    startItineraryBtn.disabled = !gnssRunning || !destinationCoords || isCalculatingRoute;
    startItineraryBtn.textContent = isCalculatingRoute ? 'Calculating...' : 'Start Itinerary';
  }
  if (updateLevelBtn) {
    updateLevelBtn.disabled = !destinationCoords;
  }
}

// Update navigation info display
function updateNavigationInfo(): void {
  if (!navigationInfoEl) return;

  renderNavigationInfo({
    navigationInfoEl,
    vpsPose: gnssPose,
    currentItinerary,
    itineraryInfoManager,
  });
}

// Handle GNSS start
async function handleStartGNSS() {
  try {
    // Request device orientation permission (iOS)
    if ((DeviceOrientationEvent as any).requestPermission) {
      await (DeviceOrientationEvent as any).requestPermission();
    }
    
    // Start GNSS source
    await gnssLocationSource.start();
    gnssRunning = true;
    gnssError = null;
    updateButtonStates();
    updateErrorDisplay();

    console.log('GnssWifiLocationSource started');
  } catch (error) {
    console.error(error);
    gnssError = error instanceof Error ? error.message : String(error);
    updateErrorDisplay();
    updateButtonStates();
    console.error('Failed to start GnssWifiLocationSource:', error);
    alert(`Failed to start GNSS Location Source: ${gnssError}`);
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

// Initialize
(async () => {
  try {
    // Set up event listeners
    if (startGnssBtn) {
      startGnssBtn.onclick = handleStartGNSS;
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
    updateNavigationInfo();
    
    // Initialize map after UI is rendered and MapLibre is loaded
    setTimeout(() => {
      if (typeof (window as any).maplibregl !== 'undefined') {
        initializeMap();
      } else {
        const checkMapLibre = setInterval(() => {
          if (typeof (window as any).maplibregl !== 'undefined') {
            clearInterval(checkMapLibre);
            initializeMap();
          }
        }, 100);
        setTimeout(() => clearInterval(checkMapLibre), 5000);
      }
    }, 100);
    
    console.log('Combined features (GNSS) page initialized.');
  } catch (error) {
    console.error('Failed to initialize page:', error);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding: 2rem; font-family: system-ui, sans-serif;';
    errorDiv.innerHTML = `
      <h1>Combined Features (GNSS)</h1>
      <div style="margin-top: 2rem; padding: 1rem; background: #f8d7da; border-radius: 8px; border: 1px solid #dc3545;">
        <h2>Error</h2>
        <p><strong>Failed to initialize:</strong> ${error instanceof Error ? error.message : String(error)}</p>
      </div>
    `;
    document.body.appendChild(errorDiv);
  }
})();

