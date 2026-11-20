import React from "react";
import ReactDOM from "react-dom/client";
import { loader } from "@monaco-editor/react";
import { App } from "./App";
import "./styles.css";
import "katex/dist/katex.min.css";
import "./markdown.css";

loader.config({
  paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.56.0/min/vs" }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
