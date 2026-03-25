import type { Pose } from '@wemap/positioning';
import type { Itinerary as ItineraryType } from '@wemap/routing';

export type MapParams = {
  styleUrl: string;
  center: { lat: number; lon: number };
  zoom: number;
};

export type DestinationCoords = { lat: number; lon: number; level: number | null };

export type CreateMapSectionOptions = {
  mapContainer: HTMLDivElement;
  getMapParams: () => MapParams;

  getCurrentPose: () => Pose;
  getCurrentItinerary: () => ItineraryType | null;

  getCanPickDestination: () => { ok: boolean; reason?: string };
  getDestinationLevel: () => number | null;
  onDestinationSelected: (destination: DestinationCoords) => void;
};

export function createMapSection(options: CreateMapSectionOptions): {
  initWhenMapLibreReady: () => Promise<void>;
  updateUserPosition: (pose: Pose) => void;
  updateRoute: (itinerary: ItineraryType | null) => void;
  updateMapDefaults: () => void;
} {
  const { mapContainer, getMapParams, getCurrentPose, getCurrentItinerary } = options;

  let map: any = null;
  let userMarker: any = null;
  let markerConeElement: HTMLElement | null = null;
  let destinationMarker: any = null;
  let routeSourceId: string | null = null;
  let mapCentered = false;
  let initialized = false;

  function updateDestinationMarker(destination: DestinationCoords): void {
    const maplibregl = (window as any).maplibregl;
    if (!maplibregl) return;

    if (destinationMarker) {
      destinationMarker.remove();
    }

    destinationMarker = new maplibregl.Marker({ color: '#dc3545' })
      .setLngLat([destination.lon, destination.lat])
      .addTo(map);
  }

  function updateUserPosition(pose: Pose): void {
    if (
      !map ||
      !map.loaded() ||
      !pose.position ||
      !('latitude' in pose.position) ||
      !('longitude' in pose.position)
    ) {
      return;
    }

    const lat = pose.position.latitude;
    const lon = pose.position.longitude;

    let headingDegrees: number | null = null;
    if (pose.attitude) {
      // VPS usually exposes `headingDegrees`; GNSS example uses `heading` (radians).
      const att = pose.attitude as any;
      if (typeof att.headingDegrees === 'number') {
        headingDegrees = att.headingDegrees;
      } else if (typeof att.heading === 'number') {
        headingDegrees = (att.heading * 180) / Math.PI;
      }
    }

    if (!userMarker) {
      const containerEl = document.createElement('div');
      containerEl.classList.add('location-container');

      const dotEl = document.createElement('div');
      dotEl.classList.add('location-dot');

      const coneEl = document.createElement('div');
      coneEl.classList.add('location-compass');
      markerConeElement = coneEl;

      containerEl.appendChild(coneEl);
      containerEl.appendChild(dotEl);

      const maplibregl = (window as any).maplibregl;
      userMarker = new maplibregl.Marker({
        element: containerEl,
        pitchAlignment: 'map',
        rotationAlignment: 'map',
        anchor: 'center',
      })
        .setLngLat([lon, lat])
        .addTo(map);
    } else {
      userMarker.setLngLat([lon, lat]);
    }

    if (headingDegrees !== null && markerConeElement) {
      const normalized = ((headingDegrees % 360) + 360) % 360;
      markerConeElement.style.transform = `rotate(${normalized}deg) translate(-50%, -50%)`;
      markerConeElement.style.display = 'block';
    } else if (markerConeElement) {
      markerConeElement.style.display = 'none';
    }

    if (!mapCentered && pose.position && 'latitude' in pose.position) {
      map.flyTo({
        center: [lon, lat],
        duration: 1000,
        zoom: 15,
      });
      mapCentered = true;
    }
  }

  function updateRoute(itinerary: ItineraryType | null): void {
    if (!map || !map.loaded() || !itinerary) {
      if (routeSourceId && map?.getSource(routeSourceId)) {
        if (map.getLayer('route')) {
          map.removeLayer('route');
        }
        map.removeSource(routeSourceId);
        routeSourceId = null;
      }
      return;
    }

    const coords = (itinerary as any).coords || [];
    if (coords.length === 0) {
      return;
    }

    const routeCoordinates = coords.map((coord: any) => [coord.longitude, coord.latitude]);

    const routeGeoJson = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: routeCoordinates,
      },
    };

    if (routeSourceId && map.getSource(routeSourceId)) {
      if (map.getLayer('route')) {
        map.removeLayer('route');
      }
      map.removeSource(routeSourceId);
    }

    routeSourceId = 'route-source';
    map.addSource(routeSourceId, {
      type: 'geojson',
      data: routeGeoJson,
    });

    map.addLayer({
      id: 'route',
      type: 'line',
      source: routeSourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': '#007bff',
        'line-width': 4,
        'line-opacity': 0.8,
      },
    });

    if (routeCoordinates.length > 0) {
      const maplibregl = (window as any).maplibregl;
      const bounds = new maplibregl.LngLatBounds(
        [coords[0].longitude, coords[0].latitude],
        [coords[0].longitude, coords[0].latitude],
      );

      routeCoordinates.forEach((coord: number[]) => {
        bounds.extend(coord as [number, number]);
      });

      const isMobile = window.innerWidth < 768;
      map.fitBounds(bounds, {
        padding: isMobile ? 20 : 50,
        duration: 1000,
      });
    }
  }

  function updateMapDefaults(): void {
    if (!map) return;
    const params = getMapParams();

    // Changing style resets map sources/layers; we re-apply UI overlays via updates.
    map.setStyle(params.styleUrl);
    if (map.loaded()) {
      map.jumpTo({
        center: [params.center.lon, params.center.lat],
        zoom: params.zoom,
      });
      updateUserPosition(getCurrentPose());
      updateRoute(getCurrentItinerary());
    } else {
      map.once('style.load', () => {
        map.jumpTo({
          center: [params.center.lon, params.center.lat],
          zoom: params.zoom,
        });
        updateUserPosition(getCurrentPose());
        updateRoute(getCurrentItinerary());
      });
    }
  }

  async function initWhenMapLibreReady(): Promise<void> {
    if (initialized) return;

    if (typeof (window as any).maplibregl === 'undefined') {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (typeof (window as any).maplibregl !== 'undefined') {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          // If still missing, resolve anyway; caller can decide how to handle.
          resolve();
        }, 5000);
      });
    }

    const maplibregl = (window as any).maplibregl;
    if (!maplibregl) {
      console.warn('MapLibre GL JS not loaded');
      return;
    }

    const params = getMapParams();
    mapContainer.style.pointerEvents = 'auto';

    map = new maplibregl.Map({
      container: mapContainer,
      style: params.styleUrl,
      center: [params.center.lon, params.center.lat],
      zoom: params.zoom,
    });

    map.on('load', () => {
      updateUserPosition(getCurrentPose());
      updateRoute(getCurrentItinerary());

      map.on('click', (e: any) => {
        if (!map.loaded()) return;

        const guard = options.getCanPickDestination();
        if (!guard.ok) {
          alert(guard.reason || 'Please start the location source first.');
          return;
        }

        const { lng, lat } = e.lngLat;
        const level = options.getDestinationLevel();
        const destination: DestinationCoords = { lat, lon: lng, level };

        updateDestinationMarker(destination);
        options.onDestinationSelected(destination);
      });
    });

    initialized = true;
  }

  return {
    initWhenMapLibreReady,
    updateUserPosition,
    updateRoute,
    updateMapDefaults,
  };
}

