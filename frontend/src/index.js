import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { applyTheme, pinDocumentTheme, readCachedTheme } from "@/lib/theme";

const cachedTheme = readCachedTheme();
if (cachedTheme) {
  applyTheme(cachedTheme);
} else {
  // No saved preference yet - paint the light default immediately (without persisting
  // it as a real choice) so the browser always gets an explicit color-scheme. Skipping
  // this used to leave brand-new visitors with no signal at all, which is exactly what
  // trips Android/Chrome's Auto Dark Theme into re-painting our light pages near-black.
  pinDocumentTheme('light');
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
