const state = {
    countries: [],
    mapFeatures: [],
    countryMaps: {},
    activeCountryIso2: null,
    provinceFeatures: [],
    destinations: [],
    mustVisitScores: {},
    airports: [],
    filtered: [],
    selectedId: null,
    selectedPlaceId: null,
    selectedAirportId: null,
    favorites: new Set(),
    compare: [],
    mapMetric: 'travelScore',
    mapMode: 'africa',
    mapNavigationMode: 'manual'
};

const scoreFields = new Set(['travelScore', 'personalScore']);
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const metricLabels = {
    travelScore: 'Travel score', personalScore: 'Personal score', safety: 'Safety', heatComfort: 'Heat comfort',
    womenSafety: 'Women’s safety', runningInfrastructure: 'Running infrastructure', gayFriendly: 'LGBTQ+ friendly',
    roads: 'Roads', selfDrive: 'Self-drive', touristConvenience: 'Tourist ease', airAccess: 'Air access',
    internet: 'Internet', remoteWork: 'Remote work', affordability: 'Affordability', mapsPayments: 'Maps & payments',
    nature: 'Nature', safari: 'Safari', hiking: 'Hiking', beaches: 'Beaches', cultureHistory: 'Culture & history',
    diving: 'Diving', surfingKite: 'Surf & kite', birds: 'Birding', endemics: 'Endemics', deserts: 'Deserts',
    jungle: 'Rainforest', mountains: 'Mountains', waterWaterfalls: 'Water & falls', fuel: 'Fuel', camping: 'Camping',
    healthcare: 'Healthcare', english: 'English', visaRussiaScore: 'Russian passport', visaChileScore: 'Chilean passport',
    dailyBudget: 'Daily budget', recommendedStayDays: 'Suggested stay', populationMillion: 'Population', areaKm2: 'Area',
    daytimeTemperature: 'Daytime temperature', religion: 'Religion mix'
};
const religionStyles = {
    Christianity: { symbol: '✝', color: '#d78a68' },
    Islam: { symbol: '☾', color: '#48ad68' },
    Hinduism: { symbol: 'ॐ', color: '#9b83c7' },
    Traditional: { symbol: '◈', color: '#c0a54f' }
};

const islandCoordinates = {
    CPV: [-23.6, 15.1],
    COM: [43.3, -11.7],
    MUS: [57.55, -20.2],
    STP: [6.7, 0.25],
    SYC: [55.45, -4.6]
};

const els = {
    searchInput: document.querySelector('#searchInput'),
    regionSelect: document.querySelector('#regionSelect'),
    visaSelect: document.querySelector('#visaSelect'),
    prioritySelect: document.querySelector('#prioritySelect'),
    focusSelect: document.querySelector('#focusSelect'),
    monthSelect: document.querySelector('#monthSelect'),
    budgetRange: document.querySelector('#budgetRange'),
    budgetOutput: document.querySelector('#budgetOutput'),
    favoritesOnly: document.querySelector('#favoritesOnly'),
    resetFilters: document.querySelector('#resetFilters'),
    countryGrid: document.querySelector('#countryGrid'),
    detailContent: document.querySelector('#detailContent'),
    compareList: document.querySelector('#compareList'),
    africaMap: document.querySelector('#africaMap'),
    mapTooltip: document.querySelector('#mapTooltip'),
    mapFocusClose: document.querySelector('#mapFocusClose'),
    statsCount: document.querySelector('#statsCount'),
    favoritesBadge: document.querySelector('#favoritesBadge'),
    compareBadge: document.querySelector('#compareBadge'),
    compareHint: document.querySelector('#compareHint'),
    mapLegend: document.querySelector('#mapLegend'),
    mapLayerLabel: document.querySelector('#mapLayerLabel'),
    mapBackButton: document.querySelector('#mapBackButton'),
    mapTitle: document.querySelector('#mapTitle'),
    mapInstruction: document.querySelector('#mapInstruction'),
    mapNavigationControls: document.querySelector('#mapNavigationControls')
};

const countryMapBaseViewBox = { x: 0, y: 0, width: 760, height: 700 };
let countryMapViewBox = { ...countryMapBaseViewBox };
let countryMapZoomFrame = null;
let countryMapFocusPoint = null;
let countryMapHoverPlaceId = null;
let countryMapHoverPoint = null;
let countryMapHoverOrigin = null;
let manualMapDrag = null;
let suppressManualMapClick = false;

function activeCountryMap() {
    return state.countryMaps[state.activeCountryIso2] || null;
}

function activeCountry() {
    return state.countries.find((country) => country.iso2 === state.activeCountryIso2) || null;
}

