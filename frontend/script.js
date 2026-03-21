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
    cities = DEFAULT_CITIES.map(c => ({ name: c, transport: 'bike' }));
    selectedCities = cities.map(c => c.name);
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
        label.textContent = cityObj.name;
        label.title = cityObj.name;

        // Transport Selector
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

        const controls = document.createElement('div');
        controls.className = 'city-controls';
        
        // Delete
        const delBtn = document.createElement('button');
        delBtn.className = 'control-btn delete';
        delBtn.innerHTML = '✕';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            removeCity(index);
        };

        controls.append(delBtn);
        item.append(checkbox, label, transport, controls);
        citySelector.appendChild(item);
    });
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

function removeCity(index) {
    const cityObj = cities[index];
    cities.splice(index, 1);
    selectedCities = selectedCities.filter(name => name !== cityObj.name);
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

    const activeRoute = cities.filter(c => selectedCities.includes(c.name));

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

    for (let i = 0; i < activeRoute.length; i++) {
        const cityObj = activeRoute[i];
        
        // Start a new day group if it's the first city or if the transport to here was 'bike'
        if (i === 0 || activeRoute[i-1].transport === 'bike') {
            if (i > 0) currentDay++;
            
            currentDayGroup = document.createElement('div');
            currentDayGroup.className = 'day-group';
            
            const header = document.createElement('div');
            header.className = 'day-header';
            
            const label = document.createElement('span');
            label.className = 'day-label';
            label.textContent = `Day ${currentDay}`;
            header.appendChild(label);
            
            const statsContainer = document.createElement('div');
            statsContainer.className = 'day-stats';
            
            // Bike Distance
            const distItem = document.createElement('div');
            distItem.className = 'day-stat-item';
            const dayBikeDistVal = document.createElement('span');
            dayBikeDistVal.className = 'day-stat-value';
            dayBikeDistVal.textContent = '0.0 km';
            const distLabel = document.createElement('span');
            distLabel.className = 'day-stat-label';
            distLabel.textContent = 'Day Dist';
            distItem.append(dayBikeDistVal, distLabel);
            
            // Elevation
            const elevItem = document.createElement('div');
            elevItem.className = 'day-stat-item';
            const dayElevVal = document.createElement('span');
            dayElevVal.className = 'day-stat-value';
            dayElevVal.textContent = '0 m';
            const elevLabel = document.createElement('span');
            elevLabel.className = 'day-stat-label';
            elevLabel.textContent = 'Elevation';
            elevItem.append(dayElevVal, elevLabel);
            
            // Cumulative
            const cumItem = document.createElement('div');
            cumItem.className = 'day-stat-item';
            const dayCumDistVal = document.createElement('span');
            dayCumDistVal.className = 'cumulative-badge';
            dayCumDistVal.textContent = `Total: ${(cumulativeBikeDistance / 1000).toFixed(1)} km`;
            cumItem.append(dayCumDistVal);

            statsContainer.append(distItem, elevItem, cumItem);
            header.appendChild(statsContainer);
            currentDayGroup.appendChild(header);
            routeContainer.appendChild(currentDayGroup);

            // Update activeDayStats to point to these new elements
            activeDayStats = {
                dist: dayBikeDistVal,
                elev: dayElevVal,
                cum: dayCumDistVal,
                bikeDist: 0,
                elevGain: 0
            };
        }

        // City cards are now effectively handled as part of the segment title or final destination
        // We'll only render the final destination city if it's the end of the route
        if (i === activeRoute.length - 1) {
            const cityCard = document.createElement('div');
            cityCard.className = 'city-card final-destination';
            const cityName = document.createElement('h2');
            cityName.className = 'city-name';
            cityName.textContent = `🏁 Final Destination: ${cityObj.name}`;
            cityCard.appendChild(cityName);
            currentDayGroup.appendChild(cityCard);
        }

        if (i < activeRoute.length - 1) {
            const nextCityObj = activeRoute[i + 1];
            const transport = cityObj.transport || 'bike';
            const result = await requestDirections(cityObj.name, nextCityObj.name, transport);
            
            if (result) {
                const leg = result.routes[0].legs[0];
                const distance = leg.distance.value;
                totalsByTransport[transport] += distance;

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

                renderMapSegment(currentDayGroup, { distance, elevationGain }, transport, cityObj.name, nextCityObj.name, cumulativeBikeDistance / 1000);
            } else {
                renderMapSegment(currentDayGroup, null, transport, cityObj.name, nextCityObj.name, cumulativeBikeDistance / 1000);
            }
        }
    }

    totalDistanceEl.textContent = `${(totalsByTransport.bike / 1000).toFixed(1)} km`;
    totalElevationEl.textContent = `${Math.round(grandTotalElevation)} m`;
    totalDaysEl.textContent = currentDay;
    distanceBreakdownEl.innerHTML = '';
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

    for (let i = 0; i < route.length - 1; i++) {
        const start = route[i];
        const end = route[i+1];
        const transport = start.transport || 'bike';
        
        const result = await requestDirections(start.name, end.name, transport);
        if (result) {
            new google.maps.DirectionsRenderer({
                map: map,
                directions: result,
                preserveViewport: true,
                suppressMarkers: i > 0 && i < route.length - 1,
                polylineOptions: {
                    strokeColor: transport === 'train' ? '#94a3b8' : '#38bdf8',
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

function renderMapSegment(container, data, transportType, origin, destination, cumulativeBike) {
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

    const mapWidget = document.createElement('div');
    mapWidget.className = 'map-widget';
    
    // Add Maximize Button
    const maxBtn = document.createElement('button');
    maxBtn.className = 'maximize-btn';
    maxBtn.innerHTML = '⛶';
    maxBtn.title = 'Maximize Map';
    maxBtn.onclick = () => toggleMaximize(mapWidget);
    mapWidget.appendChild(maxBtn);

    const API_KEY = window.CONFIG?.GOOGLE_MAPS_API_KEY;
    const encodedOrigin = encodeURIComponent(origin);
    const encodedDest = encodeURIComponent(destination);
    
    let mode = 'bicycling';
    if (transportType === 'train') mode = 'transit';
    
    const src = `https://www.google.com/maps/embed/v1/directions?key=${API_KEY}&origin=${encodedOrigin}&destination=${encodedDest}&mode=${mode}&units=metric`;
    
    const iframe = document.createElement('iframe');
    iframe.width = "100%";
    iframe.height = "450";
    iframe.style.border = "0";
    iframe.src = src; 
    iframe.loading = "lazy";
    iframe.allowFullscreen = true; 
    
    mapWidget.appendChild(iframe);
    segmentDiv.appendChild(mapWidget);
    container.appendChild(segmentDiv);
}

async function init() {
    await loadData();
    initSidebar();
    
    document.getElementById('add-city-btn').addEventListener('click', addCity);
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
}

document.addEventListener('DOMContentLoaded', init);