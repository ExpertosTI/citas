const AI_DEMO_LINES = [
  'Corte 700, Barba 350, Cejas 200',
  'Horario 9am a 8pm, cerrado domingos',
  'Logo listo · color #c9a227 aplicado',
  '¡Bahía abierta! Tus clientes ya pueden reservar',
];

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function typeText(el, text, speed, onDone) {
  let i = 0;
  el.textContent = '';
  el.classList.add('typewriter-active');

  function tick() {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      i += 1;
      setTimeout(tick, speed);
    } else {
      el.classList.remove('typewriter-active');
      onDone?.();
    }
  }

  tick();
}

function initTypewriter(el) {
  const text = el.dataset.typewriter || el.textContent?.trim() || '';
  const speed = Number(el.dataset.typeSpeed) || 42;
  if (!text) return;

  const run = () => typeText(el, text, speed);

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
  } else {
    run();
  }
}

function initAiDemo(el) {
  const speed = 36;
  let line = 0;

  const cycle = () => {
    typeText(el, AI_DEMO_LINES[line], speed, () => {
      setTimeout(() => {
        line = (line + 1) % AI_DEMO_LINES.length;
        cycle();
      }, 2200);
    });
  };

  const io = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        cycle();
        io.disconnect();
      }
    },
    { threshold: 0.4 },
  );
  io.observe(el);
}

function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  if (prefersReducedMotion()) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -4% 0px' },
  );

  els.forEach((el) => io.observe(el));
}

function initFeatureMotion() {
  const cards = document.querySelectorAll('.feature-showcase[data-motion]');
  if (!cards.length) return;

  if (prefersReducedMotion()) {
    cards.forEach((c) => c.classList.add('is-live'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-live');
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.22, rootMargin: '0px 0px -8% 0px' },
  );

  cards.forEach((card) => io.observe(card));
}

function initParallax() {
  if (prefersReducedMotion()) return;

  const items = [...document.querySelectorAll('[data-parallax]')];
  const motifs = [...document.querySelectorAll('.theme-motifs__item')];
  if (!items.length && !motifs.length) return;

  let ticking = false;

  const update = () => {
    const scrollY = window.scrollY;
    items.forEach((el) => {
      const speed = Number(el.dataset.parallax) || 0.12;
      const y = scrollY * speed;
      el.style.transform = `translate3d(0, ${y}px, 0)`;
    });
    motifs.forEach((el, i) => {
      const y = scrollY * (0.03 + i * 0.018);
      el.style.transform = `translate3d(0, ${y}px, 0) rotate(${i % 2 ? 3 : -3}deg)`;
    });
    ticking = false;
  };

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
  update();
}

function initTilt() {
  if (prefersReducedMotion()) return;

  document.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(800px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateY(-4px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

function initModuleMotion() {
  const arch = document.querySelector('.modules-arch');
  if (arch && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        arch.classList.add('is-visible');
        io.disconnect();
      },
      { threshold: 0.35 },
    );
    io.observe(arch);
  }

  const cards = document.querySelectorAll('[data-module-card]');
  if (!cards.length) return;

  if (prefersReducedMotion()) {
    cards.forEach((c) => c.classList.add('is-live'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-live');
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
  );

  cards.forEach((card) => io.observe(card));
}

export function initMotion() {
  document.documentElement.classList.add('motion-enabled');
  initReveal();
  initFeatureMotion();
  initModuleMotion();
  initParallax();
  initTilt();
  document.querySelectorAll('[data-typewriter]').forEach(initTypewriter);
  const demo = document.getElementById('ai-type-demo');
  if (demo) initAiDemo(demo);
}
