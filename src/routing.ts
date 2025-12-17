/**
 * Example page for Routing package
 * 
 * Demonstrates Router, route calculation, itinerary management, and Navigation utilities
 */
import { CoreConfig } from '@wemap/core';
import { 
  Router,
  Coordinates,
  ItineraryInfoManager,
  type Itinerary as ItineraryType,
  type ItineraryInfo,
} from '@wemap/routing';

// Display example info
const app = document.querySelector<HTMLDivElement>('#app')!;
let contentContainer: HTMLDivElement | null = null;
let mapContainer: HTMLDivElement | null = null;

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

// Map state
let map: any = null;
let routeSourceId: string | null = null;
let originMarker: any = null;
let destinationMarker: any = null;
let testPositionMarker: any = null;
let router: Router | null = null;

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
    updateMapRoute();
    updateMapTestPosition();
    
    // Update markers from stored positions if they exist
    if (originPosition && map && map.loaded()) {
      updateOriginMarker(originPosition.lat, originPosition.lon);
    }
    
    if (destinationPosition && map && map.loaded()) {
      updateDestinationMarker(destinationPosition.lat, destinationPosition.lon);
    }
  });

  // Add click handler for map interactions with popup
  let popup: any = null;
  
  map.on('click', (e: any) => {
    const lng = e.lngLat.lng;
    const lat = e.lngLat.lat;
    
    // Remove existing popup if any
    if (popup) {
      popup.remove();
    }
    
    const maplibregl = (window as any).maplibregl;
    
    // Create popup content with buttons
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
    
    // Create buttons for each option
    const createButton = (text: string, onClick: () => void) => {
      const btn = document.createElement('button');
      btn.textContent = text;
      btn.style.padding = '8px 12px';
      btn.style.border = 'none';
      btn.style.borderRadius = '4px';
      btn.style.cursor = 'pointer';
      btn.style.backgroundColor = '#007bff';
      btn.style.color = 'white';
      btn.style.fontSize = '14px';
      btn.onclick = () => {
        onClick();
        if (popup) {
          popup.remove();
          popup = null;
        }
      };
      return btn;
    };
    
    // Add "Set as Origin" button
    const originBtn = createButton('Set as Origin', () => {
      originPosition = { lat, lon: lng };
      console.log('Origin set from map click:', { lat, lng });
      updateOriginMarker(lat, lng);
      updateUI(); // Update button states
    });
    buttonContainer.appendChild(originBtn);
    
    // Add "Set as Destination" button
    const destinationBtn = createButton('Set as Destination', () => {
      destinationPosition = { lat, lon: lng };
      console.log('Destination set from map click:', { lat, lng });
      updateDestinationMarker(lat, lng);
      updateUI(); // Update button states
      
      // If origin is set and router is initialized, calculate route automatically
      if (originPosition && router) {
        calculateRoute(originPosition, destinationPosition);
      }
    });
    buttonContainer.appendChild(destinationBtn);
    
    // Add "Set as Test Position" button (only if route exists)
    if (currentItinerary) {
      const testBtn = createButton('Set as Test Position', () => {
        testPosition = { lat, lon: lng };
        updateNavigationInfo();
        updateUI();
        console.log('Test position set from map click:', { lat, lng });
      });
      buttonContainer.appendChild(testBtn);
    }
    
    popupContent.appendChild(buttonContainer);
    
    // Create and add popup to map
    popup = new maplibregl.Popup({ closeOnClick: true })
      .setLngLat([lng, lat])
      .setDOMContent(popupContent)
      .addTo(map);
  });
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

  // Add origin and destination markers (only update if they don't exist or route changed)
  if (coords.length > 0) {
    const maplibregl = (window as any).maplibregl;
    
    // Origin marker - update position to match route start
    if (originMarker) {
      originMarker.setLngLat([coords[0].longitude, coords[0].latitude]);
    } else {
      originMarker = new maplibregl.Marker({ color: '#28a745' })
        .setLngLat([coords[0].longitude, coords[0].latitude])
        .addTo(map);
    }

    // Destination marker - update position to match route end
    const lastCoord = coords[coords.length - 1];
    if (destinationMarker) {
      destinationMarker.setLngLat([lastCoord.longitude, lastCoord.latitude]);
    } else {
      destinationMarker = new maplibregl.Marker({ color: '#dc3545' })
        .setLngLat([lastCoord.longitude, lastCoord.latitude])
        .addTo(map);
    }

    // Fit map to show entire route
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

// Update origin marker on map
function updateOriginMarker(lat: number, lon: number): void {
  if (!map || !map.loaded()) {
    return;
  }

  const maplibregl = (window as any).maplibregl;

  if (originMarker) {
    originMarker.remove();
  }
  originMarker = new maplibregl.Marker({ color: '#28a745' })
    .setLngLat([lon, lat])
    .addTo(map);
}

// Update destination marker on map
function updateDestinationMarker(lat: number, lon: number): void {
  if (!map || !map.loaded()) {
    return;
  }

  const maplibregl = (window as any).maplibregl;

  if (destinationMarker) {
    destinationMarker.remove();
  }
  destinationMarker = new maplibregl.Marker({ color: '#dc3545' })
    .setLngLat([lon, lat])
    .addTo(map);
}

// Update test position marker on map
function updateMapTestPosition(): void {
  if (!map || !map.loaded() || !testPosition) {
    if (testPositionMarker) {
      testPositionMarker.remove();
      testPositionMarker = null;
    }
    return;
  }

  const maplibregl = (window as any).maplibregl;

  if (!testPositionMarker) {
    testPositionMarker = new maplibregl.Marker({ color: '#ffc107' })
      .setLngLat([testPosition.lon, testPosition.lat])
      .addTo(map);
  } else {
    testPositionMarker.setLngLat([testPosition.lon, testPosition.lat]);
  }
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
  
  // Clear all markers
  if (originMarker) {
    originMarker.remove();
    originMarker = null;
  }
  if (destinationMarker) {
    destinationMarker.remove();
    destinationMarker = null;
  }
  if (testPositionMarker) {
    testPositionMarker.remove();
    testPositionMarker = null;
  }
  
  updateUI();
  updateMapRoute();
  updateMapTestPosition();
}


// Initialize
(async () => {
  try {
    initializeUIStructure();
    updateUI();
    
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

