const STYLE_LABELS = {
  fade: 'Fade / Degradé',
  low_fade: 'Low Fade',
  buzz: 'Buzz / Rapado',
  classic: 'Clásico',
  lineup: 'Line Up / Diseño',
  mullet: 'Mullet / Moderno',
  curly: 'Rizado / Textura',
  afro: 'Afro / Natural',
};

function bindChoiceCards(form, onSelect) {
  form.querySelectorAll('.flow-choice, .choice-card').forEach((card) => {
    const input = card.querySelector('input[type="radio"]');
    if (!(input instanceof HTMLInputElement)) return;

    const sync = () => {
      form.querySelectorAll(`input[name="${input.name}"]`).forEach((radio) => {
        radio.closest('.flow-choice, .choice-card')?.classList.toggle('is-selected', radio.checked);
      });
    };

    card.addEventListener('click', (e) => {
      e.preventDefault();
      input.checked = true;
      sync();
      onSelect?.(input.name, input.value);
    });
  });
}

function renderDateChips(form) {
  const grid = document.getElementById('date-grid');
  const hidden = document.getElementById('date-hidden');
  if (!grid || !(hidden instanceof HTMLInputElement)) return;

  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  grid.innerHTML = days
    .map((d, i) => {
      const iso = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleDateString('es-DO', { weekday: 'short' }).replace('.', '');
      const month = d.toLocaleDateString('es-DO', { month: 'short' }).replace('.', '');
      const num = d.getDate();
      return `
        <label class="date-chip ${i === 0 ? '' : ''}" data-date="${iso}">
          <input type="radio" name="datePick" value="${iso}" class="sr-only" />
          <span class="date-chip__day">${dayName} · ${month}</span>
          <span class="date-chip__num">${num}</span>
        </label>`;
    })
    .join('');

  grid.querySelectorAll('.date-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const iso = chip.getAttribute('data-date') || '';
      hidden.value = iso;
      grid.querySelectorAll('.date-chip').forEach((c) => c.classList.remove('is-selected'));
      chip.classList.add('is-selected');
      const input = chip.querySelector('input');
      if (input instanceof HTMLInputElement) input.checked = true;
      if (step === 3) setTimeout(() => go(4), 220);
    });
  });
}

