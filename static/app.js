//Global variables
let map, infowindow, originMarker, userCurrentLocation;
let distanceMatrixService, directionsService, directionsRenderer;
let markers = [], repairStations = [], distCalcs = [], stationDistCalcs = [], slicedRepairStations = [];

//The location of Madison, WI
const MADISON = { lat: 43.0722, lng: -89.4008 };

//set map styles
const mapStyles = [
  {
    featureType: "poi", // Points of interest
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "transit", // Transit stations
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "road", // Roads
    elementType: "labels", // Only the labels on roads
    stylers: [{ visibility: "on" }]
  },
];

// Initialization function
async function initialize() {
  initMap();
  initAutocompleteWidget();   
  initGeolocationWidget();
  fetchAndRenderRepairStations(MADISON);
  setupEventListeners();
  setupAboutButtonListener();
}

function setupEventListeners() {
  const destinationSelect = document.getElementById('destination-select');
  if (destinationSelect) {
    destinationSelect.addEventListener('change', function() {
      const selectedStationIndex = this.value;
      if (selectedStationIndex && userCurrentLocation) {
        const station = repairStations[selectedStationIndex];
        calculateRouteToStation(userCurrentLocation, station);
      } else {
        window.alert("Please select a repair station and ensure your location is known.");
      }
    });
  }
}

// Initialize the application after DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);

// Initialize the map
function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
      center: MADISON,
      zoom: 14,
      styles: mapStyles,
      clickableIcons: false,
      fullscreenControl: false,
      mapTypeControl: true,
      rotateControl: true,
      scaleControl: false,
      streetViewControl: false,
      zoomControl: true,
  });

  // Create a new instance of the bike layer and add it to the map
  const bikeLayer = new google.maps.BicyclingLayer();
  bikeLayer.setMap(map);

  infowindow = new google.maps.InfoWindow();
  originMarker = new google.maps.Marker({ map: map, visible: false });
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer();
  directionsRenderer.setMap(map);
  distanceMatrixService = new google.maps.DistanceMatrixService();
}

// Function to fetch and render repair stations
async function fetchAndRenderRepairStations(location) {
  // Fetch the repair stations from the data source
  repairStations = (await fetchRepairStations(location)).features;
  
  // Clear existing markers
  markers.forEach(marker => marker.setMap(null));
  markers = [];

  // Create markers based on the repair stations
  repairStations.forEach(station => {
    const marker = stationToMarker(station, map, infowindow);
    if (marker instanceof google.maps.Marker) { // Ensure it's a valid object
      markers.push(marker);
    } else {
      console.error('Invalid marker object created:', marker);
    }
  });
};

// Function to fetch repair stations
async function fetchRepairStations (center) {
  const url = `/data/dropoffs?centerLat=${center.lat}&centerLng=${center.lng}`;
  const response = await fetch(url);
  return response.json();
};