function activateCountryMap(iso2) {
    const map = state.countryMaps[iso2];
    if (!map) return false;
    state.activeCountryIso2 = iso2;
    state.provinceFeatures = map.features;
    state.destinations = map.destinations;
    state.mustVisitScores = map.mustVisitScores;
    state.airports = map.airports;
    state.mapMode = 'country-detail';
    state.selectedPlaceId = null;
    state.selectedAirportId = null;
    resetCountryMapViewBox(false);
    return true;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function loadSavedState() {
    try {
        const saved = localStorage.getItem('larili-atlas-favorites') || localStorage.getItem('dark-atlas-favorites') || '[]';
        JSON.parse(saved).forEach((slug) => state.favorites.add(slug));
    } catch {
        state.favorites.clear();
    }
}

function saveFavorites() {
    localStorage.setItem('larili-atlas-favorites', JSON.stringify([...state.favorites]));
}

function normalize(value) {
    return String(value ?? '').toLocaleLowerCase('en').trim();
}

function budgetAverage(country) {
    const values = String(country.budgetDaily).match(/\d+/g)?.map(Number) || [];
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function recommendedStayDays(country) {
    const values = String(country.recommendedStay).match(/\d+/g)?.map(Number) || [];
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function daytimeTemperature(country) {
    if (els.monthSelect.value !== 'all') return Number(country.monthlyDaytimeTempC[Number(els.monthSelect.value)]);
    return country.monthlyDaytimeTempC.reduce((sum, value) => sum + Number(value), 0) / country.monthlyDaytimeTempC.length;
}

function normalizeFieldValue(country, field) {
    const raw = Number(country[field]);
    const values = state.countries.map((item) => Number(item[field])).filter(Number.isFinite);
    if (!Number.isFinite(raw) || !values.length) return 0;
    const useLog = field === 'populationMillion' || field === 'areaKm2';
    const transform = (value) => useLog ? Math.log10(Math.max(value, 0.01)) : value;
    const current = transform(raw);
    const minimum = Math.min(...values.map(transform));
    const maximum = Math.max(...values.map(transform));
    return maximum === minimum ? 50 : ((current - minimum) / (maximum - minimum)) * 100;
}

function numericScore(country, field) {
    if (field === 'seasonality') {
        if (els.monthSelect.value === 'all') {
            const scores = country?.seasonScores || [];
            return scores.length ? (scores.reduce((sum, score) => sum + Number(score), 0) / scores.length) * 10 : 0;
        }
        return Number(country?.seasonScores?.[Number(els.monthSelect.value)] ?? 0) * 10;
    }
    if (field === 'dailyBudget') return 100 - Math.max(0, Math.min(100, ((budgetAverage(country) - 60) / 300) * 100));
    if (field === 'recommendedStayDays') return Math.min(100, (recommendedStayDays(country) / 14) * 100);
    if (field === 'daytimeTemperature') {
        const values = state.countries.map(daytimeTemperature);
        const minimum = Math.min(...values);
        const maximum = Math.max(...values);
        return maximum === minimum ? 50 : 100 - ((daytimeTemperature(country) - minimum) / (maximum - minimum)) * 100;
    }
    if (field === 'populationMillion' || field === 'areaKm2') return normalizeFieldValue(country, field);
    const value = Number(country?.[field] ?? 0);
    return scoreFields.has(field) ? value : value * 10;
}

function displayScore(country, field) {
    if (field === 'seasonality') {
        const value = country.seasonScores[Number(els.monthSelect.value)];
        return { text: `${value}/10`, compact: value };
    }
    if (field === 'dailyBudget') return { text: `$${Math.round(budgetAverage(country))} avg/day`, compact: `$${Math.round(budgetAverage(country))}` };
    if (field === 'recommendedStayDays') return { text: `${formatNumber(recommendedStayDays(country))} days / 14`, compact: `${Math.round(recommendedStayDays(country))}d` };
    if (field === 'populationMillion') return { text: `${formatNumber(country.populationMillion)}m people`, compact: `${formatNumber(country.populationMillion)}m` };
    if (field === 'areaKm2') return { text: `${formatNumber(country.areaKm2)} km²`, compact: compactNumber(country.areaKm2) };
    if (field === 'daytimeTemperature') return { text: `${Math.round(daytimeTemperature(country))}° daytime`, compact: `${Math.round(daytimeTemperature(country))}°` };
    if (field === 'religion') return { text: country.religion, compact: religionParts(country.religion)[0].symbol };
    const value = Number(country[field] ?? 0);
    const scale = scoreFields.has(field) ? 100 : 10;
    return { text: `${value}/${scale}`, compact: value };
}

function layerLabel() {
    if (state.mapMetric === 'seasonality') return `${els.monthSelect.options[els.monthSelect.selectedIndex].text.replace('◷ ', '')} suitability`;
    if (state.mapMetric === 'daytimeTemperature' && els.monthSelect.value !== 'all') return `${els.monthSelect.options[els.monthSelect.selectedIndex].text.replace('◷ ', '')} daytime temperature`;
    return metricLabels[state.mapMetric] || 'Travel score';
}

function scoreVerdict(score) {
    if (score >= 82) return 'Excellent fit';
    if (score >= 72) return 'Worth considering';
    if (score >= 58) return 'Plan with care';
    if (score >= 42) return 'Challenging';
    return 'High-friction travel';
}

function scoreColor(score) {
    if (score === null) return '#171b20';
    const amount = Math.max(0, Math.min(1, (score - 25) / 65));
    const low = [210, 85, 80];
    const middle = [192, 165, 79];
    const high = [72, 173, 104];
    const start = amount < 0.5 ? low : middle;
    const end = amount < 0.5 ? middle : high;
    const segment = amount < 0.5 ? amount * 2 : (amount - 0.5) * 2;
    const rgb = start.map((value, index) => Math.round(value + (end[index] - value) * segment));
    return `rgb(${rgb.join(',')})`;
}

function mustVisitScore(place) {
    return Number(state.mustVisitScores[place.id] ?? place.worldClass.score);
}

function mustVisitLabel(score) {
    if (score >= 8.5) return 'Essential';
    if (score >= 7) return 'Strong priority';
    if (score >= 5) return 'Optional';
    return 'Easy to skip';
}

function formatNumber(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

function compactNumber(value) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function religionParts(value) {
    const parts = String(value).split(/,|;|\band\b/i).map((part) => normalize(part)).filter(Boolean);
    const categories = parts.map((part) => {
        if (/islam/.test(part)) return 'Islam';
        if (/christ|orthodox|coptic|protestant/.test(part)) return 'Christianity';
        if (/hindu/.test(part)) return 'Hinduism';
        return 'Traditional';
    });
    return [...new Set(categories)].map((category) => ({ category, ...religionStyles[category] }));
}

function religionGradient(country) {
    const parts = religionParts(country.religion);
    if (parts.length === 1) return '';
    const primaryShare = parts.length === 2 ? 65 : 55;
    const secondaryShare = (100 - primaryShare) / (parts.length - 1);
    const shares = parts.map((_, index) => index === 0 ? primaryShare : secondaryShare);
    let offset = 0;
    const stops = parts.map((part, index) => {
        const start = offset;
        offset += shares[index];
        return `<stop offset="${start}%" stop-color="${part.color}"></stop><stop offset="${offset}%" stop-color="${part.color}"></stop>`;
    }).join('');
    return `<linearGradient id="religion-${country.iso3}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>`;
}

function religionFill(country) {
    const parts = religionParts(country.religion);
    return parts.length === 1 ? parts[0].color : `url(#religion-${country.iso3})`;
}

function tripFormatIcons(value) {
    const icons = { Hiking: '△', Nature: '♧', Safari: '◇', Beaches: '≈', Culture: '⌂' };
    return String(value).split(' + ').map((part) => `${icons[part] || '·'} ${part}`).join('  +  ');
}

function updateBudgetControl() {
    const maximum = Number(els.budgetRange.value);
    const percentage = ((maximum - Number(els.budgetRange.min)) / (Number(els.budgetRange.max) - Number(els.budgetRange.min))) * 100;
    els.budgetRange.style.setProperty('--range-fill', `${percentage}%`);
    els.budgetOutput.textContent = maximum >= Number(els.budgetRange.max) ? 'Any budget' : `≤ $${maximum} avg/day`;
}

function visaMatches(country, filter) {
    if (filter === 'all') return true;
    const [passport, access] = filter.split(':');
    const score = Number(country[passport === 'ru' ? 'visaRussiaScore' : 'visaChileScore']);
    if (access === 'free') return score === 10;
    if (access === 'easy') return score >= 7;
    if (access === 'check') return score === 5;
    return score <= 3;
}

function visaTone(score) {
    if (Number(score) >= 10) return 'free';
    if (Number(score) >= 7) return 'easy';
    if (Number(score) >= 5) return 'check';
    return 'required';
}

function visaRow(country, compact = false) {
    const entries = [
        ['RU', country.visaRussia, country.visaRussiaScore],
        ['CL', country.visaChile, country.visaChileScore]
    ];
    return `<div class="visa-row ${compact ? 'compact' : ''}">${entries.map(([passport, status, score]) => `<span class="visa-pill ${visaTone(score)}" title="${passport}: ${escapeHtml(status)}"><b>${passport}</b><i>${escapeHtml(status)}</i></span>`).join('')}</div>`;
}

function filterCountries() {
    const query = normalize(els.searchInput.value);
    const region = els.regionSelect.value;
    const visa = els.visaSelect.value;
    const maximumBudget = Number(els.budgetRange.value);
    const priority = els.prioritySelect.value;
    let list = [...state.countries];

    if (query) {
        list = list.filter((country) => normalize(`${country.name} ${country.region} ${country.capital} ${country.visaRussia} ${country.visaChile} ${country.strengths.join(' ')}`).includes(query));
    }
    if (region !== 'all') list = list.filter((country) => country.region === region);
    if (visa !== 'all') list = list.filter((country) => visaMatches(country, visa));
    if (maximumBudget < Number(els.budgetRange.max)) list = list.filter((country) => budgetAverage(country) <= maximumBudget);
    if (els.favoritesOnly.checked) list = list.filter((country) => state.favorites.has(country.slug));

    const sortMetric = state.mapMetric === 'seasonality' ? state.mapMetric : priority;
    list.sort((a, b) => compareCountriesByField(a, b, sortMetric));
    state.filtered = list;
    if (!list.some((country) => country.slug === state.selectedId)) state.selectedId = list[0]?.slug || null;
}

function compareCountriesByField(left, right, field) {
    if (field === 'religion') return String(left.religion).localeCompare(String(right.religion), 'en');
    const leftScore = numericScore(left, field);
    const rightScore = numericScore(right, field);
    if (!Number.isFinite(leftScore) && !Number.isFinite(rightScore)) return left.name.localeCompare(right.name, 'en');
    if (!Number.isFinite(leftScore)) return 1;
    if (!Number.isFinite(rightScore)) return -1;
    return rightScore - leftScore || left.name.localeCompare(right.name, 'en');
}

function renderRegions() {
    const regions = [...new Set(state.countries.map((country) => country.region))].sort();
    els.regionSelect.innerHTML = '<option value="all">◎ All of Africa</option>' + regions.map((region) => `<option value="${escapeHtml(region)}">◌ ${escapeHtml(region)}</option>`).join('');
}

function renderSortOptions() {
    const catalog = els.focusSelect.cloneNode(true);
    const overview = catalog.querySelector('optgroup[label="Overview"]');
    const seasonality = document.createElement('option');
    seasonality.value = 'seasonality';
    seasonality.textContent = '◷ Season suitability';
    overview?.append(seasonality);
    const labelOverrides = {
        dailyBudget: '$ Daily budget · lowest first',
        daytimeTemperature: '☼ Daytime temperature · coolest first',
        religion: '☾ Religion · A–Z'
    };
    catalog.querySelectorAll('option').forEach((option) => {
        if (labelOverrides[option.value]) option.textContent = labelOverrides[option.value];
    });
    els.prioritySelect.innerHTML = catalog.innerHTML;
    els.prioritySelect.value = 'travelScore';
}

function syncCustomSelect(select) {
    const wrapper = select.nextElementSibling;
    if (!wrapper?.classList.contains('custom-select')) return;
    const selected = select.options[select.selectedIndex];
    const selectedText = selected?.textContent || '';
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const fieldLabel = select.closest('.field')?.querySelector(':scope > span')?.textContent || 'Select option';
    wrapper.querySelector('.custom-select-value').textContent = selectedText;
    trigger.setAttribute('aria-label', `${fieldLabel}: ${selectedText}`);
    wrapper.querySelectorAll('[data-select-value]').forEach((button) => {
        const active = button.dataset.selectValue === select.value;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
    });
}

function closeCustomSelects(except = null) {
    document.querySelectorAll('.custom-select.open').forEach((wrapper) => {
        if (wrapper === except) return;
        wrapper.classList.remove('open');
        wrapper.classList.remove('open-up');
        wrapper.querySelector('.custom-select-trigger').setAttribute('aria-expanded', 'false');
    });
}

function syncCustomSelects() {
    document.querySelectorAll('.field select').forEach(syncCustomSelect);
}

function initializeCustomSelects() {
    document.querySelectorAll('.field select').forEach((select) => {
        select.classList.add('custom-select-native');
        select.closest('.field')?.classList.add('has-custom-select');
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select';
        const menuId = `${select.id}-menu`;
        wrapper.innerHTML = `<button class="custom-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${menuId}"><span class="custom-select-value"></span><i aria-hidden="true">⌄</i></button><div id="${menuId}" class="custom-select-menu" role="listbox"></div>`;
        select.after(wrapper);
        const menu = wrapper.querySelector('.custom-select-menu');
        Array.from(select.children).forEach((child) => {
            if (child.tagName === 'OPTGROUP') {
                const group = document.createElement('div');
                group.className = 'custom-select-group';
                const label = document.createElement('span');
                label.textContent = child.label;
                group.append(label);
                Array.from(child.children).forEach((option) => group.append(customSelectOption(option, select, wrapper)));
                menu.append(group);
            } else {
                menu.append(customSelectOption(child, select, wrapper));
            }
        });
        const trigger = wrapper.querySelector('.custom-select-trigger');
        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            const opening = !wrapper.classList.contains('open');
            closeCustomSelects(wrapper);
            wrapper.classList.toggle('open', opening);
            trigger.setAttribute('aria-expanded', String(opening));
            if (opening) {
                const triggerBounds = trigger.getBoundingClientRect();
                const menuHeight = Math.min(menu.scrollHeight, 310);
                wrapper.classList.toggle('open-up', triggerBounds.bottom + menuHeight + 12 > window.innerHeight);
            } else {
                wrapper.classList.remove('open-up');
            }
        });
        trigger.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                wrapper.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
                menu.querySelector('[data-select-value]')?.focus();
            }
        });
        syncCustomSelect(select);
    });
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.custom-select')) closeCustomSelects();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const openSelect = document.querySelector('.custom-select.open');
            closeCustomSelects();
            openSelect?.querySelector('.custom-select-trigger')?.focus();
        }
    });
}

function customSelectOption(option, select, wrapper) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'custom-select-option';
    button.dataset.selectValue = option.value;
    button.setAttribute('role', 'option');
    button.textContent = option.textContent;
    button.addEventListener('click', () => {
        select.value = option.value;
        syncCustomSelect(select);
        closeCustomSelects();
        select.dispatchEvent(new Event('change', { bubbles: true }));
        wrapper.querySelector('.custom-select-trigger').focus();
    });
    button.addEventListener('keydown', (event) => {
        const options = [...wrapper.querySelectorAll('[data-select-value]')];
        const index = options.indexOf(button);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const offset = event.key === 'ArrowDown' ? 1 : -1;
            options[(index + offset + options.length) % options.length].focus();
        }
        if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            options[event.key === 'Home' ? 0 : options.length - 1].focus();
        }
    });
    return button;
}

function renderCountryGrid() {
    if (!state.filtered.length) {
        els.countryGrid.innerHTML = '<div class="empty-state"><strong>No matches found</strong><br><small>Try changing or resetting the filters.</small></div>';
        return;
    }
    els.countryGrid.innerHTML = state.filtered.map((country) => {
        const favorite = state.favorites.has(country.slug);
        const compared = state.compare.includes(country.slug);
        const layerScore = displayScore(country, state.mapMetric);
        const normalizedLayerScore = numericScore(country, state.mapMetric);
        const miniTone = state.mapMetric === 'religion' ? religionParts(country.religion)[0].color : scoreColor(normalizedLayerScore);
        return `
            <article class="country-card ${country.slug === state.selectedId ? 'selected' : ''}" data-slug="${country.slug}" tabindex="0">
                <header>
                    <div class="country-title"><span class="flag">${escapeHtml(country.flag)}</span><div><h3>${escapeHtml(country.name)}</h3><span class="region">${escapeHtml(country.region)}</span></div></div>
                    <span class="mini-score" style="--tone:${miniTone}" title="${escapeHtml(layerLabel())}: ${escapeHtml(layerScore.text)}">${escapeHtml(layerScore.compact)}</span>
                </header>
                ${visaRow(country, true)}
                <div class="card-signal-row">
                    <span class="card-budget" style="--tone:${scoreColor(country.affordability * 10)}"><b>${escapeHtml(country.budgetDaily)}</b><small>daily budget</small></span>
                    <span class="card-trip">${escapeHtml(tripFormatIcons(country.tripFormat))}</span>
                </div>
                <div class="card-insights">
                    ${signalChip('⌂', 'Remote', country.remoteWork)}
                    ${signalChip('◎', 'Tourist ease', country.touristConvenience)}
                    ${staySignalChip(country)}
                </div>
                <div class="card-bars">
                    ${cardBar('Safety', country.safety)}
                    ${cardBar('Self-drive', country.selfDrive)}
                    ${cardBar('Nature', country.nature)}
                </div>
                <div class="card-footer">
                    <small><span class="layer-chip">${escapeHtml(layerLabel())} · ${escapeHtml(layerScore.text)}</span>${escapeHtml(country.strengths.slice(0, 2).join(' · ') || country.capital)}</small>
                    <div class="card-tools">
                        <button class="card-icon favorite-icon ${favorite ? 'active' : ''}" type="button" data-action="favorite" data-slug="${country.slug}" aria-label="${favorite ? 'Remove from' : 'Add to'} favorites">${favorite ? '★' : '☆'}</button>
                        <button class="card-icon ${compared ? 'active' : ''}" type="button" data-action="compare" data-slug="${country.slug}" aria-label="Compare">⇄</button>
                    </div>
                </div>
            </article>`;
    }).join('');

    els.countryGrid.querySelectorAll('.country-card').forEach((card) => {
        card.addEventListener('click', (event) => {
            if (!event.target.closest('button')) selectCountry(card.dataset.slug, false);
        });
        card.addEventListener('keydown', (event) => {
            if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('button')) {
                event.preventDefault();
                selectCountry(card.dataset.slug, false);
            }
        });
    });
    bindActionButtons(els.countryGrid);
}

