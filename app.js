const STORAGE_KEY = 'etaTravelCompanies';
const SEARCH_STATE_KEY = 'etaTravelSearchState';
const BATCH_SIZE = 50;

let companies = loadCompanies();
let searchState = loadSearchState();

const discoveryForm = document.getElementById('discovery-form');
const searchLocation = document.getElementById('search-location');
const searchType = document.getElementById('search-type');
const searchKeyword = document.getElementById('search-keyword');
const nextBatchButton = document.getElementById('next-batch');
const prevBatchButton = document.getElementById('prev-batch');
const batchStatus = document.getElementById('batch-status');

const locationFilter = document.getElementById('location-filter');
const ownerFilter = document.getElementById('owner-filter');
const specialtyFilter = document.getElementById('specialty-filter');
const typeFilter = document.getElementById('type-filter');

discoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  searchState.location = searchLocation.value.trim();
  searchState.companyType = searchType.value;
  searchState.keyword = searchKeyword.value.trim();
  searchState.offset = 0;
  await fetchBatch();
});

nextBatchButton.addEventListener('click', async () => {
  if (!searchState.location) return;
  searchState.offset += BATCH_SIZE;
  await fetchBatch();
});

prevBatchButton.addEventListener('click', async () => {
  if (!searchState.location || searchState.offset === 0) return;
  searchState.offset = Math.max(0, searchState.offset - BATCH_SIZE);
  await fetchBatch();
});

[locationFilter, ownerFilter, specialtyFilter, typeFilter].forEach((input) => {
  input.addEventListener('input', render);
});

function loadCompanies() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function saveCompanies() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(companies));
}

function loadSearchState() {
  const stored = localStorage.getItem(SEARCH_STATE_KEY);
  if (!stored) {
    return {
      location: '',
      companyType: 'all',
      keyword: '',
      offset: 0,
      currentBatchIds: []
    };
  }

  try {
    return JSON.parse(stored);
  } catch {
    return {
      location: '',
      companyType: 'all',
      keyword: '',
      offset: 0,
      currentBatchIds: []
    };
  }
}

function saveSearchState() {
  localStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(searchState));
}

function buildQuery() {
  const typeText = {
    all: 'travel agency or tour operator',
    'tour operator': 'tour operator',
    'retail travel agency': 'travel agency'
  }[searchState.companyType];

  return [typeText, searchState.location, searchState.keyword].filter(Boolean).join(' ');
}

function inferType(record) {
  const haystack = `${record.type || ''} ${record.class || ''} ${record.display_name || ''}`.toLowerCase();
  if (haystack.includes('tour')) return 'tour operator';
  return 'retail travel agency';
}

function mapResultToCompany(record) {
  const address = record.address || {};
  const location = [address.city, address.town, address.village, address.state]
    .filter(Boolean)
    .slice(0, 2)
    .join(', ') || record.display_name;

  const website = record.extratags?.website || record.extratags?.contact_website || 'Not listed';

  return {
    id: `${record.osm_type}-${record.osm_id}`,
    name: record.name || record.display_name.split(',')[0],
    type: inferType(record),
    owner: 'Not publicly listed',
    location,
    employees: 'Not publicly listed',
    specialties: searchState.keyword || 'General travel services',
    website,
    notes: '',
    status: 'open'
  };
}

