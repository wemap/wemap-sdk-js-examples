/**
 * Example page for Routing package
 * 
 * Demonstrates Router, route calculation, itinerary management, and Navigation utilities
 */
import { CoreConfig, type GeocodingResult } from '@wemap/core';
import {
  Router,
  Coordinates,
  ItineraryInfoManager,
  type Itinerary as ItineraryType,
  type ItineraryInfo,
} from '@wemap/routing';
import * as maplibregl from 'maplibre-gl';
import { ExampleMapStack } from './shared/ExampleMapStack';

type RouteEndpoint = 'departure' | 'arrival';
const GEOCODE_DEBOUNCE_MS = 300;

// Display example info
const app = document.querySelector<HTMLDivElement>('#app')!;
let contentContainer: HTMLDivElement | null = null;
let mapContainer: HTMLDivElement | null = null;

// Initialize core
const core = new CoreConfig();
let coreInitialized = false;

try {
  await core.init({
    emmid: '31668',
    token: 'WEMAP_TOKEN',
  });
  coreInitialized = true;
} catch (error) {
  console.warn('Core initialization failed, continuing without it:', error);
}

// Router instance
let currentItinerary: ItineraryType | null = null;
let routeError: string | null = null;
let isCalculating = false;

// Navigation state
let navigationInfo: ItineraryInfo | null = null;
let testPosition: { lat: number; lon: number } | null = null;
let itineraryInfoManager: ItineraryInfoManager | null = null;

// Route coordinates state
let originPosition: { lat: number; lon: number } | null = null;
let destinationPosition: { lat: number; lon: number } | null = null;

let mapStack: ExampleMapStack | null = null;
let router: Router | null = null;
const geocoding = core.createGeocodingService({ language: 'en' });

let departureInput: HTMLInputElement | null = null;
let arrivalInput: HTMLInputElement | null = null;
let departureSuggestionsEl: HTMLUListElement | null = null;
let arrivalSuggestionsEl: HTMLUListElement | null = null;
let departureSearchTimer: ReturnType<typeof setTimeout> | null = null;
let arrivalSearchTimer: ReturnType<typeof setTimeout> | null = null;
let geocodeFieldsWired = false;

// Initialize Router
function initializeRouter(): void {
  try {
    
    // Initialize Remoterouter with config
    router = new Router();
    updateUI();
  } catch (error) {
    routeError = error instanceof Error ? error.message : String(error);
    console.error('Failed to initialize Router:', error);
    updateUI();
  }
}

// Calculate route
async function calculateRoute(from: { lat: number; lon: number }, to: { lat: number; lon: number }): Promise<void> {
  if (!router) {
    routeError = 'Router not initialized';
    updateUI();
    return;
  }

  isCalculating = true;
  routeError = null;
  updateUI();

  try {
    const itineraries = await router.directions(
      new Coordinates(from.lat, from.lon),
      new Coordinates(to.lat, to.lon),
      'WALK',
    );

    currentItinerary = itineraries[0];
    console.log('Route calculated:', itineraries);
    
    // Initialize ItineraryInfoManager with the itinerary
    itineraryInfoManager = new ItineraryInfoManager();
    itineraryInfoManager.itinerary = currentItinerary;
    
    // Update navigation info if test position is set
    if (testPosition) {
      updateNavigationInfo();
    }
    
    updateUI();
    updateMapRoute();
  } catch (error) {
    routeError = error instanceof Error ? error.message : String(error);
    console.error('Failed to calculate route:', error);
    updateUI();
  } finally {
    isCalculating = false;
    updateUI();
  }
}

// Update navigation info
function updateNavigationInfo(): void {
  if (!itineraryInfoManager || !testPosition || !currentItinerary) {
    navigationInfo = null;
    updateMapTestPosition();
    return;
  }

  try {
    const userPosition = new Coordinates(testPosition.lat, testPosition.lon);
    navigationInfo = itineraryInfoManager.getInfo(userPosition);
    updateMapTestPosition();
    console.log('Navigation info updated:', navigationInfo);
  } catch (error) {
    console.error('Failed to calculate navigation info:', error);
    navigationInfo = null;
    updateMapTestPosition();
  }
}