function cardBar(label, value) {
    const normalized = Number(value) * 10;
    return `<div class="card-bar"><span>${label}</span><i style="--value:${normalized}%;--tone:${scoreColor(normalized)}"></i><b>${value}</b></div>`;
}

function signalChip(icon, label, value) {
    const normalized = Number(value) * 10;
    return `<span style="--tone:${scoreColor(normalized)}"><i>${icon}</i><small>${label}</small><b>${value}</b></span>`;
}

function staySignalChip(country) {
    const days = recommendedStayDays(country);
    const normalized = Math.min(100, (days / 14) * 100);
    return `<span style="--tone:${scoreColor(normalized)}" title="Suggested stay: ${escapeHtml(country.recommendedStay)}"><i>▥</i><small>Stay</small><b>${Math.round(days)}d</b></span>`;
}

function metricRow(label, value, scale = 10) {
    const normalized = scale === 100 ? Number(value) : Number(value) * 10;
    return `<div class="metric-row"><span>${label}</span><div class="metric-track"><i style="width:${normalized}%;--tone:${scoreColor(normalized)}"></i></div><b>${value}</b></div>`;
}

function renderDetail() {
    if (state.mapMode === 'country-detail' && state.selectedAirportId) {
        const airport = state.airports.find((item) => item.id === state.selectedAirportId);
        if (airport) {
            renderAirportDetail(airport);
            return;
        }
    }
    if (state.mapMode === 'country-detail' && state.selectedPlaceId) {
        const place = state.destinations.find((item) => item.id === state.selectedPlaceId);
        if (place) {
            renderPlaceDetail(place);
            return;
        }
    }
    const country = state.countries.find((item) => item.slug === state.selectedId);
    if (!country) {
        els.detailContent.innerHTML = '<div class="empty-state">Select a country on the map or adjust the filters.</div>';
        return;
    }
    const favorite = state.favorites.has(country.slug);
    const compared = state.compare.includes(country.slug);
    els.detailContent.innerHTML = `
        <div class="detail-topline"><span class="country-code">${country.flag} &nbsp;${country.iso3} · AFRICA</span><button class="favorite-button ${favorite ? 'active' : ''}" type="button" data-action="favorite" data-slug="${country.slug}" aria-label="${favorite ? 'Remove from' : 'Add to'} favorites">${favorite ? '★' : '☆'}</button></div>
        <h2 class="detail-name">${escapeHtml(country.name)}</h2>
        <p class="detail-meta">${escapeHtml(country.region)} · capital ${escapeHtml(country.capital)}</p>
        ${visaRow(country)}
        <p class="detail-summary">${escapeHtml(country.summary)}</p>
        <div class="detail-divider"></div>
        <div class="score-pair">
            <div class="overall-score"><div class="score-ring" style="--score:${country.travelScore};--score-color:${scoreColor(country.travelScore)}"><strong>${country.travelScore}</strong></div><p><span>Travel score</span><strong>${scoreVerdict(country.travelScore)}</strong></p></div>
            <div class="personal-score"><span>Personal score</span><strong>${country.personalScore}</strong><small>/100</small></div>
        </div>
        <div class="quick-facts">
            ${quickFact('Best season', country.bestSeason)}
            ${stayFact(country)}
            ${quickFact('Population', `${formatNumber(country.populationMillion)}m`)}
            ${quickFact('Area', `${formatNumber(country.areaKm2)} km²`)}
            ${budgetFact(country)}
            ${tripFact(country)}
        </div>
        <div class="season-panel"><div><span>Month fit · daytime high</span><strong>${escapeHtml(country.bestSeason)}</strong></div>${seasonStrip(country)}<small>1991–2020 daily maximum average · ${escapeHtml(country.temperatureLocation)}</small></div>
        <div class="profile-callout"><span>Why go</span><strong>${escapeHtml(country.highlight)}</strong></div>
        <div class="profile-warning"><span>Plan around</span><p>${escapeHtml(country.constraints)}</p></div>
        <details class="metric-group" open><summary>Safety & inclusion</summary><div class="metric-list">
            ${metricRow('Overall safety', country.safety)}${metricRow('Women’s safety', country.womenSafety)}${metricRow('LGBTQ+ friendly', country.gayFriendly)}
        </div>${factList([['Women reporting local safety', `${country.womenCommunitySafetyPercent}%`], ['Same-sex acts', country.sameSexActs], ['LGBTQ+ legal rights', `${country.gayLegalIndex}/10`], ['LGBTQ+ public opinion', country.gayPublicOpinionIndex === null ? 'No separate score' : `${country.gayPublicOpinionIndex}/10`], ['Data note', country.enrichmentNote]])}<p class="metric-source">Women’s score: WPS Index 2025/26 · LGBTQ+ score: Equaldex 2026 · running: editorial composite</p></details>
        <details class="metric-group" open><summary>Travel fundamentals</summary><div class="metric-list">
            ${metricRow('Heat comfort', country.heatComfort)}${metricRow('Roads', country.roads)}${metricRow('Running infrastructure', country.runningInfrastructure)}${metricRow('Self-drive', country.selfDrive)}${metricRow('Tourist ease', country.touristConvenience)}
        </div></details>
        <details class="metric-group" open><summary>Experiences</summary><div class="metric-list">
            ${metricRow('Nature', country.nature)}${metricRow('Safari', country.safari)}${metricRow('Hiking', country.hiking)}${metricRow('Beaches', country.beaches)}${metricRow('Culture', country.cultureHistory)}${metricRow('Diving', country.diving)}${metricRow('Surf & kite', country.surfingKite)}${metricRow('Birding', country.birds)}${metricRow('Endemics', country.endemics)}${metricRow('Deserts', country.deserts)}${metricRow('Rainforest', country.jungle)}${metricRow('Mountains', country.mountains)}${metricRow('Water & falls', country.waterWaterfalls)}
        </div></details>
        <details class="metric-group" open><summary>Digital & budget</summary><div class="metric-list">
            ${metricRow('Internet', country.internet)}${metricRow('Remote work', country.remoteWork)}${metricRow('Affordability', country.affordability)}${metricRow('Maps & payments', country.mapsPayments)}
        </div>${factList([['Connection', country.connectionType], ['Work base', country.workBase], ['Satellite', country.starlinkSatellite], ['Two weeks / two people', country.budgetTwoWeeks], ['Cash', country.cashNeed]])}</details>
        <details class="metric-group" open><summary>Logistics</summary>
            ${factList([['Air hub', country.airHub], ['Vehicle', country.vehicle], ['Car rental', country.carRental], ['4×4', country.fourByFour], ['Cross-border', country.crossBorder], ['Camping trip', country.campingTrip]])}
            <div class="metric-list compact-metrics">${metricRow('Fuel', country.fuel)}${metricRow('Camping', country.camping)}${metricRow('Air access', country.airAccess)}</div>
        </details>
        <details class="metric-group" open><summary>Health & language</summary>
            ${factList([['Yellow fever', country.yellowFever], ['Malaria', country.malaria]])}
            <div class="metric-list compact-metrics">${metricRow('Healthcare', country.healthcare)}${metricRow('English', country.english)}</div>
        </details>
        <details class="metric-group" open><summary>Country context</summary>
            ${factList([['Subregion', country.subregion], ['Languages', country.languages], ['Religion', country.religion], ['Climate', country.climate], ['Long-stay base', country.longStayBase], ['Plan status', country.planStatus]])}
        </details>
        <div class="detail-tags">${country.strengths.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
        <div class="detail-actions"><button class="primary-button" type="button" data-scroll="countries">View in shortlist</button><button class="secondary-button ${compared ? 'active' : ''}" type="button" data-action="compare" data-slug="${country.slug}">${compared ? 'Comparing' : 'Compare'}</button></div>`;
    bindActionButtons(els.detailContent);
    bindScrollButtons(els.detailContent);
}

