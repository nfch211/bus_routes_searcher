import React, { useState, useRef, useEffect } from "react";
import { GoogleMap, LoadScript, Marker } from "@react-google-maps/api";
import axios from "axios"; // Import axios

// --- Python Backend Logic (Fetcher Class) ---
class Fetcher {
  constructor() {
    /**
     * Initializes the Fetcher by fetching and processing bus stop and route data.
     */
    this.all_stop_data = [];
    this.all_route_data = [];
    this.route = {};
    this.stop_name_dict = {};
    this.stops_nearby = null;
    this.stops_nearby_destination = null;
    this.start = null;
    this.end = null;
    this.dataLoaded = false;

    console.log("Fetcher constructor: Initializing data...");
    this.initializeData();
  }

  async initializeData() {
    console.log("Fetcher.initializeData: Starting data fetch...");
    try {
      // Fetch all stop data
      console.log("Fetcher.initializeData: Fetching stop data...");
      const stops_response = await axios.get(
        "https://data.etabus.gov.hk/v1/transport/kmb/stop"
      );
      console.log(
        "Fetcher.initializeData: Stop data request sent. Status:",
        stops_response.status
      );
      stops_response.raise_for_status = () => {
        if (stops_response.status >= 400) {
          throw new Error(`HTTP error! status: ${stops_response.status}`);
        }
      };
      stops_response.raise_for_status();
      this.all_stop_data = stops_response.data.data;
      console.log(
        "Fetcher.initializeData: Stop data fetched successfully. Count:",
        this.all_stop_data.length
      );

      // Fetch all route-stop data
      console.log("Fetcher.initializeData: Fetching route-stop data...");
      const routes_response = await axios.get(
        "https://data.etabus.gov.hk/v1/transport/kmb/route-stop"
      );
      console.log(
        "Fetcher.initializeData: Route-stop data request sent. Status:",
        routes_response.status
      );
      routes_response.raise_for_status = () => {
        if (routes_response.status >= 400) {
          throw new Error(`HTTP error! status: ${routes_response.status}`);
        }
      };
      routes_response.raise_for_status();
      this.all_route_data = routes_response.data.data;
      console.log(
        "Fetcher.initializeData: Route-stop data fetched successfully. Count:",
        this.all_route_data.length
      );

      // Build route dictionary
      console.log("Fetcher.initializeData: Building route dictionary...");
      this.route = {};
      for (const route_info of this.all_route_data) {
        const stop_id = route_info.stop;
        const route_num = route_info.route;
        if (!this.route[stop_id]) {
          this.route[stop_id] = new Set();
        }
        this.route[stop_id].add(route_num);
      }
      console.log(
        "Fetcher.initializeData: Route dictionary built. Entries:",
        Object.keys(this.route).length
      );

      // Build stop name dictionary
      console.log("Fetcher.initializeData: Building stop name dictionary...");
      this.stop_name_dict = {};
      for (const stop_data of this.all_stop_data) {
        this.stop_name_dict[stop_data.stop] = stop_data.name_tc;
      }
      console.log(
        "Fetcher.initializeData: Stop name dictionary built. Entries:",
        Object.keys(this.stop_name_dict).length
      );

      console.log(
        "Fetcher.initializeData: Data initialization complete successfully."
      );
      this.dataLoaded = true;
    } catch (error) {
      console.error(
        "Fetcher.initializeData: ERROR during initial data fetch:",
        error
      );
      this.all_stop_data = [];
      this.all_route_data = [];
      this.route = {};
      this.stop_name_dict = {};
      this.dataLoaded = false;
    }
  }

  get_stop_name(stop_id) {
    return this.stop_name_dict[stop_id] || "Stop Name Not Found";
  }