function initializeMap(): void {
  if (mapStack || !mapContainer) {
    return;
  }

  mapStack = new ExampleMapStack({
    container: mapContainer,
    followOnFirstFix: false,
  });

  const map = mapStack.wemapMap.maplibre;
  let popup: maplibregl.Popup | null = null;

  map.on('load', () => {
    console.log('Map loaded');
    updateMapRoute();
    updateMapTestPosition();

    if (originPosition) {
      updateOriginMarker(originPosition.lat, originPosition.lon);
    }

    if (destinationPosition) {
      updateDestinationMarker(destinationPosition.lat, destinationPosition.lon);
    }
  });

  map.on('click', (e) => {
    const lng = e.lngLat.lng;
    const lat = e.lngLat.lat;

    if (popup) {
      popup.remove();
    }

    const popupContent = document.createElement('div');
    popupContent.style.padding = '10px';
    popupContent.style.minWidth = '150px';

    const title = document.createElement('div');
    title.textContent = 'Select point type:';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '10px';
    popupContent.appendChild(title);

    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '5px';

    const createButton = (text: string, onClick: () => void) => {
      const btn = document.createElement('button');
      btn.textContent = text;
      btn.style.cssText =
        'padding:8px 12px;border:none;border-radius:4px;cursor:pointer;background:#007bff;color:white;font-size:14px';
      btn.onclick = () => {
        onClick();
        popup?.remove();
        popup = null;
      };
      return btn;
    };

    buttonContainer.appendChild(
      createButton('Set as Origin', () => {
        void setEndpointFromMap('departure', lat, lng);
      })
    );

    buttonContainer.appendChild(
      createButton('Set as Destination', () => {
        void setEndpointFromMap('arrival', lat, lng);
      })
    );

    if (currentItinerary) {
      buttonContainer.appendChild(
        createButton('Set as Test Position', () => {
          testPosition = { lat, lon: lng };
          updateNavigationInfo();
          updateUI();
        })
      );
    }

    popupContent.appendChild(buttonContainer);

    popup = new maplibregl.Popup({ closeOnClick: true })
      .setLngLat([lng, lat])
      .setDOMContent(popupContent)
      .addTo(map);
  });
}

function syncRouteEndpointMarkers(itinerary: ItineraryType): void {
  const coords = itinerary.coords ?? [];

  if (!coords.length || !mapStack) {
    return;
  }

  const first = coords[0];
  const last = coords[coords.length - 1];
  mapStack.setOrigin(first.latitude, first.longitude, first.level);
  mapStack.setDestination(last.latitude, last.longitude, last.level);
}

function updateMapRoute(): void {
  if (!mapStack) {
    return;
  }

  if (!currentItinerary) {
    mapStack.clearRoute();
    return;
  }

  mapStack.setRoute(currentItinerary);
  syncRouteEndpointMarkers(currentItinerary);
}

function updateOriginMarker(lat: number, lon: number): void {
  mapStack?.setOrigin(lat, lon);
}

function updateDestinationMarker(lat: number, lon: number): void {
  mapStack?.setDestination(lat, lon);
}

function updateMapTestPosition(): void {
  if (!mapStack) {
    return;
  }

  if (!testPosition) {
    mapStack.clearTestPosition();
    return;
  }

  mapStack.setTestPosition(testPosition.lat, testPosition.lon);
}

function getEndpointElements(endpoint: RouteEndpoint): {
  input: HTMLInputElement | null;
  suggestions: HTMLUListElement | null;
} {
  if (endpoint === 'departure') {
    return { input: departureInput, suggestions: departureSuggestionsEl };
  }

  return { input: arrivalInput, suggestions: arrivalSuggestionsEl };
}

function hideSuggestions(endpoint: RouteEndpoint): void {
  const { suggestions } = getEndpointElements(endpoint);
  if (!suggestions) {
    return;
  }

  suggestions.innerHTML = '';
  suggestions.hidden = true;
}

function renderSuggestionsStatus(endpoint: RouteEndpoint, message: string): void {
  const { suggestions } = getEndpointElements(endpoint);
  if (!suggestions) {
    return;
  }

  suggestions.innerHTML = `<li class="geocode-suggestions__status">${message}</li>`;
  suggestions.hidden = false;
}

function renderSuggestions(endpoint: RouteEndpoint, results: GeocodingResult[]): void {
  const { suggestions } = getEndpointElements(endpoint);
  if (!suggestions) {
    return;
  }

  if (results.length === 0) {
    suggestions.innerHTML = '<li class="geocode-suggestions__empty">No places found</li>';
    suggestions.hidden = false;
    return;
  }

  suggestions.innerHTML = '';
  for (const result of results) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = result.placeName;
    button.onclick = () => {
      selectGeocodingResult(endpoint, result);
    };
    item.appendChild(button);
    suggestions.appendChild(item);
  }
  suggestions.hidden = false;
}

