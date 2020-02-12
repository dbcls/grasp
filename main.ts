import { ApolloServer } from 'apollo-server';
import Dataloader from 'dataloader';
import transform = require('lodash.transform');
import isEqual = require('lodash.isequal');

import Resource, { ResourceEntry } from './resource';
import Resources from './resources';
import SchemaLoader from './schema-loader';
import { isListType, oneOrMany, unwrapCompositeType } from './utils';

type ResourceResolver = (parent: ResourceEntry, args: {iri: string | Array<string>}, context: Context) => Promise<ResourceEntry | ResourceEntry[] | null>;

interface Context {
  loaders: Map<Resource, Dataloader<string, ResourceEntry | null>>
}

SchemaLoader.loadFrom('./resources').then(loader => {
  const resources = new Resources(loader.resourceTypeDefs);

  const queryResolvers: Record<string, ResourceResolver> = {};

  (loader.queryDef.fields || []).forEach(field => {
    queryResolvers[field.name.value] = async (_parent, args: {iri: string | Array<string>}, context) => {
      const resourceName = unwrapCompositeType(field.type).name.value;
      const resource     = resources.lookup(resourceName);
      if (!resource) {
        throw new Error(`resource ${resourceName} is not found`);
      }

      const loader = context.loaders.get(resource);
      if (!loader) {
        throw new Error(`missing resource loader for ${resource.definition.name.value}`);
      }

      if (isEqual(Object.keys(args), ['iri'])) {
        const iris = args.iri instanceof Array ? args.iri : [args.iri];
        return oneOrMany(await loader.loadMany(iris), !isListType(field.type));
      }
      return oneOrMany(await resource.fetch(args), !isListType(field.type));
    }
  });

  const resourceResolvers: Record<string, Record<string, ResourceResolver>> = {};

  resources.all.forEach(resource => {
    const fieldResolvers: Record<string, ResourceResolver> = resourceResolvers[resource.definition.name.value] = {};

    (resource.definition.fields || []).forEach(field => {
      const type = field.type;
      const name = field.name.value;

      fieldResolvers[name] = async (parent, _args, context) => {
        const value = parent[name];

        if (!value) { return isListType(type) ? [] : value; }

        const resourceName = unwrapCompositeType(type).name.value;
        const resource     = resources.lookup(resourceName);

        if (!resource || resource.isEmbeddedType) { return value; }

        const loader = context.loaders.get(resource);
        if (!loader) {
          throw new Error(`missing resource loader for ${resource.definition.name.value}`);
        }

        return oneOrMany(await loader.loadMany(value), !isListType(type));
      };
    });
  });

  const rootResolvers = {
    Query: queryResolvers,
    ...resourceResolvers,
  };

  const port = process.env.PORT || 4000;

  const server = new ApolloServer({
    typeDefs: loader.originalTypeDefs,
    resolvers: rootResolvers,
    context: () => {
      return {
        loaders: transform(resources.root, (acc, resource) => {
          acc.set(resource, new Dataloader(async (iris: ReadonlyArray<string>) => {
            return resource.fetchByIRIs(iris);
          }));
        }, new Map<Resource, Dataloader<string, ResourceEntry | null>>())
      };
    }
  });

  server.listen({ port }).then(({ url }) => {
    console.log(`🚀 Server ready at ${url}`);
  });
});
