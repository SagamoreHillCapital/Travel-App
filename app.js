const STORAGE_KEY = 'etaTravelCompanies';
const SEARCH_STATE_KEY = 'etaTravelSearchState';
const BATCH_SIZE = 50;

let companies = loadCompanies();
let searchState = loadSearchState();

const discoveryForm = document.getElementById('discovery-form');
const searchProvider = document.getElementById('search-provider');
const searchLocation = document.getElementById('search-location');
const searchType = document.getElementById('search-type');
const searchKeyword = document.getElementById('search-keyword');
const proxyBase = document.getElementById('proxy-base');
const providerHelp = document.getElementById('provider-help');
const nextBatchButton = document.getElementById('next-batch');
const prevBatchButton = document.getElementById('prev-batch');
const batchStatus = document.getElementById('batch-status');

const locationFilter = document.getElementById('location-filter');
const ownerFilter = document.getElementById('owner-filter');
const specialtyFilter = document.getElementById('specialty-filter');
const typeFilter = document.getElementById('type-filter');

discoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  searchState.provider = searchProvider.value;
  searchState.location = searchLocation.value.trim();
  searchState.companyType = searchType.value;
  searchState.keyword = searchKeyword.value.trim();
  searchState.proxyBase = proxyBase.value.trim();
  searchState.offset = 0;
  await fetchBatch();
});

searchProvider.addEventListener('change', () => {
  updateProviderHelp();
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

function defaultSearchState() {
  return {
    provider: 'google',
    location: '',
    companyType: 'all',
    keyword: '',
    proxyBase: '',
    offset: 0,
    currentBatchIds: []
  };
}

function loadSearchState() {
  const stored = localStorage.getItem(SEARCH_STATE_KEY);
  if (!stored) return defaultSearchState();

  try {
    return { ...defaultSearchState(), ...JSON.parse(stored) };
  } catch {
    return defaultSearchState();
  }
}

function saveSearchState() {
  localStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(searchState));
}

function buildQueryText() {
  const typeText = {
    all: 'travel agency or tour operator',
    'tour operator': 'tour operator',
    'retail travel agency': 'travel agency'
  }[searchState.companyType];

  return [typeText, searchState.location, searchState.keyword].filter(Boolean).join(' ');
}

function requiresProxy(provider) {
  return ['google', 'yelp', 'foursquare', 'directory'].includes(provider);
}

function updateProviderHelp() {
  const provider = searchProvider.value;
  if (!requiresProxy(provider)) {
    providerHelp.textContent = 'OpenCorporates runs directly from the browser.';
    return;
  }

  providerHelp.textContent = 'This provider requires a backend/proxy endpoint that holds API keys securely.';
}

function normalizeCompany(input, provider) {
  return {
    id: `${provider}-${input.id}`,
    name: input.name || 'Unknown Company',
    type: input.type || 'retail travel agency',
    owner: input.owner || 'Not publicly listed',
    location: input.location || 'Not publicly listed',
    employees: input.employees || 'Not publicly listed',
    specialties: input.specialties || searchState.keyword || 'General travel services',
    website: input.website || 'Not listed',
    notes: '',
    status: 'open'
  };
}

function companyTypeFromText(text) {
  const lower = text.toLowerCase();
  if (lower.includes('tour')) return 'tour operator';
  return 'retail travel agency';
}

async function fetchFromProxy(provider, query, offset) {
  const base = searchState.proxyBase.replace(/\/$/, '');
  if (!base) {
    throw new Error('Enter Proxy API Base URL for this provider.');
  }

  const url = new URL(`${base}/${provider}-search`);
  url.searchParams.set('query', query);
  url.searchParams.set('location', searchState.location);
  url.searchParams.set('type', searchState.companyType);
  url.searchParams.set('keyword', searchState.keyword);
  url.searchParams.set('limit', String(BATCH_SIZE));
  url.searchParams.set('offset', String(offset));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`${provider} search failed with status ${response.status}`);
  }

  const json = await response.json();
  const items = Array.isArray(json.items) ? json.items : [];
  return items.map((item) => normalizeCompany(item, provider));
}