async function searchEndpoint(endpoint: RouteEndpoint, query: string): Promise<void> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    hideSuggestions(endpoint);
    return;
  }

  renderSuggestionsStatus(endpoint, 'Searching…');

  try {
    const results = await geocoding.searchMultiple(trimmed);
    renderSuggestions(endpoint, results);
  } catch (error) {
    console.error(`Geocoding search failed (${endpoint}):`, error);
    renderSuggestionsStatus(endpoint, 'Search failed');
  }
}

function scheduleSearch(endpoint: RouteEndpoint, query: string): void {
  if (endpoint === 'departure') {
    if (departureSearchTimer) {
      clearTimeout(departureSearchTimer);
    }
    departureSearchTimer = setTimeout(() => {
      void searchEndpoint(endpoint, query);
    }, GEOCODE_DEBOUNCE_MS);
    return;
  }

  if (arrivalSearchTimer) {
    clearTimeout(arrivalSearchTimer);
  }
  arrivalSearchTimer = setTimeout(() => {
    void searchEndpoint(endpoint, query);
  }, GEOCODE_DEBOUNCE_MS);
}

function flyToEndpoint(lat: number, lon: number): void {
  mapStack?.wemapMap.maplibre.flyTo({
    center: [lon, lat],
    zoom: Math.max(mapStack.wemapMap.maplibre.getZoom(), 14),
  });
}

function applyEndpointPosition(
  endpoint: RouteEndpoint,
  lat: number,
  lon: number,
  label?: string
): void {
  const { input } = getEndpointElements(endpoint);

  if (endpoint === 'departure') {
    originPosition = { lat, lon };
    updateOriginMarker(lat, lon);
  } else {
    destinationPosition = { lat, lon };
    updateDestinationMarker(lat, lon);
  }

  if (input) {
    input.value = label ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }

  hideSuggestions(endpoint);
  flyToEndpoint(lat, lon);
  updateUI();
}

function selectGeocodingResult(endpoint: RouteEndpoint, result: GeocodingResult): void {
  applyEndpointPosition(endpoint, result.latitude, result.longitude, result.placeName);

  if (
    endpoint === 'arrival' &&
    originPosition &&
    destinationPosition &&
    router
  ) {
    void calculateRoute(originPosition, destinationPosition);
  }
}

async function setEndpointFromMap(
  endpoint: RouteEndpoint,
  lat: number,
  lon: number
): Promise<void> {
  applyEndpointPosition(endpoint, lat, lon);

  try {
    const place = await geocoding.reverseGeocode(lat, lon);
    const { input } = getEndpointElements(endpoint);
    if (place && input) {
      input.value = place.placeName;
    }
  } catch (error) {
    console.warn(`Reverse geocoding failed (${endpoint}):`, error);
  }

  if (
    endpoint === 'arrival' &&
    originPosition &&
    destinationPosition &&
    router
  ) {
    void calculateRoute(originPosition, destinationPosition);
  }
}

function wireGeocodeFields(): void {
  if (geocodeFieldsWired) {
    return;
  }

  departureInput = document.getElementById('departure-input') as HTMLInputElement | null;
  arrivalInput = document.getElementById('arrival-input') as HTMLInputElement | null;
  departureSuggestionsEl = document.getElementById(
    'departure-suggestions'
  ) as HTMLUListElement | null;
  arrivalSuggestionsEl = document.getElementById(
    'arrival-suggestions'
  ) as HTMLUListElement | null;

  if (!departureInput || !arrivalInput) {
    return;
  }

  departureInput.addEventListener('input', () => {
    scheduleSearch('departure', departureInput!.value);
  });
  arrivalInput.addEventListener('input', () => {
    scheduleSearch('arrival', arrivalInput!.value);
  });

  departureInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideSuggestions('departure');
    }
  });
  arrivalInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideSuggestions('arrival');
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target as Node | null;
    if (!target) {
      return;
    }

    if (
      departureInput &&
      departureSuggestionsEl &&
      !departureInput.contains(target) &&
      !departureSuggestionsEl.contains(target)
    ) {
      hideSuggestions('departure');
    }

    if (
      arrivalInput &&
      arrivalSuggestionsEl &&
      !arrivalInput.contains(target) &&
      !arrivalSuggestionsEl.contains(target)
    ) {
      hideSuggestions('arrival');
    }
  });

  geocodeFieldsWired = true;
}

