const lines = {
  git:'<path d="M8.4 20c-4 .9-4-2-5.4-2.4m10.8 4v-3.3c0-1 .1-1.4-.4-1.9 3.4-.4 6.9-1.6 6.9-7.2a5.4 5.4 0 0 0-1.5-3.9c.2-.8.4-2-.2-3.3 0 0-1.2-.4-3.9 1.5a14.2 14.2 0 0 0-7 0C5 1.6 3.8 2 3.8 2c-.6 1.3-.4 2.5-.2 3.3a5.4 5.4 0 0 0-1.5 3.9c0 5.6 3.5 6.8 6.9 7.2-.5.5-.6 1.1-.6 1.9v3.3"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>', cube:'<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5m-9 5v10"/>',
  box:'<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5m-9 5v9M7 5.8l9 5"/>',
  expand:'<path d="M3 8V3h5m8 0h5v5m0 8v5h-5M3 16v5h5"/>',
  sliders:'<path d="M5 3v7m0 4v7m7-18v3m0 4v11m7-18v10m0 4v4"/><path d="M2 10h6m1-4h6m1 7h6"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  orbit:'<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.7" transform="rotate(-29 12 12)"/>',
  spin:'<path d="M20 8a8.5 8.5 0 0 0-15.4 0M4 5v4h4m-4 7a8.5 8.5 0 0 0 15.4 0M20 19v-4h-4"/>', ruler:'<path d="M2.5 15.5 15.6 2.4l6 6L8.5 21.5zM7 11l3 3m1-7 3 3m1-7 3 3"/>',
  reset:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>', channels:'<circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M5 7v10m14-10v10"/>',
  printer:'<path d="M3 3h18v17H3zM7 3v4h10V3m-5 4v4m-2 0h4l-2 3zM5 17h14"/>',
  file:'<path d="M5 2h9l5 5v15H5zM14 2v6h5M8 13h8m-8 4h5"/>',
  activity:'<path d="M2 13h4l3-7 4 13 3-9 2 3h4"/>',play:'<path d="m7 3 14 9-14 9z"/>',
  pause:'<path d="M8 4v16m8-16v16" stroke-width="3"/>',stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
  list:'<path d="M8 5h13M8 12h13M8 19h13"/><path d="M3 5h.1M3 12h.1M3 19h.1" stroke-width="3"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',download:'<path d="M12 2v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
  stack:'<path d="M3 8V3h9l3 3h6v14H3zM3 8h18"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9v1"/>',
  book:'<path d="M2 4c4-1 7 0 10 2 3-2 6-3 10-2v15c-4-1-7 0-10 2-3-2-6-3-10-2zm10 2v15"/>',
  top:'<path d="m5 14 7-7 7 7"/>',code:'<path d="m7 6-5 6 5 6m10-12 5 6-5 6m-4-14-2 16"/>',
  check:'<path d="m3 13 6 6L21 6"/>'
};
export function icon(name) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(lines[name]||'')+'</svg>'; }
export function applyIcons(root=document) {root.querySelectorAll('i[data-icon]').forEach(e=>{e.innerHTML=icon(e.dataset.icon)})}
