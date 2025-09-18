// Initialize map
const map = L.map('map').setView([20.5937, 78.9629], 5); // India default
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const resultsList = document.getElementById("resultsList");
const form = document.getElementById("searchForm");
const myLocationBtn = document.getElementById("myLocationBtn");
let routeLine = null;

let userMarker;
let userLat = null;
let userLon = null;
let isUsingMyLocation = false; // track if "My Location" mode is active

// ------------------ SEARCH BY PLACE NAME ------------------
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    resultsList.innerHTML = "Loading...";

    // disable my-location mode if searching by name
    isUsingMyLocation = false;

    if (userMarker) userMarker.closePopup();

    const placeInput = document.getElementById("placeInput");
    const place = placeInput.value.trim();
    const category = document.getElementById("categorySelect").value;
    if (!place) {
        alert("Please enter a place!");
        return;
    }

    const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`);
    const nomData = await nomRes.json();
    if (nomData.length === 0) {
        resultsList.innerHTML = "<li>Place not found.</li>";
        return;
    }

    const lat = parseFloat(nomData[0].lat);
    const lon = parseFloat(nomData[0].lon);

    map.setView([lat, lon], 14);

    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lon]).addTo(map).bindPopup(` ${place}`).openPopup();

    userLat = null; // reset user location for routing
    userLon = null;

    await fetchNearby(lat, lon, category);
});

// ------------------ SEARCH BY MY LOCATION ------------------
myLocationBtn.addEventListener("click", () => {
    resultsList.innerHTML = "Fetching your location...";
    document.getElementById("placeInput").value = "";

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;

        userLat = latitude;
        userLon = longitude;
        isUsingMyLocation = true; // enable routing

        map.setView([latitude, longitude], 14);

        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("You are here").openPopup();

        const category = document.getElementById("categorySelect").value;
        await fetchNearby(latitude, longitude, category);
    }, () => {
        alert("Location access denied!");
    });
});

// ------------------ CATEGORY CHANGE AUTO REFRESH ------------------
document.getElementById("categorySelect").addEventListener("change", async () => {
    const category = document.getElementById("categorySelect").value;

    if (isUsingMyLocation && userLat !== null && userLon !== null) {
        await fetchNearby(userLat, userLon, category);
    } else if (userMarker) {
        const { lat, lng } = userMarker.getLatLng();
        await fetchNearby(lat, lng, category);
    }
});

// ------------------ FETCH NEARBY PLACES ------------------
async function fetchNearby(lat, lon, category) {
    const query = ` 
[out:json][timeout:25]; 
( node["amenity"="${category}"](around:10000, ${lat}, ${lon}); ); 
out; 
`;

    const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query
    });
    const data = await res.json();

    resultsList.innerHTML = "";
    if (data.elements.length === 0) {
        resultsList.innerHTML = `<li>No ${category}s found nearby.</li>`;
        return;
    }

    // Remove all markers except userMarker
    map.eachLayer((layer) => {
        if ((layer instanceof L.Marker && layer !== userMarker) || layer instanceof L.Polyline) {
            map.removeLayer(layer);
        }
    });

    const markersGroup = L.featureGroup();

    // Collect valid places with distance
    const placesWithDistance = [];
    data.elements.forEach((place) => {
        const name = place.tags && place.tags.name ? place.tags.name.trim() : "";
        if (!name || name.toLowerCase() === "unnamed") return;

        const dist = getDistance(lat, lon, place.lat, place.lon);
        placesWithDistance.push({ place, name, dist });
    });

    // Sort by distance
    placesWithDistance.sort((a, b) => a.dist - b.dist);

    // Render sorted list
    placesWithDistance.forEach(({ place, name, dist }) => {
        const item = document.createElement("li");
        item.textContent = `${name} – ${dist.toFixed(2)} km away`;
        resultsList.appendChild(item);

        const marker = L.marker([place.lat, place.lon])
            .addTo(map)
            .bindPopup(`<b>${name}</b><br>${dist.toFixed(2)} km away`);

        markersGroup.addLayer(marker);

        item.addEventListener("click", async () => {
            // Remove all markers except userMarker and old route
            map.eachLayer((layer) => {
                if ((layer instanceof L.Marker && layer !== userMarker) || layer instanceof L.Polyline) {
                    map.removeLayer(layer);
                }
            });

            map.setView([place.lat, place.lon], 16);

            // Show clicked place marker
            L.marker([place.lat, place.lon])
                .addTo(map)
                .bindPopup(`<b>${name}</b><br>${dist.toFixed(2)} km away`)
                .openPopup();

            // Draw route only if using My Location
            if (isUsingMyLocation && userLat !== null && userLon !== null) {
                if (routeLine) {
                    map.removeLayer(routeLine);
                }

                const routeRes = await fetch(
                    `https://router.project-osrm.org/route/v1/driving/${userLon},${userLat};${place.lon},${place.lat}?overview=full&geometries=geojson`
                );
                const routeData = await routeRes.json();

                if (routeData.routes && routeData.routes.length > 0) {
                    const coords = routeData.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                    routeLine = L.polyline(coords, {
                        color: '#2193b0',
                        weight: 5,
                        opacity: 0.7
                    }).addTo(map);
                    map.fitBounds(routeLine.getBounds());
                }
            }
        });
    });

    // Always keep userMarker visible in map bounds
    if (userMarker) {
        markersGroup.addLayer(userMarker);
    }

    // Fit map to all markers
    if (markersGroup.getLayers().length > 0) {
        map.fitBounds(markersGroup.getBounds().pad(0.2));
    }
}


// ------------------ DISTANCE CALCULATION ------------------
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
