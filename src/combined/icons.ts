/**
 * The handful of line icons the VPS sample app's design calls for.
 *
 * Drawn inline (lucide's 24-unit grid, 2px round strokes) rather than pulled
 * from an icon package: an example app should install nothing extra, and
 * `currentColor` lets the stylesheet own every icon's colour.
 */
const PATHS = {
  'map-pin':
    '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="3"/>',
  'corner-up-right': '<path d="m15 14 5-5-5-5"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  'corner-up-left': '<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  'arrow-up': '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  'arrow-up-right': '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  'arrow-up-left': '<path d="M17 17 7 7"/><path d="M17 7H7v10"/>',
  'u-turn': '<path d="M20 20v-8a4 4 0 0 0-8 0v8"/><path d="m9 17 3 3 3-3"/>',
  'chevrons-up': '<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>',
  'chevrons-down': '<path d="m7 6 5 5 5-5"/><path d="m7 13 5 5 5-5"/>',
  'scan-line':
    '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  settings:
    '<path d="M3 6h18"/><circle cx="9" cy="6" r="2"/><path d="M3 12h18"/><circle cx="15" cy="12" r="2"/><path d="M3 18h18"/><circle cx="8" cy="18" r="2"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'move-horizontal': '<path d="m18 8 4 4-4 4"/><path d="m6 8-4 4 4 4"/><path d="M2 12h20"/>',
  'eye-off':
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/><path d="m3 3 18 18"/>',
  'refresh-cw': '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  pointer: '<path d="m4 4 7 16 2.5-6.5L20 11Z"/>',
  layers:
    '<path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  navigation: '<path d="m3 11 19-9-9 19-2-8Z"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  radar:
    '<path d="M19.07 4.93a10 10 0 1 1-14.14 0"/><path d="M12 12 18 6"/><circle cx="12" cy="12" r="2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z"/><path d="M4 22v-7"/>',
  'building-2':
    '<path d="M3 22h18"/><path d="M6 22V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v16"/><path d="M16 22V11h4v11"/><path d="M9 8h2"/><path d="M9 13h2"/>',
  'key-round':
    '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2"/><path d="m17 5 2.5 2.5"/><path d="m14.5 7.5 2.5 2.5"/>',
  crosshair:
    '<circle cx="12" cy="12" r="7"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><circle cx="12" cy="12" r="1.5"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size: number): string {
  return `<svg class="nav-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}
