// Data management
let cities = [];
let selectedCities = []; // Store names of selected cities

const DEFAULT_CITIES = [
    "London (UK)", "Harwich (UK)", "Hook of Holland (NL)", "Nijmegen (NL)",
    "Düsseldorf (DE)", "Koblenz (DE)", "Speyer (DE)", "Strasbourg (FR)",
    "Basel (CH)", "Bad Zurzach (CH)", "Chur (CH)", "Andermatt (CH)",
    "Brig (CH)", "Chamonix (FR)", "Annecy (FR)", "Lyon (FR)"
];

async function loadData() {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const data = await response.json();
            if (data.cities && data.cities.length > 0) {
                cities = data.cities;
                selectedCities = data.selected_cities || cities.map(c => c.name);
                return;
            }
        }
    } catch (e) {
        console.warn('Failed to load config from server', e);
    }
    
    // Fallback if no server data or error
    cities = [];
    DEFAULT_CITIES.forEach((name, i) => {
        cities.push({ name, transport: 'bike' });
        // Add sleep after every city except the first one (start city)
        // This makes every city hop a separate day
        if (i > 0) {
            cities.push({ 
                name: `Sleep_${Date.now()}_${i}`, 
                is_sleep: true, 
                night_type: 'warmshowers' 
            });
        }
    });
    selectedCities = DEFAULT_CITIES;
}

function saveData() {
    fetch('/api/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cities: cities, selected_cities: selectedCities })
    }).catch(e => console.error('Failed to save config to server', e));
}

const routeContainer = document.getElementById('route-container');
const citySelector = document.getElementById('city-selector');
const totalDistanceEl = document.getElementById('total-distance');
const totalElevationEl = document.getElementById('total-elevation');
const distanceBreakdownEl = document.getElementById('distance-breakdown');

// Services
let directionsService;
let elevationService;

