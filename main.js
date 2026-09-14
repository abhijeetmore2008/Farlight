import './styles.css';
import { formatUtc } from './place.js';
import { initEpic } from './epic.js';
import { initIss } from './iss.js';
import { initPass } from './pass.js';

function startClock() {
  const el = document.getElementById('clock');
  const tick = () => {
    const now = new Date();
    el.textContent = formatUtc(now);
    el.dateTime = now.toISOString();
  };
  tick();
  window.setInterval(tick, 1000);
}

function initAbout() {
  const root = document.getElementById('about');
  const openBtn = document.getElementById('about-open');
  const closeBtn = document.getElementById('about-close');

  const open = () => {
    root.hidden = false;
    closeBtn.focus();
  };
  const close = () => {
    root.hidden = true;
    openBtn.focus();
  };

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  return { open, close, isOpen: () => !root.hidden };
}

function initSheet(iss) {
  const sheet = document.getElementById('margin');
  const handle = document.getElementById('sheet-handle');
  const app = document.querySelector('.app');
  let dragging = false;
  let startY = 0;
  let startH = 0;

  const desktop = () => window.matchMedia('(min-width: 721px)').matches;

  handle.addEventListener('pointerdown', (e) => {
    if (desktop()) return;
    dragging = true;
    startY = e.clientY;
    startH = sheet.getBoundingClientRect().height;
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging || desktop()) return;
    const next = Math.min(
      window.innerHeight * 0.78,
      Math.max(window.innerHeight * 0.28, startH + (startY - e.clientY)),
    );
    sheet.style.height = `${next}px`;
    app.style.paddingBottom = `${next}px`;
    iss.resize();
  });

  const stop = () => {
    dragging = false;
  };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);

  window.addEventListener('resize', () => {
    if (desktop()) {
      sheet.style.height = '';
      app.style.paddingBottom = '';
    }
    iss.resize();
  });
}

const epic = initEpic();
const iss = initIss();
const pass = initPass();
const about = initAbout();

startClock();
initSheet(iss);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && about.isOpen()) {
    about.close();
    return;
  }
  const typing = e.target.matches('input, textarea');
  if (typing) return;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    epic.prev();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    epic.next();
  } else if (e.key === 'n' || e.key === 'N') {
    epic.setMode('natural');
  } else if (e.key === 'e' || e.key === 'E') {
    epic.setMode('enhanced');
  } else if (e.key === 'l' || e.key === 'L') {
    pass.locate();
  }
});