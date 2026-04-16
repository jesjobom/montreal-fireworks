const PRESENTATION_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwia2lkIjoiMGpwTEJBLlJSMUJIZyJ9..1weVOmK6BEwD1cd8.WjKcY7_qzc12DZ29hUyvrD0fTGymr4S1JttEyronmBGCyIF6EvYYSP6Sz4nKMt573UmvAUBG4I_9eIXHoQzSf5URJmv8I6sDydyxR3hEFT7SvO14JM6vXRnQtHygfgNu5OJLidwiUdLHF3t1huzRITsTnwMjhEbNgbuzs8Tm.54eSc7pzAHnxWmfV68BEyg';
const REMOTE_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIiwia2lkIjoiMGpwTEJBLmdyNHFqQSJ9..NasFZ4T7sywXrx9r.A4fNm92KEGGXQjANZVsnHOunjnYgW_ebNH1QGp3jSwjh0g89VBnpbszImIGD00RhceH5B6I1ezjz4s--A52fhsluYz2c6NaJl9RrmdqkoP6FODp0PaKA6DIk3BIBsk6a8j9238PJ5LTvD9C6-1TtZkJDleHSuKzKVerUIw.St685SZy1Ix6noek2BV3jA';
const CHANNEL_PREFIX = 'montreal-fireworks:';

function getSessionId() {
  const url = new URL(window.location.href);
  let sessionId = url.searchParams.get('session');

  if (!sessionId) {
    sessionId = Math.random().toString(36).slice(2, 10);
    url.searchParams.set('session', sessionId);
    window.history.replaceState({}, '', url);
  }

  return sessionId;
}

function getRemoteUrl(sessionId) {
  const url = new URL('remote.html', window.location.href);
  url.searchParams.set('session', sessionId);
  return url.toString();
}

function updateStatus(text, state) {
  const element = document.getElementById('ably-status');
  if (!element) return;
  element.textContent = text;
  element.dataset.state = state || '';
}

function showToast(message) {
  const toast = document.getElementById('remote-toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('is-visible');

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2600);
}