// Function to create a marker for each station
function stationToMarker(station, map, infowindow) {
  const coordinates = station.geometry.coordinates;
  const lat = coordinates[1];
  const lng = coordinates[0];

  const defaultIcon = {
    url: "bike_icon.png",
    scaledSize: new google.maps.Size(25, 25), 
    origin: new google.maps.Point(0, 0),
    anchor: new google.maps.Point(15, 15)
  };

  const enlargedIcon = {
    url: "bike_icon.png",
    scaledSize: new google.maps.Size(35, 35), 
    origin: new google.maps.Point(0, 0),
    anchor: new google.maps.Point(15, 15)
  };

  const marker = new google.maps.Marker({
    position: { lat, lng },
    map: map,
    icon: defaultIcon
  });

  // Mouseover event listener to enlarge the icon
  marker.addListener("mouseover", () => {
    marker.setIcon(enlargedIcon);
  });

  // Store the station's unique identifier in the marker
  marker.stationId = station.properties.OBJECTID;

  // Mouseover event listener to highlight corresponding row in the panel
  marker.addListener("mouseover", () => {
    marker.setIcon(enlargedIcon);
    highlightPanelRow(marker.stationId, true); // Highlight the row
  });

  // Mouseout event listener to unhighlight corresponding row in the panel
  marker.addListener("mouseout", () => {
    marker.setIcon(defaultIcon);
    highlightPanelRow(marker.stationId, false); // Unhighlight the row
    });

  // Mouseout event listener to revert the icon size
  marker.addListener("mouseout", () => {
    marker.setIcon(defaultIcon);
  });

  marker.addListener("click", () => {
    if (userCurrentLocation) {
      calculateRouteToStation(userCurrentLocation, station);
    }
    //Create and open the info window for this marker
    const contentString = `
      <div>
        <p><strong>Description:</strong> ${station.properties.Description}</p>
        <p><strong>Owner:</strong> ${station.properties.Owner}</p>
        <p><a href="${station.properties.File_Path}" target="_blank">View Image</a></p>
      </div>
    `;
    infowindow.setContent(contentString);
    infowindow.setPosition({ lat, lng });
    infowindow.setOptions({ pixelOffset: new google.maps.Size(0, -10) });
    infowindow.open(map);
  });
  return marker;
};

function highlightPanelRow(stationId, highlight) {
  console.log("Highlighting Station ID:", stationId, "Highlight:", highlight);
  const panelRows = document.querySelectorAll('.station-row');
  panelRows.forEach(row => {
    if (row.dataset.stationId == stationId) { // Ensure to use == for comparison
      if (highlight) {
        row.style.backgroundColor = '#dadada'; // Set the background color for highlighting
      } else {
        row.style.backgroundColor = '#fff'; // Reset the background color
      }
    }
  });
}

//Function to handle distance calculations
async function calculateDistances(origin, repairStations) {

   // Check if origin is a LatLng object and convert to a plain object if necessary
   const originCoords = origin instanceof google.maps.LatLng ? origin.toJSON() : origin;

  // Reduce number of repairStations from entire list to rough calculation of 25 closest
  for (let i = 0; i < repairStations.length; i++) {
    let a = originCoords.lat - repairStations[i].geometry.coordinates[1];
    let b = originCoords.lng - repairStations[i].geometry.coordinates[0];
    let c = Math.sqrt(a**2 + b**2); // Pythagorean calculation
    let distCalc = c;
    distCalcs.push(distCalc);

    let obj = {'station': repairStations[i], 'distanceCalc': distCalc};
    stationDistCalcs.push(obj);
  }
  
  stationDistCalcs.sort((a,b) => a.distanceCalc - b.distanceCalc); // sorts by lowest to greatest distanceCalc
  const slicedStationDistCalcs = stationDistCalcs.slice(0, 25); // creates a new array of the lowest 25 

  // builds a new array of just the repairStations (station object only) from the array of station & distance calc objects using the lowest 25 distance calcs
  slicedStationDistCalcs.forEach((element) => { slicedRepairStations.push(element.station) });

  // Retrieve the distances of each store from the origin
  // The returned list will be in the same order as the destinations list
  const response = await getDistanceMatrix({
    origins: [origin],
    destinations: slicedRepairStations.map((station) => {
      const [lng, lat] = station.geometry.coordinates;
      return { lat, lng };
    }),
    travelMode: google.maps.TravelMode.BICYCLING,
    unitSystem: google.maps.UnitSystem.IMPERIAL,
  });
  response.rows[0].elements.forEach((element, index) => {
    slicedRepairStations[index].properties.distanceText = element.distance.text;
    slicedRepairStations[index].properties.distanceValue = element.distance.value;
  });
}

// Promise wrapper for distance matrix service
function getDistanceMatrix (request) {
  return new Promise((resolve, reject) => {
    const callback = (response, status) => {
      if (status === google.maps.DistanceMatrixStatus.OK) {
        resolve(response);
      } else {
        reject(response);
      }
    };
    distanceMatrixService.getDistanceMatrix(request, callback);
  });
};