function initSidebar() {
    citySelector.innerHTML = '';
    let dayNum = 1;
    cities.forEach((cityObj, index) => {
        const item = document.createElement('div');
        item.className = 'city-item';
        item.draggable = true;
        item.dataset.index = index;
        
        // Drag Events
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('dragend', handleDragEnd);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedCities.includes(cityObj.name);
        
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedCities = cities
                    .filter(c => c.name === cityObj.name || selectedCities.includes(c.name))
                    .map(c => c.name);
            } else {
                selectedCities = selectedCities.filter(name => name !== cityObj.name);
            }
            saveData();
            renderAll();
        });
        
        const label = document.createElement('span');
        label.className = 'city-label';
        if (cityObj.is_sleep) {
            const d = dayNum++;
            label.innerHTML = `💤 DAY ${d} <span id="sidebar-day-stats-${d}" class="sidebar-day-dist"></span>`;
        } else {
            label.textContent = cityObj.name;
        }
        label.title = cityObj.name;

        // Inline Name Edit
        if (!cityObj.is_sleep) {
            label.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const editInput = document.createElement('input');
                editInput.type = 'text';
                editInput.className = 'city-edit-input';
                editInput.value = cityObj.name;
                
                const finishEdit = () => {
                    const newVal = editInput.value.trim();
                    if (newVal && newVal !== cityObj.name) {
                        const oldName = cityObj.name;
                        // Check if we already have a city with the same name
                        if (cities.some((c, i) => i !== index && c.name === newVal)) {
                            editInput.replaceWith(label);
                            return;
                        }
                        cityObj.name = newVal;
                        // Update labels in selectedCities too
                        selectedCities = selectedCities.map(name => name === oldName ? newVal : name);
                        saveData();
                        initSidebar();
                        renderAll();
                    } else {
                        editInput.replaceWith(label);
                    }
                };

                editInput.onkeydown = (e) => {
                    if (e.key === 'Enter') finishEdit();
                    if (e.key === 'Escape') editInput.replaceWith(label);
                };
                
                editInput.onblur = finishEdit;
                label.replaceWith(editInput);
                editInput.focus();
                editInput.select();
            });
        }

        // Transport Selector (only for cities)
        if (!cityObj.is_sleep) {
            const transport = document.createElement('select');
            transport.className = 'transport-select';
            ['bike', 'ferry', 'train'].forEach(type => {
                const opt = document.createElement('option');
                opt.value = type;
                opt.textContent = type;
                if (cityObj.transport === type) opt.selected = true;
                transport.appendChild(opt);
            });
            transport.addEventListener('change', (e) => {
                cityObj.transport = e.target.value;
                saveData();
                renderAll();
            });
            item.append(checkbox, label, transport);
        } else {
            item.classList.add('sleep-item');
            const nightType = document.createElement('select');
            nightType.className = 'night-type-select';
            ['warmshowers', 'hotel', 'airbnb', 'friend'].forEach(type => {
                const opt = document.createElement('option');
                opt.value = type;
                opt.textContent = type;
                if (cityObj.night_type === type) opt.selected = true;
                nightType.appendChild(opt);
            });
            nightType.addEventListener('change', (e) => {
                cityObj.night_type = e.target.value;
                saveData();
                renderAll();
            });
            item.append(label, nightType);
        }

        const controls = document.createElement('div');
        controls.className = 'city-controls';
        
        // Add Sleep After
        const addSleepBtn = document.createElement('button');
        addSleepBtn.className = 'control-btn add-after';
        addSleepBtn.innerHTML = '+💤';
        addSleepBtn.title = 'Add Sleep after this';
        addSleepBtn.onclick = (e) => {
            e.stopPropagation();
            addSleepAt(index);
        };

        // Add City After
        const addCityBtn = document.createElement('button');
        addCityBtn.className = 'control-btn add-after';
        addCityBtn.innerHTML = '+🏠';
        addCityBtn.title = 'Add City after this';
        addCityBtn.onclick = (e) => {
            e.stopPropagation();
            showInlineAddCity(index, item);
        };

        // Delete
        const delBtn = document.createElement('button');
        delBtn.className = 'control-btn delete';
        delBtn.innerHTML = '✕';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            removeCity(index);
        };

        controls.append(addCityBtn, addSleepBtn, delBtn);
        item.append(controls);
        citySelector.appendChild(item);
    });
}

