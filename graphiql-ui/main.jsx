import React from "react";
import { createRoot } from "react-dom/client";
import { GraphiQL } from "graphiql";
import "graphiql/style.css";

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
