let days = [];
let selectedCities = []; // Store names of selected cities
let activeDayIndex = 'all'; // State for which day is currently showing ('all' for whole trip)

let projects = [];
let currentProjectId = null;

const DEFAULT_CITIES = [
    "London (UK)", "Harwich (UK)", "Hook of Holland (NL)", "Nijmegen (NL)",
    "Düsseldorf (DE)", "Koblenz (DE)", "Speyer (DE)", "Strasbourg (FR)",
    "Basel (CH)", "Bad Zurzach (CH)", "Chur (CH)", "Andermatt (CH)",
    "Brig (CH)", "Chamonix (FR)", "Annecy (FR)", "Lyon (FR)"
];

function migrateToDays(flatList) {
    let newDays = [];
    let currentCities = [];
    let dayIndex = 1;
    for (let item of flatList) {
        if (item.is_sleep) {
            newDays.push({
                id: `day_${Date.now()}_${dayIndex++}`,
                collapsed: false,
                cities: currentCities,
                night_type: item.night_type || 'warmshowers'
            });
            currentCities = [];
        } else {
            currentCities.push({ name: item.name, transport: item.transport || 'bike' });
        }
    }
    if (currentCities.length > 0) {
        newDays.push({
            id: `day_${Date.now()}_${dayIndex++}`,
            collapsed: false,
            cities: currentCities,
            night_type: 'unknown'
        });
    }
    return newDays;
}

async function loadData() {
    try {
        // First load projects
        const projResponse = await fetch('/api/projects');
        if (projResponse.ok) {
            projects = await projResponse.json();
            renderProjectSelector();
            
            // Default to first project if none selected
            if (currentProjectId === null && projects.length > 0) {
                currentProjectId = projects[0].id;
                document.getElementById('project-select').value = currentProjectId;
            }
        }

        if (currentProjectId !== null) {
            const response = await fetch(`/api/projects/${currentProjectId}/route`);
            if (response.ok) {
                const data = await response.json();
                if (data.cities && (data.cities.length > 0 || Array.isArray(data.cities))) {
                    if (data.cities.length > 0 && data.cities[0] && (data.cities[0].is_sleep !== undefined || data.cities[0].cities === undefined)) {
                        days = migrateToDays(data.cities);
                    } else {
                        days = data.cities || []; 
                    }
                    selectedCities = data.selected_cities || [];
                    return;
                }
            }
        }
    } catch (e) {
        console.warn('Failed to load data from server', e);
        
        // Fallback if no server data or error
        days = [];
        let currentDayCities = [];
        let defaultCitiesMap = DEFAULT_CITIES.map(name => ({name, transport: 'bike'}));
        
        defaultCitiesMap.forEach((city, i) => {
            currentDayCities.push(city);
            if (i > 0) {
                days.push({
                    id: `day_${Date.now()}_${i}`,
                    collapsed: false,
                    cities: currentDayCities,
                    night_type: 'warmshowers'
                });
                currentDayCities = [];
            }
        });
        if (currentDayCities.length > 0) {
            days.push({
                id: `day_${Date.now()}_end`,
                collapsed: false,
                cities: currentDayCities,
                night_type: 'warmshowers'
            });
        }
        selectedCities = DEFAULT_CITIES;
    }
    
    // Ensure at least one day exists for any project
    if (days.length === 0) {
        days.push({
            id: `day_${Date.now()}`,
            collapsed: false,
            cities: [],
            night_type: 'warmshowers'
        });
        selectedCities = [];
    }
}

function saveData() {
    if (currentProjectId === null) return;
    
    fetch(`/api/projects/${currentProjectId}/route`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cities: days, selected_cities: selectedCities })
    }).catch(e => console.error('Failed to save config to server', e));
}

function renderProjectSelector() {
    const select = document.getElementById('project-select');
    if (!select) return;
    
    select.innerHTML = '';
    projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === currentProjectId) opt.selected = true;
        select.appendChild(opt);
    });

    // Update Header Title
    const currentProject = projects.find(p => p.id === currentProjectId);
    if (currentProject) {
        document.getElementById('project-title').textContent = currentProject.name;
        document.getElementById('project-description').textContent = currentProject.description || 'Tracking the journey';
        document.title = `${currentProject.name} - Bike Trip Route`;
    }
}

async function createNewProject() {
    openProjectModal('create');
}

function openProjectModal(mode, projectId = null) {
    const modal = document.getElementById('project-modal');
    const title = document.getElementById('modal-title');
    const nameInput = document.getElementById('modal-project-name');
    const descInput = document.getElementById('modal-project-desc');
    const saveBtn = document.getElementById('modal-save');
    
    modal.dataset.mode = mode;
    modal.dataset.projectId = projectId;
    
    if (mode === 'create') {
        title.textContent = 'Create New Trip';
        nameInput.value = '';
        descInput.value = '';
        saveBtn.textContent = 'Save Trip';
    } else {
        const project = projects.find(p => p.id === projectId);
        title.textContent = 'Rename Trip';
        nameInput.value = project.name;
        descInput.value = project.description || '';
        saveBtn.textContent = 'Update Trip';
    }
    
    modal.classList.add('active');
    nameInput.focus();
}