// Render itinerary information
function renderItineraryInfo(): string {
  if (!currentItinerary) {
    return '<p style="color: #999;">No itinerary calculated yet</p>';
  }

  const distanceKm = currentItinerary.distance 
    ? `${(currentItinerary.distance / 1000).toFixed(2)} km` 
    : 'N/A';
  const durationMin = currentItinerary.duration 
    ? `${Math.round(currentItinerary.duration / 60)} min` 
    : 'N/A';
  const legsCount = currentItinerary.legs?.length || 0;

  return `
    <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
      <h4>Route Information</h4>
      <div style="margin-left: 1rem; margin-top: 0.5rem;">
        <p><strong>Distance:</strong> ${distanceKm}</p>
        <p><strong>Duration:</strong> ${durationMin}</p>
        <p><strong>Legs:</strong> ${legsCount}</p>
        ${currentItinerary.coords && currentItinerary.coords.length > 0 ? `
          <p><strong>Coordinates:</strong> ${currentItinerary.coords.length} points</p>
        ` : ''}
      </div>
      
      ${currentItinerary.legs && currentItinerary.legs.length > 0 ? `
        <div style="margin-top: 1rem;">
          <h5 style="margin: 0.5rem 0;">Legs</h5>
          <div style="max-height: 200px; overflow-y: auto;">
            ${currentItinerary.legs.map((leg: any, index: number) => `
              <div style="margin-left: 1rem; margin-top: 0.5rem; padding: 0.5rem; background: #f9f9f9; border-radius: 4px;">
                <p style="margin: 0;"><strong>Leg ${index + 1}:</strong></p>
                ${leg.instruction ? `<p style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">${leg.instruction}</p>` : ''}
                ${leg.distance ? `<p style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Distance: ${(leg.distance / 1000).toFixed(2)} km</p>` : ''}
                ${leg.duration ? `<p style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Duration: ${Math.round(leg.duration / 60)} min</p>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      <details style="margin-top: 0.5rem;">
        <summary style="cursor: pointer; font-weight: bold; color: #666;">Raw Itinerary Data</summary>
        <pre>${JSON.stringify(currentItinerary, null, 2)}</pre>
      </details>
    </div>
  `;
}

// Render navigation info
function renderNavigationInfo(): string {
  if (!navigationInfo) {
    return '<p style="color: #999;">Set a test position on the map to see navigation info</p>';
  }

  return `
    <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
      <h4>Navigation Information</h4>
      <div style="margin-left: 1rem; margin-top: 0.5rem;">
        <p><strong>Traveled Distance:</strong> ${(navigationInfo.traveledDistance / 1000).toFixed(2)} km</p>
        <p><strong>Remaining Distance:</strong> ${(navigationInfo.remainingDistance / 1000).toFixed(2)} km</p>
        <p><strong>Traveled Percentage:</strong> ${(navigationInfo.traveledPercentage * 100).toFixed(1)}%</p>
        <p><strong>Remaining Percentage:</strong> ${(navigationInfo.remainingPercentage * 100).toFixed(1)}%</p>
        ${navigationInfo.nextStep ? `
          <div style="margin-top: 0.5rem;">
            <p><strong>Next Step:</strong></p>
            ${'instruction' in navigationInfo.nextStep && navigationInfo.nextStep.instruction ? `<p style="margin-left: 1rem;">${navigationInfo.nextStep.instruction}</p>` : ''}
            ${'distance' in navigationInfo.nextStep && navigationInfo.nextStep.distance ? `<p style="margin-left: 1rem;">Distance: ${(navigationInfo.nextStep.distance / 1000).toFixed(2)} km</p>` : ''}
          </div>
        ` : ''}
        ${navigationInfo.previousStep ? `
          <div style="margin-top: 0.5rem;">
            <p><strong>Previous Step:</strong></p>
            ${'instruction' in navigationInfo.previousStep && navigationInfo.previousStep.instruction ? `<p style="margin-left: 1rem;">${navigationInfo.previousStep.instruction}</p>` : ''}
          </div>
        ` : ''}
        ${navigationInfo.leg ? `
          <div style="margin-top: 0.5rem;">
            <p><strong>Current Leg:</strong></p>
            ${'instruction' in navigationInfo.leg && navigationInfo.leg.instruction ? `<p style="margin-left: 1rem;">${navigationInfo.leg.instruction}</p>` : ''}
            ${navigationInfo.leg.distance ? `<p style="margin-left: 1rem;">Distance: ${(navigationInfo.leg.distance / 1000).toFixed(2)} km</p>` : ''}
          </div>
        ` : ''}
        <details style="margin-top: 0.5rem;">
          <summary style="cursor: pointer; font-weight: bold; color: #666;">Raw Navigation Data</summary>
          <pre style="margin-top: 0.5rem; font-size: 0.875rem; overflow-x: auto; background: #f5f5f5; padding: 0.5rem; border-radius: 4px;">${JSON.stringify(navigationInfo, null, 2)}</pre>
        </details>
      </div>
    </div>
  `;
}

// Initialize UI structure
function initializeUIStructure(): void {
  // HTML is now in routing.html, just get references to elements
  contentContainer = document.getElementById('content-container') as HTMLDivElement;
  mapContainer = document.getElementById('map-container') as HTMLDivElement;
  wireGeocodeFields();
}

// Update UI
function updateUI(): void {
  if (!contentContainer) {
    initializeUIStructure();
  }
  
  if (!contentContainer) return;
    
  // Update core status
  const coreStatusEl = document.getElementById('core-status');
  if (coreStatusEl) {
    coreStatusEl.textContent = coreInitialized ? '✓ Yes' : '✗ No';
    coreStatusEl.style.color = coreInitialized ? '#28a745' : '#dc3545';
  }
  
  // Update router status
  const routerStatusEl = document.getElementById('router-status');
  if (routerStatusEl) {
    routerStatusEl.textContent = router ? '● Initialized' : '○ Not Initialized';
    routerStatusEl.style.color = router ? '#28a745' : '#dc3545';
  }
  
  const routerErrorEl = document.getElementById('router-error');
  const routerErrorMessageEl = document.getElementById('router-error-message');
  if (routerErrorEl && routerErrorMessageEl) {
    if (routeError) {
      routerErrorEl.style.display = 'block';
      routerErrorMessageEl.textContent = routeError;
    } else {
      routerErrorEl.style.display = 'none';
    }
  }
  
  // Update buttons
  const initRouterBtn = document.getElementById('init-router') as HTMLButtonElement;
  if (initRouterBtn) {
    initRouterBtn.disabled = !!router;
    if (!initRouterBtn.onclick) {
      initRouterBtn.onclick = handleInitRouter;
    }
  }
  
  // Check if calculate button should be enabled
  const hasValidOrigin = originPosition !== null;
  const hasValidDestination = destinationPosition !== null;
  
  const calculateRouteBtn = document.getElementById('calculate-route') as HTMLButtonElement;
  if (calculateRouteBtn) {
    calculateRouteBtn.disabled = !router || isCalculating || !hasValidOrigin || !hasValidDestination;
    calculateRouteBtn.textContent = isCalculating ? 'Calculating...' : 'Calculate Route';
    if (!calculateRouteBtn.onclick) {
      calculateRouteBtn.onclick = () => {
        if (originPosition && destinationPosition && router) {
          calculateRoute(originPosition, destinationPosition);
        }
      };
    }
  }
  
  const clearRouteBtn = document.getElementById('clear-route') as HTMLButtonElement;
  if (clearRouteBtn) {
    clearRouteBtn.disabled = !currentItinerary;
    if (!clearRouteBtn.onclick) {
      clearRouteBtn.onclick = handleClearRoute;
    }
  }
  
  // Update itinerary info
  const itineraryInfoContainer = document.getElementById('itinerary-info-container');
  if (itineraryInfoContainer) {
    itineraryInfoContainer.innerHTML = renderItineraryInfo();
  }
  
  // Update navigation info
  const navigationInfoContainer = document.getElementById('navigation-info-container');
  if (navigationInfoContainer) {
    navigationInfoContainer.innerHTML = renderNavigationInfo();
  }
}

// Event handlers
function handleInitRouter(): void {
  initializeRouter();
}


function handleClearRoute(): void {
  currentItinerary = null;
  testPosition = null;
  navigationInfo = null;
  routeError = null;
  originPosition = null;
  destinationPosition = null;
  itineraryInfoManager = null;

  if (departureInput) {
    departureInput.value = '';
  }
  if (arrivalInput) {
    arrivalInput.value = '';
  }
  hideSuggestions('departure');
  hideSuggestions('arrival');

  mapStack?.clearMarkers();
  updateUI();
  updateMapRoute();
  updateMapTestPosition();
}


// Initialize
(async () => {
  try {
    initializeUIStructure();
    updateUI();
    
    initializeMap();

    console.log('Routing example page initialized.');
  } catch (error) {
    console.error('Failed to initialize example page:', error);
    app.innerHTML = `
      <div style="padding: 2rem; font-family: system-ui, sans-serif;">
        <h1>Routing Example</h1>
        <div style="margin-top: 2rem; padding: 1rem; background: #f8d7da; border-radius: 8px; border: 1px solid #dc3545;">
          <h2>Error</h2>
          <p><strong>Failed to initialize:</strong> ${error instanceof Error ? error.message : String(error)}</p>
        </div>
      </div>
    `;
  }
})();

