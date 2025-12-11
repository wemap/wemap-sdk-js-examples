/**
 * Combined features page: VPSLocationSource + Router + Map Matching
 * 
 * Features:
 * - Start VPSLocationSource (automatically starts scan)
 * - Click on map to choose destination
 * - Start itinerary (calls router)
 * - Shows itinerary on map + sets for map matching
 */
import { CoreConfig } from '@wemap-sdk/core';
import { 
  VPSLocationSource,
  MapMatching,
  requestSensorPermissions,
  type Pose 
} from '@wemap-sdk/positioning';
import { Camera } from '@wemap-sdk/camera';
import { 
  Router,
  Coordinates,
  ItineraryInfoManager,
  type Itinerary as ItineraryType
} from '@wemap-sdk/routing';

// Get DOM elements
const mapContainer = document.getElementById('map-container') as HTMLDivElement;
const currentLatEl = document.getElementById('current-lat') as HTMLSpanElement;
const currentLonEl = document.getElementById('current-lon') as HTMLSpanElement;
const currentLevelEl = document.getElementById('current-level') as HTMLSpanElement;
const startVpsBtn = document.getElementById('start-vps') as HTMLButtonElement;
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

try {
  await core.init({
    emmid: '30763',
    token: 'WEMAP_TOKEN',
  });
} catch (error) {
  console.warn('Core initialization failed, continuing without it:', error);
}