function showInlineAddCity(index, parentItem) {
    // Remove any existing inline inputs first
    const existing = document.querySelector('.inline-add-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.className = 'inline-add-container';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter city name...';
    input.className = 'inline-add-input';
    
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'control-btn confirm';
    confirmBtn.innerHTML = '✓';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'control-btn cancel';
    cancelBtn.innerHTML = '✕';
    
    const handleAdd = () => {
        const val = input.value.trim();
        if (val) {
            addCityAt(index + 1, val);
        } else {
            container.remove();
        }
    };
    
    confirmBtn.onclick = (e) => {
        e.stopPropagation();
        handleAdd();
    };
    
    cancelBtn.onclick = (e) => {
        e.stopPropagation();
        container.remove();
    };
    
    input.onkeypress = (e) => {
        if (e.key === 'Enter') handleAdd();
        if (e.key === 'Escape') container.remove();
    };
    
    container.append(input, confirmBtn, cancelBtn);
    parentItem.after(container);
    input.focus();
}

function addCityAt(index, name) {
    if (name && !cities.find(c => c.name === name)) {
        const newCity = { name: name, transport: 'bike' };
        cities.splice(index, 0, newCity);
        selectedCities.push(name);
        saveData();
        initSidebar();
        renderAll();
    }
}

function addSleepAt(index) {
    const id = Date.now();
    const sleepMark = { name: `Sleep_${id}`, is_sleep: true, night_type: 'warmshowers' };
    cities.splice(index + 1, 0, sleepMark);
    saveData();
    initSidebar();
    renderAll();
}

let draggedItemIndex = null;

function handleDragStart(e) {
    draggedItemIndex = parseInt(this.dataset.index);
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Calculate if we should insert above or below
    const rect = this.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    
    this.classList.remove('over-top', 'over-bottom');
    if (e.clientY < midPoint) {
        this.classList.add('over-top');
    } else {
        this.classList.add('over-bottom');
    }
}

function handleDragEnter(e) {
    // Just visual feedback
}

function handleDragLeave(e) {
    this.classList.remove('over-top', 'over-bottom');
}

function handleDrop(e) {
    e.preventDefault();
    const targetIndex = parseInt(this.dataset.index);
    const rect = this.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const insertAfter = e.clientY >= midPoint;
    
    let toIndex;
    if (insertAfter) {
        toIndex = (draggedItemIndex < targetIndex) ? targetIndex : targetIndex + 1;
    } else {
        toIndex = (draggedItemIndex < targetIndex) ? targetIndex - 1 : targetIndex;
    }
    
    toIndex = Math.max(0, Math.min(toIndex, cities.length));

    if (draggedItemIndex !== toIndex) {
        reorderCities(draggedItemIndex, toIndex);
    }
    this.classList.remove('over-top', 'over-bottom');
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    const items = document.querySelectorAll('.city-item');
    items.forEach(item => item.classList.remove('over-top', 'over-bottom'));
}

function reorderCities(fromIndex, toIndex) {
    const item = cities.splice(fromIndex, 1)[0];
    cities.splice(toIndex, 0, item);
    saveData();
    initSidebar();
    renderAll();
}

function addCity() {
    const input = document.getElementById('new-city-input');
    const val = input.value.trim();
    if (val && !cities.find(c => c.name === val)) {
        const newCity = { name: val, transport: 'bike' };
        cities.push(newCity);
        selectedCities.push(val);
        input.value = '';
        saveData();
        initSidebar();
        renderAll();
    }
}

function addSleep() {
    const id = Date.now();
    const sleepMark = { name: `Sleep_${id}`, is_sleep: true, night_type: 'warmshowers' };
    cities.push(sleepMark);
    saveData();
    initSidebar();
    renderAll();
}

function removeCity(index) {
    const cityObj = cities[index];
    cities.splice(index, 1);
    if (!cityObj.is_sleep) {
        selectedCities = selectedCities.filter(name => name !== cityObj.name);
    }
    saveData();
    initSidebar();
    renderAll();
}

async function renderAll() {
    routeContainer.innerHTML = '';
    const overviewContainer = document.getElementById('overview-map');
    const totalDaysEl = document.getElementById('total-days');
    overviewContainer.innerHTML = '';
    
    let grandTotalElevation = 0;
    const totalsByTransport = { bike: 0, ferry: 0, train: 0 };

    const activeRoute = cities.filter(c => c.is_sleep || selectedCities.includes(c.name));

    if (activeRoute.length >= 2) {
        renderMultiModeOverview(activeRoute);
    }

    let currentDayGroup = null;
    let currentDay = 1;
    let cumulativeBikeDistance = 0;
    let cumulativeTotalDistance = 0;
    
    let activeDayStats = {
        dist: null,
        elev: null,
        cum: null,
        bikeDist: 0,
        elevGain: 0
    };

    let lastCityObj = null;
    let initialCityShown = false;

    // Helper to start a new day group
    const startNewDay = (dayNum, nightType = null) => {
        const group = document.createElement('div');
        group.className = 'day-group';
        
        const header = document.createElement('div');
        header.className = 'day-header';
        
        const labelContainer = document.createElement('div');
        labelContainer.style.display = 'flex';
        labelContainer.style.alignItems = 'center';
        labelContainer.style.gap = '0.5rem';

        const label = document.createElement('span');
        label.className = 'day-label';
        label.textContent = `Day ${dayNum}`;
        
        labelContainer.appendChild(label);

        if (nightType) {
            const emojiMap = {
                'warmshowers': '🚿',
                'hotel': '🏨',
                'airbnb': '🏠',
                'friend': '🤝'
            };
            const nightBadge = document.createElement('span');
            nightBadge.className = 'night-type-badge';
            nightBadge.textContent = `${emojiMap[nightType] || '💤'} ${nightType}`;
            labelContainer.appendChild(nightBadge);
        }

        header.appendChild(labelContainer);
        
        const statsContainer = document.createElement('div');
        statsContainer.className = 'day-stats';
        
        const distItem = document.createElement('div');
        distItem.className = 'day-stat-item';
        const dayBikeDistVal = document.createElement('span');
        dayBikeDistVal.className = 'day-stat-value';
        dayBikeDistVal.textContent = '0.0 km';
        const distLabel = document.createElement('span');
        distLabel.className = 'day-stat-label';
        distLabel.textContent = 'Day Dist';
        distItem.append(dayBikeDistVal, distLabel);
        
        const elevItem = document.createElement('div');
        elevItem.className = 'day-stat-item';
        const dayElevVal = document.createElement('span');
        dayElevVal.className = 'day-stat-value';
        dayElevVal.textContent = '0 m';
        const elevLabel = document.createElement('span');
        elevLabel.className = 'day-stat-label';
        elevLabel.textContent = 'Elevation';
        elevItem.append(dayElevVal, elevLabel);
        
        const cumItem = document.createElement('div');
        cumItem.className = 'day-stat-item';
        const dayCumDistVal = document.createElement('span');
        dayCumDistVal.className = 'cumulative-badge';
        dayCumDistVal.textContent = `Total: ${(cumulativeBikeDistance / 1000).toFixed(1)} km`;
        cumItem.append(dayCumDistVal);

        statsContainer.append(distItem, elevItem, cumItem);
        header.appendChild(statsContainer);
        group.appendChild(header);
        routeContainer.appendChild(group);

        return {
            group,
            stats: {
                dist: dayBikeDistVal,
                elev: dayElevVal,
                cum: dayCumDistVal,
                bikeDist: 0,
                elevGain: 0
            },
            journeyShown: false
        };
    };

    let dayData = startNewDay(currentDay);
    currentDayGroup = dayData.group;
    activeDayStats = dayData.stats;

    let dayLegs = [];

    for (let i = 0; i < activeRoute.length; i++) {
        const item = activeRoute[i];
        
        if (item.is_sleep) {
            // Update sidebar indicator for this day
            const sidebarDayEl = document.getElementById(`sidebar-day-stats-${currentDay}`);
            if (sidebarDayEl) {
                const km = activeDayStats.bikeDist / 1000;
                sidebarDayEl.textContent = `(${km.toFixed(1)} km)`;
                sidebarDayEl.className = 'sidebar-day-dist ' + getDistanceColorClass(km);
            }

            if (dayLegs.length > 0) {
                await renderDayMap(currentDayGroup, dayLegs);
            }
            dayLegs = [];
            currentDay++;
            dayData = startNewDay(currentDay, item.night_type);
            currentDayGroup = dayData.group;
            activeDayStats = dayData.stats;
            continue;
        }

        const cityObj = item;
        
        // Find the last city of THIS day to show exactly what this day covers
        let dayEndCity = cityObj;
        for (let j = i; j < activeRoute.length; j++) {
            if (activeRoute[j].is_sleep) break;
            if (!activeRoute[j].is_sleep) dayEndCity = activeRoute[j];
        }

        // Render card: "A to B" for each day
        if (!dayData.journeyShown) {
            const startCard = document.createElement('div');
            startCard.className = 'city-card day-summary-card';
            const startName = document.createElement('h2');
            startName.className = 'city-name';
            const fromCity = lastCityObj ? lastCityObj.name : cityObj.name;
            startName.textContent = `${fromCity} ➔ ${dayEndCity.name}`;
            startCard.appendChild(startName);
            currentDayGroup.appendChild(startCard);
            dayData.journeyShown = true;
        }

        if (lastCityObj) {
            const transport = lastCityObj.transport || 'bike';
            const result = await requestDirections(lastCityObj.name, cityObj.name, transport);
            
            if (result) {
                const leg = result.routes[0].legs[0];
                const distance = leg.distance.value;
                totalsByTransport[transport] = (totalsByTransport[transport] || 0) + distance;

                let elevationGain = 0;
                if (transport !== 'train') {
                    elevationGain = await calculateElevation(result.routes[0].overview_path);
                    grandTotalElevation += elevationGain;
                }

                if (transport === 'bike') {
                    activeDayStats.bikeDist += distance;
                    activeDayStats.elevGain += elevationGain;
                    cumulativeBikeDistance += distance;
                }
                
                cumulativeTotalDistance += distance;

                const km = activeDayStats.bikeDist / 1000;
                activeDayStats.dist.textContent = `${km.toFixed(1)} km`;
                activeDayStats.dist.className = 'day-stat-value ' + getDistanceColorClass(km);
                activeDayStats.elev.textContent = `${Math.round(activeDayStats.elevGain)} m`;
                activeDayStats.cum.textContent = `Total: ${(cumulativeBikeDistance / 1000).toFixed(1)} km`;

                renderLegStats(currentDayGroup, { distance, elevationGain }, transport, lastCityObj.name, cityObj.name, cumulativeBikeDistance / 1000);
                dayLegs.push({ result, transport });
            } else {
                renderLegStats(currentDayGroup, null, transport, lastCityObj.name, cityObj.name, cumulativeBikeDistance / 1000);
            }
        }
        
        // Render final destination card only if it's the last selected city in the whole route
        const lastSelectedCity = activeRoute.slice().reverse().find(c => !c.is_sleep);
        if (cityObj === lastSelectedCity) {
            const cityCard = document.createElement('div');
            cityCard.className = 'city-card final-destination';
            const cityName = document.createElement('h2');
            cityName.className = 'city-name';
            cityName.textContent = `🏁 Final Destination: ${cityObj.name}`;
            cityCard.appendChild(cityName);
            currentDayGroup.appendChild(cityCard);
        }

        lastCityObj = cityObj;
    }

    if (dayLegs.length > 0) {
        await renderDayMap(currentDayGroup, dayLegs);
    }

    totalDistanceEl.textContent = `${(totalsByTransport.bike / 1000).toFixed(1)} km`;
    totalElevationEl.textContent = `${Math.round(grandTotalElevation)} m`;
    totalDaysEl.textContent = currentDay;
    distanceBreakdownEl.innerHTML = '';
}

async function renderDayMap(container, legs) {
    const mapWidget = document.createElement('div');
    mapWidget.className = 'map-widget day-map';
    mapWidget.style.height = '400px';
    container.appendChild(mapWidget);

    // Maximize Button
    const maxBtn = document.createElement('button');
    maxBtn.className = 'maximize-btn';
    maxBtn.innerHTML = '⛶';
    maxBtn.onclick = () => toggleMaximize(mapWidget);
    mapWidget.appendChild(maxBtn);

    const { Map } = await google.maps.importLibrary("maps");
    const map = new Map(mapWidget, {
        zoom: 7,
        mapTypeId: google.maps.MapTypeId.TERRAIN,
        disableDefaultUI: true,
        zoomControl: true,
        scrollwheel: false
    });

    const bounds = new google.maps.LatLngBounds();

    for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        if (leg.result) {
            new google.maps.DirectionsRenderer({
                map: map,
                directions: leg.result,
                preserveViewport: true,
                suppressMarkers: i > 0 && i < legs.length - 1,
                polylineOptions: {
                    strokeColor: leg.transport === 'train' ? '#94a3b8' : '#f43f5e',
                    strokeOpacity: 0.8,
                    strokeWeight: 5
                }
            });
            const steps = leg.result.routes[0].legs[0];
            bounds.extend(steps.start_location);
            bounds.extend(steps.end_location);
        }
    }

    if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
    }
}

