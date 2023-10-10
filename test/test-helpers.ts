import fs from "fs";
import { parse } from "graphql/language/parser.js";
import { ObjectTypeDefinitionNode } from "graphql";
import { join } from "path";
import Resource from "../lib/resource.js";
import SparqlClient from "sparql-http-client";
import Resources from "../lib/resources.js";
import { Quad } from "@rdfjs/types";
import StreamStore from "sparql-http-client/StreamStore.js";
import Endpoint from "sparql-http-client/Endpoint.js";
import { Readable } from "stream";
import * as url from 'url';
const dirname = url.fileURLToPath(new URL('.', import.meta.url));

export function getTestFile(path: string): string {
  return fs.readFileSync(join(dirname, path), { encoding: "utf-8" });
}
export function getResourceTypeDefs(path: string): ObjectTypeDefinitionNode[] {
  const schema = getTestFile(path);
  return parse(schema).definitions.filter(
    (def): def is ObjectTypeDefinitionNode => {
      return def.kind === "ObjectTypeDefinition";
    }
  );
}
export function getTestResources(res?: Resource): Resources {
  return {
    all: res ? [res] : [],
    root: res ? [res] : [],
    isUserDefined: () => true,
    lookup: (name: string) => null,
  };
}
export function getTestResource(
  path: string,
  name: string = "Test",
  serviceIndex?: Map<string, SparqlClient>,
  templateIndex?: Map<string, string>
): Resource {
  const resourceTypeDefs = getResourceTypeDefs(path);
  const testResourceTypeDef = resourceTypeDefs.filter(
    (def) => def.name.value === name
  )[0];
  return Resource.buildFromTypeDefinition(
    getTestResources(),
    testResourceTypeDef,
    serviceIndex,
    templateIndex
  );
}

export function getTestSparqlClient(quads: Quad[]):SparqlClient {
  const endpoint = new Endpoint({endpointUrl: "http://example.org"})
  return {
    query: { 
      endpoint, 
      ask: async (query) => true, 
      construct: async (query) => Readable.from(quads), 
      select: async (query) => new Readable(), 
      update: async (query) => {}, 
    },
    store: new StreamStore({endpoint})
  }
}

export function compileEmptyTemplate(res: Resource) {
  return res.queryTemplate != null ? res.queryTemplate({}) : "";
}
