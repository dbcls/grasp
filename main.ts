import express from "express";
import { ApolloServer } from "apollo-server-express";
import {
  ApolloServerPluginLandingPageGraphQLPlayground,
  ApolloServerPluginLandingPageProductionDefault,
} from "apollo-server-core";

import DataLoader from "dataloader";
import transform from "lodash/transform";
import isEqual from "lodash/isEqual";

import Resource, { ResourceEntry } from "./lib/resource";
import Resources from "./lib/resources";
import SchemaLoader from "./lib/schema-loader";
import {
  isListType,
  oneOrMany,
  unwrapCompositeType,
  ensureArray,
} from "./lib/utils";
import ConfigLoader from "./lib/config-loader";
import logger from "./lib/logger";

type ResourceResolver = (
  parent: ResourceEntry,
  args: { iri: string | Array<string> },
  context: Context
) => Promise<ResourceEntry | ResourceEntry[] | null>;

interface Context {
  loaders: Map<Resource, DataLoader<string, ResourceEntry | null>>;
}

// Load config
const port = process.env.PORT || 4000;
const path = process.env.ROOT_PATH || "/";
const maxBatchSize = Number(process.env.MAX_BATCH_SIZE || Infinity);
const resourcesDir = process.env.RESOURCES_DIR || "./resources";
const servicesFile = process.env.SERVICES_FILE;

// Load services and query templates from file
const templateIndex = await ConfigLoader.loadTemplateIndexFromDirectory(
  resourcesDir
);
const serviceIndex = servicesFile
  ? await ConfigLoader.loadServiceIndexFromFile(servicesFile)
  : undefined;

// Load schema from folder
const loader = await SchemaLoader.loadFromDirectory(resourcesDir);

// Load all resource definitions
const resources = new Resources(
  loader.resourceTypeDefs,
  serviceIndex,
  templateIndex
);

// Setup query resolvers
const queryResolvers: Record<string, ResourceResolver> = {};

(loader.queryDef.fields || []).forEach((field) => {
  queryResolvers[field.name.value] = async (
    _parent: ResourceEntry,
    args: { iri: string | Array<string> },
    context: Context
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
    fieldResolvers[name] = async (
      _parent: ResourceEntry,
      args: { iri: string | Array<string> },
      context: Context
    ) => {
      // get the parent of this field
      const value = _parent[name];
      
      // If the parent exists, make sure it's an array
      if (!value) {
        return isListType(type) ? [] : value;
      }

      // Get the underlying type
      const resourceName = unwrapCompositeType(type).name.value;
      // Check whether we can find a resource connected to this type
      const resource = resources.lookup(resourceName);

      if (!resource || resource.isEmbeddedType) {
        return value;
      }
      // Are there any arguments?
      if (Object.keys(args).length === 0) {
        const loader = context.loaders.get(resource);
        if (!loader) {
          throw new Error(
            `missing resource loader for ${resource.definition.name.value}`
          );
        }
        const entry = await loader.loadMany(ensureArray(value));
        // If multiple values are returned when the schema defines single value, value is no array. Pick first element of array in case.
        return oneOrMany(entry, !isListType(type));
      } else {
        // Get all IRIs
        const argIRIs = ensureArray(args.iri);
        const values = ensureArray(value);
        const allIRIs = Array.from(new Set([...values, ...argIRIs]));

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
  introspection: true,
  typeDefs: loader.originalTypeDefs,
  resolvers: rootResolvers,
  context: () => {
    return {
      loaders: transform(
        resources.root,
        (acc, resource) => {
          acc.set(
            resource,
            // Use DataLoader to pre-load and cache data from sparql endpoint
            new DataLoader(
              async (iris: ReadonlyArray<string>) => {
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
  plugins: [
    process.env.NODE_ENV === "production"
      ? ApolloServerPluginLandingPageProductionDefault({ footer: false })
      : ApolloServerPluginLandingPageGraphQLPlayground(),
  ],
});

server.start().then(() => {
  server.applyMiddleware({ app, path });

  app.listen(port, () => {
    logger.info(
      {
        "Resources directory": resourcesDir,
        "Services file": servicesFile || "none",
        "Dataloader max. batch size": maxBatchSize,
        "SPARQL cache TTL": process.env.QUERY_CACHE_TTL,
      },
      `🚀 Server ready at http://localhost:${port}${server.graphqlPath}`
    );
  });
});

// Log application crashes
process
  .on('unhandledRejection', (reason, p) => {
    logger.error(reason, `Unhandled Rejection at Promise ${p}`);
  })
  .on('uncaughtException', err => {
    logger.error(err, `Uncaught Exception thrown`);
    logger.flush();

    // Ensure process will stop after this
    process.exit(1);
  });

