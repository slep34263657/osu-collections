const audio = new Audio();
audio.preload = 'none';
audio.volume = 0.5;
let active, request = 0;

export function stopPreview() {
  request++; audio.pause();
  if (active) {
    active.button.classList.remove('playing', 'loading');
    active.button.setAttribute('aria-pressed', 'false');
    active.button.setAttribute('aria-label', `Play preview: ${active.title}`);
    active = null;
  }
  audio.removeAttribute('src'); audio.load();
}
audio.addEventListener('ended', stopPreview);
audio.addEventListener('error', () => {
  const button = active?.button;
  stopPreview();
  if (button) { button.title = 'Preview unavailable'; button.setAttribute('aria-label', 'Preview unavailable'); }
});
window.addEventListener('pagehide', stopPreview);

export function previewButton(map) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'map-cover preview-button';
  button.setAttribute('aria-label', `Play preview: ${map.title}`); button.setAttribute('aria-pressed', 'false');
  button.title = 'Play 30-second preview';
  if (map.background) { const img = document.createElement('img'); img.src = map.background; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; button.append(img); }
  const icon = document.createElement('span'); icon.className = 'preview-icon'; icon.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
  for (const [className, d] of [['preview-play', 'M7 4l13 8-13 8Z'], ['preview-pause', 'M8 5v14M16 5v14']]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('class', className); path.setAttribute('d', d); svg.append(path);
  }
  icon.append(svg); button.append(icon);
  button.addEventListener('click', async () => {
    if (active?.button === button) { stopPreview(); return; }
    stopPreview(); const token = request;
    active = { button, title: map.title }; button.classList.add('loading');
    button.setAttribute('aria-label', `Stop preview: ${map.title}`); button.setAttribute('aria-pressed', 'true');
    audio.src = map.preview;
    try {
      await audio.play();
      if (token !== request) return;
      button.classList.remove('loading'); button.classList.add('playing');
    } catch {
      if (token !== request) return;
      stopPreview(); button.title = 'Preview unavailable'; button.setAttribute('aria-label', `Preview unavailable: ${map.title}`);
    }
  });
  return button;
}