async function fetchFromOpenCorporates(query, offset) {
  const page = Math.floor(offset / BATCH_SIZE) + 1;
  const url = new URL('https://api.opencorporates.com/v0.4/companies/search');
  url.searchParams.set('q', query);
  url.searchParams.set('per_page', String(BATCH_SIZE));
  url.searchParams.set('page', String(page));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`OpenCorporates search failed with status ${response.status}`);
  }

  const data = await response.json();
  const companiesList = data?.results?.companies || [];

  return companiesList.map((entry) => {
    const record = entry.company;
    const location = [record.registered_address_in_full, record.jurisdiction_code]
      .filter(Boolean)
      .join(' | ');

    return normalizeCompany(
      {
        id: record.company_number || record.opencorporates_url || crypto.randomUUID(),
        name: record.name,
        type: companyTypeFromText(record.name || ''),
        owner: 'Not publicly listed',
        location: location || searchState.location,
        employees: 'Not publicly listed',
        specialties: searchState.keyword || 'General travel services',
        website: record.opencorporates_url || 'Not listed'
      },
      'opencorporates'
    );
  });
}

async function fetchProviderBatch() {
  const query = buildQueryText();
  const provider = searchState.provider;

  if (!query || !searchState.location) {
    throw new Error('Enter a location to run search.');
  }

  if (provider === 'opencorporates') {
    return fetchFromOpenCorporates(query, searchState.offset);
  }

  if (provider === 'google' || provider === 'yelp' || provider === 'foursquare' || provider === 'directory') {
    return fetchFromProxy(provider, query, searchState.offset);
  }

  throw new Error('Unsupported provider selected.');
}

async function fetchBatch() {
  const query = buildQueryText();
  batchStatus.textContent = `Loading ${searchState.provider} results ${searchState.offset + 1}-${searchState.offset + BATCH_SIZE}...`;

  try {
    const incomingCompanies = await fetchProviderBatch();
    const newBatchIds = [];

    incomingCompanies.forEach((incoming) => {
      const existing = companies.find((company) => company.id === incoming.id);

      if (existing) {
        existing.name = incoming.name;
        existing.type = incoming.type;
        existing.location = incoming.location;
        if (existing.website === 'Not listed' && incoming.website !== 'Not listed') existing.website = incoming.website;
      } else {
        companies.push(incoming);
      }

      newBatchIds.push(incoming.id);
    });

    searchState.currentBatchIds = newBatchIds;
    saveCompanies();
    saveSearchState();

    const start = searchState.offset + 1;
    const end = searchState.offset + incomingCompanies.length;
    batchStatus.textContent = incomingCompanies.length
      ? `Showing ${searchState.provider} results ${start}-${end} for "${query}".`
      : `No results found for ${searchState.provider} with this query.`;

    render();
  } catch (error) {
    batchStatus.textContent = `Could not fetch results: ${error.message}`;
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
  website.href = company.website.startsWith('http') ? company.website : '#';

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
  searchProvider.value = searchState.provider;
  searchLocation.value = searchState.location;
  searchType.value = searchState.companyType;
  searchKeyword.value = searchState.keyword;
  proxyBase.value = searchState.proxyBase;
  updateProviderHelp();

  const batchSet = new Set(searchState.currentBatchIds);
  const openCurrentBatch = applyFilters(companies.filter((company) => company.status === 'open' && batchSet.has(company.id)));
  const maybeAndFiltered = applyFilters(companies.filter((company) => company.status === 'maybe'));
  const goodAndFiltered = applyFilters(companies.filter((company) => company.status === 'good'));
  const rejected = companies.filter((company) => company.status === 'rejected');

  renderColumn('open-list', openCurrentBatch);
  renderColumn('maybe-list', maybeAndFiltered);
  renderColumn('good-list', goodAndFiltered);
  renderColumn('rejected-list', rejected);
}

render();
