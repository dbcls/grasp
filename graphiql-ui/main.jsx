import React from "react";
import { createRoot } from "react-dom/client";
import { GraphiQL } from "graphiql";
import "graphiql/style.css";

const editorWorkerUrl = new URL("./editor.worker.js", import.meta.url);
const graphqlWorkerUrl = new URL("./graphql.worker.js", import.meta.url);
const jsonWorkerUrl = new URL("./json.worker.js", import.meta.url);
const cssWorkerUrl = new URL("./css.worker.js", import.meta.url);
const htmlWorkerUrl = new URL("./html.worker.js", import.meta.url);
const tsWorkerUrl = new URL("./ts.worker.js", import.meta.url);

globalThis.MonacoEnvironment = {
  getWorker(_workerId, label) {
    switch (label) {
      case "graphql":
        return new Worker(graphqlWorkerUrl, { type: "module" });
      case "json":
        return new Worker(jsonWorkerUrl, { type: "module" });
      case "css":
      case "scss":
      case "less":
        return new Worker(cssWorkerUrl, { type: "module" });
      case "html":
      case "handlebars":
      case "razor":
        return new Worker(htmlWorkerUrl, { type: "module" });
      case "typescript":
      case "javascript":
        return new Worker(tsWorkerUrl, { type: "module" });
      default:
        return new Worker(editorWorkerUrl, { type: "module" });
    }

  },
};

const graphQLFetcher = async (graphQLParams) => {
  const response = await fetch(window.GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(graphQLParams),
  });

  return response.json();
};

const container = document.getElementById("graphiql");

if (!container) {
  throw new Error("GraphiQL root element is missing");
}

createRoot(container).render(
  <React.StrictMode>
    <GraphiQL fetcher={graphQLFetcher} />
  </React.StrictMode>
);