function setOverlayCollapsed(collapsed) {
  const overlay = document.getElementById('remote-overlay');
  const toggle = document.getElementById('remote-toggle');
  if (!overlay || !toggle) return;

  overlay.classList.toggle('is-collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
}

function publishCommand(channel, payload, feedbackElement, eventName = 'command') {
  if (!channel) {
    if (feedbackElement) feedbackElement.textContent = 'Canal indisponible.';
    return;
  }

  channel.publish(eventName, payload, (error) => {
    if (!feedbackElement) return;
    feedbackElement.textContent = error ? `Échec d’envoi : ${error.message || error}` : `Envoyé : ${payload.action}`;
  });
}

function syncMapPinsToFragments(deck) {
  const pins = Array.from(document.querySelectorAll('.map-pin'));
  const callouts = Array.from(document.querySelectorAll('.map-callout.fragment'));
  if (!pins.length || !callouts.length) return;

  const currentFragment = deck.getCurrentSlide()?.querySelector('.map-callout.fragment.current-fragment');
  const activeIndex = currentFragment ? Number.parseInt(currentFragment.dataset.fragmentIndex || '-1', 10) : -1;

  pins.forEach((pin, index) => {
    pin.classList.toggle('is-active', index === activeIndex);
    pin.classList.toggle('is-muted', activeIndex !== -1 && index !== activeIndex);
    pin.classList.toggle('is-overview', activeIndex === -1);
  });
}

function createFireworksEngine() {
  const canvas = document.getElementById('fireworks-canvas');
  if (!canvas) {
    return { trigger() {} };
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return { trigger() {} };
  }

  const bursts = [];
  let rafId = 0;
  let stopAt = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function makeBurst() {
    const hue = Math.floor(Math.random() * 360);
    const x = window.innerWidth * (0.18 + Math.random() * 0.64);
    const y = window.innerHeight * (0.16 + Math.random() * 0.42);
    const count = 22 + Math.floor(Math.random() * 18);
    const particles = [];

    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + (Math.random() - 0.5) * 0.18;
      const speed = 1.8 + Math.random() * 4.4;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        ttl: 42 + Math.random() * 26,
        radius: 1.8 + Math.random() * 2.8,
        alpha: 1,
        color: `hsla(${(hue + Math.random() * 40 - 20 + 360) % 360}, 100%, ${60 + Math.random() * 20}%, 1)`
      });
    }

    bursts.push({ particles });
  }

  function animate() {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let burstIndex = bursts.length - 1; burstIndex >= 0; burstIndex -= 1) {
      const burst = bursts[burstIndex];

      for (let particleIndex = burst.particles.length - 1; particleIndex >= 0; particleIndex -= 1) {
        const particle = burst.particles[particleIndex];
        particle.life += 1;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.988;
        particle.vy = particle.vy * 0.988 + 0.045;
        particle.alpha = Math.max(0, 1 - particle.life / particle.ttl);

        if (particle.alpha <= 0.02) {
          burst.particles.splice(particleIndex, 1);
          continue;
        }

        context.beginPath();
        context.fillStyle = particle.color.replace(', 1)', `, ${particle.alpha})`);
        context.shadowColor = particle.color.replace(', 1)', `, ${Math.min(1, particle.alpha)})`);
        context.shadowBlur = 12;
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }

      if (!burst.particles.length) {
        bursts.splice(burstIndex, 1);
      }
    }

    context.shadowBlur = 0;

    if (Date.now() < stopAt) {
      if (Math.random() < 0.17) {
        makeBurst();
      }
    }

    if (bursts.length || Date.now() < stopAt) {
      rafId = window.requestAnimationFrame(animate);
      return;
    }

    canvas.classList.remove('is-active');
    rafId = 0;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', resize);
  resize();

  return {
    trigger(durationMs = 1800) {
      resize();
      stopAt = Date.now() + durationMs;
      canvas.classList.add('is-active');

      makeBurst();
      window.setTimeout(makeBurst, 180);
      window.setTimeout(makeBurst, 360);

      if (!rafId) {
        rafId = window.requestAnimationFrame(animate);
      }
    }
  };
}

function initializePresentation() {
  const deck = new Reveal({
    hash: true,
    slideNumber: true,
    transition: 'slide',
    backgroundTransition: 'fade'
  });

  deck.initialize();

  const fireworks = createFireworksEngine();
  const sessionId = getSessionId();
  const remoteUrl = getRemoteUrl(sessionId);
  document.getElementById('session-id').textContent = sessionId;
  document.getElementById('remote-link').href = remoteUrl;
  document.getElementById('remote-link').textContent = remoteUrl;

  document.getElementById('remote-toggle')?.addEventListener('click', () => {
    const overlay = document.getElementById('remote-overlay');
    const collapsed = overlay ? overlay.classList.contains('is-collapsed') : true;
    setOverlayCollapsed(!collapsed);
  });

  document.getElementById('remote-close')?.addEventListener('click', () => {
    setOverlayCollapsed(true);
  });

  const qrContainer = document.getElementById('remote-qr');
  if (qrContainer) {
    qrContainer.replaceChildren();
    try {
      const canvas = document.createElement('canvas');
      qrContainer.appendChild(canvas);
      new QRious({
        element: canvas,
        value: remoteUrl,
        size: 200,
        foreground: '#111827',
        background: '#ffffff',
        level: 'M'
      });
    } catch (error) {
      qrContainer.textContent = 'QR generation failed';
      console.error(error);
    }
  }

  updateStatus('Jeton expiré ou connexion Ably échouée', 'error');

  syncMapPinsToFragments(deck);
  deck.on('fragmentshown', () => syncMapPinsToFragments(deck));
  deck.on('fragmenthidden', () => syncMapPinsToFragments(deck));
  deck.on('slidechanged', () => syncMapPinsToFragments(deck));
  deck.on('ready', () => syncMapPinsToFragments(deck));

  if (!PRESENTATION_TOKEN) {
    return;
  }

  const client = new Ably.Realtime({ token: PRESENTATION_TOKEN });
  const channel = client.channels.get(`${CHANNEL_PREFIX}${sessionId}`);

  client.connection.on('connected', () => updateStatus('connecté', 'ok'));
  client.connection.on('connecting', () => updateStatus('connexion...', 'pending'));
  client.connection.on('disconnected', () => updateStatus('déconnecté', 'warn'));
  client.connection.on('suspended', () => updateStatus('connexion suspendue', 'warn'));
  client.connection.on('failed', () => updateStatus('Jeton expiré ou connexion Ably échouée', 'error'));

  channel.subscribe('presence', (message) => {
    const data = (message && message.data) || {};

    if (data.action === 'remote-connected') {
      setOverlayCollapsed(true);
      showToast('Télécommande connectée');
    }
  });

  channel.subscribe('command', (message) => {
    const data = (message && message.data) || {};

    switch (data.action) {
      case 'next':
        deck.next();
        break;
      case 'prev':
        deck.prev();
        break;
      case 'goto':
        if (typeof data.h === 'number') {
          deck.slide(data.h, 0);
        }
        break;
      case 'fireworks':
        fireworks.trigger();
        showToast('Feux déclenchés');
        break;
      default:
        console.warn('Unknown remote action', data);
    }
  });
}

