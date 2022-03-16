import fs from "fs";
import { parse } from "graphql/language/parser";
import { ObjectTypeDefinitionNode } from "graphql";
import { join } from "path";
import Resource from "../lib/resource";
import SparqlClient from "sparql-http-client";

export function getResourceTypeDefs(path: string): ObjectTypeDefinitionNode[] {
  const schema = fs.readFileSync(join(__dirname, path), { encoding: "utf-8" });
  return parse(schema).definitions.filter(
    (def): def is ObjectTypeDefinitionNode => {
      return def.kind === "ObjectTypeDefinition";
    }
  );
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
    undefined,
    testResourceTypeDef,
    serviceIndex,
    templateIndex
  );
}