function renderPlaceDetail(place) {
    const related = place.combineWith
        .map((id) => state.destinations.find((item) => item.id === id))
        .filter(Boolean);
    const fieldNotes = place.fieldNotes || [];
    const image = place.image
        ? `<img class="place-hero-image" src="${escapeHtml(place.image)}" alt="${escapeHtml(place.imageAlt)}" />`
        : '<div class="place-hero-image placeholder" aria-hidden="true"></div>';
    const fourByFourScore = fourByFourNeedScore(place.fourByFour);
    const fourByFourFact = shouldShowFourByFour(place.fourByFour, fourByFourScore)
        ? placeFact('4×4', '4×4 need', `${fourByFourScore}/10`, fourByFourScore * 10, scoreColor(100 - fourByFourScore * 10), place.fourByFour, 'Green: not needed · red: required')
        : '';
    const countryName = activeCountry()?.name || 'Country';
    const mapsUrl = googleMapsUrl(place, countryName);
    els.detailContent.innerHTML = `
        <div class="place-hero">
            ${image}
            <div class="place-hero-shade"></div>
            <span class="place-kind ${place.kind}">${place.kind === 'region' ? 'Region' : 'Destination'}</span>
            <div class="place-hero-copy"><small>${escapeHtml(place.category)} · ${escapeHtml(place.province)}</small><div class="place-hero-title"><h2>${escapeHtml(place.name)}</h2><a class="google-maps-link" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(place.name)} place details and reviews in Google Maps" title="Open place details and reviews in Google Maps"><img src="./assets/icons/google-maps.svg" alt="" aria-hidden="true" /></a></div></div>
        </div>
        <div class="place-toolbar"><button class="text-button" type="button" data-action="country-overview">← ${escapeHtml(countryName)} overview</button><span>${place.tags.map((tag) => escapeHtml(tag)).join(' · ')}</span></div>
        <p class="detail-summary place-summary">${escapeHtml(place.summary)}</p>
        <div class="world-class-score" style="--tone:${scoreColor(place.worldClass.score * 10)}">
            <div><span>World-class ${escapeHtml(place.worldClass.label)}</span><strong>${place.worldClass.score}<small>/10</small></strong></div>
            <p>${escapeHtml(place.worldClass.note)}</p>
        </div>
        <div class="place-priority" style="--tone:${scoreColor(mustVisitScore(place) * 10)}"><span>Must-visit priority in ${escapeHtml(countryName)}</span><strong>${mustVisitScore(place)}/10</strong><small>${mustVisitLabel(mustVisitScore(place))}</small></div>
        <div class="place-facts">
            ${placeFact('◷', 'Recommended time', place.recommendedTime, recommendedTimeFill(place.recommendedTime), '#a9b46e', 'A well-paced allocation for this destination.', 'Relative to a 7-day stop')}
            ${placeFact('⌁', 'Connectivity', `${place.connectivityScore}/10`, place.connectivityScore * 10, scoreColor(place.connectivityScore * 10), place.connectivity)}
            ${placeFact('△', 'Difficulty', `${place.difficultyScore}/10`, place.difficultyScore * 10, scoreColor(100 - place.difficultyScore * 10), place.difficulty)}
            ${placeFact('♿', 'Accessibility', `${place.accessibilityScore}/10`, place.accessibilityScore * 10, scoreColor(place.accessibilityScore * 10), place.accessibility)}
            ${fourByFourFact}
        </div>
        <section class="place-field-notes">
            <div class="place-field-notes-heading"><span>${fieldNotes.length} field notes</span><a href="${escapeHtml(place.fieldNotesSourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(place.fieldNotesSourceLabel)} ↗</a></div>
            <ul>${fieldNotes.map((note, index) => `<li><i aria-hidden="true">${['✦', '◌', '⌁', '◇'][index % 4]}</i><span>${escapeHtml(note)}</span></li>`).join('')}</ul>
        </section>
        <section class="place-info-block"><span>Getting there</span><p>${escapeHtml(place.gettingThere)}</p></section>
        <section class="combine-section"><span>Combine with</span><div>${related.map((item) => `<button type="button" data-place-id="${item.id}">${item.kind === 'region' ? '◉' : '•'} ${escapeHtml(item.name)}</button>`).join('')}</div></section>
        <div class="place-source"><span>Planning source</span><a href="${escapeHtml(place.sourceUrl)}" target="_blank" rel="noreferrer">Open destination source ↗</a>${place.imageSourceUrl ? `<a href="${escapeHtml(place.imageSourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(place.imageCredit)} ↗</a>` : ''}</div>`;
    bindPlaceButtons(els.detailContent);
}

function recommendedTimeFill(value) {
    const numbers = String(value).match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    let days = numbers.length ? numbers.reduce((sum, item) => sum + item, 0) / numbers.length : 0.75;
    if (/hour/i.test(value)) days /= 24;
    return Math.min(100, Math.max(10, (days / 7) * 100));
}

function fourByFourNeedScore(value) {
    const description = normalize(value);
    if (/not applicable|lodge vehicles|not required|no 4×4/.test(description)) return 0;
    if (/recommended.*required|recommended or required|required for several/.test(description)) return 8;
    if (/^required|mandatory|essential/.test(description)) return 10;
    if (/recommended/.test(description)) return 6;
    if (/not usually|some remote|helpful|useful|high-clearance/.test(description)) return 4;
    return 2;
}

function shouldShowFourByFour(value, score = fourByFourNeedScore(value)) {
    if (score > 0) return true;
    const description = normalize(value).replace(/[.!]+$/, '');
    return !['not required', 'not applicable', 'no 4×4'].includes(description);
}

