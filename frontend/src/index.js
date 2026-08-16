import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { applyTheme, readCachedTheme } from "@/lib/theme";

const cachedTheme = readCachedTheme();
if (cachedTheme) applyTheme(cachedTheme);

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
