// Initialize map 
const map = L.map('map').setView([20.5937, 78.9629], 5); // India default
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
 attribution: '&copy; OpenStreetMap contributors' 
}).addTo(map);

const resultsList = document.getElementById("resultsList"); 
const form = document.getElementById("searchForm"); 
const myLocationBtn = document.getElementById("myLocationBtn"); 

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
 isUsingMyLocation = true; // enable my-location mode

 map.setView([latitude, longitude], 14); 

 if (userMarker) map.removeLayer(userMarker); 
 userMarker = L.marker([latitude, longitude]).addTo(map).bindPopup(" You are here").openPopup(); 

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

 map.eachLayer((layer) => { 
 if (layer instanceof L.Marker && layer !== userMarker) { 
 map.removeLayer(layer); 
 } 
 }); 

 data.elements.forEach((place) => { 
 const name = place.tags && place.tags.name ? place.tags.name.trim() : ""; 
 if (!name || name.toLowerCase() === "unnamed") return; 

 const dist = getDistance(lat, lon, place.lat, place.lon); 

 const item = document.createElement("li"); 
 item.textContent = `${name} – ${dist.toFixed(2)} km away`; 
 resultsList.appendChild(item); 

 const marker = L.marker([place.lat, place.lon]) 
 .addTo(map) 
 .bindPopup(`<b>${name}</b><br>${dist.toFixed(2)} km away`); 

 item.addEventListener("click", () => { 
 map.setView([place.lat, place.lon], 16); 
 marker.openPopup(); 
 }); 
 }); 
} 

// ------------------ DISTANCE CALCULATION ------------------ 
function getDistance(lat1, lon1, lat2, lon2) { 
 const R = 6371; 
 const dLat = (lat2 - lat1) * Math.PI / 180; 
 const dLon = (lon2 - lon1) * Math.PI / 180; 
 const a = 
 Math.sin(dLat/2) * Math.sin(dLat/2) + 
 Math.cos(lat1 * Math.PI / 180) * 
 Math.cos(lat2 * Math.PI / 180) * 
 Math.sin(dLon/2) * Math.sin(dLon/2); 
 const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
 return R * c; 
}
