import { Coordinates, type ItineraryInfoManager, type Itinerary as ItineraryType } from '@wemap/routing';
import type { Pose } from '@wemap/positioning';

export type UpdateNavigationInfoArgs = {
  navigationInfoEl: HTMLDivElement;
  vpsPose: Pose;
  currentItinerary: ItineraryType | null;
  itineraryInfoManager: ItineraryInfoManager;
};

/**
 * Renders navigation panel content based on the current itinerary + current position.
 * This is intentionally UI-only and expects the caller to manage orchestration/state.
 */
export function updateNavigationInfo(args: UpdateNavigationInfoArgs): void {
  const { navigationInfoEl, vpsPose, currentItinerary, itineraryInfoManager } = args;

  if (!currentItinerary || !vpsPose.position || !('latitude' in vpsPose.position)) {
    navigationInfoEl.style.display = 'none';
    return;
  }

  try {
    const altitude =
      'altitude' in vpsPose.position && typeof vpsPose.position.altitude === 'number'
        ? vpsPose.position.altitude
        : null;

    const level =
      'level' in vpsPose.position && vpsPose.position.level !== null ? vpsPose.position.level : null;

    const currentPosition = new Coordinates(
      vpsPose.position.latitude,
      vpsPose.position.longitude,
      altitude,
      level,
    );

    const navInfo = itineraryInfoManager.getInfo(currentPosition) as any;
    if (!navInfo) {
      navigationInfoEl.style.display = 'none';
      return;
    }

    navigationInfoEl.style.display = 'block';

    // VPS and GNSS navigation info expose different field names.
    const distanceMeters =
      navInfo.distanceRemaining !== undefined
        ? navInfo.distanceRemaining
        : navInfo.remainingDistance !== undefined
          ? navInfo.remainingDistance
          : undefined;

    const distanceRemaining = distanceMeters !== undefined ? `${(distanceMeters / 1000).toFixed(2)} km` : 'N/A';

    const timeRemaining =
      navInfo.timeRemaining !== undefined ? `${Math.round(navInfo.timeRemaining / 60)} min` : null;

    const progressText =
      navInfo.progress !== undefined
        ? `${(navInfo.progress * 100).toFixed(1)}%` // VPS: ratio [0..1]
        : navInfo.traveledPercentage !== undefined
          ? `${navInfo.traveledPercentage.toFixed(1)}%` // GNSS: already a percentage number
          : 'N/A';

    const isAtDestination =
      navInfo.isAtDestination !== undefined ? (navInfo.isAtDestination ? 'Yes' : 'No') : null;

    let html = `
      <h4 style="margin-top: 0;">Navigation Information</h4>
      <div style="margin-left: 1rem; margin-top: 0.5rem;">
        <p><strong>Distance Remaining:</strong> ${distanceRemaining}</p>
        ${
          timeRemaining !== null ? `<p><strong>Time Remaining:</strong> ${timeRemaining}</p>` : ''
        }
        <p><strong>Progress:</strong> ${progressText}</p>
        ${isAtDestination !== null ? `<p><strong>At Destination:</strong> ${isAtDestination}</p>` : ''}
    `;

    if (navInfo.nextStep) {
      const nextStepDirection = navInfo.nextStep.direction || navInfo.nextStep.instruction || 'N/A';
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

