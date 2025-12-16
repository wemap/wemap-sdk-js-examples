/**
 * Example page for MapMatching with VPS
 * 
 * Demonstrates how to use MapMatching with VPSLocationSource to project user position onto an itinerary
 */
import { CoreConfig } from '@wemap/core';
import { 
  VPSLocationSource,
  MapMatching,
  type Pose
} from '@wemap/positioning';
import { Camera } from '@wemap/camera';
import { 
  Itinerary,
  type Itinerary as ItineraryType,
  Coordinates
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

// Create VPSLocationSource instance
const vpsLocationSource = new VPSLocationSource({
  usePositionSmoother: true,
});

// State for VPSLocationSource
let vpsPose: Pose = {};
let vpsUpdateCount = 0;
let vpsRunning = false;
let isScanning = false;
let vpsError: string | null = null;

// Camera state (for VPS)
let camera: Camera | null = null;
let cameraContainer: HTMLElement | null = null;

// State for MapMatching
let currentItinerary: ItineraryType | null = null;
let itineraryInfo: string = 'No itinerary set';

// Map state
let map: any = null; // MapLibre map instance
let userMarker: any = null; // User position HTML marker (contains dot + cone)
let markerConeElement: HTMLElement | null = null; // Reference to cone element for rotation
let itinerarySourceId: string | null = null; // Itinerary route source ID

// Set up VPSLocationSource listeners
vpsLocationSource.onUpdate((pose: Pose) => {
  vpsPose = pose;
  vpsUpdateCount++;
  updateUI();
  updateMapUserPosition();
});

vpsLocationSource.onError((error: Error) => {
  vpsError = error.message;
  updateUI();
  console.error('[VPSLocationSource] Error:', error);
});

// Function to render pose data
function renderPose(pose: Pose): string {
  const position = pose.position;
  const attitude = pose.attitude;
  const inclination = pose.inclination;

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
      
      ${inclination !== undefined ? `
        <div style="margin-left: 1rem; margin-top: 0.5rem;">
          <h5 style="margin: 0.5rem 0;">Inclination</h5>
          <p>${inclination.toFixed(3)} rad (${(inclination * 180 / Math.PI).toFixed(1)}°)</p>
        </div>
      ` : ''}
      
      <details style="margin-top: 0.5rem;">
        <summary style="cursor: pointer; font-weight: bold; color: #666;">Raw Pose Data</summary>
        <pre style="margin-top: 0.5rem; font-size: 0.875rem; overflow-x: auto; background: #f5f5f5; padding: 0.5rem; border-radius: 4px;">${JSON.stringify(pose, null, 2)}</pre>
      </details>
    </div>
  `;
}

// Function to create an itinerary from current VPS position
function createItineraryFromCurrentPosition(): void {
  // Check if we have a current position
  if (!vpsPose.position || !('latitude' in vpsPose.position) || !('longitude' in vpsPose.position)) {
    alert('No VPS position available yet. Please start the VPS source and perform a scan to get a position.');
    return;
  }

  const currentPosition = vpsPose.position;

  const coords = [currentPosition];
  let previousPosition = currentPosition;
  let currentLevel = currentPosition.level;
  for (let i = 0; i < 10; i++) {

    currentLevel = i >= 5 ? 1 : 0;

    // Angle between 60 and 120 degrees
    const angle = Math.random() * 60 + 60;
    const newCoordinates = previousPosition.clone().move(15, angle * Math.PI / 180);
    newCoordinates.level = currentLevel;
    coords.push(newCoordinates);
    previousPosition = newCoordinates;
  }
       // Create itinerary from ordered coordinates
     currentItinerary = Itinerary.fromOrderedCoordinates(
       coords,
       currentPosition,
       coords[coords.length - 1]
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
  if (!map || !map.loaded() || !vpsPose.position || !('latitude' in vpsPose.position) || !('longitude' in vpsPose.position)) {
    return;
  }

  const lat = vpsPose.position.latitude;
  const lon = vpsPose.position.longitude;

  // Get heading from attitude if available
  let heading: number | null = null;
  if (vpsPose.attitude && 'heading' in vpsPose.attitude && typeof vpsPose.attitude.heading === 'number') {
    heading = vpsPose.attitude.heading;
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
    
    // Store reference to cone element for rotation updates
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
  if (vpsUpdateCount === 1) {
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
        <a href="/map-matching.html">MapMatching</a>
        <a href="/map-matching-vps.html" style="font-weight: bold;">MapMatching VPS</a>
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
        <p><strong>💡 MapMatching with VPS:</strong></p>
        <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
          <li>Map matching projects VPS positions onto a predefined route/itinerary</li>
          <li>VPS requires camera permissions and a VPS endpoint (from CoreConfig)</li>
          <li>Start VPS Source, then perform a VPS Scan to get initial position</li>
          <li>Use <code>MapMatching.setItinerary(itinerary)</code> to enable map matching</li>
          <li>When active, positions from VPS will be projected onto the route</li>
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
      <h1 style="font-size: 1.5rem; margin: 0 0 1rem 0;">MapMatching Example (VPS)</h1>
      
      <div class="section" style="background: #e3f2fd;">
        <h3 style="margin-top: 0; font-size: 1.125rem;">Core Status</h3>
        <p style="margin: 0.5rem 0;"><strong>Initialized:</strong> <span style="color: ${coreInitialized ? '#28a745' : '#dc3545'}">${coreInitialized ? '✓ Yes' : '✗ No'}</span></p>
      </div>

      <div class="section">
        <h2 class="section-title">MapMatching</h2>
        <p style="color: #666; font-size: 0.9rem; margin: 0.5rem 0;">
          Map matching projects VPS positions onto a predefined route/itinerary, providing more accurate navigation.
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
                ${!vpsPose.position || !('latitude' in vpsPose.position) ? 'disabled="disabled"' : ''}
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
          
          <div class="info-box ${vpsPose.position && 'latitude' in vpsPose.position ? 'info-box-success' : 'info-box-warning'}">
            <strong>VPS Status:</strong> 
            ${vpsPose.position && 'latitude' in vpsPose.position 
              ? `✓ Position available (${vpsPose.position.latitude.toFixed(6)}, ${vpsPose.position.longitude.toFixed(6)})`
              : '⚠ Waiting for VPS position... Start VPS Source and perform a scan first'}
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
                ${vpsPose.position && 'latitude' in vpsPose.position 
                  ? 'Click "Set Route from Current Position" to create an itinerary starting from your location.'
                  : 'Start the VPS Source and perform a scan to get your position, then click "Set Route from Current Position" to create an itinerary from your location.'}
              </p>
            </div>
          `}
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">VPSLocationSource</h2>
        <p style="color: #666; font-size: 0.9rem; margin: 0.5rem 0;">
          Provides VPS (Visual Positioning System) + PDR + AbsoluteAttitude
        </p>
        
        <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
          <div style="margin-bottom: 1rem;">
            <div style="margin-bottom: 0.75rem;">
              <strong>Status:</strong> <span style="color: ${vpsRunning ? '#28a745' : '#dc3545'}">${vpsRunning ? '● Running' : '○ Stopped'}</span>
              <span style="margin-left: 0.5rem;"><strong>Scan Status:</strong> <span style="color: ${isScanning ? '#28a745' : '#dc3545'}">${isScanning ? '● Scanning' : '○ Stopped'}</span></span>
              <span style="margin-left: 0.5rem;"><strong>Updates:</strong> ${vpsUpdateCount}</span>
              ${vpsError ? `
                <div style="margin-top: 0.5rem; color: #dc3545; font-size: 0.875rem;">
                  <strong>⚠️ Error:</strong> ${vpsError}
                </div>
              ` : ''}
            </div>
            <div class="button-group">
              <button 
                id="start-vps" 
                class="btn btn-success"
              >
                Start VPS Source
              </button>
              <button 
                id="stop-vps" 
                class="btn btn-danger"
              >
                Stop VPS Source
              </button>
              <button 
                id="start-vps-scan" 
                class="btn btn-success"
                ${!vpsRunning ? 'disabled="disabled"' : ''}
              >
                Start VPS Scan
              </button>
              <button 
                id="stop-vps-scan" 
                class="btn btn-danger"
                ${!isScanning ? 'disabled="disabled"' : ''}
              >
                Stop VPS Scan
              </button>
            </div>
          </div>
          
          ${camera ? `
            <div class="info-box" style="margin-top: 1rem;">
              <strong>Camera Status:</strong> <span style="color: ${camera.state === 'started' ? '#28a745' : camera.state === 'starting' ? '#ffc107' : '#dc3545'}">${camera.state}</span>
              ${camera.fov ? `
                <div style="margin-top: 0.5rem; font-size: 0.875rem;">
                  <strong>FOV:</strong> Vertical: ${camera.fov.vertical.toFixed(2)}°, Horizontal: ${camera.fov.horizontal.toFixed(2)}°
                </div>
              ` : ''}
            </div>
          ` : ''}
          
          ${renderPose(vpsPose)}
        </div>
      </div>
  `;

  // Attach event listeners
  const startVpsBtn = document.getElementById('start-vps');
  const stopVpsBtn = document.getElementById('stop-vps');
  const startVpsScanBtn = document.getElementById('start-vps-scan');
  const stopVpsScanBtn = document.getElementById('stop-vps-scan');
  const setRouteFromPositionBtn = document.getElementById('set-route-from-position');
  const clearItineraryBtn = document.getElementById('clear-itinerary');
  
  if (startVpsBtn) {
    startVpsBtn.onclick = handleStartVPS;
  }
  if (stopVpsBtn) {
    stopVpsBtn.onclick = handleStopVPS;
  }
  if (startVpsScanBtn) {
    startVpsScanBtn.onclick = handleStartVPSScan;
  }
  if (stopVpsScanBtn) {
    stopVpsScanBtn.onclick = handleStopVPSScan;
  }
  if (setRouteFromPositionBtn) {
    setRouteFromPositionBtn.onclick = handleSetRouteFromPosition;
  }
  if (clearItineraryBtn) {
    clearItineraryBtn.onclick = handleClearItinerary;
  }
}

// Handle VPS start
async function handleStartVPS() {
  try {
    await vpsLocationSource.start();
    vpsRunning = true;
    vpsError = null;
    updateUI();
    console.log('VPSLocationSource started');
  } catch (error) {
    vpsError = error instanceof Error ? error.message : String(error);
    updateUI();
    console.error('Failed to start VPSLocationSource:', error);
    alert(`Failed to start VPSLocationSource: ${vpsError}`);
  }
}

// Handle VPS stop
async function handleStopVPS() {
  try {
    // Stop scan if running
    if (isScanning) {
      await handleStopVPSScan();
    }
    
    await vpsLocationSource.stop();
    vpsRunning = false;
    vpsError = null;
    updateUI();
    console.log('VPSLocationSource stopped');
  } catch (error) {
    vpsError = error instanceof Error ? error.message : String(error);
    updateUI();
    console.error('Failed to stop VPSLocationSource:', error);
  }
}

// Handle VPS scan start
async function handleStartVPSScan() {
  try {
    // Request device orientation permission (iOS)
    if ((DeviceOrientationEvent as any).requestPermission) {
      await (DeviceOrientationEvent as any).requestPermission();
    }
    
    // Set up camera first if not already set up
    if (!camera) {
      await setupCamera();
    }
    
    const scanPromise = vpsLocationSource.startScan();
    isScanning = true;
    vpsError = null;
    updateUI();

    console.log('VPSLocationSource scan started');

    const success = await scanPromise;
    isScanning = false;
    if (!success) {
      throw new Error('VPS scan failed');
    }

    // Stop camera after successful scan
    if (camera) {
      await stopCamera();
    }

    updateUI();
  } catch (error) {
    isScanning = false;
    vpsError = error instanceof Error ? error.message : String(error);
    updateUI();
    console.error('Failed to start VPSLocationSource scan:', error);
    alert(`Failed to start VPSLocationSource scan: ${vpsError}`);
  }
}

// Handle VPS scan stop
async function handleStopVPSScan() {
  try {
    // Stop camera
    if (camera) {
      await stopCamera();
    }

    await vpsLocationSource.stopScan();
    isScanning = false;
    vpsError = null;
    updateUI();
    console.log('VPSLocationSource scan stopped');
  } catch (error) {
    vpsError = error instanceof Error ? error.message : String(error);
    updateUI();
    console.error('Failed to stop VPSLocationSource scan:', error);
  }
}

// Set up camera for VPS
async function setupCamera(): Promise<void> {
  try {
    // Check camera availability
    await Camera.checkAvailability();
    
    // Get or create camera container
    cameraContainer = document.getElementById('camera-container');
    if (!cameraContainer) {
      cameraContainer = document.createElement('div');
      cameraContainer.id = 'camera-container';
      cameraContainer.style.cssText = 'width: 100%; max-width: 640px; margin: 1rem auto; background: #000; border-radius: 8px; overflow: hidden; position: relative; min-height: 360px;';
      // Insert after content container
      if (contentContainer && contentContainer.nextSibling) {
        contentContainer.parentNode?.insertBefore(cameraContainer, contentContainer.nextSibling);
      } else {
        contentContainer?.parentNode?.appendChild(cameraContainer);
      }
    } else {
      // Clear container if it already exists
      cameraContainer.innerHTML = '';
    }
    
    // Create camera instance
    camera = new Camera(cameraContainer, {
      width: 640,
      height: 480,
      resizeOnWindowChange: true,
    });
    
    // Set up camera event listeners
    camera.on('started', ({ videoElement, stream }) => {
      console.log('Camera started:', { videoElement, stream });
      updateUI();
    });
    
    camera.on('stopped', () => {
      console.log('Camera stopped');
      updateUI();
    });
    
    camera.on('fov.changed', ({ vertical, horizontal }) => {
      console.log('Camera FOV changed:', { vertical, horizontal });
      updateUI();
    });
    
    // Start the camera
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
    
    console.log('MapMatching VPS example page initialized.');
  } catch (error) {
    console.error('Failed to initialize example page:', error);
    app.innerHTML = `
      <div style="padding: 2rem; font-family: system-ui, sans-serif;">
        <h1>MapMatching Example (VPS)</h1>
        <div style="margin-top: 2rem; padding: 1rem; background: #f8d7da; border-radius: 8px; border: 1px solid #dc3545;">
          <h2>Error</h2>
          <p><strong>Failed to initialize:</strong> ${error instanceof Error ? error.message : String(error)}</p>
        </div>
      </div>
    `;
  }
})();

