/**
 * Example page for MapMatching
 * 
 * Demonstrates how to use MapMatching to project user position onto an itinerary
 */
import { CoreConfig } from '@wemap-sdk/core';
import { 
  GnssWifiLocationSource,
  MapMatching,
  type Pose
} from '@wemap-sdk/positioning';
import { 
  Itinerary,
  type Itinerary as ItineraryType,
  Coordinates
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
    emmid: '23270',
    token: 'UG509QQDZGP6YBC98XIRB5ZBU',
  });
  coreInitialized = true;
} catch (error) {
  console.warn('Core initialization failed, continuing without it:', error);
}

// Create GnssWifiLocationSource instance
const gnssWifiLocationSource = new GnssWifiLocationSource({
  usePositionSmoother: true,
  enableAttitude: true,
});

// State for GnssWifiLocationSource
let gnssPose: Pose = {};
let gnssUpdateCount = 0;
let gnssRunning = false;
let gnssError: string | null = null;

// State for MapMatching
let currentItinerary: ItineraryType | null = null;
let itineraryInfo: string = 'No itinerary set';

// Map state
let map: any = null; // MapLibre map instance
let userMarker: any = null; // User position HTML marker (contains dot + cone)
let markerConeElement: HTMLElement | null = null; // Reference to cone element for rotation
let itinerarySourceId: string | null = null; // Itinerary route source ID

// Set up GnssWifiLocationSource listeners
gnssWifiLocationSource.onUpdate((pose: Pose) => {
  gnssPose = pose;
  gnssUpdateCount++;
  updateUI();
  updateMapUserPosition();
});

gnssWifiLocationSource.onError((error: Error) => {
  gnssError = error.message;
  updateUI();
  console.error('[GnssWifiLocationSource] Error:', error);
});