function googleMapsUrl(place, countryName) {
    const query = [place.name, place.province, countryName].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&utm_source=larili_atlas&utm_campaign=place_details_search`;
}

function placeFact(icon, label, value, fill, tone, detail, title = `${fill}%`) {
    return `<div class="place-fact" style="--fill:${fill}%;--tone:${tone}" title="${escapeHtml(title)}"><i>${icon}</i><span>${label}</span><strong>${escapeHtml(value)}</strong><div class="place-fact-battery" aria-hidden="true"><b></b></div><p>${escapeHtml(detail)}</p></div>`;
}

function renderAirportDetail(airport) {
    const connectedPlaces = airport.connections
        .map((id) => state.destinations.find((place) => place.id === id))
        .filter(Boolean);
    const countryName = activeCountry()?.name || 'Country';
    els.detailContent.innerHTML = `
        <div class="airport-hero">
            <div class="airport-symbol">✈</div>
            <div><span>${escapeHtml(airport.type)}</span><strong>${escapeHtml(airport.code)}</strong></div>
        </div>
        <div class="place-toolbar"><button class="text-button" type="button" data-action="country-overview">← ${escapeHtml(countryName)} overview</button><span>Main airport</span></div>
        <h2 class="detail-name airport-name">${escapeHtml(airport.name)}</h2>
        <p class="detail-summary">${escapeHtml(airport.network)}</p>
        <div class="airport-route-grid">
            <div><span>Direct routes</span><strong>${airport.directRoutes}</strong><small>current scheduled destinations</small></div>
            <div class="airport-origin"><span>${escapeHtml(airport.topOriginLabel)}</span><strong>${escapeHtml(airport.topOriginCountry)}</strong><small>${escapeHtml(airport.topOriginDetail)}</small></div>
        </div>
        <section class="combine-section airport-connections"><span>Best for</span><div>${connectedPlaces.map((place) => `<button type="button" data-place-id="${place.id}">${place.kind === 'region' ? '◉' : '•'} ${escapeHtml(place.name)}</button>`).join('')}</div></section>
        <div class="airport-data-note"><span>Schedule note</span><p>Origin country is based on current scheduled nonstop frequency, not passenger nationality or total connecting traffic. Airline schedules change seasonally.</p></div>
        <div class="place-source"><span>Route source</span><a href="${escapeHtml(airport.sourceUrl)}" target="_blank" rel="noreferrer">Open current route schedule ↗</a></div>`;
    bindPlaceButtons(els.detailContent);
}

function bindPlaceButtons(root) {
    root.querySelectorAll('[data-place-id]').forEach((button) => {
        button.addEventListener('click', () => selectPlace(button.dataset.placeId));
    });
    root.querySelector('[data-action="country-overview"]')?.addEventListener('click', () => {
        closePlaceFocus();
    });
}

function quickFact(label, value) {
    return `<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function stayFact(country) {
    const days = recommendedStayDays(country);
    const fill = Math.min(100, (days / 14) * 100);
    return `<div class="stay-fact"><span>Suggested stay</span><strong>${escapeHtml(country.recommendedStay)}</strong><div class="stay-charge" title="${Math.round(fill)}% of a 14-day stay"><i style="width:${fill}%"></i></div></div>`;
}

function budgetFact(country) {
    return `<div class="budget-fact" style="--tone:${scoreColor(country.affordability * 10)}"><span>Daily budget</span><strong>${escapeHtml(country.budgetDaily)}</strong><small>$${Math.round(budgetAverage(country))} average</small></div>`;
}

function tripFact(country) {
    return `<div class="trip-fact"><span>Trip format</span><strong>${escapeHtml(tripFormatIcons(country.tripFormat))}</strong></div>`;
}

function factList(entries) {
    return `<dl class="fact-list">${entries.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
}

function seasonStrip(country) {
    const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const selectedMonth = els.monthSelect.value === 'all' ? null : Number(els.monthSelect.value);
    return `<div class="season-strip">${country.seasonScores.map((score, index) => {
        const temperature = Number(country.monthlyDaytimeTempC?.[index]);
        const temperatureLabel = Number.isFinite(temperature) ? `${temperature.toFixed(1)}°C` : '—';
        const visualTemperature = Number.isFinite(temperature) ? `${Math.round(temperature)}°` : '—';
        return `<span class="${selectedMonth === index ? 'active' : ''}" style="--tone:${scoreColor(score * 10)}" title="${monthNames[index]}: ${score}/10 · daytime ${temperatureLabel}"><i></i><b>${months[index]}</b><em>${visualTemperature}</em></span>`;
    }).join('')}</div>`;
}

function renderCompare() {
    const countries = state.compare.map((slug) => state.countries.find((country) => country.slug === slug)).filter(Boolean);
    els.compareHint.textContent = countries.length ? `${countries.length} of 3 selected` : 'Add countries from their cards';
    if (!countries.length) {
        els.compareList.innerHTML = '<div class="compare-empty">Nothing here yet — select ⇄ on any country card.</div>';
        return;
    }
    els.compareList.innerHTML = countries.map((country) => `
        <article class="compare-item">
            <button class="remove-compare" type="button" data-action="compare" data-slug="${country.slug}" aria-label="Remove from comparison">×</button>
            <h3>${country.flag} ${escapeHtml(country.name)}</h3>
            <dl><div><dt>Travel score</dt><dd>${country.travelScore}</dd></div><div><dt>Women’s safety</dt><dd>${country.womenSafety}</dd></div><div><dt>Running</dt><dd>${country.runningInfrastructure}</dd></div><div><dt>LGBTQ+ friendly</dt><dd>${country.gayFriendly}</dd></div><div><dt>Self-drive</dt><dd>${country.selfDrive}</dd></div><div><dt>Nature</dt><dd>${country.nature}</dd></div></dl>
        </article>`).join('');
    bindActionButtons(els.compareList);
}

function project([longitude, latitude]) {
    return [70 + ((longitude + 20) / 76) * 610, 25 + ((38 - latitude) / 74) * 630];
}

function ringToPath(ring, projector = project) {
    return ring.map((point, index) => {
        const [x, y] = projector(point);
        return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ') + ' Z';
}

function geometryToPath(geometry, projector = project) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.flatMap((polygon) => polygon.map((ring) => ringToPath(ring, projector))).join(' ');
}

function geometryCenter(geometry, projector = project) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const points = polygons.flatMap((polygon) => polygon[0]);
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    return projector([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]);
}

function graticulePath() {
    const paths = [];
    for (let longitude = -10; longitude <= 50; longitude += 10) paths.push(ringToPath([[longitude, 37], [longitude, -35]]).replace(' Z', ''));
    for (let latitude = -30; latitude <= 30; latitude += 10) paths.push(ringToPath([[-19, latitude], [55, latitude]]).replace(' Z', ''));
    return paths.join(' ');
}

function countryMapProject([longitude, latitude]) {
    const [minimumLongitude, maximumLongitude, minimumLatitude, maximumLatitude] = activeCountryMap()?.meta.mapBounds || [16, 33.4, -35.2, -21.8];
    return [
        48 + ((longitude - minimumLongitude) / (maximumLongitude - minimumLongitude)) * 664,
        72 + ((maximumLatitude - latitude) / (maximumLatitude - minimumLatitude)) * 530
    ];
}

function markerAngleSeed(id) {
    return [...id].reduce((seed, character) => ((seed * 31) + character.charCodeAt(0)) % 360, 0);
}

function countryMapPinLayout() {
    const pins = [
        ...state.destinations.filter((place) => place.kind !== 'region').map((place) => ({ id: place.id, coordinates: place.coordinates })),
        ...state.airports.map((airport) => ({ id: airport.id, coordinates: airport.coordinates }))
    ].map((pin) => ({ ...pin, anchor: countryMapProject(pin.coordinates) }));
    const ranked = pins.map((pin) => ({
        ...pin,
        nearest: Math.min(...pins.filter((other) => other.id !== pin.id).map((other) => Math.hypot(pin.anchor[0] - other.anchor[0], pin.anchor[1] - other.anchor[1]))),
        nearby: pins.filter((other) => other.id !== pin.id && Math.hypot(pin.anchor[0] - other.anchor[0], pin.anchor[1] - other.anchor[1]) < 58).length
    })).sort((left, right) => right.nearby - left.nearby || left.id.localeCompare(right.id));
    const positions = new Map();
    const occupied = [];
    const minimumDistance = 29;
    const radii = [18, 30, 42, 54, 66, 78, 90];
    ranked.forEach((pin) => {
        const angleSeed = markerAngleSeed(pin.id);
        let chosen = occupied.every((position) => Math.hypot(pin.anchor[0] - position[0], pin.anchor[1] - position[1]) >= minimumDistance) ? pin.anchor : null;
        if (!chosen) {
            for (const radius of radii) {
                for (let step = 0; step < 24; step += 1) {
                    const angle = ((angleSeed + step * 137.5) * Math.PI) / 180;
                    const candidate = [
                        Math.max(48, Math.min(712, pin.anchor[0] + Math.cos(angle) * radius)),
                        Math.max(62, Math.min(602, pin.anchor[1] + Math.sin(angle) * radius))
                    ];
                    if (occupied.every((position) => Math.hypot(candidate[0] - position[0], candidate[1] - position[1]) >= minimumDistance)) {
                        chosen = candidate;
                        break;
                    }
                }
                if (chosen) break;
            }
        }
        chosen ||= pin.anchor;
        occupied.push(chosen);
        positions.set(pin.id, { anchor: pin.anchor, pin: chosen, nearest: pin.nearest, displaced: Math.hypot(pin.anchor[0] - chosen[0], pin.anchor[1] - chosen[1]) > 1 });
    });
    return positions;
}

function pinDisplacementFactor(nearestDistance, zoom) {
    if (!Number.isFinite(nearestDistance) || nearestDistance >= 29) return 0;
    return Math.max(0, Math.min(1, (29 - nearestDistance * zoom) / Math.max(29 - nearestDistance, 0.01)));
}

function pinPositionAtZoom(layout, zoom) {
    const factor = pinDisplacementFactor(layout.nearest, zoom);
    return [
        layout.anchor[0] + (layout.pin[0] - layout.anchor[0]) * factor,
        layout.anchor[1] + (layout.pin[1] - layout.anchor[1]) * factor
    ];
}

function countryMapViewBoxFor(center, zoom, centered = false, anchorPoint = center) {
    const width = countryMapBaseViewBox.width / zoom;
    const height = countryMapBaseViewBox.height / zoom;
    const horizontalAnchor = (anchorPoint[0] - countryMapViewBox.x) / countryMapViewBox.width;
    const verticalAnchor = (anchorPoint[1] - countryMapViewBox.y) / countryMapViewBox.height;
    const targetX = center[0] - width * (centered ? 0.5 : horizontalAnchor);
    const targetY = center[1] - height * (centered ? 0.5 : verticalAnchor);
    return {
        x: centered ? targetX : Math.max(0, Math.min(countryMapBaseViewBox.width - width, targetX)),
        y: centered ? targetY : Math.max(0, Math.min(countryMapBaseViewBox.height - height, targetY)),
        width,
        height
    };
}

function countryMapFocusLabels(pinLayout) {
    const destinationLabels = state.destinations.map((place) => {
        const [x, y] = place.kind === 'region' ? countryMapProject(place.coordinates) : pinLayout.get(place.id).pin;
        return { x, y: y - (place.kind === 'region' ? 12 : 14), width: Math.min(158, Math.max(36, place.name.length * 6.3)), height: 13 };
    });
    const airportLabels = state.airports.map((airport) => {
        const [x, y] = pinLayout.get(airport.id).pin;
        return { x, y: y - 15, width: 34, height: 12 };
    });
    const provinceLabels = state.provinceFeatures.map((feature) => {
        const [x, y] = geometryCenter(feature.geometry, countryMapProject);
        const name = provinceLabel(feature.properties.shapeName);
        return { x, y, width: Math.min(110, Math.max(48, name.length * 5.8)), height: 12 };
    });
    return [...destinationLabels, ...airportLabels, ...provinceLabels];
}

function countryMapLabelsOverlap(labels, viewBox, zoom) {
    const boxes = labels.map((label) => ({
        left: (label.x - viewBox.x) * zoom - label.width / 2,
        right: (label.x - viewBox.x) * zoom + label.width / 2,
        top: (label.y - viewBox.y) * zoom - label.height / 2,
        bottom: (label.y - viewBox.y) * zoom + label.height / 2
    })).filter((box) => box.right >= 0 && box.left <= countryMapBaseViewBox.width && box.bottom >= 0 && box.top <= countryMapBaseViewBox.height);
    return boxes.some((box, index) => boxes.slice(index + 1).some((other) => (
        box.left < other.right + 5 && box.right + 5 > other.left
        && box.top < other.bottom + 4 && box.bottom + 4 > other.top
    )));
}

function countryMapSafeZoom(center, pinLayout, centered = false) {
    const labels = countryMapFocusLabels(pinLayout);
    const zoomLevels = [1.55, 1.8, 2.15, 2.55, 3, 3.5, 4, 4.4];
    return zoomLevels.find((zoom) => !countryMapLabelsOverlap(labels, countryMapViewBoxFor(center, zoom, centered), zoom)) || zoomLevels.at(-1);
}

function applyCountryMapViewBox(viewBox) {
    countryMapViewBox = { ...viewBox };
    const zoom = countryMapBaseViewBox.width / viewBox.width;
    els.africaMap.setAttribute('viewBox', `${viewBox.x.toFixed(2)} ${viewBox.y.toFixed(2)} ${viewBox.width.toFixed(2)} ${viewBox.height.toFixed(2)}`);
    els.africaMap.style.setProperty('--map-label-scale', String(1 / zoom));
    els.africaMap.style.setProperty('--map-marker-hover-scale', String(1.35 / zoom));
    els.africaMap.style.setProperty('--map-airport-hover-scale', String(1.25 / zoom));
    els.africaMap.classList.toggle('map-focus-active', zoom > 1.02);
    updateCountryMapPinDisplacements(zoom);
    positionMapFocusClose();
}

function updateCountryMapPinDisplacements(zoom) {
    els.africaMap.querySelectorAll('[data-pin-x][data-anchor-x]').forEach((marker) => {
        const layout = {
            anchor: [Number(marker.dataset.anchorX), Number(marker.dataset.anchorY)],
            pin: [Number(marker.dataset.pinX), Number(marker.dataset.pinY)],
            nearest: Number(marker.dataset.nearest)
        };
        const [x, y] = pinPositionAtZoom(layout, zoom);
        marker.querySelector('.map-pin-body')?.setAttribute('transform', `translate(${(x - layout.pin[0]).toFixed(2)} ${(y - layout.pin[1]).toFixed(2)})`);
        const stem = marker.querySelector('.point-stem, .airport-stem');
        if (stem) {
            stem.setAttribute('x2', x.toFixed(2));
            stem.setAttribute('y2', y.toFixed(2));
        }
        if (marker.dataset.placeId === state.selectedPlaceId) countryMapFocusPoint = [x, y];
        if (!state.selectedPlaceId && marker.dataset.placeId === countryMapHoverPlaceId) countryMapHoverPoint = [x, y];
    });
}

function animateCountryMapViewBox(target, duration = 1050) {
    if (countryMapZoomFrame) cancelAnimationFrame(countryMapZoomFrame);
    const start = { ...countryMapViewBox };
    const startedAt = performance.now();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || duration === 0) {
        applyCountryMapViewBox(target);
        countryMapZoomFrame = null;
        return;
    }
    const tick = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress < 0.5
            ? 4 * Math.pow(progress, 3)
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        applyCountryMapViewBox({
            x: start.x + (target.x - start.x) * eased,
            y: start.y + (target.y - start.y) * eased,
            width: start.width + (target.width - start.width) * eased,
            height: start.height + (target.height - start.height) * eased
        });
        countryMapZoomFrame = progress < 1 ? requestAnimationFrame(tick) : null;
    };
    countryMapZoomFrame = requestAnimationFrame(tick);
}

function focusCountryMapPlace(placeId, pinLayout, centered = false) {
    const place = state.destinations.find((item) => item.id === placeId);
    if (!place) return;
    const layout = place.kind === 'region' ? null : pinLayout.get(place.id);
    const currentZoom = countryMapBaseViewBox.width / countryMapViewBox.width;
    const initialCenter = layout ? pinPositionAtZoom(layout, currentZoom) : countryMapProject(place.coordinates);
    const zoom = countryMapSafeZoom(initialCenter, pinLayout, centered);
    const center = layout ? pinPositionAtZoom(layout, zoom) : initialCenter;
    animateCountryMapViewBox(countryMapViewBoxFor(center, zoom, centered, initialCenter));
    return center;
}

function resetCountryMapViewBox(animate = true) {
    countryMapHoverPlaceId = null;
    countryMapHoverPoint = null;
    countryMapHoverOrigin = null;
    if (animate) animateCountryMapViewBox(countryMapBaseViewBox, 1250);
    else {
        if (countryMapZoomFrame) cancelAnimationFrame(countryMapZoomFrame);
        countryMapZoomFrame = null;
        applyCountryMapViewBox(countryMapBaseViewBox);
    }
}

function manualMapNavigationEnabled() {
    return state.mapMode === 'country-detail' && state.mapNavigationMode === 'manual';
}

function mapDragNavigationEnabled() {
    return state.mapMode === 'country-detail' && ['manual', 'auto'].includes(state.mapNavigationMode);
}

function clampManualViewBox(viewBox) {
    const width = Math.min(countryMapBaseViewBox.width, viewBox.width);
    const height = Math.min(countryMapBaseViewBox.height, viewBox.height);
    return {
        x: Math.max(0, Math.min(countryMapBaseViewBox.width - width, viewBox.x)),
        y: Math.max(0, Math.min(countryMapBaseViewBox.height - height, viewBox.y)),
        width,
        height
    };
}

function mapPointFromClient(clientX, clientY) {
    const matrix = els.africaMap.getScreenCTM();
    if (!matrix) return null;
    const point = els.africaMap.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(matrix.inverse());
}

function handleManualMapWheel(event) {
    if (!manualMapNavigationEnabled()) return;
    event.preventDefault();
    const mapPoint = mapPointFromClient(event.clientX, event.clientY);
    if (!mapPoint) return;
    if (countryMapZoomFrame) cancelAnimationFrame(countryMapZoomFrame);
    countryMapZoomFrame = null;
    const currentZoom = countryMapBaseViewBox.width / countryMapViewBox.width;
    const nextZoom = Math.max(1, Math.min(6, currentZoom * Math.exp(-event.deltaY * 0.0015)));
    const width = countryMapBaseViewBox.width / nextZoom;
    const height = countryMapBaseViewBox.height / nextZoom;
    const horizontalAnchor = (mapPoint.x - countryMapViewBox.x) / countryMapViewBox.width;
    const verticalAnchor = (mapPoint.y - countryMapViewBox.y) / countryMapViewBox.height;
    applyCountryMapViewBox(clampManualViewBox({
        x: mapPoint.x - width * horizontalAnchor,
        y: mapPoint.y - height * verticalAnchor,
        width,
        height
    }));
}

function handleManualMapPointerDown(event) {
    if (!mapDragNavigationEnabled() || event.button !== 0) return;
    if (countryMapZoomFrame) cancelAnimationFrame(countryMapZoomFrame);
    countryMapZoomFrame = null;
    const matrix = els.africaMap.getScreenCTM();
    if (!matrix) return;
    manualMapDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        viewBox: { ...countryMapViewBox },
        scaleX: Math.hypot(matrix.a, matrix.b),
        scaleY: Math.hypot(matrix.c, matrix.d),
        dragging: false
    };
    suppressManualMapClick = false;
}

function handleManualMapPointerMove(event) {
    if (!manualMapDrag || event.pointerId !== manualMapDrag.pointerId) return;
    const deltaX = event.clientX - manualMapDrag.startX;
    const deltaY = event.clientY - manualMapDrag.startY;
    if (!manualMapDrag.dragging && Math.hypot(deltaX, deltaY) <= 4) return;
    if (!manualMapDrag.dragging) {
        manualMapDrag.dragging = true;
        suppressManualMapClick = true;
        countryMapHoverPlaceId = null;
        countryMapHoverPoint = null;
        countryMapHoverOrigin = null;
        hideMapTooltip();
        els.africaMap.setPointerCapture(event.pointerId);
        els.africaMap.classList.add('map-dragging');
    }
    applyCountryMapViewBox(clampManualViewBox({
        ...manualMapDrag.viewBox,
        x: manualMapDrag.viewBox.x - deltaX / Math.max(manualMapDrag.scaleX, 0.01),
        y: manualMapDrag.viewBox.y - deltaY / Math.max(manualMapDrag.scaleY, 0.01)
    }));
}

function finishManualMapDrag(event) {
    if (!manualMapDrag || event.pointerId !== manualMapDrag.pointerId) return;
    if (els.africaMap.hasPointerCapture(event.pointerId)) els.africaMap.releasePointerCapture(event.pointerId);
    manualMapDrag = null;
    els.africaMap.classList.remove('map-dragging');
    setTimeout(() => { suppressManualMapClick = false; }, 0);
}

function manualDragConsumedClick() {
    if (!suppressManualMapClick) return false;
    suppressManualMapClick = false;
    return true;
}

function syncMapNavigationControls() {
    els.mapNavigationControls.querySelectorAll('[data-map-navigation]').forEach((button) => {
        const active = button.dataset.mapNavigation === state.mapNavigationMode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });
    els.africaMap.classList.toggle('map-manual-navigation', manualMapNavigationEnabled());
    els.africaMap.classList.toggle('map-auto-navigation', state.mapMode === 'country-detail' && state.mapNavigationMode === 'auto');
}

function setMapNavigationMode(mode) {
    if (!['manual', 'auto'].includes(mode) || state.mapNavigationMode === mode) return;
    state.mapNavigationMode = mode;
    countryMapHoverPlaceId = null;
    countryMapHoverPoint = null;
    countryMapHoverOrigin = null;
    hideMapTooltip();
    if (mode === 'manual' && countryMapZoomFrame) {
        cancelAnimationFrame(countryMapZoomFrame);
        countryMapZoomFrame = null;
    }
    renderMap();
    if (mode === 'auto' && !state.selectedPlaceId) resetCountryMapViewBox();
    syncMapNavigationControls();
}

function screenPositionForMapPoint(coordinates) {
    const matrix = els.africaMap.getScreenCTM();
    if (!matrix) return null;
    const point = els.africaMap.createSVGPoint();
    point.x = coordinates[0];
    point.y = coordinates[1];
    return point.matrixTransform(matrix);
}

function distanceToSegment(point, start, end) {
    const width = end.x - start.x;
    const height = end.y - start.y;
    const lengthSquared = width * width + height * height;
    if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
    const progress = Math.max(0, Math.min(1, ((point.x - start.x) * width + (point.y - start.y) * height) / lengthSquared));
    return Math.hypot(point.x - (start.x + width * progress), point.y - (start.y + height * progress));
}

function releaseDistantCountryMapHover(event) {
    if (manualMapDrag?.dragging || state.selectedPlaceId || !countryMapHoverOrigin || !countryMapHoverPoint) return;
    const hoveredPlace = state.destinations.find((place) => place.id === countryMapHoverPlaceId);
    if (hoveredPlace?.kind === 'region') {
        const halo = els.africaMap.querySelector(`[data-place-id="${hoveredPlace.id}"] .zone-halo`);
        const bounds = halo?.getBoundingClientRect();
        if (bounds?.width && bounds?.height) {
            const horizontalDistance = (event.clientX - (bounds.left + bounds.width / 2)) / (bounds.width / 2 + 10);
            const verticalDistance = (event.clientY - (bounds.top + bounds.height / 2)) / (bounds.height / 2 + 10);
            if (horizontalDistance * horizontalDistance + verticalDistance * verticalDistance <= 1) return;
        }
    }
    const markerPosition = screenPositionForMapPoint(countryMapHoverPoint);
    if (!markerPosition) return;
    const pointer = { x: event.clientX, y: event.clientY };
    if (distanceToSegment(pointer, countryMapHoverOrigin, markerPosition) > 90) {
        hideMapTooltip();
        resetCountryMapViewBox();
    }
}

function positionMapFocusClose() {
    if (!countryMapFocusPoint || els.mapFocusClose.hidden) return;
    const matrix = els.africaMap.getScreenCTM();
    if (!matrix) return;
    const point = els.africaMap.createSVGPoint();
    point.x = countryMapFocusPoint[0];
    point.y = countryMapFocusPoint[1];
    const screenPoint = point.matrixTransform(matrix);
    const stageBounds = els.africaMap.parentElement.getBoundingClientRect();
    els.mapFocusClose.style.left = `${screenPoint.x - stageBounds.left}px`;
    els.mapFocusClose.style.top = `${screenPoint.y - stageBounds.top}px`;
}

function closePlaceFocus() {
    state.selectedPlaceId = null;
    state.selectedAirportId = null;
    countryMapFocusPoint = null;
    els.mapFocusClose.hidden = true;
    hideMapTooltip();
    render();
    if (state.mapNavigationMode === 'auto') resetCountryMapViewBox();
}

function provinceLabel(name) {
    const corrected = name === 'Nothern Cape' ? 'Northern Cape' : name;
    return corrected.replace(/ District$/, '');
}

function renderCountryMap() {
    const map = activeCountryMap();
    const country = activeCountry();
    if (!map || !country) {
        state.mapMode = 'africa';
        renderMap();
        return;
    }
    els.mapTitle.textContent = country.name;
    els.mapBackButton.hidden = false;
    els.mapNavigationControls.hidden = false;
    els.mapInstruction.textContent = state.mapNavigationMode === 'manual'
        ? 'Scroll to zoom · drag to move · select a place to open its profile'
        : 'Hover to focus · select a place to lock it';
    els.africaMap.setAttribute('aria-label', `Map of ${country.name} ${map.meta.adminLabelPlural || 'regions'}, travel destinations and airports`);
    const provincePaths = state.provinceFeatures.map((feature, index) => {
        const name = provinceLabel(feature.properties.shapeName);
        return `<path class="province-shape tone-${index % 3}" d="${geometryToPath(feature.geometry, countryMapProject)}"><title>${escapeHtml(name)}</title></path>`;
    }).join('');
    const provinceLabels = state.provinceFeatures.map((feature) => {
        const name = provinceLabel(feature.properties.shapeName);
        const [x, y] = geometryCenter(feature.geometry, countryMapProject);
        return `<text class="province-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${escapeHtml(name)}</text>`;
    }).join('');
    const pinLayout = countryMapPinLayout();
    const regions = state.destinations.filter((place) => place.kind === 'region').map((place) => {
        const [x, y] = countryMapProject(place.coordinates);
        const selected = place.id === state.selectedPlaceId;
        const priority = mustVisitScore(place);
        return `<g class="destination-marker destination-zone ${selected ? 'selected' : ''}" style="--tone:${scoreColor(priority * 10)}" data-place-id="${place.id}" tabindex="0" role="button" aria-label="Open ${escapeHtml(place.name)}, must-visit priority ${priority} out of 10">
            <circle class="zone-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${place.radius}"></circle>
            <circle class="zone-core" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"></circle>
            <text x="${x.toFixed(1)}" y="${(y - 12).toFixed(1)}" text-anchor="middle">${escapeHtml(place.name)}</text>
            <title>${escapeHtml(place.name)} · ${escapeHtml(place.category)}</title>
        </g>`;
    }).join('');
    const points = state.destinations.filter((place) => place.kind !== 'region').map((place) => {
        const { anchor: [anchorX, anchorY], pin: [x, y], nearest, displaced } = pinLayout.get(place.id);
        const selected = place.id === state.selectedPlaceId;
        const priority = mustVisitScore(place);
        const stem = displaced ? `<line class="point-stem" x1="${anchorX.toFixed(1)}" y1="${anchorY.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line><circle class="point-anchor" cx="${anchorX.toFixed(1)}" cy="${anchorY.toFixed(1)}" r="2.5"></circle>` : '';
        const pointLabel = `<text class="place-map-label ${selected ? 'selected-place-label' : ''}" x="${x.toFixed(1)}" y="${(y - 14).toFixed(1)}" text-anchor="middle">${escapeHtml(place.name)}</text>`;
        return `<g class="destination-marker destination-point ${selected ? 'selected' : ''} ${displaced ? 'displaced' : ''}" style="--tone:${scoreColor(priority * 10)}" data-place-id="${place.id}" data-anchor-x="${anchorX.toFixed(2)}" data-anchor-y="${anchorY.toFixed(2)}" data-pin-x="${x.toFixed(2)}" data-pin-y="${y.toFixed(2)}" data-nearest="${nearest.toFixed(2)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(place.name)}, must-visit priority ${priority} out of 10">
            ${stem}
            <g class="map-pin-body"><circle class="point-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10"></circle>
            <circle class="point-core" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"></circle>${pointLabel}</g>
            <title>${escapeHtml(place.name)} · ${escapeHtml(place.category)}</title>
        </g>`;
    }).join('');
    const airports = state.airports.map((airport) => {
        const { anchor: [anchorX, anchorY], pin: [x, y], nearest, displaced } = pinLayout.get(airport.id);
        const selected = airport.id === state.selectedAirportId;
        const stem = displaced ? `<line class="airport-stem" x1="${anchorX.toFixed(1)}" y1="${anchorY.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line><circle class="airport-anchor" cx="${anchorX.toFixed(1)}" cy="${anchorY.toFixed(1)}" r="2.5"></circle>` : '';
        return `<g class="airport-marker ${selected ? 'selected' : ''} ${displaced ? 'displaced' : ''}" data-airport-id="${airport.id}" data-anchor-x="${anchorX.toFixed(2)}" data-anchor-y="${anchorY.toFixed(2)}" data-pin-x="${x.toFixed(2)}" data-pin-y="${y.toFixed(2)}" data-nearest="${nearest.toFixed(2)}" tabindex="0" role="button" aria-label="Open ${escapeHtml(airport.name)}">
            ${stem}
            <g class="map-pin-body"><circle class="airport-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12"></circle>
            <circle class="airport-core" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"></circle>
            <text class="airport-icon" x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle">✈</text>
            <text class="airport-code" x="${x.toFixed(1)}" y="${(y - 15).toFixed(1)}" text-anchor="middle">${escapeHtml(airport.code)}</text></g>
            <title>${escapeHtml(airport.name)} · ${escapeHtml(airport.type)}</title>
        </g>`;
    }).join('');
    const geographicLabels = (map.meta.geographicLabels || []).map((label) => `<text class="map-ocean-label" x="${label.x}" y="${label.y}"${label.rotate ? ` transform="rotate(${label.rotate} ${label.x} ${label.y})"` : ''}>${escapeHtml(label.text)}</text>`).join('');
    els.africaMap.innerHTML = `<defs><filter id="zoneGlow"><feGaussianBlur stdDeviation="5"></feGaussianBlur></filter></defs>${geographicLabels}${provincePaths}${provinceLabels}${regions}${points}${airports}`;
    const currentMapZoom = countryMapBaseViewBox.width / countryMapViewBox.width;
    updateCountryMapPinDisplacements(currentMapZoom);
    els.africaMap.querySelectorAll('.destination-marker').forEach((marker) => {
        marker.addEventListener('click', () => {
            if (!manualDragConsumedClick()) selectPlace(marker.dataset.placeId);
        });
        marker.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectPlace(marker.dataset.placeId);
            }
        });
        marker.addEventListener('pointerenter', (event) => {
            if (state.mapNavigationMode !== 'auto') return;
            const placeId = marker.dataset.placeId;
            if (state.selectedPlaceId) return;
            if (countryMapHoverPlaceId && countryMapHoverPlaceId !== placeId) {
                const currentPlace = state.destinations.find((place) => place.id === countryMapHoverPlaceId);
                const nextPlace = state.destinations.find((place) => place.id === placeId);
                if (currentPlace?.kind !== 'region' || nextPlace?.kind === 'region') return;
            }
            countryMapHoverPlaceId = placeId;
            countryMapHoverOrigin = { x: event.clientX, y: event.clientY };
            countryMapHoverPoint = focusCountryMapPlace(placeId, pinLayout);
        });
        marker.addEventListener('focus', () => {
            if (state.mapNavigationMode === 'auto' && !state.selectedPlaceId) focusCountryMapPlace(marker.dataset.placeId, pinLayout);
        });
        marker.addEventListener('blur', () => {
            if (state.mapNavigationMode === 'auto' && !state.selectedPlaceId) resetCountryMapViewBox();
        });
        marker.addEventListener('pointermove', (event) => showPlaceTooltip(event, marker.dataset.placeId));
        marker.addEventListener('pointerleave', hideMapTooltip);
    });
    els.africaMap.querySelectorAll('.airport-marker').forEach((marker) => {
        marker.addEventListener('click', () => {
            if (!manualDragConsumedClick()) selectAirport(marker.dataset.airportId);
        });
        marker.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectAirport(marker.dataset.airportId);
            }
        });
        marker.addEventListener('pointermove', (event) => showAirportTooltip(event, marker.dataset.airportId));
        marker.addEventListener('pointerleave', hideMapTooltip);
    });
    els.africaMap.onpointerleave = () => {
        hideMapTooltip();
        if (!manualMapDrag?.dragging && state.mapNavigationMode === 'auto' && !state.selectedPlaceId) resetCountryMapViewBox();
    };
    els.africaMap.onpointermove = state.mapNavigationMode === 'auto' ? releaseDistantCountryMapHover : null;
    const selectedPlace = state.destinations.find((place) => place.id === state.selectedPlaceId);
    if (selectedPlace) {
        countryMapFocusPoint = selectedPlace.kind === 'region'
            ? countryMapProject(selectedPlace.coordinates)
            : pinPositionAtZoom(pinLayout.get(selectedPlace.id), currentMapZoom);
        countryMapHoverPlaceId = selectedPlace.id;
        els.mapFocusClose.hidden = false;
        els.mapFocusClose.setAttribute('aria-label', `Close ${selectedPlace.name} map focus`);
        positionMapFocusClose();
        if (state.mapNavigationMode === 'auto') focusCountryMapPlace(selectedPlace.id, pinLayout, true);
    } else {
        countryMapFocusPoint = null;
        els.mapFocusClose.hidden = true;
    }
    syncMapNavigationControls();
}