//Function to render repair stations panel
function renderRepairStationsPanel() {
  const panel = document.getElementById("panel");
  
  if (slicedRepairStations.length == 0) {
    panel.classList.remove("open");
    
    return;
  }

  // Clear the previous panel rows
  while (panel.lastChild) {
    panel.removeChild(panel.lastChild);
  }
  panel.appendChild(panelTitle());
  slicedRepairStations
    .sort((a, b) => a.properties.distanceValue - b.properties.distanceValue)
    .forEach((station) => {
      panel.appendChild(stationToPanelRow(station));
    });
  // Open the panel
  panel.classList.add("open");
  document.getElementById("page-container").style.gridTemplateColumns = "auto 350px"; // change grid from auto 0 to auto 350, opens panel in a different way than tutorial
  document.getElementById("pac-card").style.right = '360px'; // moves pac-card with the panel opening
  return;
}

//Function to create title for the repair stations panel
function panelTitle() {
  const rowElement = document.createElement("div");
  const nameElement = document.createElement("p");
  nameElement.classList.add("panel-title");
  nameElement.textContent = "Bicycle Repair Stations Distance to Address";
  rowElement.appendChild(nameElement)
  return rowElement;
};

function stationToPanelRow(station, index) {
  const rowElement = document.createElement("div");
  rowElement.classList.add("station-row");
  rowElement.setAttribute("data-station-index", index);
  rowElement.dataset.stationId = station.properties.OBJECTID;

  const nameElement = document.createElement("p");
  nameElement.classList.add("place"); 
  nameElement.textContent = station.properties.Description;
  nameElement.style.fontWeight = 'bold';
  nameElement.style.fontSize = '0.9em';
  nameElement.style.wordWrap = 'break-word';
  nameElement.style.margin = '5px 0';
  nameElement.style.paddingLeft = '18px';
  nameElement.style.paddingRight = '18px';
  rowElement.appendChild(nameElement);

  const distanceTextElement = document.createElement("p");
  distanceTextElement.classList.add("distanceText"); 
  distanceTextElement.textContent = station.properties.distanceText;
  distanceTextElement.style.fontSize = '0.8em';
  distanceTextElement.style.fontWeight = 'normal';
  distanceTextElement.style.color = 'rgb(151, 151, 151)';
  distanceTextElement.style.margin = '5px 0';
  distanceTextElement.style.paddingLeft = '18px';
  distanceTextElement.style.paddingRight = '18px';
  rowElement.appendChild(distanceTextElement);

  // Add click event listener to each row
  rowElement.addEventListener('click', () => {
    if (userCurrentLocation) {
      calculateRouteToStation(userCurrentLocation, station);
    } else {
      alert('Please set your current location first.');
    }
  });
  return rowElement;
};

//Function to initialize geolocation widget
function initGeolocationWidget() {
  let locationButton = document.getElementById("location-button");
  if (!locationButton) {
    locationButton = document.createElement("button");
    locationButton.id = "location-button";
    locationButton.textContent = "Use current location?";
    locationButton.classList.add("custom-map-control-button");
    document.getElementById("pac-card").appendChild(locationButton);
  
    // Respond when a user selects the geolocation button
    locationButton.addEventListener("click", () => {
      // Try HTML5 geolocation.
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            //Update userCurrentLocation
            userCurrentLocation = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            console.log("Location found: ", userCurrentLocation);

           // Update map and markers
           await updateMapAndMarkers(userCurrentLocation);
        },
        ()=> {
          window.alert("Error: Unable to retrieve your location.");
        }
      );
    } else {
      window.alert("Error: Your browser doesn't support geolocation.");
    }
  });
}          
};