function renderMultiModeOverview(route) {
    const container = document.getElementById('overview-map');
    initMultiModeMap(container, route);
}

async function initMultiModeMap(container, route) {
    const { Map } = await google.maps.importLibrary("maps");
    
    const map = new Map(container, {
        center: { lat: 50, lng: 5 },
        zoom: 5,
        mapTypeId: google.maps.MapTypeId.TERRAIN, 
        fullscreenControl: true
    });

    // Add UI components after Map init (so they aren't cleared)
    const maxBtn = document.createElement('button');
    maxBtn.className = 'maximize-btn';
    maxBtn.innerHTML = '⛶';
    maxBtn.title = 'Maximize Map';
    maxBtn.onclick = () => toggleMaximize(container);

    const bikeBtn = document.createElement('button');
    bikeBtn.className = 'bike-lane-btn';
    bikeBtn.innerHTML = '🚲';
    bikeBtn.title = 'Toggle Bike Lanes';

    const terrainBtn = document.createElement('button');
    terrainBtn.className = 'terrain-btn';
    terrainBtn.innerHTML = '⛰️';
    terrainBtn.title = 'Toggle Terrain View';
    terrainBtn.classList.add('active');

    container.append(maxBtn, bikeBtn, terrainBtn);

    // Setup Biking Layer
    const { BicyclingLayer } = await google.maps.importLibrary("maps");
    const bikeLayer = new BicyclingLayer();
    let bikeLayerVisible = false;

    bikeBtn.onclick = () => {
        bikeLayerVisible = !bikeLayerVisible;
        bikeLayer.setMap(bikeLayerVisible ? map : null);
        bikeBtn.classList.toggle('active', bikeLayerVisible);
    };

    terrainBtn.onclick = () => {
        const isTerrain = map.getMapTypeId() === google.maps.MapTypeId.TERRAIN;
        map.setMapTypeId(isTerrain ? google.maps.MapTypeId.ROADMAP : google.maps.MapTypeId.TERRAIN);
        terrainBtn.classList.toggle('active', !isTerrain);
    };

    const bounds = new google.maps.LatLngBounds();

    const overviewCities = route.filter(c => !c.is_sleep);
    for (let i = 0; i < overviewCities.length - 1; i++) {
        const start = overviewCities[i];
        const end = overviewCities[i+1];
        const transport = start.transport || 'bike';
        
        const result = await requestDirections(start.name, end.name, transport);
        if (result) {
            new google.maps.DirectionsRenderer({
                map: map,
                directions: result,
                preserveViewport: true,
                suppressMarkers: i > 0 && i < route.length - 1,
                polylineOptions: {
                    strokeColor: transport === 'train' ? '#94a3b8' : '#f43f5e',
                    strokeOpacity: 0.8,
                    strokeWeight: 5
                }
            });

            const leg = result.routes[0].legs[0];
            bounds.extend(leg.start_location);
            bounds.extend(leg.end_location);
        }
    }

    if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
    }
}

