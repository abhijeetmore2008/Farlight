import {
  parseEpicDate,
  formatUtc,
  formatCoord,
  formatAlt,
  formatDistance,
  distanceFromFrame,
  lookingAt,
  ymdOf,
  prefersReducedMotion,
} from './place.js';

const EPIC_API = 'https://epic.gsfc.nasa.gov/api';
const EPIC_ARCHIVE = 'https://epic.gsfc.nasa.gov/archive';

const DOWN =
  'The disk didn’t arrive. EPIC is probably between frames — try again in a minute.';
const SKIP = 'No disk for that day. EPIC skips some dates.';

export function imageUrl(frame, collection, kind = 'jpg') {
  const [ymd] = frame.date.split(' ');
  const [y, m, d] = ymd.split('-');
  const folder = kind === 'thumbs' ? 'thumbs' : 'jpg';
  return `${EPIC_ARCHIVE}/${collection}/${y}/${m}/${d}/${folder}/${frame.image}.jpg`;
}

async function fetchFrames(collection, dateStr, signal) {
  const url = dateStr
    ? `${EPIC_API}/${collection}/date/${dateStr}`
    : `${EPIC_API}/${collection}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('bad payload');
  return data;
}

function centroid(frame) {
  const c = frame.centroid_coordinates || frame.coords?.centroid_coordinates;
  if (!c) return null;
  return { lat: Number(c.lat), lon: Number(c.lon) };
}

export function initEpic() {
  const print = document.getElementById('print');
  const disk = document.getElementById('disk');
  const strip = document.getElementById('strip');
  const dayInput = document.getElementById('day');
  const frameWhen = document.getElementById('frame-when');
  const frameCoord = document.getElementById('frame-coord');
  const frameGloss = document.getElementById('frame-gloss');
  const frameDist = document.getElementById('frame-dist');
  const frameNote = document.getElementById('frame-note');
  const frameBlock = document.getElementById('frame-block');
  const modeBox = document.getElementById('mode');

  let collection = 'natural';
  let frames = [];
  let index = 0;
  let loadedDay = '';
  let shownOnce = false;
  let abort = null;
  let loadToken = 0;

  function setNote(text) {
    if (!text) {
      frameNote.hidden = true;
      frameNote.textContent = '';
      return;
    }
    frameNote.hidden = false;
    frameNote.textContent = text;
  }

  function markWritten() {
    frameBlock.classList.add('written');
  }

  function revealWriting() {
    if (prefersReducedMotion()) {
      markWritten();
      return;
    }
    window.setTimeout(markWritten, 600);
  }

  function renderMeta(frame) {
    const taken = parseEpicDate(frame.date);
    frameWhen.textContent = formatUtc(taken);
    const c = centroid(frame);
    if (c) {
      frameCoord.textContent = `looking at  ${formatCoord(c.lat, c.lon)}`;
      frameGloss.textContent = lookingAt(c.lat, c.lon, taken);
    } else {
      frameCoord.textContent = '';
      frameGloss.textContent = '';
    }
    const km = distanceFromFrame(frame);
    frameDist.textContent = km ? formatDistance(km) : '';
  }

  function paintStrip() {
    strip.replaceChildren();
    frames.forEach((frame, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb' + (i === index ? ' is-now' : '');
      btn.setAttribute('role', 'listitem');
      btn.setAttribute('aria-label', formatUtc(parseEpicDate(frame.date)));
      if (i === index) btn.setAttribute('aria-current', 'true');
      const img = document.createElement('img');
      img.src = imageUrl(frame, collection, 'thumbs');
      img.alt = '';
      img.draggable = false;
      btn.appendChild(img);
      btn.addEventListener('click', () => showFrame(i));
      strip.appendChild(btn);
    });
    const current = strip.querySelector('.is-now');
    if (current) {
      current.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
    }
  }

  function preload(i) {
    const frame = frames[i];
    if (!frame) return;
    const img = new Image();
    img.src = imageUrl(frame, collection);
  }

  async function showFrame(i) {
    if (!frames.length) return;
    index = (i + frames.length) % frames.length;
    const frame = frames[index];
    renderMeta(frame);
    paintStrip();

    const token = ++loadToken;
    const src = imageUrl(frame, collection);
    const fadeIn = !shownOnce && !prefersReducedMotion();
    print.classList.add('is-loading');

    const apply = () => {
      if (token !== loadToken) return;
      print.classList.remove('is-loading');
      disk.alt = formatAlt(parseEpicDate(frame.date));
      if (fadeIn) void disk.offsetWidth;
      disk.classList.add('shown');
      if (!shownOnce) {
        shownOnce = true;
        if (fadeIn) revealWriting();
        else markWritten();
      } else {
        markWritten();
      }
      preload(index + 1);
      preload(index - 1);
    };

    const fail = () => {
      if (token !== loadToken) return;
      print.classList.remove('is-loading');
      setNote(DOWN);
      markWritten();
    };

    if (disk.dataset.src === src && disk.complete && disk.naturalWidth) {
      apply();
      return;
    }

    try {
      if (fadeIn) disk.classList.remove('shown');
      disk.dataset.src = src;
      disk.src = src;
      if (typeof disk.decode === 'function') {
        await disk.decode();
      } else if (!disk.complete) {
        await new Promise((resolve, reject) => {
          disk.onload = resolve;
          disk.onerror = reject;
        });
      }
      if (disk.naturalWidth) apply();
      else fail();
    } catch {
      if (token === loadToken && disk.complete && disk.naturalWidth) apply();
      else fail();
    }
  }

  async function load({ dateStr = null, nextCollection = collection } = {}) {
    abort?.abort();
    abort = new AbortController();
    const { signal } = abort;
    print.classList.add('is-loading');
    setNote('');
    try {
      const incoming = await fetchFrames(nextCollection, dateStr, signal);
      if (!incoming.length) {
        print.classList.remove('is-loading');
        if (frames.length) {
          setNote(SKIP);
          if (dateStr) dayInput.value = loadedDay;
          markWritten();
          return;
        }
        setNote(DOWN);
        markWritten();
        return;
      }
      collection = nextCollection;
      frames = incoming;
      const first = parseEpicDate(frames[0].date);
      loadedDay = ymdOf(first);
      dayInput.value = loadedDay;
      dayInput.max = loadedDay > dayInput.max ? loadedDay : dayInput.max;
      modeBox.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('is-on', b.dataset.mode === collection);
      });
      index = 0;
      showFrame(0);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      print.classList.remove('is-loading');
      setNote(DOWN);
      markWritten();
    }
  }

  modeBox.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    const next = btn.dataset.mode;
    if (next === collection) return;
    load({ dateStr: loadedDay || dayInput.value || null, nextCollection: next });
  });

  dayInput.addEventListener('change', () => {
    if (!dayInput.value) return;
    load({ dateStr: dayInput.value, nextCollection: collection });
  });

  async function boot() {
    try {
      const latest = await fetchFrames('natural', null);
      if (!latest.length) {
        setNote(DOWN);
        markWritten();
        return;
      }
      const day = ymdOf(parseEpicDate(latest[0].date));
      dayInput.max = day;
      frames = latest;
      collection = 'natural';
      loadedDay = day;
      dayInput.value = day;
      showFrame(0);
      window.setTimeout(() => {
        if (!frameBlock.classList.contains('written')) markWritten();
      }, 2200);
    } catch {
      setNote(DOWN);
      markWritten();
    }
  }

  boot();

  return {
    next() {
      if (frames.length) showFrame(index + 1);
    },
    prev() {
      if (frames.length) showFrame(index - 1);
    },
    setMode(next) {
      if (next === collection) return;
      load({ dateStr: loadedDay || null, nextCollection: next });
    },
  };
}