  get_nearby_stops(lat, lon, variation = 0.0001, is_destination = false) {
    console.log(
      "Fetcher.get_nearby_stops: lat:",
      lat,
      "lon:",
      lon,
      "variation:",
      variation,
      "is_destination:",
      is_destination
    ); // Log inputs
    const nearby_stops = this.all_stop_data.filter((data) => {
      const stopLat = parseFloat(data.lat);
      const stopLon = parseFloat(data.long);
      return (
        lat - variation <= stopLat &&
        stopLat <= lat + variation &&
        lon - variation <= stopLon &&
        stopLon <= lon + variation
      );
    });
    console.log(
      "Fetcher.get_nearby_stops: Found",
      nearby_stops.length,
      "nearby stops."
    ); // Log output count
    if (is_destination) {
      this.stops_nearby_destination = nearby_stops;
      this.find_route();
    } else {
      this.stops_nearby = nearby_stops;
    }
    return nearby_stops;
  }

  get_stops_nearby(lat, lon, variation = 0.005) {
    return this.get_nearby_stops(lat, lon, variation, false);
  }

  get_stops_nearby_destination(lat, lon, variation = 0.005) {
    return this.get_nearby_stops(lat, lon, variation, true);
  }

  find_route() {
    this.start = new Set();
    this.end = new Set();
    if (this.stops_nearby) {
      for (const stop of this.stops_nearby) {
        const routesForStop = this.route[stop.stop] || new Set();
        for (const route_id of routesForStop) {
          this.start.add(route_id);
        }
      }
    }
    if (this.stops_nearby_destination) {
      for (const stop of this.stops_nearby_destination) {
        const routesForStop = this.route[stop.stop] || new Set();
        for (const route_id of routesForStop) {
          this.end.add(route_id);
        }
      }
    }
  }

  async find_transfer_stop(route1, route2) {
    let route1_stops = new Set();
    let route2_stops = new Set();

    const url1 = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route1}/outbound/1`;
    try {
      const response1 = await axios.get(url1);
      response1.raise_for_status = () => {
        if (response1.status >= 400) {
          throw new Error(`HTTP error! status: ${response1.status}`);
        }
      };
      response1.raise_for_status();
      const route_stop_data1 = response1.data.data;
      route1_stops = new Set(
        route_stop_data1.map((stop_info) => stop_info.stop)
      );
    } catch (error) {
      console.error(
        `Error fetching route-stop data for route ${route1}:`,
        error
      );
      return null;
    }

    const url2 = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route2}/outbound/1`;
    try {
      const response2 = await axios.get(url2);
      response2.raise_for_status = () => {
        if (response2.status >= 400) {
          throw new Error(`HTTP error! status: ${response2.status}`);
        }
      };
      response2.raise_for_status();
      const route_stop_data2 = response2.data.data;
      route2_stops = new Set(
        route_stop_data2.map((stop_info) => stop_info.stop)
      );
    } catch (error) {
      console.error(
        `Error fetching route-stop data for route ${route2}:`,
        error
      );
      return null;
    }