function toggleMaximize(element) {
    const isMaximized = element.classList.toggle('maximized');
    document.body.classList.toggle('overlay-active', isMaximized);
    
    // Re-trigger window resize event for Google Maps to adjust
    window.dispatchEvent(new Event('resize'));
}

async function requestDirections(origin, destination, transportType) {
    if (!google || !google.maps || !google.maps.DirectionsService) return null;
    
    if (!directionsService) directionsService = new google.maps.DirectionsService();
    
    let travelMode = google.maps.TravelMode.BICYCLING;
    if (transportType === 'train') travelMode = google.maps.TravelMode.TRANSIT;

    return new Promise((resolve) => {
        directionsService.route({
            origin: origin,
            destination: destination,
            travelMode: travelMode
        }, (result, status) => {
            if (status === google.maps.DirectionsStatus.OK) {
                resolve(result);
            } else {
                resolve(null);
            }
        });
    });
}

async function calculateElevation(path) {
    if (!google || !google.maps || !google.maps.ElevationService) return 0;
    if (!elevationService) elevationService = new google.maps.ElevationService();
    
    return new Promise((resolve) => {
        elevationService.getElevationAlongPath({
            path: path,
            samples: 50
        }, (elevations, eStatus) => {
            let gain = 0;
            if (eStatus === google.maps.ElevationStatus.OK) {
                for (let j = 1; j < elevations.length; j++) {
                    const diff = elevations[j].elevation - elevations[j-1].elevation;
                    if (diff > 0) gain += diff;
                }
            }
            resolve(gain);
        });
    });
}

