const MEDIA_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" preserveAspectRatio="none">
  <defs>
    <pattern id="stripe" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="#161922"/>
      <rect width="4" height="8" fill="#242830"/>
    </pattern>
  </defs>
  <rect width="64" height="64" fill="url(#stripe)"/>
  <rect x="1" y="1" width="62" height="62" fill="none" stroke="#8e9aae" stroke-width="2"/>
  <path d="M2 2 62 62M62 2 2 62" stroke="#8e9aae" stroke-width="4" stroke-linecap="square"/>
</svg>`;

export const MEDIA_PLACEHOLDER_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  MEDIA_PLACEHOLDER_SVG,
)}`;
