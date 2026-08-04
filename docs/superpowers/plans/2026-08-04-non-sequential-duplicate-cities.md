# Non-Sequential Duplicate Cities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to add the same city multiple times across a bike trip route as long as it is not placed sequentially (adjacent to another city with the exact same name).

**Architecture:** Add a helper `isSequentialDuplicate` in `frontend/script.js` that checks whether placing or renaming a city at a target position makes it adjacent to an identical city name across the flat sequence of all cities in the trip. Integrate this check into city addition, inline city renaming, city drag-and-drop reordering, and day drag-and-drop reordering.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5 DOM manipulation, Google Maps JS API (existing).

## Global Constraints
- Do not introduce build tools, package managers, or framework dependencies to `frontend/script.js`.
- Preserve existing data schemas in `backend/database.py` and Flask APIs.
- Keep `saveData()`, `initSidebar()`, and `renderAll()` calls intact after valid state updates.

---

### Task 1: Add `isSequentialDuplicate` Helper and Update `addCityAt` & City Renaming

**Files:**
- Modify: `frontend/script.js:497-515` (Inline city rename handler)
- Modify: `frontend/script.js:659-669` (`addCityAt` function)

**Interfaces:**
- Consumes: `days` (global array of day objects containing `cities: [{ name, transport }]`)
- Produces: `isSequentialDuplicate(cityName, targetDayIndex, targetCityIndex, ignoreDayIndex, ignoreCityIndex)` returning boolean `true` if adjacent duplicate exists, `false` otherwise.

- [ ] **Step 1: Inspect target locations in `frontend/script.js`**

Verify line ranges and existing functions for `finishEdit` and `addCityAt`.

- [ ] **Step 2: Add `isSequentialDuplicate` and update `addCityAt`**

In `frontend/script.js`, right before `addCityAt`, define `isSequentialDuplicate`:

```javascript
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
```

- [ ] **Step 3: Update `finishEdit` in city rename handler**

In `frontend/script.js` inside `initSidebar()` (around line 500), update `finishEdit`:

```javascript
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
```

- [ ] **Step 4: Commit Task 1 changes**

```bash
git add frontend/script.js
git commit -m "feat: allow non-sequential duplicate cities in addCityAt and rename"
```

---

### Task 2: Validate City and Day Drag-and-Drop Operations

**Files:**
- Modify: `frontend/script.js:399-419` (Empty day drop listener)
- Modify: `frontend/script.js:701-733` (`handleDrop` city reorder handler)
- Modify: `frontend/script.js:770-805` (`handleDayDrop` day reorder handler)

**Interfaces:**
- Consumes: `isSequentialDuplicate(cityName, targetDayIndex, targetCityIndex, ignoreDayIndex, ignoreCityIndex)` from Task 1

- [ ] **Step 1: Update empty day city drop listener**

In `frontend/script.js` (around line 400), update the `drop` event listener on `contentDiv`:

```javascript
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
```

- [ ] **Step 2: Update `handleDrop` for city reordering**

In `frontend/script.js` (around line 701), update `handleDrop`:

```javascript
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
```

- [ ] **Step 3: Update `handleDayDrop` for day reordering**

In `frontend/script.js` (around line 770), update `handleDayDrop`:

```javascript
function handleDayDrop(e) {
    if (draggedDayIndex === null) return;
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
```

- [ ] **Step 4: Commit Task 2 changes**

```bash
git add frontend/script.js
git commit -m "feat: validate sequential duplicate cities on city and day drag-and-drop"
```

---

### Task 3: End-to-End Verification

- [ ] **Step 1: Start local app server**

Run: `./run.sh`

- [ ] **Step 2: Verify non-sequential city addition and rejection**

1. Create a trip with Day 1: "London", "Harwich".
2. Try adding "London" immediately after "London" -> Expect alert and rejection.
3. Try adding "London" after "Harwich" -> Expect success.
4. Rename "Harwich" to "London" -> Expect alert and rejection.
5. Add Day 2 with "London" as first city -> Expect alert/rejection because Day 1 ends with "London".
6. Add "Oxford" to Day 2, then "London" -> Expect success.

- [ ] **Step 3: Final Commit and Verification**

Verify clean status with `git status`.