function getDistanceColorClass(distKm) {
    if (distKm < 100) return 'status-green';
    if (distKm < 150) return 'status-orange';
    if (distKm < 180) return 'status-red';
    return 'status-darkred';
}

function getTransportEmoji(transportType) {
    switch (transportType) {
        case 'bike': return '🚲';
        case 'train': return '🚆';
        case 'ferry': return '⛴️';
        case 'transit': return '🚌';
        default: return '📍';
    }
}

function renderLegStats(container, data, transportType, origin, destination, cumulativeBike) {
    const segmentDiv = document.createElement('div');
    segmentDiv.className = 'route-segment';
    
    const emoji = getTransportEmoji(transportType);
    const title = document.createElement('h2');
    title.className = 'segment-title';
    title.textContent = `${emoji} ${origin} to ${destination}`;
    segmentDiv.appendChild(title);
    
    if (data) {
        const distKm = data.distance / 1000;
        const colorClass = transportType === 'bike' ? getDistanceColorClass(distKm) : '';
        
        const statsBar = document.createElement('div');
        statsBar.className = 'segment-stats-bar';
        
        const elevationContent = transportType === 'train' ? '' : `
            <div class="seg-stat">
                <span class="seg-label">ELEVATION</span>
                <span class="seg-value">${Math.round(data.elevationGain)} m</span>
            </div>
        `;

        statsBar.innerHTML = `
            <div class="seg-stat ${colorClass}">
                <span class="seg-label">${transportType.toUpperCase()} DIST</span>
                <span class="seg-value">${distKm.toFixed(1)} km</span>
            </div>
            ${elevationContent}
            <div class="seg-stat total">
                <span class="seg-label">CUMULATIVE BIKE</span>
                <span class="seg-value">${cumulativeBike.toFixed(1)} km</span>
            </div>
        `;
        segmentDiv.appendChild(statsBar);
    }

    container.appendChild(segmentDiv);
}

