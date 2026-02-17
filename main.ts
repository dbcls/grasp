import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import DataLoader from "dataloader";
import transform from "lodash.transform";
import isEqual from "lodash.isequal";

import Resource, { ResourceEntry } from "./resource.js";
import Resources from "./resources.js";
import SchemaLoader from "./schema-loader.js";
import {
	isListType,
	oneOrMany,
	unwrapCompositeType,
	ensureArray,
} from "./utils.js";

type ResourceResolver = (
	parent: ResourceEntry,
	args: { iri: string | Array<string> },
	context: Context,
) => Promise<ResourceEntry | ResourceEntry[] | null>;

interface Context {
	loaders: Map<Resource, DataLoader<string, ResourceEntry | null>>;
}

const port = process.env.PORT || 4000;
const path = process.env.ROOT_PATH || "/";
const maxBatchSize = Number(process.env.MAX_BATCH_SIZE || Infinity);
const resourcesDir = process.env.RESOURCES_DIR || "./resources";
const currentDir = dirname(fileURLToPath(import.meta.url));
const normalizedRootPath = path === "/" ? "" : path.replace(/\/$/, "");
const graphiqlAssetsPath = `${normalizedRootPath}/graphiql-assets`;

function renderGraphiQLPage(endpoint: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GraphiQL</title>
    <link rel="stylesheet" href="${graphiqlAssetsPath}/main.css" />
    <style>
      html, body, #graphiql { height: 100%; margin: 0; width: 100%; }
      body { overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="graphiql">Loading...</div>
    <script>window.GRAPHQL_ENDPOINT = ${JSON.stringify(endpoint)};</script>
    <script type="module" src="${graphiqlAssetsPath}/main.js"></script>
  </body>
</html>`;
}

SchemaLoader.loadFrom(resourcesDir).then((loader) => {
	const resources = new Resources(loader.resourceTypeDefs);

	const queryResolvers: Record<string, ResourceResolver> = {};

	(loader.queryDef.fields || []).forEach((field) => {
		queryResolvers[field.name.value] = async (
			_parent,
			args: { iri: string | Array<string> },
			context,
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
						`missing resource loader for ${resource.definition.name.value}`,
					);
				}

				const iris = ensureArray(args.iri);
				return oneOrMany(await loader.loadMany(iris), !isListType(field.type));
			}
			return oneOrMany(await resource.fetch(args), !isListType(field.type));
		};
	});

	const resourceResolvers: Record<
		string,
		Record<string, ResourceResolver>
	> = {};

	resources.all.forEach((resource) => {
		const fieldResolvers: Record<string, ResourceResolver> = (resourceResolvers[
			resource.definition.name.value
		] = {});

		(resource.definition.fields || []).forEach((field) => {
			const type = field.type;
			const name = field.name.value;

			fieldResolvers[name] = async (parent, args, context) => {
				const value = parent[name];

				if (!value) {
					return isListType(type) ? [] : value;
				}

				const resourceName = unwrapCompositeType(type).name.value;
				const resource = resources.lookup(resourceName);

				if (!resource || resource.isEmbeddedType) {
					return value;
				}

				if (Object.keys(args).length === 0) {
					const loader = context.loaders.get(resource);

					if (!loader) {
						throw new Error(
							`missing resource loader for ${resource.definition.name.value}`,
						);
					}

					return oneOrMany(await loader.loadMany(value), !isListType(type));
				} else {
					const argIRIs = ensureArray(args.iri);
					const allIRIs = Array.from(new Set([...value, ...argIRIs]));

					return oneOrMany(
						await resource.fetch({ ...args, ...{ iri: allIRIs } }),
						!isListType(type),
					);
				}
			};
		});
	});

	const rootResolvers = {
		Query: queryResolvers,
		...resourceResolvers,
	};

	const app = express();

  const server = new ApolloServer({
    typeDefs: loader.originalTypeDefs,
    resolvers: rootResolvers,
    plugins: [ApolloServerPluginLandingPageDisabled()],
  });

  server.start().then(() => {
    app.use(
      graphiqlAssetsPath,
      express.static(join(currentDir, "public/graphiql"))
    );

    app.get(path, (_req, res) => {
      res.type("html").send(renderGraphiQLPage(path));
    });

    app.use(
      path,
      express.json(),
			expressMiddleware(server, {
				context: async () => {
					return {
						loaders: transform(
							resources.root,
							(acc, resource) => {
								acc.set(
									resource,
									new DataLoader(
										async (iris: ReadonlyArray<string>) => {
											return resource.fetchByIRIs(iris);
										},
										{ maxBatchSize },
									),
								);
							},
							new Map<Resource, DataLoader<string, ResourceEntry | null>>(),
						),
					};
				},
			}),
		);

		app.listen(port, () => {
			console.log(`🚀 Server ready at http://localhost:${port}${path}`);
		});
	});
});