// Function to initialize autocomplete widget
function initAutocompleteWidget() {
  // Build and add the autocomplete search bar
  const placesAutoCompleteCardElement = document.getElementById("pac-card");
  const placesAutoCompleteInputElement = placesAutoCompleteCardElement.querySelector(
    "input"
  );
  const options = {
    types: ["address"],
    componentRestrictions: { country: "us" },
    map,
  };

  // Make the search bar into a Places Autocomplete search bar and select
  // which detail fields should be returned about the place that
  // the user selects from the suggestions.
  const autocomplete = new google.maps.places.Autocomplete(
    placesAutoCompleteInputElement,
    options
  );
  autocomplete.setFields(["address_components", "geometry", "name"]);
  map.addListener("bounds_changed", () => {
    autocomplete.setBounds(map.getBounds());
  });

  // Respond when a user selects an address
  // Set the origin point when the user selects an address
  originMarker = new google.maps.Marker({ map: map });
  originMarker.setVisible(false);
  let originLocation = map.getCenter();
  
  autocomplete.addListener("place_changed", async () => {
    markers.forEach((c) => c.setMap(null)); // clear existing repair staions
    originMarker.setVisible(false);
    
    const place = autocomplete.getPlace();
    if (!place.geometry) {
      window.alert("No address available for input: '" + place.name + "'");
      return;
    }

    // Update userCurrentLocation with the selected address
    userCurrentLocation = place.geometry.location.toJSON(); 

    //update map and marker
    await updateMapAndMarkers(userCurrentLocation);
  });
}
    
async function updateMapAndMarkers(location) {
  map.setCenter(location);
  originMarker.setPosition(location);
  originMarker.setVisible(true);

  // Reset global variables for new calculations
  distCalcs = [];
  stationDistCalcs = [];
  slicedRepairStations = [];

  await fetchAndRenderRepairStations(location);

  // Recalculate distances with new location and updated repair stations
  await calculateDistances(location, repairStations);
  // Render the panel with new distance data
  renderRepairStationsPanel();
}

// Function to calculate the route to the selected station
function calculateRouteToStation(origin, station) {
  const destination = {
    lat: station.geometry.coordinates[1],
    lng: station.geometry.coordinates[0]
  };

  directionsService.route({
    origin: origin,
    destination: destination,
    travelMode: google.maps.TravelMode.BICYCLING 
  }, function(response, status) {
    if (status === 'OK') {
      directionsRenderer.setDirections(response);
    } else {
      console.error('Directions request failed due to ' + status);
      window.alert('Directions request failed due to ' + status);
    }
  });
}

function setupAboutButtonListener() {
  const aboutButton = document.getElementById("about-button");
  aboutButton.addEventListener("click", function() {
    openAboutModal();
  });
}

function openAboutModal() {
 // Check if modal already exists
 let modal = document.querySelector(".modal");
 if (!modal) {
   // Create the modal if it doesn't exist
   modal = document.createElement("div");
   modal.classList.add("modal");
   modal.innerHTML = `
  <div class="modal-content">
  <span class="close">&times;</span>
  <h2>About Madison CycleCare</h2>
<p>Madison CycleCare, a creation of Lisa Siewert and Jessica Steslow for their GEOG 576 final project at UW-Madison, aims to streamline bike repair and maintenance for cyclists in Madison.</p>
<h3>Essential Bike Repair Tips</h3>
<ul>
  <li>Ensure your tires are always inflated to the recommended pressure levels for optimal performance.</li>
  <li>Maintain a clean and well-lubricated chain to enhance your riding experience.</li>
  <li>Regular brake inspections are crucial for safe cycling – always check their functionality.</li>
  <li>For comprehensive bike maintenance guides, please visit <a href='https://www.rei.com/learn/expert-advice/bike-maintenance.html' target='_blank'>the REI Bike Maintenance Basics page</a>.</li>
</ul>
<p>This application is not only a tool for local cyclists but also serves as an academic contribution to the field of geographic information systems and its application in community services.</p>
</div>
  `;
  document.body.appendChild(modal);

  // Handle closing the modal
  modal.querySelector(".close").onclick = function() {
    modal.style.display = "none";
  };

  window.onclick = function(event) {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  };
}

// Display the modal
modal.style.display = "block";
}

// Initialize the application after DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);