import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("A #root elem nem található az index.html-ben.");
}

createRoot(container).render(<App />);