// Create VPSLocationSource instance
const vpsLocationSource = new VPSLocationSource({
  usePositionSmoother: true
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
let destinationMarker: any = null;
let destinationCoords: { lat: number; lon: number; level: number | null } | null = null;
let isCalculatingRoute = false;
let routeError: string | null = null;

// Map state
let map: any = null;
let userMarker: any = null;
let markerConeElement: HTMLElement | null = null;
let routeSourceId: string | null = null;
let mapCentered = false;

// Set up VPSLocationSource listeners
vpsLocationSource.onUpdate((pose: Pose) => {
  vpsPose = pose;
  updatePositionDisplay();
  updateMapUserPosition();
  updateButtonStates();
  updateNavigationInfo();
});

vpsLocationSource.onError((error: Error) => {
  vpsError = error.message;
  updateErrorDisplay();
  console.error('[VPSLocationSource] Error:', error);
});

// Initialize MapLibre map
function initializeMap(): void {
  if (map) {
    return;
  }

  if (typeof (window as any).maplibregl === 'undefined') {
    console.warn('MapLibre GL JS not loaded');
    return;
  }

  const maplibregl = (window as any).maplibregl;

  if (!mapContainer) {
    console.warn('Map container not found');
    return;
  }

  map = new maplibregl.Map({
    container: mapContainer,
    style: 'https://tiles.getwemap.com/styles/wemap-v2-fr.json',
    center: [2.3522, 48.8566], // Paris center
    zoom: 13
  });

  map.on('load', () => {
    console.log('Map loaded');
    updateMapUserPosition();
    updateMapRoute();
  });

  // Add click handler for destination selection
  map.on('click', (e: any) => {
    console.log('Map clicked', { vpsRunning, hasPosition: !!vpsPose.position, mapLoaded: map.loaded() });
    
    // Check if map is loaded
    if (!map.loaded()) {
      console.warn('Map not loaded yet');
      return;
    }
    
    if (!vpsRunning) {
      alert('Please start VPSLocationSource first');
      return;
    }
    
    if (!vpsPose.position || !('latitude' in vpsPose.position)) {
      alert('Waiting for VPS position. Please wait for the scan to complete.');
      return;
    }

    const { lng, lat } = e.lngLat;
    console.log('Setting destination:', { lat, lng });
    
    // Get level from input if available, otherwise use null
    const levelInput = document.getElementById('destination-level') as HTMLInputElement;
    const level = levelInput && levelInput.value !== '' ? parseInt(levelInput.value, 10) : null;
    setDestination(lat, lng, isNaN(level as number) ? null : level);
  });
  
  // Ensure map container is clickable
  if (mapContainer) {
    mapContainer.style.pointerEvents = 'auto';
    // Cursor styling is handled by CSS class 'clickable'
  }
}

// Set destination from map click
function setDestination(lat: number, lon: number, level: number | null = null): void {
  destinationCoords = { lat, lon, level };
  
  // Update input value if level is provided
  if (destinationLevelInput && level !== null) {
    destinationLevelInput.value = String(level);
  }
  
  const maplibregl = (window as any).maplibregl;
  
  // Remove existing destination marker
  if (destinationMarker) {
    destinationMarker.remove();
  }
  
  // Add new destination marker
  destinationMarker = new maplibregl.Marker({ color: '#dc3545' })
    .setLngLat([lon, lat])
    .addTo(map);
  
  updateDestinationInfo();
  updateButtonStates();
}

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
  if (!map || !map.loaded() || !vpsPose.position || !('latitude' in vpsPose.position) || !('longitude' in vpsPose.position)) {
    return;
  }

  const lat = vpsPose.position.latitude;
  const lon = vpsPose.position.longitude;

  // Get heading from attitude if available
  let headingDegrees: number | null = null;
  if (vpsPose.attitude && 'headingDegrees' in vpsPose.attitude && typeof vpsPose.attitude.headingDegrees === 'number') {
    headingDegrees = vpsPose.attitude.headingDegrees;
  }

  if (!userMarker) {
    // Create container element for both dot and cone
    const containerEl = document.createElement('div');
    containerEl.classList.add('location-container');

    // Create HTML element for the blue dot
    const dotEl = document.createElement('div');
    dotEl.classList.add('location-dot');

    // Create HTML element for the heading cone
    const coneEl = document.createElement('div');
    coneEl.classList.add('location-compass');
    markerConeElement = coneEl;

    // Add both elements to container
    containerEl.appendChild(coneEl);
    containerEl.appendChild(dotEl);

    // Create marker with combined HTML element
    const maplibregl = (window as any).maplibregl;
    userMarker = new maplibregl.Marker({ 
      element: containerEl,
      pitchAlignment: 'map',
      rotationAlignment: 'map',
      anchor: 'center'
    })
      .setLngLat([lon, lat])
      .addTo(map);
  } else {
    // Update existing marker position
    userMarker.setLngLat([lon, lat]);
  }

  // Update heading cone rotation if heading is available
  if (headingDegrees !== null && markerConeElement) {
    if (headingDegrees < 0) {
      headingDegrees += 360;
    }
    
    markerConeElement.style.transform = `rotate(${headingDegrees}deg) translate(-50%, -50%)`;
    markerConeElement.style.display = 'block';
  } else if (markerConeElement) {
    markerConeElement.style.display = 'none';
  }

  // Center map on user position on first update only
  if (!mapCentered && vpsPose.position && 'latitude' in vpsPose.position) {
    map.flyTo({
      center: [lon, lat],
      duration: 1000,
      zoom: 15
    });
    mapCentered = true;
  }
}

// Update route on map
function updateMapRoute(): void {
  if (!map || !map.loaded() || !currentItinerary) {
    // Remove route if it exists
    if (routeSourceId && map?.getSource(routeSourceId)) {
      if (map.getLayer('route')) {
        map.removeLayer('route');
      }
      map.removeSource(routeSourceId);
      routeSourceId = null;
    }
    return;
  }

  const coords = currentItinerary.coords || [];
  if (coords.length === 0) {
    return;
  }

  const routeCoordinates = coords.map((coord: Coordinates) => [coord.longitude, coord.latitude]);

  const routeGeoJson = {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: routeCoordinates
    }
  };

  // Remove existing route
  if (routeSourceId && map.getSource(routeSourceId)) {
    if (map.getLayer('route')) {
      map.removeLayer('route');
    }
    map.removeSource(routeSourceId);
  }

  // Add new route
  routeSourceId = 'route-source';
  map.addSource(routeSourceId, {
    type: 'geojson',
    data: routeGeoJson
  });

  map.addLayer({
    id: 'route',
    type: 'line',
    source: routeSourceId,
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#007bff',
      'line-width': 4,
      'line-opacity': 0.8
    }
  });

  // Fit map to show entire route
  if (routeCoordinates.length > 0) {
    const maplibregl = (window as any).maplibregl;
    const bounds = new maplibregl.LngLatBounds(
      [coords[0].longitude, coords[0].latitude],
      [coords[0].longitude, coords[0].latitude]
    );
    routeCoordinates.forEach((coord: number[]) => {
      bounds.extend(coord as [number, number]);
    });

    const isMobile = window.innerWidth < 768;
    map.fitBounds(bounds, {
      padding: isMobile ? 20 : 50,
      duration: 1000
    });
  }
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
  if (startVpsBtn) {
    startVpsBtn.disabled = vpsRunning;
  }
  if (startItineraryBtn) {
    startItineraryBtn.disabled = !vpsRunning || !destinationCoords || isCalculatingRoute;
    startItineraryBtn.textContent = isCalculatingRoute ? 'Calculating...' : 'Start Itinerary';
  }
  if (updateLevelBtn) {
    updateLevelBtn.disabled = !destinationCoords;
  }
}

