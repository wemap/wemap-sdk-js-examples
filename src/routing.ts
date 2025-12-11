/**
 * Example page for Routing package
 * 
 * Demonstrates Router, route calculation, itinerary management, and Navigation utilities
 */
import { CoreConfig } from '@wemap-sdk/core';
import { 
  Router,
  Coordinates,
  type Itinerary as ItineraryType,
} from '@wemap-sdk/routing';

// Display example info
const app = document.querySelector<HTMLDivElement>('#app')!;
let contentContainer: HTMLDivElement | null = null;
let mapContainer: HTMLDivElement | null = null;

// Initialize core
const core = new CoreConfig();
let coreInitialized = false;

try {
  await core.init({
    emmid: '30763',
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
let navigationInfo: any | null = null;
let testPosition: { lat: number; lon: number } | null = null;

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
    const config = CoreConfig.getConfig();
    
    // Get routing configuration from CoreConfig
    const routingType = config?.routingType || 'osrm';
    const routingUrl = config?.routingUrl || 'https://routing-osrm.getwemap.com';
    
    // Initialize Remoterouter with config
    router = new Router();
    
    console.log('Router initialized:', { routingType, routingUrl });
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
  if (!currentItinerary || !testPosition) {
    navigationInfo = null;
    return;
  }

  try {
    updateMapTestPosition();
  } catch (error) {
    console.error('Failed to calculate navigation info:', error);
    navigationInfo = null;
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

  // Add origin and destination markers
  if (coords.length > 0) {
    const maplibregl = (window as any).maplibregl;
    
    // Origin marker
    if (originMarker) {
      originMarker.remove();
    }
    originMarker = new maplibregl.Marker({ color: '#28a745' })
      .setLngLat([coords[0].longitude, coords[0].latitude])
      .addTo(map);

    // Destination marker
    if (destinationMarker) {
      destinationMarker.remove();
    }
    const lastCoord = coords[coords.length - 1];
    destinationMarker = new maplibregl.Marker({ color: '#dc3545' })
      .setLngLat([lastCoord.longitude, lastCoord.latitude])
      .addTo(map);

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
    return '<p style="color: #999;">Set a test position to see navigation info</p>';
  }

  return `
    <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
      <h4>Navigation Information</h4>
      <div style="margin-left: 1rem; margin-top: 0.5rem;">
        <p><strong>Distance Remaining:</strong> ${(navigationInfo.distanceRemaining / 1000).toFixed(2)} km</p>
        <p><strong>Time Remaining:</strong> ${Math.round(navigationInfo.timeRemaining / 60)} min</p>
        <p><strong>Progress:</strong> ${(navigationInfo.progress * 100).toFixed(1)}%</p>
        <p><strong>At Destination:</strong> ${navigationInfo.isAtDestination ? '✓ Yes' : '✗ No'}</p>
        ${navigationInfo.nextStep ? `
          <p><strong>Next Step:</strong> ${navigationInfo.nextStep.direction || 'N/A'}</p>
        ` : ''}
        ${navigationInfo.currentLeg ? `
          <p><strong>Current Leg:</strong> ${navigationInfo.currentLeg.steps?.length || 0} steps</p>
        ` : ''}
      </div>
    </div>
  `;
}

// Initialize UI structure
function initializeUIStructure(): void {
  app.innerHTML = `
    <div class="main-container">
      <div class="nav-links">
        <strong>📋 Example Pages:</strong>
        <a href="/index.html">PositioningProvider</a>
        <a href="/gnss-location-source.html">GnssWifiLocationSource</a>
        <a href="/vps-location-source.html">VPSLocationSource</a>
        <a href="/map-matching.html">MapMatching</a>
        <a href="/map-matching-vps.html">MapMatching VPS</a>
        <a href="/routing.html" style="font-weight: bold;">Routing</a>
      </div>
      <div id="content-container"></div>
      <div class="section">
        <h2 class="section-title">Map Visualization</h2>
        <p style="color: #666; font-size: 0.9rem;">
          Interactive map showing calculated route and test position
        </p>
        <div id="map-container" class="map-container"></div>
        <p style="margin-top: 0.5rem; font-size: 0.875rem; color: #666;">
          <span style="background: #28a745; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; margin-right: 0.5rem;">●</span> Origin
          <span style="background: #dc3545; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; margin: 0 0.5rem;">●</span> Destination
          <span style="background: #ffc107; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; margin-left: 0.5rem;">●</span> Test Position
        </p>
      </div>
    </div>
  `;
  
  contentContainer = document.getElementById('content-container') as HTMLDivElement;
  mapContainer = document.getElementById('map-container') as HTMLDivElement;
}

// Update UI
function updateUI(): void {
  if (!contentContainer) {
    initializeUIStructure();
  }
  
  if (!contentContainer) return;
  
  const config = CoreConfig.getConfig();
  const routingType = config?.routingType || 'osrm';
  const routingUrl = config?.routingUrl || 'https://routing-osrm.getwemap.com';
  const routingMode = config?.routingMode || 'walking';
  
  contentContainer.innerHTML = `
    <h1 style="font-size: 1.5rem; margin: 0 0 1rem 0;">Routing Example</h1>
    
    <div class="section" style="background: #e3f2fd;">
      <h3 style="margin-top: 0; font-size: 1.125rem;">Core Status</h3>
      <p style="margin: 0.5rem 0;"><strong>Initialized:</strong> <span style="color: ${coreInitialized ? '#28a745' : '#dc3545'}">${coreInitialized ? '✓ Yes' : '✗ No'}</span></p>
      ${coreInitialized ? `
        <p style="margin: 0.5rem 0; font-size: 0.875rem;">
          <strong>Routing Config:</strong> Type: ${routingType}, Mode: ${routingMode}, URL: ${routingUrl}
        </p>
      ` : ''}
    </div>

    <div class="section">
      <h2 class="section-title">Router</h2>
      <p style="color: #666; font-size: 0.9rem; margin: 0.5rem 0;">
        Initialize Router and calculate routes between two points
      </p>
      
      <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
        <div style="margin-bottom: 1rem;">
          <div style="margin-bottom: 0.75rem;">
            <strong>Status:</strong> <span style="color: ${router ? '#28a745' : '#dc3545'}">${router ? '● Initialized' : '○ Not Initialized'}</span>
            ${routeError ? `
              <div style="margin-top: 0.5rem; color: #dc3545; font-size: 0.875rem;">
                <strong>⚠️ Error:</strong> ${routeError}
              </div>
            ` : ''}
          </div>
          <div class="button-group">
            <button 
              id="init-router" 
              class="btn btn-success"
              ${router ? 'disabled="disabled"' : ''}
            >
              Initialize Router
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Calculate Route</h2>
      <p style="color: #666; font-size: 0.9rem; margin: 0.5rem 0;">
        Calculate a route between two coordinates
      </p>
      
      <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
        <form id="route-form">
          <div class="form-group">
            <label>From (Latitude, Longitude)</label>
            <div class="form-row">
              <input type="number" id="from-lat" step="any" value="48.8566" placeholder="Latitude" />
              <input type="number" id="from-lon" step="any" value="2.3522" placeholder="Longitude" />
            </div>
          </div>
          <div class="form-group">
            <label>To (Latitude, Longitude)</label>
            <div class="form-row">
              <input type="number" id="to-lat" step="any" value="48.8606" placeholder="Latitude" />
              <input type="number" id="to-lon" step="any" value="2.3376" placeholder="Longitude" />
            </div>
          </div>
          <div class="button-group">
            <button 
              type="submit"
              id="calculate-route" 
              class="btn btn-primary"
              ${!router || isCalculating ? 'disabled="disabled"' : ''}
            >
              ${isCalculating ? 'Calculating...' : 'Calculate Route'}
            </button>
            <button 
              type="button"
              id="clear-route" 
              class="btn btn-danger"
              ${!currentItinerary ? 'disabled="disabled"' : ''}
            >
              Clear Route
            </button>
          </div>
        </form>
        
        ${renderItineraryInfo()}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Navigation Utilities</h2>
      <p style="color: #666; font-size: 0.9rem; margin: 0.5rem 0;">
        Test Navigation utilities with a position along the route
      </p>
      
      <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
        <div class="form-group">
          <label>Test Position (Latitude, Longitude)</label>
          <div class="form-row">
            <input type="number" id="test-lat" step="any" placeholder="Latitude" />
            <input type="number" id="test-lon" step="any" placeholder="Longitude" />
            <button 
              type="button"
              id="set-test-position" 
              class="btn btn-success"
              ${!currentItinerary ? 'disabled="disabled"' : ''}
            >
              Set Test Position
            </button>
          </div>
        </div>
        
        ${renderNavigationInfo()}
      </div>
    </div>

    <div class="info-box info-box-warning" style="margin-top: 2rem;">
      <p><strong>💡 Routing Usage:</strong></p>
      <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
        <li>Initialize Router first (uses config from CoreConfig if available)</li>
        <li>Calculate routes between two coordinates</li>
        <li>View route information including distance, duration, and legs</li>
        <li>Test Navigation utilities by setting a test position along the route</li>
        <li>Navigation info shows distance remaining, progress, and next instructions</li>
      </ul>
      <p style="margin-top: 0.5rem;"><strong>Note:</strong> Check the browser console for detailed logs.</p>
    </div>
  `;

  // Attach event listeners
  const initRouterBtn = document.getElementById('init-router');
  const clearRouteBtn = document.getElementById('clear-route');
  const routeForm = document.getElementById('route-form');
  const setTestPositionBtn = document.getElementById('set-test-position');
  
  if (initRouterBtn) {
    initRouterBtn.onclick = handleInitRouter;
  }
  if (routeForm) {
    routeForm.onsubmit = handleCalculateRoute;
  }
  if (clearRouteBtn) {
    clearRouteBtn.onclick = handleClearRoute;
  }
  if (setTestPositionBtn) {
    setTestPositionBtn.onclick = handleSetTestPosition;
  }
}

// Event handlers
function handleInitRouter(): void {
  initializeRouter();
}

function handleCalculateRoute(e: Event): void {
  e.preventDefault();
  
  const fromLatInput = document.getElementById('from-lat') as HTMLInputElement;
  const fromLonInput = document.getElementById('from-lon') as HTMLInputElement;
  const toLatInput = document.getElementById('to-lat') as HTMLInputElement;
  const toLonInput = document.getElementById('to-lon') as HTMLInputElement;
  
  const from = {
    lat: parseFloat(fromLatInput.value),
    lon: parseFloat(fromLonInput.value),
  };
  
  const to = {
    lat: parseFloat(toLatInput.value),
    lon: parseFloat(toLonInput.value),
  };
  
  if (isNaN(from.lat) || isNaN(from.lon) || isNaN(to.lat) || isNaN(to.lon)) {
    alert('Please enter valid coordinates');
    return;
  }
  
  calculateRoute(from, to);
}

function handleClearRoute(): void {
  currentItinerary = null;
  testPosition = null;
  navigationInfo = null;
  routeError = null;
  updateUI();
  updateMapRoute();
  updateMapTestPosition();
}

function handleSetTestPosition(): void {
  const testLatInput = document.getElementById('test-lat') as HTMLInputElement;
  const testLonInput = document.getElementById('test-lon') as HTMLInputElement;
  
  const lat = parseFloat(testLatInput.value);
  const lon = parseFloat(testLonInput.value);
  
  if (isNaN(lat) || isNaN(lon)) {
    alert('Please enter valid coordinates');
    return;
  }
  
  testPosition = { lat, lon };
  updateNavigationInfo();
  updateUI();
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

