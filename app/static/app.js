const state = { offset: 0, limit: 50, location: '', companyType: 'all', specialty: '' };

const form = document.getElementById('search-form');
const locationInput = document.getElementById('location');
const typeInput = document.getElementById('company-type');
const specialtyInput = document.getElementById('specialty');
const statusEl = document.getElementById('status');
const providersEl = document.getElementById('providers');

document.getElementById('next').addEventListener('click', async () => {
  state.offset += state.limit;
  await runSearch();
});

document.getElementById('prev').addEventListener('click', async () => {
  state.offset = Math.max(0, state.offset - state.limit);
  await runSearch();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  state.location = locationInput.value.trim();
  state.companyType = typeInput.value;
  state.specialty = specialtyInput.value.trim();
  state.offset = 0;
  await runSearch();
});

async function fetchProviders() {
  const res = await fetch('/providers');
  const json = await res.json();
  providersEl.textContent = `Enabled providers: ${Object.entries(json).filter(([,v]) => v).map(([k]) => k).join(', ')}`;
}

async function runSearch() {
  if (!state.location) {
    statusEl.textContent = 'Enter a location first.';
    return;
  }

  statusEl.textContent = `Loading ${state.offset + 1}-${state.offset + state.limit}...`;
  const res = await fetch('/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: state.location,
      company_type: state.companyType,
      specialty: state.specialty,
      offset: state.offset,
      limit: state.limit,
    }),
  });

  const json = await res.json();
  statusEl.textContent = `Showing ${json.items.length} results (offset ${state.offset}).`;
  renderBoard(json.items);
}

function cardFor(item) {
  const card = document.getElementById('card-template').content.firstElementChild.cloneNode(true);
  card.querySelector('.name').textContent = item.name;
  card.querySelector('.owner').textContent = item.owner || 'Not listed';
  card.querySelector('.location').textContent = item.location || 'Not listed';
  card.querySelector('.employees').textContent = item.employees || 'Not listed';
  card.querySelector('.specialties').textContent = item.specialties || 'Not listed';
  const website = card.querySelector('.website');
  website.href = item.website || '#';
  website.textContent = item.website || 'Not listed';

  const notes = card.querySelector('.notes');
  notes.value = item.notes || '';

  card.querySelectorAll('button[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch('/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: item.domain, status: btn.dataset.status, notes: notes.value.trim() }),
      });
      await refreshBoard();
    });
  });

  notes.addEventListener('change', async () => {
    await fetch('/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: item.domain, status: item.triage_status || 'open', notes: notes.value.trim() }),
    });
  });

  return card;
}

async function refreshBoard() {
  const res = await fetch('/board');
  const json = await res.json();
  renderBoard(json.items);
}

function renderBoard(items) {
  const cols = {
    open: document.getElementById('open-list'),
    maybe: document.getElementById('maybe-list'),
    good: document.getElementById('good-list'),
    rejected: document.getElementById('rejected-list'),
  };

  Object.values(cols).forEach((el) => (el.innerHTML = ''));

  const filtered = items.filter((i) => i.triage_status !== 'rejected' || i.triage_status === 'rejected');
  for (const item of filtered) {
    const status = item.triage_status || 'open';
    (cols[status] || cols.open).appendChild(cardFor(item));
  }

  Object.entries(cols).forEach(([status, el]) => {
    if (!el.children.length) {
      const p = document.createElement('p');
      p.textContent = `No ${status} records.`;
      el.appendChild(p);
    }
  });
}

fetchProviders();
refreshBoard();
