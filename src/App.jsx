import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import axio from "axios";
import "./App.css";
import Data from "./API";
import BusMap from "./Busmap";
function App() {
  return (
    <>
      <BusMap />
    </>
  );
}

export default App;
