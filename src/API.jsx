import axios from "axios";
import React, { useEffect, useState } from "react";

function Data() {
  const [data, setData] = useState(""); // State for route stop data
  const [stopID, setStopID] = useState(""); // State for stop data
  const [rout, setRout] = useState("");
  const [bus, setbus] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(
          `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${bus}/outbound/1`
        );
        setData(response.data.data); // Update to access the correct data property
      } catch (err) {
        console.log(err);
      }
    };

    fetchData();
  }, [bus]); // Use rout as a dependency to refetch when it changes

  useEffect(() => {
    const fetchStopID = async () => {
      try {
        const response = await axios.get(
          "https://data.etabus.gov.hk/v1/transport/kmb/stop"
        );
        setStopID(response.data.data); // Update to access the correct data property
      } catch (err) {
        console.log(err);
      }
    };

    fetchStopID();
  }, []);

  function handleSubmit(event) {
    event.preventDefault(); // Prevent form submission
    setbus(rout);
  }

  function handleInput(event) {
    setRout(event.target.value); // Update rout state with input value
  }

  return (
    <div>
      <h1>Data</h1>

      <form onSubmit={handleSubmit}>
        <label>Route: </label>
        <input value={rout} onChange={handleInput} />
        <button type="submit" style={{ margin: "5px" }}>
          Submit
        </button>
      </form>

      {data &&
        stopID &&
        data.map((h, index) =>
          stopID
            .filter((id) => id.stop === h.stop)
            .map((filteredID) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignContent: "center",
                  justifyContent: "center",
                  height: "10vh",
                  backgroundColor: "grey",
                  margin: "5px",
                }}
              >
                <h1>{filteredID.name_tc}</h1>
                <h6
                  style={{ justifyContent: "center", alignContent: "center" }}
                >
                  {filteredID.stop}
                </h6>
              </div>
            ))
        )}
    </div>
  );
}

export default Data;
