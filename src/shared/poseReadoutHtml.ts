/**
 * Renders a {@link Pose} as the "Current Pose" readout markup shared by the
 * location-source and map-matching examples. Field narrowing is delegated to
 * {@link readPose}, so this module only decides how to lay the values out.
 */
import type { Pose } from '@wemap/positioning';
import { readPose, type PoseReadout } from './readPose';

const line = (label: string, value: string) => `<p><strong>${label}:</strong> ${value}</p>`;
const deg = (rad: number) => ((rad * 180) / Math.PI).toFixed(1);

export function poseReadoutHtml(pose: Pose): string {
  const { position, attitude, inclination }: PoseReadout = readPose(pose);

  const positionBlock = position
    ? `
      <div style="margin-left: 1rem; margin-top: 0.5rem;">
        <h5 style="margin: 0.5rem 0;">Position</h5>
        ${line('Latitude', position.latitude.toFixed(6))}
        ${line('Longitude', position.longitude.toFixed(6))}
        ${position.altitude !== null ? line('Altitude', `${position.altitude.toFixed(2)}m`) : ''}
        ${position.level !== null ? line('Level', String(position.level)) : ''}
        ${position.accuracy !== null ? line('Accuracy', `${position.accuracy.toFixed(2)}m`) : ''}
        ${position.time !== null ? line('Time', new Date(position.time).toLocaleTimeString()) : ''}
      </div>`
    : '<p style="color: #999; margin-left: 1rem;">No position data yet</p>';

  const attitudeBlock = attitude
    ? `
      <div style="margin-left: 1rem; margin-top: 0.5rem;">
        <h5 style="margin: 0.5rem 0;">Attitude</h5>
        ${attitude.heading !== null ? line('Heading', `${attitude.heading.toFixed(3)} rad (${deg(attitude.heading)}°)`) : ''}
        ${attitude.pitch !== null ? line('Pitch', `${attitude.pitch.toFixed(3)} rad`) : ''}
        ${attitude.roll !== null ? line('Roll', `${attitude.roll.toFixed(3)} rad`) : ''}
      </div>`
    : '<p style="color: #999; margin-left: 1rem;">No attitude data yet</p>';

  const inclinationBlock =
    inclination !== null
      ? `
      <div style="margin-left: 1rem; margin-top: 0.5rem;">
        <h5 style="margin: 0.5rem 0;">Inclination</h5>
        <p>${inclination.toFixed(3)} rad (${deg(inclination)}°)</p>
      </div>`
      : '';

  return `
    <div style="background: white; padding: 1rem; border-radius: 4px; margin-top: 1rem;">
      <h4>Current Pose</h4>
      ${positionBlock}
      ${attitudeBlock}
      ${inclinationBlock}
      <details style="margin-top: 0.5rem;">
        <summary style="cursor: pointer; font-weight: bold; color: #666;">Raw Pose Data</summary>
        <pre style="margin-top: 0.5rem; font-size: 0.875rem; overflow-x: auto; background: #f5f5f5; padding: 0.5rem; border-radius: 4px;">${JSON.stringify(pose, null, 2)}</pre>
      </details>
    </div>
  `;
}
