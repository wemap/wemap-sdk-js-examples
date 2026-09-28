/**
 * Shared @wemap/map wiring for positioning + routing example pages (map-007).
 *
 * Level sync is automatic inside WemapMap — building selection and pose updates
 * drive the floor without integrator configuration.
 */
import type { Pose } from '@wemap/positioning';
import type { Itinerary } from '@wemap/routing';
import { Coordinates, type Level_t } from '@wemap/geo';
import {
  WemapMap,
  UserLocationLayer,
  DomMarkerLayer,
  ItineraryLayer,
  type UserLocationUpdate,
} from '@wemap/map';
import type { MapMouseEvent } from 'maplibre-gl';
import { readPose } from './readPose';
import './maplibreSetup';

const MARKER_DESTINATION = 'destination';
const MARKER_ORIGIN = 'origin';
const MARKER_TEST = 'test-position';

const MARKER_COLORS = {
  destination: '#dc3545',
  origin: '#28a745',
  test: '#ffc107',
} as const;

export type DestinationCoords = { lat: number; lng: number; level: number | null };

export type ExampleMapStackOptions = {
  container: string | HTMLElement;
  /** Fly to the first pose fix. Default `true`. */
  followOnFirstFix?: boolean;
  /** Guard map clicks that set a destination (combined pages). */
  getDestinationClickGuard?: () => { ok: boolean; reason?: string };
  getDestinationLevel?: () => number | null;
  onDestinationClick?: (destination: DestinationCoords) => void;
};

export function toCoordinates(
  lat: number,
  lng: number,
  level?: Level_t
): Coordinates {
  return new Coordinates(lat, lng, null, level ?? null);
}

export function poseToUserLocationUpdate(pose: Pose): UserLocationUpdate | null {
  const { position } = readPose(pose);

  if (!position) {
    return null;
  }

  const update: UserLocationUpdate = {
    position: toCoordinates(position.latitude, position.longitude, position.level),
  };

  if (pose.attitude) {
    update.attitude = pose.attitude;
  }

  return update;
}

export class ExampleMapStack {
  readonly wemapMap: WemapMap;
  private readonly user: UserLocationLayer;
  private readonly markers: DomMarkerLayer;
  private readonly route: ItineraryLayer;
  private readonly unsubscribeMapClick: (() => void) | null;

  private hasFitRouteBounds = false;

  constructor(options: ExampleMapStackOptions) {
    this.wemapMap = new WemapMap({ container: options.container });

    this.user = new UserLocationLayer(this.wemapMap, {
      followOnFirstFix: options.followOnFirstFix ?? true,
      showHeading: true,
    });
    this.markers = new DomMarkerLayer(this.wemapMap);
    this.route = new ItineraryLayer(this.wemapMap);

    if (options.onDestinationClick) {
      const handler = (event: MapMouseEvent) => {
        const guard = options.getDestinationClickGuard?.();

        if (guard && !guard.ok) {
          alert(guard.reason || 'Cannot set destination yet.');
          return;
        }

        const level = options.getDestinationLevel?.() ?? null;
        const destination: DestinationCoords = {
          lat: event.lngLat.lat,
          lng: event.lngLat.lng,
          level,
        };

        this.setDestination(destination.lat, destination.lng, destination.level);
        options.onDestinationClick?.(destination);
      };

      this.wemapMap.on('click', handler);
      this.unsubscribeMapClick = () => this.wemapMap.off('click', handler);
    } else {
      this.unsubscribeMapClick = null;
    }
  }

  updatePose(pose: Pose): void {
    const update = poseToUserLocationUpdate(pose);

    if (update) {
      this.user.update(update);
    }
  }

  /** `style` overrides the line colour/width (the VPS sample greys a lost fix). */
  setRoute(itinerary: Itinerary, style?: { color?: string; width?: number }): void {
    const fitBounds = !this.hasFitRouteBounds;
    this.route.set(itinerary, { ...style, ...(fitBounds && { fitBounds: true }) });

    if (fitBounds) {
      this.hasFitRouteBounds = true;
    }
  }

  clearRoute(): void {
    this.route.clear();
    this.hasFitRouteBounds = false;
  }

  setDestination(lat: number, lng: number, level: Level_t = null): void {
    this.markers.add({
      id: MARKER_DESTINATION,
      position: toCoordinates(lat, lng, level),
      color: MARKER_COLORS.destination,
    });
  }

  setOrigin(lat: number, lng: number, level?: Level_t): void {
    this.markers.add({
      id: MARKER_ORIGIN,
      position: toCoordinates(lat, lng, level),
      color: MARKER_COLORS.origin,
    });
  }

  setTestPosition(lat: number, lng: number, level?: Level_t): void {
    this.markers.add({
      id: MARKER_TEST,
      position: toCoordinates(lat, lng, level),
      color: MARKER_COLORS.test,
    });
  }

  clearTestPosition(): void {
    this.markers.remove(MARKER_TEST);
  }

  clearMarkers(): void {
    this.markers.remove(MARKER_DESTINATION);
    this.markers.remove(MARKER_ORIGIN);
    this.markers.remove(MARKER_TEST);
  }

  destroy(): void {
    this.unsubscribeMapClick?.();
    this.route.destroy();
    this.markers.destroy();
    this.user.destroy();
    this.wemapMap.remove();
  }
}