// Function to render pose data
function renderPose(pose: Pose): string {
  const position = pose.position;
  const attitude = pose.attitude;

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
            ? `<p><strong>Time:</strong> ${new Date(pose.time).toLocaleTimeString()}</p>` 
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
      
      <details style="margin-top: 0.5rem;">
        <summary style="cursor: pointer; font-weight: bold; color: #666;">Raw Pose Data</summary>
        <pre style="margin-top: 0.5rem; font-size: 0.875rem; overflow-x: auto; background: #f5f5f5; padding: 0.5rem; border-radius: 4px;">${JSON.stringify(pose, null, 2)}</pre>
      </details>
    </div>
  `;
}

// Function to create an itinerary from current GPS position
function createItineraryFromCurrentPosition(): void {
  // Check if we have a current position
  if (!gnssPose.position || !('latitude' in gnssPose.position) || !('longitude' in gnssPose.position)) {
    alert('No GPS position available yet. Please start the GNSS source and wait for a position update.');
    return;
  }

  const currentLat = gnssPose.position.latitude;
  const currentLon = gnssPose.position.longitude;

  // Create a destination ~500m north-east from current position
  // (approximately 0.0045 degrees latitude ≈ 500m, longitude varies by latitude)
  const offsetLat = 0.0045; // ~500m
  const offsetLon = 0.0045 / Math.cos(currentLat * Math.PI / 180); // Adjust for latitude
  
  createAndSetItinerary(
    { lat: currentLat, lon: currentLon },
    { lat: currentLat + offsetLat, lon: currentLon + offsetLon }
  );
  
  console.log(`Created itinerary from current position (${currentLat.toFixed(6)}, ${currentLon.toFixed(6)}) to nearby destination`);
}

// Function to create a fake itinerary and set it
function createAndSetItinerary(from: { lat: number; lon: number }, to: { lat: number; lon: number }): void {
  try {
    // Create origin and destination coordinates
    const origin = new Coordinates(from.lat, from.lon);
    const destination = new Coordinates(to.lat, to.lon);
    
    // Create intermediate points for a more realistic route
    const midLat = (from.lat + to.lat) / 2;
    const midLon = (from.lon + to.lon) / 2;
    const coords = [
      origin,
      new Coordinates(midLat + 0.001, midLon + 0.001), // Intermediate point 1
      new Coordinates(midLat, midLon), // Intermediate point 2
      new Coordinates(midLat - 0.001, midLon - 0.001), // Intermediate point 3
      destination
    ];
    
    // Create itinerary from ordered coordinates
    currentItinerary = Itinerary.fromOrderedCoordinates(
      coords,
      origin,
      destination,
      'WALK'
    );
    
    // Set the itinerary for map matching
    MapMatching.setItinerary(currentItinerary);
    
    // Extract itinerary info
    const distanceKm = currentItinerary.distance ? `${(currentItinerary.distance / 1000).toFixed(2)} km` : 'N/A';
    const durationMin = currentItinerary.duration ? `${Math.round(currentItinerary.duration / 60)} min` : 'N/A';
    itineraryInfo = `Distance: ${distanceKm}, Duration: ${durationMin}, Legs: ${currentItinerary.legs?.length || 0}`;
    
    console.log('Fake itinerary created and set for map matching:', currentItinerary);
    updateUI();
    updateMapItinerary();
  } catch (error) {
    console.error('Failed to create itinerary:', error);
    alert(`Failed to create itinerary: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Initialize MapLibre map
function initializeMap(): void {
  if (map) {
    return; // Map already initialized
  }

  // Check if MapLibre is available
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
    style: 'https://tiles.getwemap.com/styles/wemap-v2-fr.json', // Default style
    center: [2.3522, 48.8566], // Paris center
    zoom: 13
  });

  map.on('load', () => {
    console.log('Map loaded');
    // Update map with current data if available
    updateMapUserPosition();
    updateMapItinerary();
  });
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
  // let heading = 0;
  if (gnssPose.attitude && 'heading' in gnssPose.attitude && typeof gnssPose.attitude.heading === 'number') {
    heading = gnssPose.attitude.heading;
  }

  if (!userMarker) {
    // Create container element for both dot and cone
    const containerEl = document.createElement('div');
    containerEl.style.display = 'flex';
    containerEl.style.flexDirection = 'column';
    containerEl.style.alignItems = 'center';
    containerEl.style.width = '14px';
    containerEl.style.height = '14px';

    // Create HTML element for the blue dot
    const dotEl = document.createElement('div');
    dotEl.style.width = '12px';
    dotEl.style.height = '12px';
    dotEl.style.borderRadius = '50%';
    dotEl.style.backgroundColor = '#007bff';
    dotEl.style.border = '2px solid #ffffff';
    dotEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    dotEl.style.zIndex = '2';
    dotEl.style.position = 'absolute';

    // Create HTML element for the heading cone
    const coneEl = document.createElement('div');
    coneEl.classList.add('location-compass');
    
    // Store reference to cone element for rotation updates
    markerConeElement = coneEl;

    // Add both elements to container
    containerEl.appendChild(coneEl);
    containerEl.appendChild(dotEl);

    // Create marker with combined HTML element
    const maplibregl = (window as any).maplibregl;
    userMarker = new maplibregl.Marker({ 
      element: containerEl,
      anchor: 'center' // Anchor at center of the combined element
    })
      .setLngLat([lon, lat])
      .addTo(map);
  } else {
    // Update existing marker position
    userMarker.setLngLat([lon, lat]);
  }

  // Update heading cone rotation if heading is available
  if (heading !== null && markerConeElement) {
    // Convert heading to degrees if needed
    // If heading is > 2*PI, assume it's already in degrees, otherwise convert from radians
    let headingDegrees: number;
    if (heading > 2 * Math.PI) {
      // Already in degrees
      headingDegrees = heading % 360;
    } else {
      // Convert from radians to degrees
      headingDegrees = (heading * 180 / Math.PI) % 360;
    }
    
    markerConeElement.style.transform = `rotate(${headingDegrees}deg) translate(-50%, -50%)`;
    
    // Show cone if it was hidden
    markerConeElement.style.display = 'block';
  } else if (markerConeElement) {
    // Hide cone if no heading data
    markerConeElement.style.display = 'none';
  }

  // Center map on user position if it's the first update
  if (gnssUpdateCount === 1) {
    map.flyTo({
      center: [lon, lat],
      duration: 1000,
      zoom: 15
    });
  }
}