function renderMap() {
    if (state.mapMode === 'country-detail') {
        renderCountryMap();
        return;
    }
    resetCountryMapViewBox(false);
    countryMapFocusPoint = null;
    els.mapFocusClose.hidden = true;
    els.mapNavigationControls.hidden = true;
    els.africaMap.onpointerleave = null;
    els.africaMap.onpointermove = null;
    els.africaMap.classList.remove('map-manual-navigation', 'map-auto-navigation', 'map-dragging');
    els.mapTitle.textContent = 'Africa';
    els.mapBackButton.hidden = true;
    els.mapInstruction.textContent = 'Select a highlighted country to open its profile';
    els.africaMap.setAttribute('aria-label', 'Map of African countries');
    const byIso = new Map(state.countries.map((country) => [country.iso3, country]));
    byIso.set('SOL', byIso.get('SOM'));
    const visible = new Set(state.filtered.map((country) => country.slug));
    const labelIsos = new Set(['MAR', 'EGY', 'KEN', 'NAM', 'LSO', 'ZAF']);
    const religionMode = state.mapMetric === 'religion';
    const gradientDefinitions = religionMode
        ? `<defs>${state.countries.map(religionGradient).filter(Boolean).join('')}</defs>`
        : '';
    const paths = state.mapFeatures.map((feature) => {
        const country = byIso.get(feature.properties.iso3);
        const hasData = Boolean(country);
        const filteredOut = hasData && !visible.has(country.slug);
        const selected = country?.slug === state.selectedId;
        const display = hasData ? displayScore(country, state.mapMetric) : null;
        const fill = hasData && religionMode ? religionFill(country) : scoreColor(hasData ? numericScore(country, state.mapMetric) : null);
        return `<path class="geo-country ${hasData ? 'has-data' : ''} ${selected ? 'selected' : ''}" d="${geometryToPath(feature.geometry)}" fill="${fill}" stroke="#333940" stroke-width=".65" fill-rule="evenodd" opacity="${filteredOut ? '.18' : hasData ? '1' : '.55'}" data-iso="${feature.properties.iso3}" ${hasData ? `data-slug="${country.slug}" tabindex="0" role="button" aria-label="${escapeHtml(country.name)}, ${escapeHtml(display.text)}"` : ''}><title>${escapeHtml(country?.name || feature.properties.name)}${hasData ? ` — ${escapeHtml(display.text)}` : ' — no profile'}</title></path>`;
    }).join('');
    const labels = state.mapFeatures.map((feature) => {
        const country = byIso.get(feature.properties.iso3);
        if (!country || (!labelIsos.has(country.iso3) && country.slug !== state.selectedId)) return '';
        const [x, y] = geometryCenter(feature.geometry);
        return `<text class="map-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${escapeHtml(country.name)}</text>`;
    }).join('');
    const religionSymbols = religionMode ? state.mapFeatures.map((feature) => {
        const country = byIso.get(feature.properties.iso3);
        if (!country || Object.hasOwn(islandCoordinates, country.iso3)) return '';
        const [x, y] = geometryCenter(feature.geometry);
        const main = religionParts(country.religion)[0];
        return `<text class="religion-symbol" x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" opacity="${visible.has(country.slug) ? '1' : '.18'}">${main.symbol}</text>`;
    }).join('') : '';
    const islandMarkers = Object.entries(islandCoordinates).map(([iso3, coordinates]) => {
        const country = byIso.get(iso3);
        const [x, y] = project(coordinates);
        const display = displayScore(country, state.mapMetric);
        const filteredOut = !visible.has(country.slug);
        const fill = religionMode ? religionFill(country) : scoreColor(numericScore(country, state.mapMetric));
        const outline = religionMode ? religionParts(country.religion)[0].color : fill;
        const symbol = religionMode ? `<text class="religion-symbol island-symbol" x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle">${religionParts(country.religion)[0].symbol}</text>` : '';
        return `<g class="map-island has-data ${country.slug === state.selectedId ? 'selected' : ''}" data-slug="${country.slug}" tabindex="0" role="button" aria-label="${escapeHtml(country.name)}, ${escapeHtml(display.text)}" opacity="${filteredOut ? '.18' : '1'}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${fill}"></circle><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="none" stroke="${outline}" opacity=".42"></circle>${symbol}<title>${escapeHtml(country.name)} — ${escapeHtml(display.text)}</title></g>`;
    }).join('');
    els.africaMap.innerHTML = `${gradientDefinitions}<path class="map-graticule" d="${graticulePath()}"></path><text class="map-ocean-label" x="88" y="355" transform="rotate(-90 88 355)">ATLANTIC</text><text class="map-ocean-label" x="635" y="440" transform="rotate(68 635 440)">INDIAN OCEAN</text>${paths}${islandMarkers}${religionSymbols}${religionMode ? '' : labels}`;
    els.africaMap.querySelectorAll('.has-data').forEach((path) => {
        path.addEventListener('click', () => selectCountry(path.dataset.slug, true));
        path.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectCountry(path.dataset.slug, true);
            }
        });
        path.addEventListener('pointermove', (event) => showMapTooltip(event, path.dataset.slug));
        path.addEventListener('pointerleave', hideMapTooltip);
    });
}

