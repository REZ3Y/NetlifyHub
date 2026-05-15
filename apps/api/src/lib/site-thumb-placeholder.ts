/** Default site thumbnail when Netlify has no screenshot or fetch fails. */
export const SITE_THUMB_PLACEHOLDER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200" role="img" aria-label="No preview">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a2332"/>
      <stop offset="100%" style="stop-color:#0f1419"/>
    </linearGradient>
  </defs>
  <rect width="320" height="200" fill="url(#bg)" rx="8"/>
  <text x="160" y="88" text-anchor="middle" fill="#5c6b7a" font-family="system-ui,sans-serif" font-size="42" font-weight="700">404</text>
  <text x="160" y="118" text-anchor="middle" fill="#8b9aab" font-family="system-ui,sans-serif" font-size="13">No site preview</text>
</svg>`;