// Update itinerary route on map
function updateMapItinerary(): void {
  if (!map || !map.loaded() || !currentItinerary) {
    // Remove itinerary if it exists
    if (itinerarySourceId && map.getSource(itinerarySourceId)) {
      if (map.getLayer('itinerary-route')) {
        map.removeLayer('itinerary-route');
      }
      map.removeSource(itinerarySourceId);
      itinerarySourceId = null;
    }
    return;
  }

  // Get coordinates from itinerary
  const coords = currentItinerary.coords || [];
  if (coords.length === 0) {
    return;
  }

  // Convert Coordinates to [lon, lat] format for GeoJSON
  const routeCoordinates = coords.map((coord: Coordinates) => [coord.longitude, coord.latitude]);

  const routeGeoJson = {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: routeCoordinates
    }
  };

  // Remove existing route if it exists
  if (itinerarySourceId && map.getSource(itinerarySourceId)) {
    if (map.getLayer('itinerary-route')) {
      map.removeLayer('itinerary-route');
    }
    map.removeSource(itinerarySourceId);
  }

  // Add new route
  itinerarySourceId = 'itinerary-route-source';
  map.addSource(itinerarySourceId, {
    type: 'geojson',
    data: routeGeoJson
  });

  map.addLayer({
    id: 'itinerary-route',
    type: 'line',
    source: itinerarySourceId,
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
    const bounds = new maplibregl.LngLatBounds(routeCoordinates[0] as [number, number], routeCoordinates[0] as [number, number]);
    routeCoordinates.forEach((coord: number[]) => {
      bounds.extend(coord as [number, number]);
    });

    // Responsive padding for mobile vs desktop
    const isMobile = window.innerWidth < 768;
    map.fitBounds(bounds, {
      padding: isMobile ? 20 : 50,
      duration: 1000
    });
  }
}

// Initialize UI structure (called once)
function initializeUIStructure(): void {
  app.innerHTML = `
    <div class="main-container">
      <div class="nav-links">
        <strong>📋 Example Pages:</strong>
        <a href="/index.html">PositioningProvider</a>
        <a href="/gnss-location-source.html">GnssWifiLocationSource</a>
        <a href="/vps-location-source.html">VPSLocationSource</a>
        <a href="/map-matching.html" style="font-weight: bold;">MapMatching</a>
      </div>
      <div id="content-container"></div>
      <div class="section">
        <h2 class="section-title">Map Visualization</h2>
        <p style="color: #666; font-size: 0.9rem;">
          Interactive map showing user position and itinerary route
        </p>
        <div id="map-container" class="map-container"></div>
      </div>
      <div class="info-box info-box-warning" style="margin-top: 2rem;">
        <p><strong>💡 MapMatching Usage:</strong></p>
        <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
          <li>Map matching projects GPS positions onto a predefined route/itinerary</li>
          <li>Use <code>MapMatching.setItinerary(itinerary)</code> to enable map matching</li>
          <li>Use <code>MapMatching.clearItinerary()</code> to disable map matching</li>
          <li>Get current itinerary with <code>MapMatching.getItinerary()</code></li>
          <li>When active, positions from location sources will be projected onto the route</li>
        </ul>
        <p style="margin-top: 0.5rem;"><strong>Note:</strong> Check the browser console for detailed logs.</p>
      </div>
    </div>
  `;
  
  contentContainer = document.getElementById('content-container') as HTMLDivElement;
  mapContainer = document.getElementById('map-container') as HTMLDivElement;
}

