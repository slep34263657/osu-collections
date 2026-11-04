import { previewButton, stopPreview } from './preview.js';
import { parseSearch } from './search.js';
const $ = id => document.getElementById(id);
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const button = (text, href, primary = false) => {
  const a = element('a', `button${primary ? ' primary' : ''}`, text); a.href = href; return a;
};
const size = bytes => bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
const stat = value => Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '—';
const duration = value => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}` : '—';
function osuLink(text, url, className = '') {
  const link = element('a', className, text);
  link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
const difficultyStops = [0.1, 1.25, 2, 2.5, 3.3, 4.2, 4.9, 5.8, 6.7, 7.7, 9];
const difficultyPalette = difficultyStops.map((_, i) => getComputedStyle(document.documentElement).getPropertyValue(`--difficulty-${i}`).trim());
function difficultyColour(stars) {
  if (!Number.isFinite(stars) || stars < 0.1) return 'var(--difficulty-unknown)';
  if (stars >= 9) return difficultyPalette.at(-1);
  const high = difficultyStops.findIndex(stop => stop > stars), low = high - 1;
  const weight = (stars - difficultyStops[low]) / (difficultyStops[high] - difficultyStops[low]);
  const channels = [1, 3, 5].map(index => {
    const a = parseInt(difficultyPalette[low].slice(index, index + 2), 16), b = parseInt(difficultyPalette[high].slice(index, index + 2), 16);
    return Math.round(((1 - weight) * a ** 2.2 + weight * b ** 2.2) ** (1 / 2.2));
  });
  return `rgb(${channels.join(',')})`;
}
function difficultyTable(stats, slim = false) {
  const scroll = element('div', 'difficulty-scroll'), table = element('table', 'difficulty-table');
  table.setAttribute('aria-label', slim ? 'Map difficulty stats' : 'Difficulty stats');
  if (slim) table.classList.add('slim-table');
  const head = element('thead'), titles = element('tr');
  for (const title of [...(slim ? ['Map'] : []), 'Difficulty', 'Stars', 'SS', 'AR', 'OD', 'CS', 'BPM', 'Length', ...(slim ? [''] : [])]) {
    const th = element('th', '', title); th.scope = 'col';
    if (title === 'SS') th.title = 'PP for 100% accuracy and full combo (osu!lazer)';
    titles.append(th);
  }
  head.append(titles); table.append(head);
  const body = element('tbody');
  for (const diff of stats) {
    const row = element('tr');
    if (slim) {
      const map = diff.map, cell = element('td'), content = element('div', 'slim-map');
      if (map.preview) content.append(previewButton(map));
      const url = map.setId > 0 ? `https://osu.ppy.sh/beatmapsets/${map.setId}` : null;
      const title = url ? osuLink(map.title, url) : element('span', '', map.title);
      title.title = `${map.artist} — ${map.title}`; content.append(title); cell.append(content); row.append(cell);
    }
    const name = element('th', 'difficulty-name'); name.scope = 'row';
    name.append(diff.id > 0 ? osuLink(diff.name, `https://osu.ppy.sh/beatmaps/${diff.id}`) : document.createTextNode(diff.name));
    row.append(name);
    const bpm = Number.isFinite(diff.bpmMin) ? `${Math.round(diff.bpmMin)}${Math.round(diff.bpmMax) !== Math.round(diff.bpmMin) ? `–${Math.round(diff.bpmMax)}` : ''}` : '—';
    for (const value of [
      diff.stars ? `${diff.stars.toFixed(2)} ★` : '—',
      Number.isFinite(diff.pp) ? `${Math.round(diff.pp)} pp` : '—',
      diff.mode === 1 || diff.mode === 3 ? '—' : stat(diff.ar), stat(diff.od), diff.mode === 3 ? `${stat(diff.cs)}K` : diff.mode === 1 ? '—' : stat(diff.cs),
      bpm, duration(diff.length)
    ]) row.append(element('td', '', value));
    if (slim) {
      const cell = element('td'), actions = element('div', 'slim-actions');
      if (diff.map.download) actions.append(button('Download', diff.map.download));
      if (diff.map.setId > 0) actions.append(button('osu!direct', `osu://dl/${diff.map.setId}`));
      cell.append(actions); row.append(cell);
    }
    body.append(row);
  }
  table.append(body); scroll.append(table); return scroll;
}
let catalog, current, sortDirection = 'desc', dtEnabled = false, slimEnabled = false;
const mapStats = map => map.visibleStats || (map.difficultyStats || []).map(diff => dtEnabled ? { ...diff, ...diff.dt } : diff);
function updateSortDirection() {
  const action = sortDirection === 'asc' ? 'Sort high to low' : 'Sort low to high';
  $('sort-direction').classList.toggle('is-ascending', sortDirection === 'asc');
  $('sort-direction').setAttribute('aria-label', action); $('sort-direction').title = action;
}
function compareMaps(a, b, field) {
  const multiplier = sortDirection === 'asc' ? 1 : -1;
  const value = map => {
    const values = mapStats(map).map(diff => diff[field]).filter(Number.isFinite);
    return values.length ? Math.max(...values) : null;
  };
  const av = value(a), bv = value(b);
  if (av === null && bv !== null) return 1;
  if (bv === null && av !== null) return -1;
  return (av !== null && bv !== null ? (av - bv) * multiplier : 0) || (a.title || '').localeCompare(b.title || '');
}
function renderMaps() {
  const search = $('search').value.trim(), sort = $('sort').value, query = parseSearch(search);
  $('search-error').textContent = query.error; $('search-error').hidden = !query.error;
  $('search').setAttribute('aria-invalid', String(Boolean(query.error)));
  const maps = (current?.maps || catalog.maps).map(map => {
    const stats = mapStats(map), visibleStats = stats.filter(diff => query.matches(map, diff));
    const keep = stats.length ? visibleStats.length : !query.active || query.matches(map, { name: map.difficulties?.join(' ') || '', id: map.id });
    return keep && (!slimEnabled || visibleStats.length) ? { ...map, visibleStats } : null;
  }).filter(Boolean).sort((a, b) => compareMaps(a, b, sort));
  const count = maps.reduce((sum, map) => sum + map.visibleStats.length, 0);
  $('count').textContent = query.active || slimEnabled ? `${count} difficulties · ${maps.length} maps` : `${maps.length} mapsets`;
  const expanded = new Set([...$('maps').querySelectorAll('details[open]')].filter(details => details.dataset.autoExpanded !== 'true').map(details => details.closest('.map').dataset.key));
  stopPreview(); $('maps').replaceChildren();
  if (query.error) return;
  if (!maps.length) {
    const empty = element('div', 'empty');
    empty.append(element('h2', '', search ? 'No matches' : 'No maps'));
    $('maps').append(empty); return;
  }
  if (slimEnabled) {
    const stats = maps.flatMap(map => map.visibleStats.map(diff => ({ ...diff, map })));
    stats.sort((a, b) => {
      const av = a[sort], bv = b[sort];
      if (!Number.isFinite(av)) return Number.isFinite(bv) ? 1 : a.name.localeCompare(b.name);
      if (!Number.isFinite(bv)) return -1;
      return (av - bv) * (sortDirection === 'asc' ? 1 : -1) || a.map.title.localeCompare(b.map.title) || a.name.localeCompare(b.name);
    });
    $('maps').append(difficultyTable(stats, true)); return;
  }
  maps.forEach(map => {
    const row = element('article', 'map'), info = element('div', 'map-info');
    row.dataset.key = map.key;
    const stats = mapStats(map);
    if (map.preview) row.append(previewButton(map));
    else if (map.background) {
      const cover = element('img', 'map-cover'); cover.src = map.background; cover.alt = ''; cover.width = 128; cover.height = 80; cover.loading = 'lazy'; cover.decoding = 'async'; row.append(cover);
    } else row.append(element('div', 'map-cover cover-placeholder'));
    const title = element('div', 'map-title');
    const url = map.setId > 0 ? `https://osu.ppy.sh/beatmapsets/${map.setId}` : map.id > 0 ? `https://osu.ppy.sh/beatmaps/${map.id}` : null;
    title.append(url ? osuLink(map.title || 'Untitled', url) : document.createTextNode(map.title || 'Untitled'));
    info.append(title);
    const subtitle = element('div', 'map-sub');
    subtitle.append(element('span', '', [map.artist, map.creator && `mapped by ${map.creator}`].filter(Boolean).join(' · ')));
    const timings = stats.filter(diff => Number.isFinite(diff.bpmMin) && Number.isFinite(diff.bpmMax));
    if (timings.length) {
      const min = Math.round(Math.min(...timings.map(diff => diff.bpmMin))), max = Math.round(Math.max(...timings.map(diff => diff.bpmMax)));
      const main = timings.reduce((a, b) => (b.stars ?? -1) > (a.stars ?? -1) ? b : a).bpmMain;
      subtitle.append(element('span', 'map-bpm', `${min}${min !== max ? `–${max}` : ''} BPM${min !== max && Number.isFinite(main) ? ` (mostly ${Math.round(main)})` : ''}`));
    }
    info.append(subtitle);
    const difficulties = stats.length ? stats.map(diff => diff.name) : map.difficulties || [];
    row.append(info);
    if (stats.length) {
      const details = element('details', 'difficulty-list'), summary = element('summary');
      const preview = [...stats].sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1));
      const dots = element('span', 'difficulty-dots');
      for (const diff of stats) {
        const dot = element('span', 'difficulty-dot');
        dot.style.setProperty('--difficulty-color', difficultyColour(diff.stars));
        dot.title = `${diff.name}${diff.stars ? ` · ${diff.stars.toFixed(2)} ★` : ''}`;
        dots.append(dot);
      }
      summary.append(dots, element('span', 'difficulty-summary', preview.slice(0, 3).map(diff => diff.name).join(' · ')));
      if (difficulties.length > 3) summary.append(element('span', 'diff-more', `+${difficulties.length - 3} more`));
      details.append(summary);
      details.addEventListener('toggle', () => { if (details.open && !details.querySelector('table')) details.append(difficultyTable(stats)); });
      details.dataset.autoExpanded = String(query.active);
      details.open = query.active || expanded.has(map.key);
      row.append(details);
    } else if (difficulties.length) row.append(element('div', 'difficulty-list map-details', difficulties.join(' · ')));
    const actions = element('div', 'map-actions');
    if (map.download) {
      const download = button('Download', map.download);
      if (map.bytes) download.title = size(map.bytes);
      actions.append(download);
    }
    else actions.append(element('span', 'missing', 'Not hosted'));
    if (map.setId > 0) actions.append(button('osu!direct', `osu://dl/${map.setId}`));
    row.append(actions); $('maps').append(row);
  });
}
function route() {
  current = catalog.collections.find(c => `#${c.id}` === location.hash);
  $('title').textContent = current?.name || 'All maps';
  $('description').hidden = !current;
  $('description').textContent = current ? `${current.available} hosted mapsets${current.missing ? ` · ${current.missing} unhosted entries` : ''}` : '';
  $('collection-actions').replaceChildren();
  $('split-note').hidden = true;
  if (current) {
    const packs = current.packs || (current.pack ? [current.pack] : []);
    const downloads = packs.length > 1 ? element('div', 'download-split') : $('collection-actions');
    if (packs.length > 1) {
      downloads.setAttribute('role', 'group'); downloads.setAttribute('aria-label', 'Download collection');
      downloads.append(element('span', 'download-label', 'Download'));
      $('collection-actions').append(downloads);
    }
    packs.forEach((url, i) => {
      const a = button('', url);
      a.classList.add('pack-download');
      a.append(element('span', '', packs.length > 1 ? `Part ${i + 1}` : 'Download collection'));
      a.setAttribute('aria-label', packs.length > 1 ? `Download collection part ${i + 1} of ${packs.length}` : 'Download collection');
      const bytes = current.packSizes?.[i];
      a.append(element('span', 'pack-size', bytes ? `${(bytes / 1000 ** 3).toFixed(2)} GB` : 'ZIP'));
      downloads.append(a);
    });
    const collectionFile = button('.osdb', current.collectionDownload);
    collectionFile.classList.add('collection-file');
    collectionFile.setAttribute('aria-label', 'Download collection file .osdb');
    $('collection-actions').append(collectionFile);
    if (packs.length > 1) {
      $('split-note').textContent = `${packs.length} ZIP parts due to GitHub’s file-size limit. Download all parts.`;
      $('split-note').hidden = false;
    }
  }
  for (const a of $('collections').children) { if (a.hash === location.hash || (!current && a.getAttribute('href') === '#')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  renderMaps();
}
try {
  const response = await fetch('catalog.json'); if (!response.ok) throw new Error('Catalog request failed'); catalog = await response.json();
  document.title = catalog.title; $('collections').replaceChildren();
  for (const c of [{ id: '', name: 'All maps', maps: catalog.maps }, ...catalog.collections]) {
    const a = element('a'); a.href = `#${c.id}`;
    a.append(element('span', '', c.name), element('span', 'badge', c.maps.length)); $('collections').append(a);
  }
  $('search').addEventListener('input', renderMaps);
  $('sort').addEventListener('change', () => {
    sortDirection = 'desc';
    updateSortDirection(); renderMaps();
  });
  $('sort-direction').addEventListener('click', () => { sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'; updateSortDirection(); renderMaps(); });
  $('dt-toggle').addEventListener('click', () => {
    dtEnabled = !dtEnabled;
    $('dt-toggle').setAttribute('aria-pressed', String(dtEnabled));
    $('dt-toggle').setAttribute('aria-label', dtEnabled ? 'Show normal stats' : 'Show Double Time stats');
    renderMaps();
  });
  $('slim-toggle').addEventListener('click', () => {
    slimEnabled = !slimEnabled;
    $('slim-toggle').setAttribute('aria-pressed', String(slimEnabled));
    $('slim-toggle').setAttribute('aria-label', slimEnabled ? 'Show normal view' : 'Show slim view');
    renderMaps();
  });
  updateSortDirection(); window.addEventListener('hashchange', route); route();
} catch (error) {
  const box = element('div', 'empty'); box.append(element('h2', 'error', 'Couldn’t load the library'), element('p', '', 'Refresh the page to try again.')); $('maps').replaceChildren(box); console.error(error);
}