    const common_stops = new Set(
      [...route1_stops].filter((stop) => route2_stops.has(stop))
    );
    if (common_stops.size > 0) {
      return common_stops.values().next().value;
    }
    return null;
  }

  async find_bus_journeys(
    start_lat,
    start_lon,
    dest_lat,
    dest_lon,
    max_paths = 6
  ) {
    this.get_stops_nearby(start_lat, start_lon);
    this.get_stops_nearby_destination(dest_lat, dest_lon);

    console.log("find_bus_journeys: Start nearby stops:", this.stops_nearby); // LOG: Nearby start stops
    console.log(
      "find_bus_journeys: Destination nearby stops:",
      this.stops_nearby_destination
    ); // LOG: Nearby destination stops

    this.find_route(); // Call find_route to populate this.start and this.end
    console.log("find_bus_journeys: Start routes (this.start):", this.start); // LOG: Start routes
    console.log("find_bus_journeys: Destination routes (this.end):", this.end); // LOG: Destination routes

    const found_paths = [];
    const unique_paths = new Set();
    // Using standard Javascript array as queue for debugging
    const queue = [...this.start].map((route) => [route, [route]]);
    const destination_routes = this.end;
    const visited_routes = new Set();

    console.log(
      "find_bus_journeys: Starting BFS. Initial queue size:",
      queue.length
    ); // LOG: BFS start
    console.log(
      "find_bus_journeys: Queue length just before loop:",
      queue.length
    ); // <---- ADDED LOG

    while (queue.length > 0 && found_paths.length < max_paths) {
      const [current_route, path] = queue.shift();

      console.log(
        "find_bus_journeys: BFS processing route:",
        current_route,
        "Path:",
        path
      ); // LOG: Route being processed

      if (destination_routes.has(current_route)) {
        console.log(
          "find_bus_journeys: BFS found destination route:",
          current_route,
          "Path:",
          path
        ); // LOG: Destination route found
        const path_tuple = path.join(",");
        if (!unique_paths.has(path_tuple)) {
          found_paths.push(path);
          unique_paths.add(path_tuple);
        }
        if (found_paths.length >= max_paths) {
          break;
        }
        continue;
      }

      if (visited_routes.has(current_route)) {
        console.log(
          "find_bus_journeys: BFS route already visited:",
          current_route
        ); // LOG: Route already visited
        continue;
      }
      visited_routes.add(current_route);

      const url = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${current_route}/outbound/1`;
      try {
        const response = await axios.get(url);
        response.raise_for_status = () => {
          if (response.status >= 400) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
        };
        response.raise_for_status();
        const route_stop_data = response.data.data;
        console.log(
          "find_bus_journeys: Fetched route-stop data for route:",
          current_route,
          "Stop count:",
          route_stop_data.length
        ); // LOG: Route-stop data fetched

        for (const stop_info of route_stop_data) {
          const stop_id = stop_info.stop;
          const connected_routes = this.route[stop_id] || new Set();
          console.log(
            "find_bus_journeys: Stop ID:",
            stop_id,
            "Connected routes:",
            connected_routes
          ); // LOG: Stop and connected routes
          for (const new_route of connected_routes) {
            if (!path.includes(new_route)) {
              const new_path = [...path, new_route];
              const path_tuple = new_path.join(",");

              if (
                destination_routes.has(new_route) &&
                !unique_paths.has(path_tuple)
              ) {
                console.log(
                  "find_bus_journeys: BFS found destination route (via connection):",
                  new_route,
                  "Path:",
                  new_path
                ); // LOG: Destination route via connection
                found_paths.push(new_path);
                unique_paths.add(path_tuple);
                if (found_paths.length >= max_paths) {
                  break;
                }
              } else if (!destination_routes.has(new_route)) {
                console.log(
                  "find_bus_journeys: BFS adding to queue: route:",
                  new_route,
                  "Path:",
                  new_path
                ); // LOG: Adding to queue
                queue.push([new_route, new_path]);
              }
            }
          }
          if (found_paths.length >= max_paths) {
            break;
          }
        }
      } catch (error) {
        console.error(
          `find_bus_journeys: Error fetching data for route ${current_route}:`,
          error
        );
        continue;
      }
    }

    const formatted_paths = [];
    if (found_paths.length > 0) {
      console.log("find_bus_journeys: Found paths:", found_paths); // LOG: Found paths (before formatting)
      for (const path of found_paths) {
        const journey_steps = [];
        const startNearbyStops = this.stops_nearby || [];
        let current_start_stop =
          startNearbyStops.length > 0 ? startNearbyStops[0] : null;
        if (!current_start_stop) continue;

        for (let route_index = 0; route_index < path.length; route_index++) {
          const route = path[route_index];
          const from_stop_name = this.get_stop_name(current_start_stop.stop);

          if (route_index < path.length - 1) {
            const next_route = path[route_index + 1];
            const transfer_stop_id = await this.find_transfer_stop(
              route,
              next_route
            );
            if (transfer_stop_id) {
              const to_stop_name = this.get_stop_name(transfer_stop_id);
              journey_steps.push({
                type: "route_segment",
                route: route,
                from_stop_name: from_stop_name,
                to_stop_name: to_stop_name,
                transfer_stop_name: to_stop_name,
              });
              const transferStopData = this.all_stop_data.find(
                (stop) => stop.stop === transfer_stop_id
              );
              current_start_stop = transferStopData || current_start_stop;
            } else {
              journey_steps.push({
                type: "route_segment",
                route: route,
                from_stop_name: from_stop_name,
                to_stop_name: "Transfer Stop Not Found",
                transfer_stop_name: "N/A",
              });
            }
          } else {
            const destinationNearbyStops = this.stops_nearby_destination || [];
            const destination_stop =
              destinationNearbyStops.length > 0
                ? destinationNearbyStops[0]
                : null;
            if (!destination_stop) continue;

            const to_stop_name = this.get_stop_name(destination_stop.stop);
            journey_steps.push({
              type: "route_segment",
              route: route,
              from_stop_name: from_stop_name,
              to_stop_name: to_stop_name,
              transfer_stop_name: "Destination",
            });
          }
        }
        formatted_paths.push(journey_steps);
      }
    } else {
      console.log("find_bus_journeys: No paths found by BFS."); // LOG: No paths found by BFS
    }
    return { journeys: formatted_paths };
  }
}

// Custom deque implementation
class deque {
  constructor() {
    this.items = [];
  }
  push(item) {
    this.items.push(item);
  }
  shift() {
    return this.items.shift();
  }
  get length() {
    return this.items.length;
  }
}

// --- React Frontend Code (BusMap Component) ---
const googleMapsApiKey = ""; // Replace with your API key

const mapContainerStyle = {
  width: "100%",
  height: "500px",
};

const defaultCenter = {
  lat: 22.3193,
  lng: 114.1694,
};

function BusMap() {
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [journeys, setJourneys] = useState(null);
  const mapRef = useRef(null);
  const fetcherInstance = useRef(new Fetcher());

  // New state variables for loading and data display
  const [startPointLatLng, setStartPointLatLng] = useState(null);
  const [endPointLatLng, setEndPointLatLng] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [findingRoutes, setFindingRoutes] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(
    "Loading bus stop data... Please wait."
  );
  // New state for manual input
  const [startLatInput, setStartLatInput] = useState("");
  const [startLngInput, setStartLngInput] = useState("");
  const [endLatInput, setEndLatInput] = useState("");
  const [endLngInput, setEndLngInput] = useState("");

  useEffect(() => {
    console.log(
      "BusMap useEffect: Component mounted or Fetcher instance updated."
    );
    let loadingAttempts = 0;
    const loadingInterval = setInterval(() => {
      loadingAttempts++;
      setLoadingMessage(
        `Loading bus stop data... Please wait. (Attempt ${loadingAttempts})`
      );
    }, 5000);

    const checkDataLoadStatus = () => {
      console.log(
        "BusMap useEffect: Checking fetcherInstance.current.dataLoaded:",
        fetcherInstance.current.dataLoaded
      );
      if (fetcherInstance.current.dataLoaded) {
        clearInterval(loadingInterval);
        setLoadingData(false);
        setLoadingMessage("Bus stop data loaded.");
        console.log(
          "BusMap useEffect: Data loading complete detected, setting loadingData to false and clearing interval."
        );
      } else {
        console.log(
          "BusMap useEffect: Data not yet loaded, re-checking in 1 second..."
        );
        setTimeout(checkDataLoadStatus, 1000);
      }
    };

    checkDataLoadStatus();

    return () => clearInterval(loadingInterval);
  }, [fetcherInstance]);

  // Update startPointLatLng and startPoint when input values change
  useEffect(() => {
    const lat = parseFloat(startLatInput);
    const lng = parseFloat(startLngInput);
    if (!isNaN(lat) && !isNaN(lng)) {
      setStartPointLatLng({ lat: lat, lng: lng });
      setStartPoint({ lat: lat, lng: lng }); // Also update startPoint for marker
    } else {
      setStartPointLatLng(null);
      setStartPoint(null);
    }
  }, [startLatInput, startLngInput]);

  // Update endPointLatLng and endPoint when input values change
  useEffect(() => {
    const lat = parseFloat(endLatInput);
    const lng = parseFloat(endLngInput);
    if (!isNaN(lat) && !isNaN(lng)) {
      setEndPointLatLng({ lat: lat, lng: lng });
      setEndPoint({ lat: lat, lng: lng }); // Also update endPoint for marker
    } else {
      setEndPointLatLng(null);
      setEndPoint(null);
    }
  }, [endLatInput, endLngInput]);

  const onMapClick = (event) => {
    const latLng = { lat: event.latLng.lat(), lng: event.latLng.lng() };
    if (!startPoint) {
      setStartLatInput(latLng.lat.toFixed(4)); // Set input value from map click
      setStartLngInput(latLng.lng.toFixed(4));
    } else if (!endPoint) {
      setEndLatInput(latLng.lat.toFixed(4));
      setEndLngInput(latLng.lng.toFixed(4));
    }
  };

  const handleFindRoutes = async () => {
    if (startPoint && endPoint) {
      if (!loadingData) {
        console.log("handleFindRoutes: Finding routes...");
        console.log("handleFindRoutes: Start Point:", startPoint); // Log startPoint
        console.log("handleFindRoutes: End Point:", endPoint); // Log endPoint
        setFindingRoutes(true);
        const results = await fetcherInstance.current.find_bus_journeys(
          startPoint.lat,
          startPoint.lng,
          endPoint.lat,
          endPoint.lng
        );
        setJourneys(results.journeys);
        setFindingRoutes(false);
        console.log(
          "handleFindRoutes: Results from find_bus_journeys:",
          results
        ); // Log the results
        if (results.journeys.length === 0) {
          console.log("handleFindRoutes: No journeys found.");
        } else {
          console.log("handleFindRoutes: Journeys found:", results.journeys);
        }
      } else {
        alert("Data is still loading. Please wait a moment and try again.");
        console.log(
          "handleFindRoutes: Data loading is still in progress, route finding aborted."
        );
      }
    } else {
      alert("Please select both a start and an end point on the map.");
    }
  };

  const handleClearPoints = () => {
    setStartPoint(null);
    setEndPoint(null);
    setStartPointLatLng(null);
    setEndPointLatLng(null);
    setJourneys(null);
    // Clear input fields as well
    setStartLatInput("");
    setStartLngInput("");
    setEndLatInput("");
    setEndLngInput("");
  };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "20px" }}>
      <h1 style={{ textAlign: "center", color: "#333", marginBottom: "20px" }}>
        Bus Route Planner
      </h1>
      <p style={{ textAlign: "center", marginBottom: "20px", color: "#555" }}>
        Click on the map to set start and end points, or enter coordinates
        manually below.
      </p>

      <div
        style={{
          marginBottom: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "15px",
        }}
      >
        <div>
          <h3 style={{ color: "#333", marginBottom: "10px" }}>起點座標</h3>
          <div style={{ display: "flex", alignContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label
                htmlFor="startLat"
                style={{
                  fontWeight: "bold",
                  minWidth: "70px",
                  textAlign: "right",
                }}
              >
                Lat:
              </label>
              <input
                type="number"
                id="startLat"
                value={startLatInput}
                onChange={(e) => setStartLatInput(e.target.value)}
                placeholder="Latitude"
                style={{
                  padding: "8px",
                  borderRadius: "5px",
                  border: "1px solid #ccc",
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label
                htmlFor="startLng"
                style={{
                  fontWeight: "bold",
                  minWidth: "70px",
                  textAlign: "right",
                }}
              >
                Lon:
              </label>
              <input
                type="number"
                id="startLng"
                value={startLngInput}
                onChange={(e) => setStartLngInput(e.target.value)}
                placeholder="Longitude"
                style={{
                  padding: "8px",
                  borderRadius: "5px",
                  border: "1px solid #ccc",
                }}
              />
            </div>
          </div>
        </div>

        <div>
          <h3 style={{ color: "#333", marginBottom: "10px" }}>終點座標</h3>
          <div style={{ display: "flex", alignContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label
                htmlFor="endLat"
                style={{
                  fontWeight: "bold",
                  minWidth: "70px",
                  textAlign: "right",
                }}
              >
                Lat:
              </label>
              <input
                type="number"
                id="endLat"
                value={endLatInput}
                onChange={(e) => setEndLatInput(e.target.value)}
                placeholder="Latitude"
                style={{
                  padding: "8px",
                  borderRadius: "5px",
                  border: "1px solid #ccc",
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label
                htmlFor="endLng"
                style={{
                  fontWeight: "bold",
                  minWidth: "70px",
                  textAlign: "right",
                }}
              >
                Lon:
              </label>
              <input
                type="number"
                id="endLng"
                value={endLngInput}
                onChange={(e) => setEndLngInput(e.target.value)}
                placeholder="Longitude"
                style={{
                  padding: "8px",
                  borderRadius: "5px",
                  border: "1px solid #ccc",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <LoadScript googleMapsApiKey={googleMapsApiKey}>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={defaultCenter}
          zoom={12}
          onClick={onMapClick}
          onLoad={(map) => {
            mapRef.current = map;
          }}
        >
          {startPoint && <Marker position={startPoint} label="Start" />}
          {endPoint && <Marker position={endPoint} label="End" />}
        </GoogleMap>
      </LoadScript>

      <div style={{ margin: "20px 0", textAlign: "center" }}>
        {startPointLatLng && (
          <p style={{ margin: "5px 0", color: "#777" }}>
            Start Point (Map/Input): Lat: {startPointLatLng.lat.toFixed(4)},
            Lng: {startPointLatLng.lng.toFixed(4)}
          </p>
        )}
        {endPointLatLng && (
          <p style={{ margin: "5px 0", color: "#777" }}>
            End Point (Map/Input): Lat: {endPointLatLng.lat.toFixed(4)}, Lng:{" "}
            {endPointLatLng.lng.toFixed(4)}
          </p>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "20px",
          marginBottom: "20px",
        }}
      >
        <button
          onClick={handleFindRoutes}
          disabled={!startPoint || !endPoint || loadingData || findingRoutes}
          style={{
            padding: "10px 20px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          搵巴士路線
        </button>

        <button
          onClick={handleClearPoints}
          disabled={loadingData || findingRoutes}
          style={{
            padding: "10px 20px",
            backgroundColor: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          重設座標
        </button>
      </div>

      <div style={{ textAlign: "center", marginBottom: "20px", color: "#777" }}>
        {loadingData ? (
          <p>{loadingMessage}</p>
        ) : findingRoutes ? (
          <p>Finding Bus Routes... Please wait, this may take a few seconds.</p>
        ) : journeys && journeys.length > 0 ? (
          <div>
            <h2 style={{ color: "#333", marginBottom: "15px" }}>
              Bus Journeys:
            </h2>
            {journeys.map((journey, journeyIndex) => (
              <div
                key={journeyIndex}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "5px",
                  padding: "15px",
                  marginBottom: "15px",
                }}
              >
                <h3 style={{ color: "#333", marginBottom: "10px" }}>
                  Journey {journeyIndex + 1}:
                </h3>
                <ul style={{ listStyleType: "none", paddingLeft: 0 }}>
                  {journey.map((step, stepIndex) => (
                    <li key={stepIndex} style={{ marginBottom: "8px" }}>
                      坐{" "}
                      <strong style={{ color: "#007bff" }}>{step.route}</strong>{" "}
                      由{" "}
                      <strong style={{ color: "green" }}>
                        {step.from_stop_name}
                      </strong>{" "}
                      去{" "}
                      <strong style={{ color: "green" }}>
                        {step.to_stop_name}
                      </strong>{" "}
                      落車
                      {step.transfer_stop_name !== "Destination" &&
                        step.transfer_stop_name !== "N/A"}
                      {step.transfer_stop_name === "Destination" && (
                        <span style={{ color: "green" }}>
                          {" "}
                          <strong style={{ color: "#666" }}>(終點站)</strong>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : journeys &&
          journeys.length === 0 &&
          !loadingData &&
          !findingRoutes ? (
          <p style={{ color: "red" }}>
            No bus journeys found for the selected locations.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default BusMap;
