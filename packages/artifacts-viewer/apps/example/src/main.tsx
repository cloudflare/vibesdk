import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/jetbrains-mono";
import "artifacts-viewer/styles.css";
import "./index.css";
import { App } from "./App.tsx";

const container = document.getElementById("root");

if (container === null) {
  throw new Error("The example root element was not found.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
