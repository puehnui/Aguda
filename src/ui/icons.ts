import type { MissionConfig } from '../types';

const COOKIE_SVG = `
<svg width="51" height="50" viewBox="0 0 51 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="aguda-cookie-fill" cx="38%" cy="32%" r="68%">
      <stop offset="0%" stop-color="#FAD46B" />
      <stop offset="68%" stop-color="#F4C44E" />
      <stop offset="100%" stop-color="#DF9E2A" />
    </radialGradient>
  </defs>
  <circle cx="25.5" cy="25" r="21.5" fill="url(#aguda-cookie-fill)" stroke="#F9E6B3" stroke-width="3" />
  <circle cx="25.5" cy="25" r="19" stroke="#DC9924" stroke-opacity="0.35" stroke-width="1.2" />
  <!-- Primary chips matching 0:00-0:06 -->
  <circle cx="19.5" cy="21" r="2.8" fill="#6E3F1D" />
  <circle cx="32.5" cy="24" r="2.8" fill="#6E3F1D" />
  <circle cx="23.5" cy="34" r="2.7" fill="#6E3F1D" />
  <circle cx="35.5" cy="32.5" r="2.7" fill="#6E3F1D" />
  <!-- Secondary texture chips -->
  <circle cx="28" cy="13.5" r="1.7" fill="#6E3F1D" fill-opacity="0.9" />
  <circle cx="14.5" cy="15.5" r="1.6" fill="#6E3F1D" fill-opacity="0.88" />
  <circle cx="14" cy="29.5" r="1.7" fill="#6E3F1D" fill-opacity="0.9" />
</svg>
`.trim();

const BEER_SVG = `
<svg width="48" height="57" viewBox="0 0 48 57" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="aguda-beer-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F9C94A" />
      <stop offset="100%" stop-color="#ECAC22" />
    </linearGradient>
  </defs>
  <!-- Right C-handle -->
  <path
    d="M32 22.5H36.5C39.8 22.5 42 25.1 42 29.2V36.8C42 40.9 39.8 43.5 36.5 43.5H32"
    stroke="#0E1530"
    stroke-width="6.4"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M32 22.5H36.5C39.8 22.5 42 25.1 42 29.2V36.8C42 40.9 39.8 43.5 36.5 43.5H32"
    stroke="#FFFFFF"
    stroke-width="3.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <!-- Mug outer navy contour + cream-white rim + amber body -->
  <rect x="6.5" y="14.5" width="26" height="37" rx="4.5" fill="#F3B733" stroke="#0E1530" stroke-width="5.2" />
  <rect x="6.5" y="14.5" width="26" height="37" rx="4.5" fill="url(#aguda-beer-fill)" stroke="#FFFFFF" stroke-width="2.6" />
  <!-- Two subtle vertical light-gold facets -->
  <rect x="11.5" y="21" width="4.2" height="24.5" rx="2.1" fill="#FFE48A" fill-opacity="0.45" />
  <rect x="18.2" y="22.5" width="3.2" height="23" rx="1.6" fill="#FFE48A" fill-opacity="0.28" />
  <!-- Fluffy pure-white foam head overhanging rim -->
  <path
    d="M10.5 16.5C8.6 16.5 7.4 15.2 7.4 13.5C7.4 11.7 8.8 10.4 10.5 10.4C10.9 7.8 13.1 6 15.9 6C17.3 6 18.6 6.5 19.6 7.3C20.6 6.4 22 5.8 23.6 5.8C26.5 5.8 28.9 7.8 29.3 10.5C30.8 10.7 31.8 12 31.8 13.6C31.8 15.3 30.5 16.5 28.7 16.5H26.4V18.8C26.4 19.8 25.6 20.6 24.6 20.6C23.6 20.6 22.8 19.8 22.8 18.8V16.5H10.5Z"
    fill="#FFFFFF"
    stroke="#0E1530"
    stroke-width="1.2"
    stroke-linejoin="round"
  />
  <path
    d="M10 15.2H29.4"
    stroke="#F8EDC9"
    stroke-width="1.4"
    stroke-linecap="round"
  />
</svg>
`.trim();

const PARTY_SVG = `
<svg width="50" height="54" viewBox="0 0 50 54" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="aguda-party-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FAD46B" />
      <stop offset="100%" stop-color="#EEAA22" />
    </linearGradient>
  </defs>
  <!-- Left tilted clinking glass -->
  <g transform="rotate(-16 17 34)">
    <rect x="8.5" y="20" width="14" height="23" rx="3" fill="url(#aguda-party-gold)" stroke="#F9E6B3" stroke-width="2.2" />
    <path d="M9.5 21.5H21.5" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" />
    <rect x="11.5" y="25" width="2.6" height="13.5" rx="1.3" fill="#FFE89C" fill-opacity="0.45" />
  </g>
  <!-- Right tilted clinking glass -->
  <g transform="rotate(16 33 34)">
    <rect x="27.5" y="20" width="14" height="23" rx="3" fill="url(#aguda-party-gold)" stroke="#F9E6B3" stroke-width="2.2" />
    <path d="M28.5 21.5H40.5" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" />
    <rect x="30.5" y="25" width="2.6" height="13.5" rx="1.3" fill="#FFE89C" fill-opacity="0.45" />
  </g>
  <!-- Celebratory burst star above clink -->
  <path
    d="M25 5L27.4 11.4L34 12.2L28.8 16.5L30.4 23L25 19.3L19.6 23L21.2 16.5L16 12.2L22.6 11.4L25 5Z"
    fill="#F4C44E"
    stroke="#FFFFFF"
    stroke-width="1.8"
    stroke-linejoin="round"
  />
  <!-- Cyan + gold celebration sparkles -->
  <circle cx="9.5" cy="11.5" r="2" fill="#6CE4EC" />
  <circle cx="40.5" cy="11.5" r="2" fill="#6CE4EC" />
  <circle cx="25" cy="48.5" r="1.8" fill="#F9E6B3" />
</svg>
`.trim();

export function getMissionIconSvg(icon: MissionConfig['icon']): string {
  switch (icon) {
    case 'cookie':
      return COOKIE_SVG;
    case 'beer':
      return BEER_SVG;
    case 'party':
      return PARTY_SVG;
  }
}