// Function to update the UI
function updateUI() {
  if (!contentContainer) {
    initializeUIStructure();
  }
  
  const currentItineraryStatus = MapMatching.getItinerary();  
  if (!contentContainer) return;
  
  contentContainer.innerHTML = `
      <h1 style="font-size: 1.5rem; margin: 0 0 1rem 0;">MapMatching Example</h1>
      
      <div class="section" style="background: #e3f2fd;">
        <h3 style="margin-top: 0; font-size: 1.125rem;">Core Status</h3>
        <p style="margin: 0.5rem 0;"><strong>Initialized:</strong> <span style="color: ${coreInitialized ? '#28a745' : '#dc3545'}">${coreInitialized ? '✓ Yes' : '✗ No'}</span></p>
      </div>

      <div class="section">
        <h2 class="section-title">MapMatching</h2>
        <p style="color: #666; font-size: 0.9rem; margin: 0.5rem 0;">
          Map matching projects GPS positions onto a predefined route/itinerary, providing more accurate navigation.
        </p>
        
        <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
          <div style="margin-bottom: 1rem;">
            <div style="margin-bottom: 0.75rem;">
              <strong>Status:</strong> <span style="color: ${currentItineraryStatus ? '#28a745' : '#dc3545'}">${currentItineraryStatus ? '● Active' : '○ Inactive'}</span>
              ${currentItineraryStatus ? `<div style="margin-top: 0.5rem; font-size: 0.875rem;"><strong>Itinerary Info:</strong> ${itineraryInfo}</div>` : ''}
            </div>
            <div class="button-group">
              <button 
                id="set-route-from-position" 
                class="btn btn-success"
                ${!gnssPose.position || !('latitude' in gnssPose.position) ? 'disabled="disabled"' : ''}
              >
                Set Route from Current Position
              </button>
              <button 
                id="clear-itinerary" 
                class="btn btn-danger"
              >
                Clear Itinerary
              </button>
            </div>
          </div>
          
          <div class="info-box ${gnssPose.position && 'latitude' in gnssPose.position ? 'info-box-success' : 'info-box-warning'}">
            <strong>GPS Status:</strong> 
            ${gnssPose.position && 'latitude' in gnssPose.position 
              ? `✓ Position available (${gnssPose.position.latitude.toFixed(6)}, ${gnssPose.position.longitude.toFixed(6)})`
              : '⚠ Waiting for GPS position... Start GNSS Source first'}
          </div>
          
          ${currentItineraryStatus ? `
            <div class="info-box info-box-success">
              <p style="margin: 0;"><strong>✓ Map matching is active</strong></p>
              <p style="font-size: 0.875rem; color: #666; margin-top: 0.5rem; margin-bottom: 0;">
                User positions will be projected onto the itinerary route.
              </p>
            </div>
          ` : `
            <div class="info-box info-box-warning">
              <p style="margin: 0;"><strong>⚠ No itinerary set</strong></p>
              <p style="font-size: 0.875rem; color: #666; margin-top: 0.5rem; margin-bottom: 0;">
                ${gnssPose.position && 'latitude' in gnssPose.position 
                  ? 'Click "Set Route from Current Position" to create an itinerary starting from your location, or use "Set Paris Route" / "Set Custom Route" for other options.'
                  : 'Start the GNSS Source first to get your position, then click "Set Route from Current Position" to create an itinerary from your location.'}
              </p>
            </div>
          `}
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">GnssWifiLocationSource</h2>
        <p style="color: #666; font-size: 0.9rem; margin: 0.5rem 0;">
          Provides GNSS/WiFi positioning + PDR + AbsoluteAttitude
        </p>
        
        <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
          <div style="margin-bottom: 1rem;">
            <div style="margin-bottom: 0.75rem;">
              <strong>Status:</strong> <span style="color: ${gnssRunning ? '#28a745' : '#dc3545'}">${gnssRunning ? '● Running' : '○ Stopped'}</span>
              <span style="margin-left: 0.5rem;"><strong>Updates:</strong> ${gnssUpdateCount}</span>
              ${gnssError ? `
                <div style="margin-top: 0.5rem; color: #dc3545; font-size: 0.875rem;">
                  <strong>⚠️ Error:</strong> ${gnssError}
                </div>
              ` : ''}
            </div>
            <div class="button-group">
              <button 
                id="start-gnss" 
                class="btn btn-success"
              >
                Start GNSS Source
              </button>
              <button 
                id="stop-gnss" 
                class="btn btn-danger"
              >
                Stop GNSS Source
              </button>
            </div>
          </div>
          
          ${renderPose(gnssPose)}
        </div>
      </div>
  `;

  // Attach event listeners
  const startGnssBtn = document.getElementById('start-gnss');
  const stopGnssBtn = document.getElementById('stop-gnss');
  const setRouteFromPositionBtn = document.getElementById('set-route-from-position');
  const clearItineraryBtn = document.getElementById('clear-itinerary');
  
  if (startGnssBtn) {
    startGnssBtn.onclick = handleStartGNSS;
  }
  if (stopGnssBtn) {
    stopGnssBtn.onclick = handleStopGNSS;
  }
  if (setRouteFromPositionBtn) {
    setRouteFromPositionBtn.onclick = handleSetRouteFromPosition;
  }
  if (clearItineraryBtn) {
    clearItineraryBtn.onclick = handleClearItinerary;
  }
}

