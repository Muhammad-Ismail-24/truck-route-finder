export const BRAND_NAME = 'HAULCAST';

export const ALLOWED_INTERVALS_MILES = [10, 25, 50];
export const DEFAULT_INTERVAL_MILES = 25;

export const MIN_LOAD_LB = 1;
export const MAX_LOAD_LB = 80000;

export const DEFAULT_DELAY_BUFFER = 1.10;
export const DEFAULT_TRUCK_TARE_LB = 32000;

export const HEATMAP_HOURS = 49;
export const HEATMAP_INTERVAL_MILES = 25;

export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
export const MAP_STYLE_FALLBACK_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;
