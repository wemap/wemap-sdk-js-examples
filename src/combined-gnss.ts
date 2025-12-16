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
// Get DOM elements
const mapContainer = document.getElementById('map-container') as HTMLDivElement;
const currentLatEl = document.getElementById('current-lat') as HTMLSpanElement;
const currentLonEl = document.getElementById('current-lon') as HTMLSpanElement;
const currentLevelEl = document.getElementById('current-level') as HTMLSpanElement;
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

try {
  await core.init({
    emmid: '30265',
    token: 'WEMAP_TOKEN',
  });
} catch (error) {
  console.warn('Core initialization failed, continuing without it:', error);
}

// Create GnssWifiLocationSource instance
const gnssLocationSource = new GnssWifiLocationSource({
  usePositionSmoother: true,
  enableAttitude: true
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
    console.log('Map clicked', { gnssRunning, hasPosition: !!gnssPose.position, mapLoaded: map.loaded() });
    
    // Check if map is loaded
    if (!map.loaded()) {
      console.warn('Map not loaded yet');
      return;
    }
    
    if (!gnssRunning) {
      alert('Please start GNSS Location Source first');
      return;
    }
    
    if (!gnssPose.position || !('latitude' in gnssPose.position)) {
      alert('Waiting for GNSS position. Please wait for location to be acquired.');
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
  if (!map || !map.loaded() || !gnssPose.position || !('latitude' in gnssPose.position) || !('longitude' in gnssPose.position)) {
    return;
  }

  const lat = gnssPose.position.latitude;
  const lon = gnssPose.position.longitude;

  // Get heading from attitude if available
  let heading: number | null = null;
  if (gnssPose.attitude && 'heading' in gnssPose.attitude && typeof gnssPose.attitude.heading === 'number') {
    heading = gnssPose.attitude.heading;
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
  if (heading !== null && markerConeElement) {
    let headingDegrees: number;
    if (heading > 2 * Math.PI) {
      headingDegrees = heading % 360;
    } else {
      headingDegrees = (heading * 180 / Math.PI) % 360;
    }
    
    markerConeElement.style.transform = `rotate(${headingDegrees}deg) translate(-50%, -50%)`;
    markerConeElement.style.display = 'block';
  } else if (markerConeElement) {
    markerConeElement.style.display = 'none';
  }

  // Center map on user position on first update only
  if (!mapCentered && gnssPose.position && 'latitude' in gnssPose.position) {
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
  if (!navigationInfoEl) {
    return;
  }

  // Need both itinerary and current position
  if (!currentItinerary || !gnssPose.position || !('latitude' in gnssPose.position)) {
    navigationInfoEl.style.display = 'none';
    return;
  }

  try {
    // Create Coordinates from current position
    const altitude = 'altitude' in gnssPose.position && typeof gnssPose.position.altitude === 'number' 
      ? gnssPose.position.altitude 
      : null;
    const level = 'level' in gnssPose.position && gnssPose.position.level !== null 
      ? gnssPose.position.level 
      : null;
    
    const currentPosition = new Coordinates(
      gnssPose.position.latitude,
      gnssPose.position.longitude,
      altitude,
      level
    );

    // Get navigation info
    const navInfo = itineraryInfoManager.getInfo(currentPosition);
    console.log('navInfo', navInfo);

    if (!navInfo) {
      navigationInfoEl.style.display = 'none';
      return;
    }

    // Display navigation info
    navigationInfoEl.style.display = 'block';
    
    const distanceRemaining = navInfo.remainingDistance !== undefined 
      ? `${(navInfo.remainingDistance / 1000).toFixed(2)} km` 
      : 'N/A';
    const progress = navInfo.traveledPercentage !== undefined 
      ? `${(navInfo.traveledPercentage).toFixed(1)}%` 
      : 'N/A';

    let html = `
      <h4 style="margin-top: 0;">Navigation Information</h4>
      <div style="margin-left: 1rem; margin-top: 0.5rem;">
        <p><strong>Distance Remaining:</strong> ${distanceRemaining}</p>
        <p><strong>Progress:</strong> ${progress}</p>
    `;

    if (navInfo.nextStep) {
      const nextStepDirection = navInfo.nextStep.direction || 'N/A';
      html += `<p><strong>Next Step:</strong> ${nextStepDirection}</p>`;
    }

    html += `</div>`;

    navigationInfoEl.innerHTML = html;
  } catch (error) {
    console.error('Failed to get navigation info:', error);
    navigationInfoEl.style.display = 'none';
  }
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

