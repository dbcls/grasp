import { initialize } from "monaco-editor/esm/vs/editor/editor.worker";
import { GraphQLWorker } from "monaco-graphql/esm/GraphQLWorker.js";

globalThis.onmessage = () => {
  initialize((ctx, createData) => new GraphQLWorker(ctx, createData));
};