// Update navigation info display
function updateNavigationInfo(): void {
  if (!navigationInfoEl) {
    return;
  }

  // Need both itinerary and current position
  if (!currentItinerary || !vpsPose.position || !('latitude' in vpsPose.position)) {
    navigationInfoEl.style.display = 'none';
    return;
  }

  try {
    // Create Coordinates from current position
    const altitude = 'altitude' in vpsPose.position && typeof vpsPose.position.altitude === 'number' 
      ? vpsPose.position.altitude 
      : null;
    const level = 'level' in vpsPose.position && vpsPose.position.level !== null 
      ? vpsPose.position.level 
      : null;
    
    const currentPosition = new Coordinates(
      vpsPose.position.latitude,
      vpsPose.position.longitude,
      altitude,
      level
    );

    // Get navigation info
    const navInfo = itineraryInfoManager.getInfo(currentPosition) as any;

    if (!navInfo) {
      navigationInfoEl.style.display = 'none';
      return;
    }

    // Display navigation info
    navigationInfoEl.style.display = 'block';
    
    const distanceRemaining = navInfo.distanceRemaining !== undefined 
      ? `${(navInfo.distanceRemaining / 1000).toFixed(2)} km` 
      : 'N/A';
    const timeRemaining = navInfo.timeRemaining !== undefined 
      ? `${Math.round(navInfo.timeRemaining / 60)} min` 
      : 'N/A';
    const progress = navInfo.progress !== undefined 
      ? `${(navInfo.progress * 100).toFixed(1)}%` 
      : 'N/A';
    const isAtDestination = navInfo.isAtDestination !== undefined 
      ? (navInfo.isAtDestination ? 'Yes' : 'No') 
      : 'N/A';

    let html = `
      <h4 style="margin-top: 0;">Navigation Information</h4>
      <div style="margin-left: 1rem; margin-top: 0.5rem;">
        <p><strong>Distance Remaining:</strong> ${distanceRemaining}</p>
        <p><strong>Time Remaining:</strong> ${timeRemaining}</p>
        <p><strong>Progress:</strong> ${progress}</p>
        <p><strong>At Destination:</strong> ${isAtDestination}</p>
    `;

    if (navInfo.nextStep) {
      const nextStepDirection = navInfo.nextStep.direction || (navInfo.nextStep as any).instruction || 'N/A';
      html += `<p><strong>Next Step:</strong> ${nextStepDirection}</p>`;
    }

    if (navInfo.currentLeg) {
      html += `<p><strong>Current Leg:</strong> ${navInfo.currentLeg.steps?.length || 0} steps</p>`;
    }

    html += `</div>`;

    navigationInfoEl.innerHTML = html;
  } catch (error) {
    console.error('Failed to get navigation info:', error);
    navigationInfoEl.style.display = 'none';
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
      await stopCamera();
    }

    updateButtonStates();
  } catch (error) {
    vpsError = error instanceof Error ? error.message : String(error);
    updateErrorDisplay();
    updateButtonStates();
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