function closeProjectModal() {
    document.getElementById('project-modal').classList.remove('active');
}

async function handleProjectSave() {
    const modal = document.getElementById('project-modal');
    const mode = modal.dataset.mode;
    const projectId = modal.dataset.projectId;
    const name = document.getElementById('modal-project-name').value.trim();
    const description = document.getElementById('modal-project-desc').value.trim();
    
    if (!name) return;
    
    try {
        if (mode === 'create') {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description })
            });
            
            if (response.ok) {
                const result = await response.json();
                currentProjectId = result.id;
                days = [];
                selectedCities = [];
                activeDayIndex = 'all';
            }
        } else {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description })
            });
        }
        
        await loadData();
        initSidebar();
        renderAll();
        closeProjectModal();
    } catch (e) {
        console.error('Failed to save project', e);
    }
}

async function deleteCurrentProject() {
    if (currentProjectId === null) return;
    
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) return;
    
    if (confirm(`Are you sure you want to delete the trip "${project.name}"? This cannot be undone.`)) {
        try {
            const response = await fetch(`/api/projects/${currentProjectId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                currentProjectId = null;
                days = [];
                selectedCities = [];
                activeDayIndex = 'all';
                await loadData();
                initSidebar();
                renderAll();
            }
        } catch (e) {
            console.error('Failed to delete project', e);
        }
    }
}

const routeContainer = document.getElementById('route-container');
const citySelector = document.getElementById('city-selector');
const totalDistanceEl = document.getElementById('total-distance');
const totalElevationEl = document.getElementById('total-elevation');
const distanceBreakdownEl = document.getElementById('distance-breakdown');

// Services
let directionsService;
let elevationService;
const directionsCache = new Map();
const elevationCache = new Map();

function initSidebar() {
    citySelector.innerHTML = '';
    
    days.forEach((dayObj, dayIndex) => {
        const dayNum = dayIndex + 1;
        const dayContainer = document.createElement('div');
        dayContainer.className = 'day-container';
        if (dayObj.collapsed) dayContainer.classList.add('collapsed');
        if (dayIndex === activeDayIndex) dayContainer.classList.add('active-day-sidebar');
        
        // Day Header
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header-sidebar';
        dayHeader.draggable = true;
        dayHeader.dataset.dayIndex = dayIndex;
        
        dayHeader.addEventListener('dragstart', handleDayDragStart);
        dayHeader.addEventListener('dragover', handleDayDragOver);
        dayHeader.addEventListener('drop', handleDayDrop);
        dayHeader.addEventListener('dragleave', handleDayDragLeave);
        dayHeader.addEventListener('dragend', handleDayDragEnd);

        dayHeader.onclick = () => {
            activeDayIndex = dayIndex;
            initSidebar();
            renderAll();
        };
        
        const caret = document.createElement('span');
        caret.className = 'caret';
        caret.innerHTML = dayObj.collapsed ? '▶' : '▼';
        caret.onclick = (e) => {
            e.stopPropagation();
            dayObj.collapsed = !dayObj.collapsed;
            saveData();
            initSidebar();
        };

        const dayCheckbox = document.createElement('input');
        dayCheckbox.type = 'checkbox';
        dayCheckbox.style.cursor = 'pointer';
        
        const dayCities = dayObj.cities.map(c => c.name);
        const selectedInDay = dayCities.filter(name => selectedCities.includes(name));
        
        dayCheckbox.checked = selectedInDay.length > 0 && selectedInDay.length === dayCities.length;
        dayCheckbox.indeterminate = selectedInDay.length > 0 && selectedInDay.length < dayCities.length;
        
        dayCheckbox.onclick = (e) => {
            e.stopPropagation();
            const isChecked = e.target.checked;
            const allCitiesOrdered = days.map(d => d.cities).flat().map(c => c.name);
            
            if (isChecked) {
                // Add all cities of this day to the selection
                dayCities.forEach(name => {
                    if (!selectedCities.includes(name)) selectedCities.push(name);
                });
            } else {
                // Remove all cities of this day from selection
                selectedCities = selectedCities.filter(name => !dayCities.includes(name));
            }

            // Always re-sort selectedCities based on the actual global 'days' order
            selectedCities = allCitiesOrdered.filter(name => selectedCities.includes(name));

            saveData();
            initSidebar();
            renderAll();
        };
        
        const title = document.createElement('span');
        title.innerHTML = `<strong>Day ${dayNum}</strong> <span id="sidebar-day-stats-${dayNum}" class="sidebar-day-dist"></span>`;
        title.className = 'day-title-span';
        
        const delDayBtn = document.createElement('button');
        delDayBtn.className = 'control-btn delete';
        delDayBtn.innerHTML = '✕';
        delDayBtn.title = 'Delete Day';
        delDayBtn.onclick = (e) => {
            e.stopPropagation();
            if (days.length <= 1) {
                if (confirm('This is the last day. Clear all cities and reset this day?')) {
                    days[0].cities = [];
                    days[0].night_type = 'warmshowers';
                    selectedCities = [];
                    saveData();
                    initSidebar();
                    renderAll();
                }
                return;
            }
            if (confirm('Delete this entire day and its cities?')) {
                days.splice(dayIndex, 1);
                saveData();
                initSidebar();
                renderAll();
            }
        };
        
        const addDayAfterBtn = document.createElement('button');
        addDayAfterBtn.className = 'control-btn add-after';
        addDayAfterBtn.innerHTML = '+📅';
        addDayAfterBtn.title = 'Add New Day After';
        addDayAfterBtn.onclick = (e) => {
            e.stopPropagation();
            const id = Date.now();
            days.splice(dayIndex + 1, 0, { id: `day_${id}`, collapsed: false, cities: [], night_type: 'warmshowers' });
            saveData();
            initSidebar();
        };
        
        dayHeader.append(caret, dayCheckbox, title, addDayAfterBtn, delDayBtn);
        dayContainer.appendChild(dayHeader);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'day-content';
        contentDiv.dataset.dayIndex = dayIndex;
        
        contentDiv.addEventListener('dragover', (e) => {
            if (draggedObj) {
                const targetDayIndex = parseInt(contentDiv.dataset.dayIndex);
                if (days[targetDayIndex].cities.length === 0) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    contentDiv.classList.add('over-day-content');
                }
            }
        });
        
        contentDiv.addEventListener('dragleave', (e) => {
            contentDiv.classList.remove('over-day-content');
        });
        
        contentDiv.addEventListener('drop', (e) => {
            if (!draggedObj) return;
            
            const targetDayIndex = parseInt(contentDiv.dataset.dayIndex);
            if (days[targetDayIndex].cities.length > 0) return; // Only allow drop if empty
            
            if (e.target.closest('.city-item')) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            if (draggedObj.dayIndex !== targetDayIndex) {
                const item = days[draggedObj.dayIndex].cities[draggedObj.cityIndex];
                if (isSequentialDuplicate(item.name, targetDayIndex, 0, draggedObj.dayIndex, draggedObj.cityIndex)) {
                    alert(`Cannot move "${item.name}" adjacent to another city with the same name.`);
                    contentDiv.classList.remove('over-day-content');
                    draggedObj = null;
                    return;
                }
                days[draggedObj.dayIndex].cities.splice(draggedObj.cityIndex, 1);
                days[targetDayIndex].cities.push(item);
                saveData();
                initSidebar();
                renderAll();
            }
            contentDiv.classList.remove('over-day-content');
            draggedObj = null;
        });

        let prevCityName = null;
        for (let k = dayIndex - 1; k >= 0; k--) {
            for (let j = days[k].cities.length - 1; j >= 0; j--) {
                if (selectedCities.includes(days[k].cities[j].name)) {
                    prevCityName = days[k].cities[j].name;
                    break;
                }
            }
            if (prevCityName) break;
        }
        
        if (prevCityName) {
            const prevItem = document.createElement('div');
            prevItem.className = 'city-item';
            prevItem.style.opacity = '0.5';
            prevItem.style.cursor = 'default';
            prevItem.style.background = 'transparent';
            
            const icon = document.createElement('span');
            icon.innerHTML = '🏁';
            icon.style.marginRight = '0.2rem';
            icon.style.fontSize = '0.8rem';
            
            const label = document.createElement('span');
            label.className = 'city-label';
            label.innerHTML = `${prevCityName}`;
            
            prevItem.append(icon, label);
            contentDiv.appendChild(prevItem);
        }
        
        // Render cities
        dayObj.cities.forEach((cityObj, cityIndex) => {
            const item = document.createElement('div');
            item.className = 'city-item';
            item.draggable = true;
            item.dataset.dayIndex = dayIndex;
            item.dataset.cityIndex = cityIndex;
            
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
                    selectedCities = days.map(d => d.cities).flat()
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

            // Inline Name Edit
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
                        if (isSequentialDuplicate(newVal, dayIndex, cityIndex, dayIndex, cityIndex)) {
                            alert(`Cannot rename to "${newVal}" because it is adjacent to another "${newVal}".`);
                            editInput.replaceWith(label);
                            return;
                        }
                        cityObj.name = newVal;
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
            item.append(checkbox, label, transport);

            const controls = document.createElement('div');
            controls.className = 'city-controls';
            
            const addCityBtn = document.createElement('button');
            addCityBtn.className = 'control-btn add-after';
            addCityBtn.innerHTML = '+🏠';
            addCityBtn.title = 'Add City after this';
            addCityBtn.onclick = (e) => {
                e.stopPropagation();
                showInlineAddCity(dayIndex, cityIndex, item);
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'control-btn delete';
            delBtn.innerHTML = '✕';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                removeCity(dayIndex, cityIndex);
            };

            controls.append(addCityBtn, delBtn);
            item.append(controls);
            contentDiv.appendChild(item);
        });

        // Add City empty state if day has no cities
        if (dayObj.cities.length === 0) {
            const addEmptyBtn = document.createElement('button');
            addEmptyBtn.className = 'action-btn add-empty-btn';
            addEmptyBtn.innerHTML = '+ Add City';
            addEmptyBtn.style.margin = '4px 10px';
            addEmptyBtn.onclick = () => {
                showInlineAddCity(dayIndex, -1, addEmptyBtn);
            };
            contentDiv.appendChild(addEmptyBtn);
        }

        // Night Type item at the bottom of the day
        const nightItem = document.createElement('div');
        nightItem.className = 'sleep-item';
        const nightLabel = document.createElement('span');
        nightLabel.innerHTML = '💤&nbsp;<strong>Sleep</strong>';
        const nightType = document.createElement('select');
        nightType.className = 'night-type-select';
        ['warmshowers', 'hotel', 'airbnb', 'friend'].forEach(type => {
            const opt = document.createElement('option');
            opt.value = type;
            opt.textContent = type;
            if (dayObj.night_type === type) opt.selected = true;
            nightType.appendChild(opt);
        });
        nightType.addEventListener('change', (e) => {
            dayObj.night_type = e.target.value;
            saveData();
            renderAll();
        });
        nightItem.append(nightLabel, nightType);
        contentDiv.appendChild(nightItem);

        dayContainer.appendChild(contentDiv);
        citySelector.appendChild(dayContainer);
    });
}

function showInlineAddCity(dayIndex, cityIndex, parentItem) {
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
            addCityAt(dayIndex, cityIndex + 1, val);
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

function isSequentialDuplicate(cityName, targetDayIndex, targetCityIndex, ignoreDayIndex = null, ignoreCityIndex = null) {
    const flatCities = [];
    days.forEach((day, dIdx) => {
        day.cities.forEach((city, cIdx) => {
            if (ignoreDayIndex === dIdx && ignoreCityIndex === cIdx) return;
            flatCities.push({ name: city.name, dayIndex: dIdx, cityIndex: cIdx });
        });
    });

    let insertFlatIndex = 0;
    for (let i = 0; i < flatCities.length; i++) {
        const item = flatCities[i];
        if (item.dayIndex < targetDayIndex || (item.dayIndex === targetDayIndex && item.cityIndex < targetCityIndex)) {
            insertFlatIndex = i + 1;
        }
    }

    const prevCity = insertFlatIndex > 0 ? flatCities[insertFlatIndex - 1] : null;
    const nextCity = insertFlatIndex < flatCities.length ? flatCities[insertFlatIndex] : null;

    return (prevCity && prevCity.name === cityName) || (nextCity && nextCity.name === cityName);
}

function addCityAt(dayIndex, insertIndex, name) {
    if (!name) return;
    if (isSequentialDuplicate(name, dayIndex, insertIndex)) {
        alert(`Cannot add "${name}" adjacent to another city with the same name.`);
        return;
    }
    const newCity = { name: name, transport: 'bike' };
    days[dayIndex].cities.splice(insertIndex, 0, newCity);
    if (!selectedCities.includes(name)) {
        selectedCities.push(name);
    }
    saveData();
    initSidebar();
    renderAll();
}

let draggedObj = null;

function handleDragStart(e) {
    draggedObj = {
        dayIndex: parseInt(this.dataset.dayIndex),
        cityIndex: parseInt(this.dataset.cityIndex)
    };
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = this.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    this.classList.remove('over-top', 'over-bottom');
    if (e.clientY < midPoint) {
        this.classList.add('over-top');
    } else {
        this.classList.add('over-bottom');
    }
}

function handleDragEnter(e) {}
function handleDragLeave(e) {
    this.classList.remove('over-top', 'over-bottom');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedObj) return;

    const targetDayIndex = parseInt(this.dataset.dayIndex);
    const targetCityIndex = parseInt(this.dataset.cityIndex);

    const rect = this.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const insertAfter = e.clientY >= midPoint;
    
    let toCityIndex = insertAfter ? targetCityIndex + 1 : targetCityIndex;

    // Moving city logic
    if (draggedObj.dayIndex === targetDayIndex) {
        // Adjust index if moving down in same day
        if (draggedObj.cityIndex < toCityIndex) {
            toCityIndex--;
        }
    }
    
    if (draggedObj.dayIndex !== targetDayIndex || draggedObj.cityIndex !== toCityIndex) {
        const item = days[draggedObj.dayIndex].cities[draggedObj.cityIndex];
        if (isSequentialDuplicate(item.name, targetDayIndex, toCityIndex, draggedObj.dayIndex, draggedObj.cityIndex)) {
            alert(`Cannot move "${item.name}" adjacent to another city with the same name.`);
            this.classList.remove('over-top', 'over-bottom');
            draggedObj = null;
            return;
        }
        days[draggedObj.dayIndex].cities.splice(draggedObj.cityIndex, 1);
        days[targetDayIndex].cities.splice(toCityIndex, 0, item);
        saveData();
        initSidebar();
        renderAll();
    }
    
    this.classList.remove('over-top', 'over-bottom');
    draggedObj = null;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.city-item').forEach(item => {
        item.classList.remove('over-top', 'over-bottom');
    });
    draggedObj = null;
}

let draggedDayIndex = null;

function handleDayDragStart(e) {
    draggedDayIndex = parseInt(this.dataset.dayIndex);
    this.classList.add('dragging-day');
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
}

function handleDayDragOver(e) {
    if (draggedDayIndex === null) return; // Prevent city drop
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = this.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    this.classList.remove('over-top-day', 'over-bottom-day');
    if (e.clientY < midPoint) {
        this.classList.add('over-top-day');
    } else {
        this.classList.add('over-bottom-day');
    }
}

function handleDayDragLeave(e) {
    this.classList.remove('over-top-day', 'over-bottom-day');
}

function handleDayDrop(e) {
    if (draggedDayIndex === null) return; // Prevent city drop
    e.preventDefault();
    e.stopPropagation();
    
    let targetDayIndex = parseInt(this.dataset.dayIndex);
    const rect = this.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const insertAfter = e.clientY >= midPoint;
    
    let toIndex = insertAfter ? targetDayIndex + 1 : targetDayIndex;
    if (draggedDayIndex < toIndex) {
        toIndex--; 
    }
    
    if (draggedDayIndex !== toIndex) {
        const simulatedDays = days.map(d => ({ ...d, cities: [...d.cities] }));
        const movedDay = simulatedDays.splice(draggedDayIndex, 1)[0];
        simulatedDays.splice(toIndex, 0, movedDay);

        const simulatedFlat = simulatedDays.flatMap(d => d.cities);
        let hasSequentialDuplicate = false;
        for (let i = 0; i < simulatedFlat.length - 1; i++) {
            if (simulatedFlat[i].name === simulatedFlat[i + 1].name) {
                hasSequentialDuplicate = true;
                break;
            }
        }

        if (hasSequentialDuplicate) {
            alert('Reordering days would place identical cities adjacent to each other.');
            this.classList.remove('over-top-day', 'over-bottom-day');
            draggedDayIndex = null;
            return;
        }

        const item = days.splice(draggedDayIndex, 1)[0];
        days.splice(toIndex, 0, item);
        
        if (activeDayIndex === draggedDayIndex) {
            activeDayIndex = toIndex;
        } else if (activeDayIndex > draggedDayIndex && activeDayIndex <= toIndex) {
            activeDayIndex--;
        } else if (activeDayIndex < draggedDayIndex && activeDayIndex >= toIndex) {
            activeDayIndex++;
        }
        
        saveData();
        initSidebar();
        renderAll();
    }
    
    this.classList.remove('over-top-day', 'over-bottom-day');
    draggedDayIndex = null;
}

function handleDayDragEnd(e) {
    this.classList.remove('dragging-day');
    document.querySelectorAll('.day-header-sidebar').forEach(item => {
        item.classList.remove('over-top-day', 'over-bottom-day');
    });
    draggedDayIndex = null;
}

function addNewDay() {
    const id = Date.now();
    days.push({ id: `day_${id}`, collapsed: false, cities: [], night_type: 'warmshowers' });
    saveData();
    initSidebar();
}

function removeCity(dayIndex, cityIndex) {
    const cityObj = days[dayIndex].cities[cityIndex];
    days[dayIndex].cities.splice(cityIndex, 1);
    selectedCities = selectedCities.filter(name => name !== cityObj.name);
    saveData();
    initSidebar();
    renderAll();
}

async function renderAll() {
    routeContainer.innerHTML = '';
    const overviewContainer = document.getElementById('overview-map');
    const tripSummaryContainer = document.getElementById('trip-summary');
    const totalDaysEl = document.getElementById('total-days');
    overviewContainer.innerHTML = '';
    // Don't clear header, just the dynamic part if it exists
    const tableDiv = document.getElementById('summary-table-dynamic');
    if (tableDiv) tableDiv.innerHTML = '';
    
    let tripSummaryData = [];
    let dayStartCity = null;

    let grandTotalElevation = 0;
    const totalsByTransport = { bike: 0, ferry: 0, train: 0 };

    let configChanged = false;
    let activeRoute = [];
    days.forEach(dayObj => {
        dayObj.cities.forEach(c => {
            if (selectedCities.includes(c.name)) {
                activeRoute.push(c);
            }
        });
        if (activeRoute.length > 0 && activeRoute[activeRoute.length - 1].is_sleep !== true) {
            activeRoute.push({ 
                is_sleep: true, 
                night_type: dayObj.night_type 
            });
        }
    });

    if (activeRoute.length >= 2) {
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
        
        const isTargetActive = activeDayIndex === 'all' ? false : ((dayNum - 1) === activeDayIndex);
        group.style.display = isTargetActive ? 'flex' : 'none';
        
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

    let allLegs = [];
    let sleepPoints = [];

    for (let i = 0; i < activeRoute.length; i++) {
        const item = activeRoute[i];
        
        if (item.is_sleep) {
            const sidebarDayEl = document.getElementById(`sidebar-day-stats-${currentDay}`);
            if (sidebarDayEl) {
                const km = activeDayStats.bikeDist / 1000;
                sidebarDayEl.textContent = `(${km.toFixed(1)} km | ${Math.round(activeDayStats.elevGain)}m)`;
                sidebarDayEl.className = 'sidebar-day-dist ' + getDistanceColorClass(km);
            }

            const endCity = lastCityObj ? lastCityObj.name : 'Unknown';
            const startCity = dayStartCity ? dayStartCity.name : endCity;
            tripSummaryData.push({
                day: currentDay,
                startCity: startCity,
                endCity: endCity,
                distance: activeDayStats.bikeDist,
                elevation: activeDayStats.elevGain
            });
            dayStartCity = lastCityObj;

            if (dayLegs.length > 0) {
                allLegs = allLegs.concat(dayLegs);
                // The last city before a sleep marker is the stop point
                if (lastCityObj) {
                    sleepPoints.push({ name: lastCityObj.name, city: lastCityObj });
                }
                if ((currentDay - 1) === activeDayIndex) {
                    await renderDayMap(currentDayGroup, dayLegs);
                }
            }
            dayLegs = [];
            currentDay++;
            dayData = startNewDay(currentDay, item.night_type);
            currentDayGroup = dayData.group;
            activeDayStats = dayData.stats;
            continue;
        }

        const cityObj = item;
        if (!dayStartCity) {
            dayStartCity = lastCityObj ? lastCityObj : cityObj;
        }
        
        let dayEndCity = cityObj;
        for (let j = i; j < activeRoute.length; j++) {
            if (activeRoute[j].is_sleep) break;
            if (!activeRoute[j].is_sleep) dayEndCity = activeRoute[j];
        }

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
            
            const hasValidCache = lastCityObj.cachedNextCity === cityObj.name && lastCityObj.cachedTransport === transport;
            
            let legData = null;
            
            if (hasValidCache && lastCityObj.cachedPolyline) {
                legData = {
                    distance: lastCityObj.cachedDistance,
                    elevation: lastCityObj.cachedElevation,
                    polyline: lastCityObj.cachedPolyline
                };
            } else {
                const result = await requestDirections(lastCityObj.name, cityObj.name, transport);
                if (result) {
                    const leg = result.routes[0].legs[0];
                    const distance = leg.distance.value;
                    let elevationGain = 0;
                    if (transport !== 'train') {
                        elevationGain = await calculateElevation(result.routes[0].overview_path, `${lastCityObj.name}|${cityObj.name}|${transport}`);
                    }
                    let polyline = result.routes[0].overview_polyline;
                    if (typeof polyline === 'object' && polyline.points) polyline = polyline.points;
                    
                    legData = { distance, elevation: elevationGain, polyline, result };
                    
                    lastCityObj.cachedNextCity = cityObj.name;
                    lastCityObj.cachedTransport = transport;
                    lastCityObj.cachedDistance = distance;
                    lastCityObj.cachedElevation = elevationGain;
                    lastCityObj.cachedPolyline = polyline;
                    configChanged = true;
                }
            }
            
            if (legData) {
                const distance = legData.distance;
                const elevationGain = legData.elevation || 0;
                
                totalsByTransport[transport] = (totalsByTransport[transport] || 0) + distance;
                if (transport !== 'train') {
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
                dayLegs.push({ legData, transport });
            } else {
                renderLegStats(currentDayGroup, null, transport, lastCityObj.name, cityObj.name, cumulativeBikeDistance / 1000);
            }
        }
        
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
        allLegs = allLegs.concat(dayLegs);
    }

    
    if (activeDayIndex === 'all') {
        overviewContainer.style.display = 'block';
        if (tripSummaryContainer) tripSummaryContainer.style.display = 'block';
        const statsBar = document.getElementById('stats-bar');
        if (statsBar) statsBar.style.display = 'flex';
        overviewContainer.innerHTML = '';
        
        if (tripSummaryContainer && tripSummaryData.length > 0) {
            // Find or create dynamic table div
            let tableDiv = document.getElementById('summary-table-dynamic');
            if (!tableDiv) {
                tableDiv = document.createElement('div');
                tableDiv.id = 'summary-table-dynamic';
                tripSummaryContainer.appendChild(tableDiv);
            }

            let summaryHTML = `
                <div class="summary-table-container">
                    <table class="summary-table">
                        <thead>
                            <tr>
                                <th>Day</th>
                                <th>Route</th>
                                <th>Distance</th>
                                <th>Elevation</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            tripSummaryData.forEach(d => {
                const badgeClass = (d.distance / 1000) > 0 ? getDistanceColorClass(d.distance / 1000) : '';
                summaryHTML += `
                    <tr style="cursor: pointer;" onclick="activeDayIndex = ${d.day - 1}; initSidebar(); renderAll();">
                        <td><span class="summary-day-badge">Day ${d.day}</span></td>
                        <td>
                            <span class="summary-city">${d.startCity}</span>
                            <span class="summary-arrow">➔</span>
                            <span class="summary-city">${d.endCity}</span>
                        </td>
                        <td><span class="summary-val sidebar-day-dist ${badgeClass}" style="vertical-align: middle; margin-left: 0; padding: 4px 8px; font-size: 0.85rem;">${(d.distance / 1000).toFixed(1)} km</span></td>
                        <td><span class="summary-val">${Math.round(d.elevation)} m</span></td>
                    </tr>
                `;
            });
            
            // Add Total row
            summaryHTML += `
                        </tbody>
                        <tfoot>
                            <tr style="background: rgba(56, 189, 248, 0.05); font-weight: 800;">
                                <td>TOTAL</td>
                                <td>${tripSummaryData.length} Days</td>
                                <td><span class="sidebar-day-dist status-darkred" style="vertical-align: middle; margin-left: 0; padding: 4px 8px; font-size: 0.85rem;">${(totalsByTransport.bike / 1000).toFixed(1)} km</span></td>
                                <td style="color: var(--accent-color);">${Math.round(grandTotalElevation)} m</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;
            tableDiv.innerHTML = summaryHTML;

            // Handle Copy Button
            const copyBtn = document.getElementById('copy-summary-btn');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    let text = `TRIP SUMMARY: EuroVelo Adventure\n\n`;
                    tripSummaryData.forEach(d => {
                        text += `Day ${d.day}: ${d.startCity} ➔ ${d.endCity} | ${(d.distance / 1000).toFixed(1)} km | ${Math.round(d.elevation)} m\n`;
                    });
                    text += `\nTOTAL: ${(totalsByTransport.bike / 1000).toFixed(1)} km | ${Math.round(grandTotalElevation)} m | ${tripSummaryData.length} Days`;
                    
                    navigator.clipboard.writeText(text).then(() => {
                        const originalText = copyBtn.innerHTML;
                        copyBtn.innerHTML = '✅ Copied!';
                        setTimeout(() => copyBtn.innerHTML = originalText, 2000);
                    });
                };
            }
        }

        if (allLegs.length > 0) {
            await renderDayMap(overviewContainer, allLegs, sleepPoints);
        }
    } else {
        overviewContainer.style.display = 'none';
        if (tripSummaryContainer) tripSummaryContainer.style.display = 'none';
        const statsBar = document.getElementById('stats-bar');
        if (statsBar) statsBar.style.display = 'none';
        overviewContainer.innerHTML = '';
        if (dayLegs.length > 0) {
            if ((currentDay - 1) === activeDayIndex) {
                await renderDayMap(currentDayGroup, dayLegs);
            }
        }
    }

    totalDistanceEl.textContent = `${(totalsByTransport.bike / 1000).toFixed(1)} km`;
    totalElevationEl.textContent = `${Math.round(grandTotalElevation)} m`;
    totalDaysEl.textContent = currentDay;
    distanceBreakdownEl.innerHTML = '';
    
    if (configChanged) {
        saveData();
    }
}

async function renderDayMap(container, legs, sleepPoints = []) {
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
    const { encoding } = await google.maps.importLibrary("geometry");
    const map = new Map(mapWidget, {
        zoom: 7,
        mapTypeId: google.maps.MapTypeId.TERRAIN,
        disableDefaultUI: true,
        zoomControl: true,
        scrollwheel: true,
        gestureHandling: 'greedy',
        fullscreenControl: true
    });

    const bounds = new google.maps.LatLngBounds();

    for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        if (leg.legData) {
            let path;
            if (leg.legData.polyline) {
                path = encoding.decodePath(leg.legData.polyline);
            }

            if (leg.legData.result) {
                new google.maps.DirectionsRenderer({
                    map: map,
                    directions: leg.legData.result,
                    preserveViewport: true,
                    suppressMarkers: i > 0 && i < legs.length - 1,
                    polylineOptions: {
                        strokeColor: leg.transport === 'train' ? '#94a3b8' : '#f43f5e',
                        strokeOpacity: 0.8,
                        strokeWeight: 5
                    }
                });
            } else if (path) {
                new google.maps.Polyline({
                    map: map,
                    path: path,
                    strokeColor: leg.transport === 'train' ? '#94a3b8' : '#f43f5e',
                    strokeOpacity: 0.8,
                    strokeWeight: 5
                });
                
                if (i === 0 || i === legs.length - 1) {
                    new google.maps.Marker({
                        position: path[0],
                        map: map
                    });
                    new google.maps.Marker({
                        position: path[path.length - 1],
                        map: map
                    });
                }
            }
            
            if (path) {
                bounds.extend(path[0]);
                bounds.extend(path[path.length - 1]);
            } else if (leg.legData.result) {
                const steps = leg.legData.result.routes[0].legs[0];
                bounds.extend(steps.start_location);
                bounds.extend(steps.end_location);
            }
        }
    }

    // Render sleep markers if provided (for overview)
    if (sleepPoints.length > 0) {
        const { Marker } = await google.maps.importLibrary("marker");
        sleepPoints.forEach(point => {
            // We need coordinates. Since we have cached polyline, we can use the end of it
            if (point.city && point.city.cachedPolyline) {
                const path = encoding.decodePath(point.city.cachedPolyline);
                new Marker({
                    position: path[path.length - 1],
                    map: map,
                    title: `Sleep: ${point.name}`,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: '#818cf8',
                        fillOpacity: 1,
                        strokeWeight: 2,
                        strokeColor: '#ffffff',
                        scale: 6
                    }
                });
            }
        });
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
    
    const cacheKey = `${origin}|${destination}|${transportType}`;
    if (directionsCache.has(cacheKey)) {
        return directionsCache.get(cacheKey);
    }

    let travelMode = google.maps.TravelMode.BICYCLING;
    if (transportType === 'train') travelMode = google.maps.TravelMode.TRANSIT;

    return new Promise((resolve) => {
        directionsService.route({
            origin: origin,
            destination: destination,
            travelMode: travelMode
        }, (result, status) => {
            if (status === google.maps.DirectionsStatus.OK) {
                directionsCache.set(cacheKey, result);
                resolve(result);
            } else {
                resolve(null);
            }
        });
    });
}

async function calculateElevation(path, cacheKey) {
    if (!google || !google.maps || !google.maps.ElevationService) return 0;
    if (!elevationService) elevationService = new google.maps.ElevationService();
    
    if (cacheKey && elevationCache.has(cacheKey)) {
        return elevationCache.get(cacheKey);
    }

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
            if (cacheKey) elevationCache.set(cacheKey, gain);
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
    
    const projectSelect = document.getElementById('project-select');
    if (projectSelect) {
        projectSelect.onchange = async (e) => {
            currentProjectId = parseInt(e.target.value);
            activeDayIndex = 'all';
            await loadData();
            initSidebar();
            renderAll();
        };
    }

    const newProjectBtn = document.getElementById('new-project-btn');
    if (newProjectBtn) {
        newProjectBtn.onclick = createNewProject;
    }

    const deleteProjectBtn = document.getElementById('delete-project-btn');
    if (deleteProjectBtn) {
        deleteProjectBtn.onclick = deleteCurrentProject;
    }

    const renameProjectBtn = document.getElementById('rename-project-btn');
    if (renameProjectBtn) {
        renameProjectBtn.onclick = () => {
            if (currentProjectId !== null) {
                openProjectModal('edit', currentProjectId);
            }
        };
    }

    // Modal listeners
    const modalSave = document.getElementById('modal-save');
    if (modalSave) modalSave.onclick = handleProjectSave;

    const modalCancel = document.getElementById('modal-cancel');
    if (modalCancel) modalCancel.onclick = closeProjectModal;

    const modal = document.getElementById('project-modal');
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) closeProjectModal();
        };
    }

    const showWholeTripBtn = document.getElementById('show-whole-trip');
    if (showWholeTripBtn) {
        if (activeDayIndex === 'all') {
            showWholeTripBtn.classList.add('active-trip');
        } else {
            showWholeTripBtn.classList.remove('active-trip');
        }

        showWholeTripBtn.onclick = () => {
            activeDayIndex = 'all';
            initSidebar();
            renderAll();
        };
    }

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