export function initBookWizard() {
  const root = document.getElementById('book-wizard');
  const form = document.getElementById('book-form');
  if (!root || !(form instanceof HTMLFormElement)) return;

  const slug = root.dataset.slug || '';
  const total = Number(root.dataset.total || 5);
  const panels = [...form.querySelectorAll('.step-panel')];
  const dots = [...root.querySelectorAll('[data-step-dot]')];
  const stepLabel = document.getElementById('book-step-label');
  const btnBack = document.getElementById('book-back');
  const btnNext = document.getElementById('book-next');
  const btnSubmit = document.getElementById('book-submit');
  const btnAgain = document.getElementById('book-again');
  const btnWa = document.getElementById('book-wa');
  const errorEl = document.getElementById('book-error');
  const successEl = document.getElementById('book-success');
  const slotsWrap = document.getElementById('slots-grid');
  const successCode = document.getElementById('book-success-code');
  const successWhen = document.getElementById('book-success-when');
  const successStyle = document.getElementById('book-success-style');
  const styleSummary = document.getElementById('style-summary');

  let step = 1;
  let selectedStartAt = '';

  renderDateChips(form);

  form.querySelectorAll('.style-card').forEach((card) => {
    const input = card.querySelector('input[type="radio"]');
    if (!(input instanceof HTMLInputElement)) return;
    card.addEventListener('click', (e) => {
      e.preventDefault();
      input.checked = true;
      form.querySelectorAll('.style-card').forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      if (step === 1) setTimeout(() => go(2), 200);
    });
  });

  bindChoiceCards(form, (name) => {
    if (name === 'serviceId' && step === 2) setTimeout(() => go(3), 200);
  });

  function setError(msg) {
    if (!errorEl) return;
    if (!msg) {
      errorEl.classList.add('hidden');
      errorEl.textContent = '';
      return;
    }
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  function selectedHaircutStyle() {
    const el = form.querySelector('input[name="haircutStyle"]:checked');
    return el instanceof HTMLInputElement ? el.value : '';
  }

  function selectedServiceId() {
    const el = form.querySelector('input[name="serviceId"]:checked');
    return el instanceof HTMLInputElement ? el.value : '';
  }

  function selectedDate() {
    const hidden = document.getElementById('date-hidden');
    return hidden instanceof HTMLInputElement ? hidden.value : '';
  }

  function updateStyleSummary() {
    if (!styleSummary) return;
    const id = selectedHaircutStyle();
    if (!id) {
      styleSummary.classList.add('hidden');
      return;
    }
    styleSummary.textContent = `Estilo: ${STYLE_LABELS[id] || id}`;
    styleSummary.classList.remove('hidden');
  }

  async function loadSlots() {
    if (!slotsWrap) return;
    const serviceId = selectedServiceId();
    const date = selectedDate();
    if (!serviceId || !date) {
      slotsWrap.innerHTML = '<p class="text-sm text-muted">Elige servicio y fecha primero.</p>';
      return;
    }

    slotsWrap.innerHTML = '<p class="text-sm text-muted animate-pulse">Cargando horarios…</p>';
    const res = await fetch(
      `/api/slots?slug=${encodeURIComponent(slug)}&date=${encodeURIComponent(date)}&serviceId=${encodeURIComponent(serviceId)}`,
    );
    const data = await res.json();
    if (!res.ok || !data.slots?.length) {
      slotsWrap.innerHTML = '<p class="text-sm text-muted">No hay horarios libres. Puedes unirte a la lista de espera.</p>';
      return;
    }

    slotsWrap.innerHTML = data.slots
      .map(
        (s) => `
      <label class="flow-choice choice-card slot-card cursor-pointer">
        <input type="radio" name="startAt" value="${s.startAt}" class="sr-only" required />
        <span class="flow-choice__body">
          <span class="flow-choice__title">${s.label}</span>
        </span>
        <span class="flow-radio"></span>
      </label>`,
      )
      .join('');

    bindChoiceCards(form, (name) => {
      if (name === 'startAt' && step === 4) {
        const slot = form.querySelector('input[name="startAt"]:checked');
        if (slot instanceof HTMLInputElement) selectedStartAt = slot.value;
        setTimeout(() => go(5), 200);
      }
    });
  }

  function validateStep(n) {
    if (n === 1 && !selectedHaircutStyle()) {
      setError('Elige un estilo');
      return false;
    }
    if (n === 2 && !selectedServiceId()) {
      setError('Elige un servicio');
      return false;
    }
    if (n === 3 && !selectedDate()) {
      setError('Elige una fecha');
      return false;
    }
    if (n === 4) {
      const slot = form.querySelector('input[name="startAt"]:checked');
      if (!slot) {
        setError('Elige un horario');
        return false;
      }
      selectedStartAt = slot.value;
    }
    if (n === 5) {
      const name = form.querySelector('input[name="name"]');
      if (name instanceof HTMLInputElement && name.value.trim().length < 2) {
        setError('Nombre requerido');
        return false;
      }
    }
    setError('');
    return true;
  }

  function render() {
    panels.forEach((p) => {
      const n = Number(p.getAttribute('data-step'));
      p.classList.toggle('hidden', n !== step);
    });
    dots.forEach((d) => {
      const n = Number(d.getAttribute('data-step-dot'));
      d.classList.toggle('is-active', n === step);
      d.classList.toggle('is-done', n < step);
    });
    if (stepLabel) stepLabel.textContent = `Paso ${step} de ${total}`;
    btnBack?.classList.toggle('hidden', step <= 1);
    btnNext?.classList.toggle('hidden', step >= total);
    btnSubmit?.classList.toggle('hidden', step !== total);
    if (step === 3 && !document.querySelector('.date-chip.is-selected')) renderDateChips(form);
    if (step === 4) loadSlots();
    if (step === 5) updateStyleSummary();
  }

  function go(n) {
    if (n > step && !validateStep(step)) return;
    step = Math.max(1, Math.min(total, n));
    render();
  }

  btnBack?.addEventListener('click', () => go(step - 1));
  btnNext?.addEventListener('click', () => go(step + 1));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateStep(5)) return;

    const fd = new FormData(form);
    const styleId = selectedHaircutStyle();
    const styleLabel = STYLE_LABELS[styleId] || styleId;
    const payload = {
      slug,
      serviceId: selectedServiceId(),
      startAt: selectedStartAt || String(fd.get('startAt') || ''),
      haircutStyle: styleId,
      name: fd.get('name'),
      phone: fd.get('phone'),
      email: fd.get('email'),
      notes: [styleLabel, fd.get('notes')].filter(Boolean).join(' · '),
    };

    btnSubmit?.setAttribute('disabled', 'true');
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    btnSubmit?.removeAttribute('disabled');

    if (!res.ok) {
      if (res.status === 409) {
        setError('Ese horario acaba de ocuparse. Elige otro.');
        go(4);
        return;
      }
      setError(json.error || 'No se pudo reservar');
      return;
    }

    form.classList.add('hidden');
    document.querySelector('.flow-wizard .mb-5')?.classList.add('hidden');
    stepLabel?.classList.add('hidden');
    successEl?.classList.remove('hidden');
    if (successCode) successCode.textContent = json.appointment?.code || '—';
    if (successStyle) successStyle.textContent = styleLabel;
    if (successWhen) {
      const when = new Date(json.appointment?.startAt || payload.startAt);
      successWhen.textContent = when.toLocaleString('es-DO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (btnWa instanceof HTMLAnchorElement) {
      const msg = encodeURIComponent(
        `Hola, confirmé cita ${json.appointment?.code || ''} · ${styleLabel} · ${successWhen?.textContent || ''}`,
      );
      const phone = (root.dataset.whatsapp || '').replace(/\D/g, '');
      btnWa.href = phone ? `https://wa.me/${phone}?text=${msg}` : '#';
      btnWa.classList.toggle('hidden', !phone);
    }
  });

  document.getElementById('book-waitlist')?.addEventListener('click', async () => {
    const fd = new FormData(form);
    const styleId = selectedHaircutStyle();
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        serviceId: selectedServiceId(),
        preferredDate: selectedDate(),
        name: fd.get('name') || 'Cliente',
        phone: fd.get('phone'),
        email: fd.get('email'),
        notes: `${STYLE_LABELS[styleId] || styleId} · ${fd.get('notes') || ''}`,
      }),
    });
    if (res.ok) alert('Te agregamos a la lista de espera.');
    else setError('No se pudo agregar a lista de espera');
  });

  btnAgain?.addEventListener('click', () => location.reload());
  render();
}
