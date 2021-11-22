import express from "express";
import { ApolloServer } from "apollo-server-express";
import { ApolloServerPluginLandingPageGraphQLPlayground } from "apollo-server-core";

import DataLoader from "dataloader";
import transform from "lodash.transform";
import isEqual from "lodash.isequal";

import Resource, { ResourceEntry } from "./lib/resource";
import Resources from "./lib/resources";
import SchemaLoader from "./lib/schema-loader";
import {
  isListType,
  oneOrMany,
  unwrapCompositeType,
  ensureArray,
} from "./lib/utils";

type ResourceResolver = (
  parent: ResourceEntry,
  args: { iri: string | Array<string> },
  context: Context
) => Promise<ResourceEntry | ResourceEntry[] | null>;

interface Context {
  loaders: Map<Resource, DataLoader<string, ResourceEntry | null>>;
}

const port = process.env.PORT || 4000;
const path = process.env.ROOT_PATH || "/";
const maxBatchSize = Number(process.env.MAX_BATCH_SIZE || Infinity);
const resourcesDir = process.env.RESOURCES_DIR || "./resources";
const configFile = process.env.CONFIG_FILE || "./config.json";

// Load schema from folder
const loader = await SchemaLoader.loadFrom(resourcesDir);

const resources = new Resources(loader.resourceTypeDefs);

const queryResolvers: Record<string, ResourceResolver> = {};

(loader.queryDef.fields || []).forEach((field) => {
  queryResolvers[field.name.value] = async (
    _parent,
    args: { iri: string | Array<string> },
    context
  ) => {
    const resourceName = unwrapCompositeType(field.type).name.value;
    const resource = resources.lookup(resourceName);

    if (!resource) {
      throw new Error(`resource ${resourceName} is not found`);
    }

    if (isEqual(Object.keys(args), ["iri"])) {
      const loader = context.loaders.get(resource);

      if (!loader) {
        throw new Error(
          `missing resource loader for ${resource.definition.name.value}`
        );
      }

      const iris = ensureArray(args.iri);
      return oneOrMany(await loader.loadMany(iris), !isListType(field.type));
    }
    return oneOrMany(await resource.fetch(args), !isListType(field.type));
  };
});

const resourceResolvers: Record<string, Record<string, ResourceResolver>> = {};

// Iterate over all resources
resources.all.forEach((resource) => {
  //Initalize empty field resolver
  const fieldResolvers: Record<string, ResourceResolver> = (resourceResolvers[
    resource.definition.name.value
  ] = {});

  //Iterate over every field definition
  (resource.definition.fields || []).forEach((field) => {
    const type = field.type;
    const name = field.name.value;

    // Create field resolver for field
    fieldResolvers[name] = async (parent, args, context) => {
      // get the parent of this field
      const value = parent[name];

      // If the parent exists, make sure it's an array
      if (!value) {
        return isListType(type) ? [] : value;
      }

      // Get the underlying type
      const resourceName = unwrapCompositeType(type).name.value;
      const resource = resources.lookup(resourceName);

      if (!resource || resource.isEmbeddedType) {
        return value;
      }

      if (Object.keys(args).length === 0) {
        const loader = context.loaders.get(resource);
        if (!loader) {
          throw new Error(
            `missing resource loader for ${resource.definition.name.value}`
          );
        }
        // TODO: if multiple values are returned when the schema defines single value, value is no array. Pick first element of array in case.
        const entry = await loader.loadMany(ensureArray(value));
        return oneOrMany(entry, !isListType(type));
      } else {
        const argIRIs = ensureArray(args.iri);
        const allIRIs = Array.from(new Set([...value, ...argIRIs]));

        return oneOrMany(
          await resource.fetch({ ...args, ...{ iri: allIRIs } }),
          !isListType(type)
        );
      }
    };
  });
});

const rootResolvers = {
  Query: queryResolvers,
  ...resourceResolvers,
};

// Initiate server

const app = express();

const server = new ApolloServer({
  typeDefs: loader.originalTypeDefs,
  resolvers: rootResolvers,
  context: () => {
    return {
      loaders: transform(
        resources.root,
        (acc, resource) => {
          acc.set(
            resource,
            new DataLoader(
              async (iris: ReadonlyArray<string>) => {
                console.log(iris)
                return resource.fetchByIRIs(iris);
              },
              { maxBatchSize }
            )
          );
        },
        new Map<Resource, DataLoader<string, ResourceEntry | null>>()
      ),
    };
  },
  plugins: [ApolloServerPluginLandingPageGraphQLPlayground()],
});

server.start().then(() => {
  server.applyMiddleware({ app, path });

  app.listen(port, () => {
    console.log(
      `🚀 Server ready at http://localhost:${port}${server.graphqlPath}`
    );
  });
});