async function init() {
    await loadData();
    initSidebar();
    
    document.getElementById('add-city-btn').addEventListener('click', addCity);
    document.getElementById('add-sleep-btn').addEventListener('click', addSleep);
    document.getElementById('new-city-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addCity();
    });

    document.getElementById('select-all').addEventListener('click', () => {
        selectedCities = cities.map(c => c.name);
        saveData();
        initSidebar(); 
        renderAll();
    });

    document.getElementById('deselect-all').addEventListener('click', () => {
        selectedCities = [];
        saveData();
        initSidebar();
        renderAll();
    });

    try {
        const { DirectionsService } = await google.maps.importLibrary("routes");
        const { ElevationService } = await google.maps.importLibrary("elevation");
        directionsService = new DirectionsService();
        elevationService = new ElevationService();
    } catch (e) {
        console.error("Failed to load Google Maps libraries:", e);
    }
    
    renderAll();
    initResizer();
}

function initResizer() {
    const resizer = document.getElementById('resizer');
    const sidebar = document.querySelector('.sidebar');
    
    // Load saved width
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
        sidebar.style.width = savedWidth + 'px';
    }

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        resizer.classList.add('dragging');
        
        const startX = e.clientX;
        const startWidth = sidebar.offsetWidth;

        function onMouseMove(e) {
            const width = startWidth + (e.clientX - startX);
            if (width > 150 && width < 800) {
                sidebar.style.width = width + 'px';
                localStorage.setItem('sidebarWidth', width);
                // Trigger resize for maps
                window.dispatchEvent(new Event('resize'));
            }
        }

        function onMouseUp() {
            resizer.classList.remove('dragging');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

document.addEventListener('DOMContentLoaded', init);