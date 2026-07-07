import { toast } from './ui-feedback.js';

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

function ymdInTz(date, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function renderDateChips(form, step, go, tz) {
  const grid = document.getElementById('date-grid');
  const hidden = document.getElementById('date-hidden');
  if (!grid || !(hidden instanceof HTMLInputElement)) return;

  const days = [];
  const start = Date.now();
  for (let i = 0; i < 14; i++) {
    days.push(ymdInTz(new Date(start + i * 86_400_000), tz));
  }

  grid.innerHTML = days
    .map((iso) => {
      const ref = new Date(`${iso}T12:00:00`);
      const dayName = ref.toLocaleDateString('es-DO', { weekday: 'short', timeZone: tz }).replace('.', '');
      const month = ref.toLocaleDateString('es-DO', { month: 'short', timeZone: tz }).replace('.', '');
      const num = ref.toLocaleDateString('es-DO', { day: 'numeric', timeZone: tz });
      return `
        <label class="date-chip" data-date="${iso}">
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
      if (step === 2) setTimeout(() => go(3), 220);
    });
  });
}

export function initBookWizard() {
  const root = document.getElementById('book-wizard');
  const form = document.getElementById('book-form');
  if (!root || !(form instanceof HTMLFormElement)) return;

  const slug = root.dataset.slug || '';
  const tz = root.dataset.timezone || 'America/Santo_Domingo';
  const total = Number(root.dataset.total || 4);
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

  let step = 1;
  let selectedStartAt = '';

  function go(n) {
    if (n > step && !validateStep(step)) return;
    step = Math.max(1, Math.min(total, n));
    render();
  }

  renderDateChips(form, step, go, tz);

  bindChoiceCards(form, (name) => {
    if (name === 'serviceId' && step === 1) setTimeout(() => go(2), 200);
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

  function selectedServiceId() {
    const el = form.querySelector('input[name="serviceId"]:checked');
    return el instanceof HTMLInputElement ? el.value : '';
  }

  function selectedDate() {
    const hidden = document.getElementById('date-hidden');
    return hidden instanceof HTMLInputElement ? hidden.value : '';
  }

  async function loadSlots() {
    if (!slotsWrap) return;
    const serviceId = selectedServiceId();
    const date = selectedDate();
    if (!serviceId || !date) {
      slotsWrap.innerHTML = '<p class="text-sm text-muted">Primero elige servicio y día.</p>';
      return;
    }

    slotsWrap.innerHTML = '<p class="text-sm text-muted animate-pulse">Buscando horarios…</p>';
    const res = await fetch(
      `/api/slots?slug=${encodeURIComponent(slug)}&date=${encodeURIComponent(date)}&serviceId=${encodeURIComponent(serviceId)}`,
    );
    const data = await res.json();
    if (!res.ok || !data.slots?.length) {
      slotsWrap.innerHTML =
        '<p class="text-sm text-muted">Ese día no hay cupo disponible. Puedes pedir que te avisemos si se libera.</p>';
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
      if (name === 'startAt' && step === 3) {
        const slot = form.querySelector('input[name="startAt"]:checked');
        if (slot instanceof HTMLInputElement) selectedStartAt = slot.value;
        setTimeout(() => go(4), 200);
      }
    });
  }

  function validateStep(n) {
    if (n === 1 && !selectedServiceId()) {
      setError('Elige un servicio para continuar');
      return false;
    }
    if (n === 2 && !selectedDate()) {
      setError('Elige el día de tu cita');
      return false;
    }
    if (n === 3) {
      const slot = form.querySelector('input[name="startAt"]:checked');
      if (!slot) {
        setError('Elige la hora que prefieras');
        return false;
      }
      selectedStartAt = slot.value;
    }
    if (n === 4) {
      const name = form.querySelector('input[name="name"]');
      if (name instanceof HTMLInputElement && name.value.trim().length < 2) {
        setError('Necesitamos tu nombre');
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
    if (step === 2 && !document.querySelector('.date-chip.is-selected')) renderDateChips(form, step, go, tz);
    if (step === 3) loadSlots();
  }

  btnBack?.addEventListener('click', () => go(step - 1));
  btnNext?.addEventListener('click', () => go(step + 1));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateStep(4)) return;

    const fd = new FormData(form);
    const payload = {
      slug,
      serviceId: selectedServiceId(),
      startAt: selectedStartAt || String(fd.get('startAt') || ''),
      name: fd.get('name'),
      phone: fd.get('phone'),
      email: fd.get('email'),
      notes: String(fd.get('notes') || '').trim(),
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
        setError('Ese horario se acaba de ocupar. Elige otro.');
        go(3);
        return;
      }
      setError(json.error || 'No pudimos guardar la cita. Intenta de nuevo.');
      return;
    }

    form.classList.add('hidden');
    document.querySelector('.flow-wizard .mb-5')?.classList.add('hidden');
    stepLabel?.classList.add('hidden');
    successEl?.classList.remove('hidden');
    if (successCode) successCode.textContent = json.appointment?.code || '—';
    if (successWhen) {
      const when = new Date(json.appointment?.startAt || payload.startAt);
      successWhen.textContent = when.toLocaleString('es-DO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz,
      });
    }
    if (btnWa instanceof HTMLAnchorElement) {
      const whenText = successWhen?.textContent || '';
      const msg = encodeURIComponent(
        `Hola, confirmé mi cita ${json.appointment?.code || ''} · ${whenText}`,
      );
      const phone = (root.dataset.whatsapp || '').replace(/\D/g, '');
      btnWa.href = phone ? `https://wa.me/${phone}?text=${msg}` : '#';
      btnWa.classList.toggle('hidden', !phone);
    }
    toast('Cita solicitada', 'success');
  });

  document.getElementById('book-waitlist')?.addEventListener('click', async () => {
    const fd = new FormData(form);
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
        notes: String(fd.get('notes') || '').trim(),
      }),
    });
    if (res.ok) toast('Te avisaremos si hay cupo', 'success');
    else setError('No pudimos anotarte. Intenta de nuevo.');
  });

  btnAgain?.addEventListener('click', () => location.reload());
  render();
}