async function fetchBatch() {
  const query = buildQuery();

  if (!query || !searchState.location) {
    batchStatus.textContent = 'Enter a location to run search.';
    return;
  }

  batchStatus.textContent = `Loading results ${searchState.offset + 1}-${searchState.offset + BATCH_SIZE}...`;

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('extratags', '1');
    url.searchParams.set('limit', String(BATCH_SIZE));
    url.searchParams.set('offset', String(searchState.offset));

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Search failed with status ${response.status}`);
    }

    const records = await response.json();
    const newBatchIds = [];

    records.forEach((record) => {
      const incoming = mapResultToCompany(record);
      const existing = companies.find((company) => company.id === incoming.id);

      if (existing) {
        if (incoming.website !== 'Not listed') existing.website = incoming.website;
        if (existing.specialties === 'General travel services' && incoming.specialties !== 'General travel services') {
          existing.specialties = incoming.specialties;
        }
        existing.location = incoming.location;
      } else {
        companies.push(incoming);
      }

      newBatchIds.push(incoming.id);
    });

    searchState.currentBatchIds = newBatchIds;
    saveCompanies();
    saveSearchState();

    const count = records.length;
    if (!count && searchState.offset > 0) {
      batchStatus.textContent = 'No additional results found for this query. Try changing location or keyword.';
    } else {
      const start = searchState.offset + 1;
      const end = searchState.offset + count;
      batchStatus.textContent = `Showing public results ${start}-${end || searchState.offset} for "${query}".`;
    }

    render();
  } catch (error) {
    batchStatus.textContent = `Could not fetch public results: ${error.message}`;
  }
}

function applyFilters(list) {
  const location = locationFilter.value.trim().toLowerCase();
  const owner = ownerFilter.value.trim().toLowerCase();
  const specialty = specialtyFilter.value.trim().toLowerCase();
  const type = typeFilter.value;

  return list.filter((company) => {
    const locationMatch = company.location.toLowerCase().includes(location);
    const ownerMatch = company.owner.toLowerCase().includes(owner);
    const specialtyMatch = company.specialties.toLowerCase().includes(specialty);
    const typeMatch = type === 'all' || company.type === type;
    return locationMatch && ownerMatch && specialtyMatch && typeMatch;
  });
}

function createCard(company) {
  const template = document.getElementById('company-template');
  const card = template.content.firstElementChild.cloneNode(true);
  card.querySelector('.company-name').textContent = company.name;
  card.querySelector('.company-type').textContent = company.type;
  card.querySelector('.owner').textContent = company.owner;
  card.querySelector('.location').textContent = company.location;
  card.querySelector('.employees').textContent = company.employees || 'Not listed';
  card.querySelector('.specialties').textContent = company.specialties;

  const website = card.querySelector('.website');
  website.textContent = company.website;
  if (company.website.startsWith('http')) {
    website.href = company.website;
  } else {
    website.href = '#';
  }

  const notes = card.querySelector('.notes');
  notes.value = company.notes || '';
  notes.addEventListener('change', () => {
    company.notes = notes.value.trim();
    saveCompanies();
  });

  card.querySelectorAll('.status-btn').forEach((button) => {
    button.addEventListener('click', () => {
      company.status = button.dataset.status;
      saveCompanies();
      render();
    });
  });

  return card;
}

function renderColumn(elementId, list) {
  const listElement = document.getElementById(elementId);
  listElement.innerHTML = '';

  if (!list.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No companies in this column.';
    listElement.appendChild(empty);
    return;
  }

  list.forEach((company) => {
    listElement.appendChild(createCard(company));
  });
}

function render() {
  searchLocation.value = searchState.location;
  searchType.value = searchState.companyType;
  searchKeyword.value = searchState.keyword;

  const batchSet = new Set(searchState.currentBatchIds);

  const openCurrentBatch = applyFilters(
    companies.filter((company) => company.status === 'open' && batchSet.has(company.id))
  );

  const maybeAndFiltered = applyFilters(companies.filter((company) => company.status === 'maybe'));
  const goodAndFiltered = applyFilters(companies.filter((company) => company.status === 'good'));

  // rejected companies are intentionally excluded from search filters/batches
  const rejected = companies.filter((company) => company.status === 'rejected');

  renderColumn('open-list', openCurrentBatch);
  renderColumn('maybe-list', maybeAndFiltered);
  renderColumn('good-list', goodAndFiltered);
  renderColumn('rejected-list', rejected);
}

render();
