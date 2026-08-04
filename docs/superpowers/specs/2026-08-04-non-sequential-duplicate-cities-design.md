# Non-Sequential Duplicate Cities Design

## Overview
Currently, Pedal prevents adding any city name if it already exists anywhere in the trip route (`days.some(...)`). 
This design updates the city uniqueness rules to allow a city to be added multiple times across a trip, provided it is **not added sequentially** (i.e., not immediately adjacent to another instance of the same city in the route).

## Architectural Changes

### 1. Helper Function: `isSequentialDuplicate`
A central validation function will be added to `frontend/script.js`:

```js
function isSequentialDuplicate(cityName, targetDayIndex, targetCityIndex, ignoreDayIndex = null, ignoreCityIndex = null) {
    // Build a flat list of cities with their day/city indices, optionally ignoring an item being moved/renamed
    const flatCities = [];
    days.forEach((day, dIdx) => {
        day.cities.forEach((city, cIdx) => {
            if (ignoreDayIndex === dIdx && ignoreCityIndex === cIdx) return;
            flatCities.push({ name: city.name, dayIndex: dIdx, cityIndex: cIdx });
        });
    });

    // Find insertion index in the flat list
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
```

### 2. Validation Integration Sites

#### A. City Addition (`addCityAt`)
- Replace `const exists = days.some(...)` with `isSequentialDuplicate(name, dayIndex, insertIndex)`.
- If `isSequentialDuplicate` returns `true`:
  - Show user alert: `"Cannot add '${name}' adjacent to itself."`
  - Do not add city.

#### B. City Renaming (`finishEdit` in `initSidebar`)
- Replace global `exists` check with `isSequentialDuplicate(newVal, dayIndex, cityIndex, dayIndex, cityIndex)`.
- If `isSequentialDuplicate` returns `true`:
  - Show user alert: `"Cannot rename to '${newVal}' because it is adjacent to an identical city."`
  - Revert input to original name.

#### C. City Drag & Drop Reordering (`handleDrop`)
- When dropping a city from `(draggedObj.dayIndex, draggedObj.cityIndex)` to target `(targetDayIndex, toCityIndex)`:
- Evaluate `isSequentialDuplicate(item.name, targetDayIndex, toCityIndex, draggedObj.dayIndex, draggedObj.cityIndex)`.
- If `true`:
  - Show user alert: `"Cannot move city adjacent to an identical city."`
  - Revert drag operation.

#### D. Day Drag & Drop Reordering (`handleDayDrop`)
- Simulate moving the day to the target index.
- Flatten all cities in the simulated day order.
- Check if any consecutive cities in the simulated list have the same name.
- If consecutive duplicates exist:
  - Show user alert: `"Reordering days would place identical cities adjacent to each other."`
  - Revert day drag operation.

## Data Model & Cache Compatibility
- **Directions/Elevation Cache**: `requestDirections` and `calculateElevation` use keys formatted as `${origin}|${destination}|${transport}`. Non-sequential duplicate cities work seamlessly with the existing caching mechanisms.
- **`selectedCities`**: City selection logic will remain based on city names in global route order.

## Testing & Verification Plan
1. Add a city (e.g. "London") to Day 1.
2. Attempt to add "London" immediately after "London" in Day 1 -> Expect alert & rejection.
3. Add "Oxford" to Day 1, then add "London" after "Oxford" -> Expect success.
4. Rename "Oxford" to "London" -> Expect alert & rejection.
5. Move "London" from Day 2 to be adjacent to "London" in Day 1 via Drag & Drop -> Expect alert & rejection.
6. Reorder Day 1 and Day 2 such that day boundary cities match -> Expect alert & rejection.