function initializeRemote() {
  const sessionId = new URL(window.location.href).searchParams.get('session');
  const feedback = document.getElementById('remote-feedback');
  const sessionEl = document.getElementById('remote-session-id');
  const gotoSlide = document.getElementById('goto-slide');

  if (!sessionId) {
    if (feedback) feedback.textContent = 'Session manquante dans l’URL.';
    return;
  }

  if (sessionEl) sessionEl.textContent = sessionId;

  if (!REMOTE_TOKEN) {
    if (feedback) feedback.textContent = 'Jeton manquant ou expiré.';
    return;
  }

  let channel = null;

  try {
    const client = new Ably.Realtime({ token: REMOTE_TOKEN });
    channel = client.channels.get(`${CHANNEL_PREFIX}${sessionId}`);

    client.connection.on('connected', () => {
      if (feedback) feedback.textContent = 'Connectée. Prête à envoyer des commandes.';
      publishCommand(channel, { action: 'remote-connected', connectedAt: new Date().toISOString() }, null, 'presence');
    });

    client.connection.on('failed', () => {
      if (feedback) feedback.textContent = 'Connexion échouée ou jeton expiré.';
    });
  } catch (error) {
    if (feedback) feedback.textContent = 'Initialisation Ably échouée.';
    console.error(error);
    return;
  }

  document.getElementById('btn-next')?.addEventListener('click', () => {
    publishCommand(channel, { action: 'next' }, feedback);
  });

  document.getElementById('btn-prev')?.addEventListener('click', () => {
    publishCommand(channel, { action: 'prev' }, feedback);
  });

  document.getElementById('btn-fireworks')?.addEventListener('click', () => {
    publishCommand(channel, { action: 'fireworks' }, feedback);
  });

  document.getElementById('btn-goto')?.addEventListener('click', () => {
    const slideNumber = Number.parseInt(gotoSlide.value, 10);

    if (Number.isNaN(slideNumber) || slideNumber < 1) {
      if (feedback) feedback.textContent = 'Entrez un numéro de slide valide.';
      return;
    }

    publishCommand(channel, { action: 'goto', h: slideNumber - 1 }, feedback);
  });
}

if (document.body.classList.contains('presentation-page')) {
  initializePresentation();
}

if (document.body.classList.contains('remote-page')) {
  initializeRemote();
}