function showMapTooltip(event, slug) {
    const country = state.countries.find((item) => item.slug === slug);
    if (!country) return;
    if (state.mapMetric === 'religion') {
        const main = religionParts(country.religion)[0];
        els.mapTooltip.innerHTML = `<strong>${country.flag} ${escapeHtml(country.name)}</strong><span>${main.symbol} ${escapeHtml(country.religion)}</span><small>Split fill visualizes the listed mix, not census shares.</small>`;
        els.mapTooltip.hidden = false;
        els.mapTooltip.style.left = `${event.clientX + 14}px`;
        els.mapTooltip.style.top = `${event.clientY + 14}px`;
        return;
    }
    const score = numericScore(country, state.mapMetric);
    const display = displayScore(country, state.mapMetric);
    const monthIndex = state.mapMetric === 'seasonality' ? Number(els.monthSelect.value) : null;
    const temperature = monthIndex === null ? '' : ` · ${Math.round(country.monthlyDaytimeTempC[monthIndex])}° daytime`;
    els.mapTooltip.innerHTML = `<strong>${country.flag} ${escapeHtml(country.name)}</strong><span>${escapeHtml(layerLabel())}: ${escapeHtml(display.text)} · ${scoreVerdict(score)}${temperature}</span>`;
    els.mapTooltip.hidden = false;
    els.mapTooltip.style.left = `${event.clientX + 14}px`;
    els.mapTooltip.style.top = `${event.clientY + 14}px`;
}