// Handle GNSS start
async function handleStartGNSS() {
  try {
    await gnssWifiLocationSource.start();
    gnssRunning = true;
    gnssError = null;
    updateUI();
    console.log('GnssWifiLocationSource started');
  } catch (error) {
    gnssError = error instanceof Error ? error.message : String(error);
    updateUI();
    console.error('Failed to start GnssWifiLocationSource:', error);
    alert(`Failed to start GnssWifiLocationSource: ${gnssError}`);
  }
}

// Handle GNSS stop
async function handleStopGNSS() {
  try {
    await gnssWifiLocationSource.stop();
    gnssRunning = false;
    gnssError = null;
    updateUI();
    console.log('GnssWifiLocationSource stopped');
  } catch (error) {
    gnssError = error instanceof Error ? error.message : String(error);
    updateUI();
    console.error('Failed to stop GnssWifiLocationSource:', error);
  }
}

// Handle set route from current position
function handleSetRouteFromPosition() {
  createItineraryFromCurrentPosition();
}

// Handle clear itinerary
function handleClearItinerary() {
  MapMatching.clearItinerary();
  currentItinerary = null;
  itineraryInfo = 'No itinerary set';
  updateUI();
  updateMapItinerary(); // Remove route from map
  console.log('Itinerary cleared');
}

// Initialize
(async () => {
  try {
    // Initialize UI structure first
    initializeUIStructure();
    
    // Initial UI render
    updateUI();
    
    // Initialize map after UI is rendered and MapLibre is loaded
    setTimeout(() => {
      if (typeof (window as any).maplibregl !== 'undefined') {
        initializeMap();
      } else {
        // Wait for MapLibre to load
        const checkMapLibre = setInterval(() => {
          if (typeof (window as any).maplibregl !== 'undefined') {
            clearInterval(checkMapLibre);
            initializeMap();
          }
        }, 100);
        // Stop checking after 5 seconds
        setTimeout(() => clearInterval(checkMapLibre), 5000);
      }
    }, 100);
    
    console.log('MapMatching example page initialized.');
  } catch (error) {
    console.error('Failed to initialize example page:', error);
    app.innerHTML = `
      <div style="padding: 2rem; font-family: system-ui, sans-serif;">
        <h1>MapMatching Example</h1>
        <div style="margin-top: 2rem; padding: 1rem; background: #f8d7da; border-radius: 8px; border: 1px solid #dc3545;">
          <h2>Error</h2>
          <p><strong>Failed to initialize:</strong> ${error instanceof Error ? error.message : String(error)}</p>
        </div>
      </div>
    `;
  }
})();