function showPlaceTooltip(event, placeId) {
    const place = state.destinations.find((item) => item.id === placeId);
    if (!place) return;
    const priority = mustVisitScore(place);
    els.mapTooltip.innerHTML = `<strong>${place.kind === 'region' ? '◉' : '•'} ${escapeHtml(place.name)}</strong><span style="color:${scoreColor(priority * 10)}">Must-visit ${priority}/10 · ${mustVisitLabel(priority)}</span><small>${escapeHtml(place.category)} · ${place.worldClass.score}/10 world-class · ${escapeHtml(place.recommendedTime)}</small>`;
    els.mapTooltip.hidden = false;
    els.mapTooltip.style.left = `${event.clientX + 14}px`;
    els.mapTooltip.style.top = `${event.clientY + 14}px`;
}

function showAirportTooltip(event, airportId) {
    const airport = state.airports.find((item) => item.id === airportId);
    if (!airport) return;
    els.mapTooltip.innerHTML = `<strong>✈ ${escapeHtml(airport.code)} · ${escapeHtml(airport.name)}</strong><span>${escapeHtml(airport.type)} · ${airport.directRoutes} direct routes</span><small>${escapeHtml(airport.topOriginLabel)}: ${escapeHtml(airport.topOriginCountry)}</small>`;
    els.mapTooltip.hidden = false;
    els.mapTooltip.style.left = `${event.clientX + 14}px`;
    els.mapTooltip.style.top = `${event.clientY + 14}px`;
}

function hideMapTooltip() {
    els.mapTooltip.hidden = true;
}

function renderStats() {
    els.statsCount.textContent = state.filtered.length;
    els.favoritesBadge.textContent = state.favorites.size;
    els.compareBadge.textContent = state.compare.length;
    if (state.mapMode === 'country-detail') {
        const regionCount = state.destinations.filter((place) => place.kind === 'region').length;
        els.mapLayerLabel.textContent = `Travel layer · ${state.destinations.length} places · ${state.airports.length} airports`;
        els.mapLegend.className = 'destination-legend';
        els.mapLegend.innerHTML = `<span><i class="legend-region"></i>${regionCount} regions</span><span><i class="legend-point"></i>${state.destinations.length - regionCount} places</span><span><i class="legend-airport">✈</i>${state.airports.length} airports</span><span class="must-visit-legend"><small>can skip</small><i></i><small>must-see</small></span>`;
        return;
    }
    const noScale = new Set(['dailyBudget', 'recommendedStayDays', 'populationMillion', 'areaKm2', 'daytimeTemperature', 'religion']);
    const scale = scoreFields.has(state.mapMetric) ? 100 : 10;
    els.mapLayerLabel.textContent = `Data layer · ${layerLabel()}${noScale.has(state.mapMetric) ? '' : ` /${scale}`}`;
    if (state.mapMetric === 'religion') {
        els.mapLegend.className = 'religion-legend';
        els.mapLegend.innerHTML = Object.entries(religionStyles).map(([label, style]) => `<span><i style="--religion-color:${style.color}">${style.symbol}</i>${label}</span>`).join('') + '<span class="mix-note">◒ Mixed = split profile</span>';
    } else {
        els.mapLegend.className = 'scale-legend';
        els.mapLegend.innerHTML = '<span>lower</span><i></i><span>higher</span>';
    }
}

function selectCountry(slug, fromMap) {
    state.selectedId = slug;
    const country = state.countries.find((item) => item.slug === slug);
    const hasDrilldown = country ? activateCountryMap(country.iso2) : false;
    if (!hasDrilldown && state.mapMode === 'country-detail') leaveCountryMap(false);
    render();
    if (hasDrilldown && !fromMap) document.querySelector('.map-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (fromMap && window.matchMedia('(max-width: 680px)').matches) document.querySelector('#countryDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectPlace(placeId) {
    if (!state.destinations.some((place) => place.id === placeId)) return;
    state.mapMode = 'country-detail';
    state.selectedPlaceId = placeId;
    state.selectedAirportId = null;
    render();
}

function selectAirport(airportId) {
    if (!state.airports.some((airport) => airport.id === airportId)) return;
    state.mapMode = 'country-detail';
    state.selectedPlaceId = null;
    state.selectedAirportId = airportId;
    render();
    if (state.mapNavigationMode === 'auto') resetCountryMapViewBox();
}

function leaveCountryMap(shouldRender = true) {
    state.mapMode = 'africa';
    state.activeCountryIso2 = null;
    state.selectedPlaceId = null;
    state.selectedAirportId = null;
    hideMapTooltip();
    if (shouldRender) render();
}

function toggleFavorite(slug) {
    if (state.favorites.has(slug)) state.favorites.delete(slug);
    else state.favorites.add(slug);
    saveFavorites();
    render();
}

function toggleCompare(slug) {
    if (state.compare.includes(slug)) state.compare = state.compare.filter((item) => item !== slug);
    else if (state.compare.length < 3) state.compare.push(slug);
    else state.compare = [...state.compare.slice(1), slug];
    render();
}

function bindActionButtons(root) {
    root.querySelectorAll('[data-action]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            if (button.dataset.action === 'favorite') toggleFavorite(button.dataset.slug);
            if (button.dataset.action === 'compare') toggleCompare(button.dataset.slug);
        });
    });
}

function bindScrollButtons(root = document) {
    root.querySelectorAll('[data-scroll]').forEach((button) => {
        button.addEventListener('click', () => document.querySelector(`#${button.dataset.scroll}`)?.scrollIntoView({ behavior: 'smooth' }));
    });
}

function render() {
    filterCountries();
    renderCountryGrid();
    renderDetail();
    renderCompare();
    renderMap();
    renderStats();
    syncCustomSelects();
}

function resetFilters() {
    els.searchInput.value = '';
    els.regionSelect.value = 'all';
    els.visaSelect.value = 'all';
    els.prioritySelect.value = 'travelScore';
    els.focusSelect.value = 'travelScore';
    els.monthSelect.value = 'all';
    els.budgetRange.value = els.budgetRange.max;
    state.mapMetric = 'travelScore';
    state.mapMode = 'africa';
    state.selectedPlaceId = null;
    state.selectedAirportId = null;
    els.favoritesOnly.checked = false;
    updateBudgetControl();
    render();
}

function bindControls() {
    els.mapFocusClose.addEventListener('click', closePlaceFocus);
    els.mapNavigationControls.querySelectorAll('[data-map-navigation]').forEach((button) => {
        button.addEventListener('click', () => setMapNavigationMode(button.dataset.mapNavigation));
    });
    els.africaMap.addEventListener('wheel', handleManualMapWheel, { passive: false });
    els.africaMap.addEventListener('pointerdown', handleManualMapPointerDown);
    els.africaMap.addEventListener('pointermove', handleManualMapPointerMove);
    els.africaMap.addEventListener('pointerup', finishManualMapDrag);
    els.africaMap.addEventListener('pointercancel', finishManualMapDrag);
    els.searchInput.addEventListener('input', render);
    [els.regionSelect, els.visaSelect, els.prioritySelect, els.favoritesOnly].forEach((element) => element.addEventListener('change', render));
    els.budgetRange.addEventListener('input', () => {
        updateBudgetControl();
        render();
    });
    els.focusSelect.addEventListener('change', () => {
        els.monthSelect.value = 'all';
        state.mapMetric = els.focusSelect.value;
        render();
    });
    els.monthSelect.addEventListener('change', () => {
        if (els.monthSelect.value === 'all' || els.focusSelect.value === 'daytimeTemperature') {
            state.mapMetric = els.focusSelect.value;
        } else {
            state.mapMetric = 'seasonality';
        }
        render();
    });
    els.resetFilters.addEventListener('click', resetFilters);
    els.mapBackButton.addEventListener('click', leaveCountryMap);
    document.querySelector('[data-action="show-favorites"]').addEventListener('click', () => {
        els.favoritesOnly.checked = !els.favoritesOnly.checked;
        render();
        document.querySelector('#countries').scrollIntoView({ behavior: 'smooth' });
    });
    bindScrollButtons();
}

async function init() {
    loadSavedState();
    const [countriesResponse, mapResponse, southAfricaRegionsResponse, southAfricaDestinationsResponse, lesothoRegionsResponse, lesothoDestinationsResponse, fieldNotesResponse] = await Promise.all([
        fetch('./data/countries.json'),
        fetch('./data/africa.geojson'),
        fetch('./data/south-africa-provinces.geojson'),
        fetch('./data/south-africa-destinations.json'),
        fetch('./data/lesotho-districts.geojson'),
        fetch('./data/lesotho-destinations.json'),
        fetch('./data/destination-field-notes.json')
    ]);
    if (![countriesResponse, mapResponse, southAfricaRegionsResponse, southAfricaDestinationsResponse, lesothoRegionsResponse, lesothoDestinationsResponse, fieldNotesResponse].every((response) => response.ok)) throw new Error('Unable to load data');
    const countriesData = await countriesResponse.json();
    const mapData = await mapResponse.json();
    const southAfricaRegions = await southAfricaRegionsResponse.json();
    const southAfricaDestinations = await southAfricaDestinationsResponse.json();
    const lesothoRegions = await lesothoRegionsResponse.json();
    const lesothoDestinations = await lesothoDestinationsResponse.json();
    const fieldNotes = await fieldNotesResponse.json();
    const withFieldNotes = (dataset, iso2) => ({
        ...dataset,
        destinations: dataset.destinations.map((place) => ({
            ...place,
            fieldNotes: fieldNotes[iso2][place.id].facts,
            fieldNotesSourceLabel: fieldNotes[iso2][place.id].sourceLabel,
            fieldNotesSourceUrl: fieldNotes[iso2][place.id].sourceUrl
        }))
    });
    state.countries = countriesData.countries;
    state.mapFeatures = mapData.features;
    state.countryMaps = {
        ZA: { ...withFieldNotes(southAfricaDestinations, 'ZA'), features: southAfricaRegions.features },
        LS: { ...withFieldNotes(lesothoDestinations, 'LS'), features: lesothoRegions.features }
    };
    state.selectedId = state.countries.find((country) => country.iso2 === 'MA')?.slug || state.countries[0]?.slug;
    renderRegions();
    renderSortOptions();
    initializeCustomSelects();
    updateBudgetControl();
    bindControls();
    render();
}

init().catch((error) => {
    console.error(error);
    els.countryGrid.innerHTML = '<div class="empty-state">Unable to load data. Run the site through a local server.</div>';
});
