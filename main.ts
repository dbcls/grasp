import express from "express"
import { ApolloServer } from "@apollo/server"
import { expressMiddleware } from '@apollo/server/express4'
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default'
import { ApolloServerPluginLandingPageProductionDefault } from '@apollo/server/plugin/landingPage/default'
import cors from 'cors'
import parser from 'body-parser'
import fetch from 'node-fetch'
import DataLoader from "dataloader"
import {transform,isEqual} from "lodash-es"


import { IResource, ResourceEntry, UnionResource } from "./lib/resource.js"
import ResourceIndex from "./lib/resource-index.js"
import SchemaLoader from "./lib/schema-loader.js"
import {
  isListType,
  oneOrMany,
  unwrapCompositeType,
  ensureArray,
} from "./lib/utils.js"
import ConfigLoader from "./lib/config-loader.js"
import logger from "./lib/logger.js"
import { GraphQLError } from "graphql"

type ResourceResolver = (
  parent: ResourceEntry,
  args: { iri: string | Array<string> },
  context: Context
) => Promise<ResourceEntry | ResourceEntry[] | null>

interface Context {
  proxyHeaders: {[key:string]:string},
  loaders: Map<IResource, DataLoader<string, ResourceEntry | null>>
}

// Load config
const port = process.env.PORT || 4000
const path = process.env.ROOT_PATH || "/"
const maxBatchSize = Number(process.env.MAX_BATCH_SIZE || Infinity)
const resourcesDir = process.env.RESOURCES_DIR || "./resources"

// Load services and query templates from file
const templateIndex = await ConfigLoader.loadTemplateIndexFromDirectory(
  resourcesDir
)
const serviceIndex = await ConfigLoader.loadServiceIndex()

// Load schema from folder
const loader = await SchemaLoader.loadFromDirectory(resourcesDir)

// Load all resource definitions
const resources = new ResourceIndex(
  loader.resourceTypeDefs,
  loader.unionTypeDefs,
  serviceIndex,
  templateIndex
)
logger.debug(`Resource index has entries for ${resources.all.map(r => r.name)}`)

// Setup query resolvers
const queryResolvers: Record<string, ResourceResolver> = {};

(loader.queryDef.fields || []).forEach((field) => {
  queryResolvers[field.name.value] = async (
    _parent: ResourceEntry,
    args: { iri: string | Array<string> },
    context: Context
  ) => {
    logger.debug(`Called resolver for field ${field.name.value}`)
    const resourceName = unwrapCompositeType(field.type).name.value
    logger.debug(`Looking up resource for ${resourceName} (query resolver): ${field.kind}`)
    const resource = resources.lookup(resourceName)

    if (!resource) {
      throw new Error(`resource ${resourceName} is not found`)
    }

    if (isEqual(Object.keys(args), ["iri"])) {
      const loader = context.loaders.get(resource)

      if (!loader) {
        throw new Error(
          `missing resource loader for ${resource.name}`
        )
      }

      const iris = ensureArray(args.iri)
      return oneOrMany(await loader.loadMany(iris), !isListType(field.type))
    }
    const entries = (await resource.fetch(args, {proxyHeaders:context.proxyHeaders})).values()
    return oneOrMany(Array.from(entries), !isListType(field.type))
  }
})

const resourceResolvers: Record<string, Record<string, ResourceResolver>> = {}

// Iterate over all resources
resources.all.forEach((resource) => {
  //Initalize empty field resolver
  const fieldResolvers: Record<string, ResourceResolver> = (resourceResolvers[
    resource.name
  ] = {});

  //Iterate over every field definition
  resource.fields.forEach((field) => {
    const type = field.type
    const name = field.name.value

    // Create field resolver for field
    fieldResolvers[name] = async (
      _parent: ResourceEntry,
      args: { iri: string | Array<string> },
      context: Context
    ) => {
      logger.debug(`Called resolver for field ${name}`)
      // get the parent of this field
      const value: ResourceEntry = _parent[name]

      // If the parent exists, make sure it's an array
      if (!value) {
        return isListType(type) ? [] : value
      }

      // Get the underlying type
      const resourceType = unwrapCompositeType(type)
      const resourceName = resourceType.name.value
      // Check whether we can find a resource connected to this type
      logger.debug(`Looking up resource for ${resourceName} (field resolver): ${field.kind}`)
      const resource = resources.lookup(resourceName)

      if (!resource || resource.isEmbeddedType) {
        return value
      }
      // Are there any arguments?
      if (Object.keys(args).length === 0) {
        const loader = context.loaders.get(resource)
        if (!loader) {
          throw new Error(
            `missing resource loader for ${resource.name}`
          )
        }
        const entry = await loader.loadMany(ensureArray(value))
        // If multiple values are returned when the schema defines single value, value is no array. Pick first element of array in case.
        return oneOrMany(entry, !isListType(type))
      } else {
        // Get all IRIs
        const argIRIs = ensureArray(args.iri)
        const values = ensureArray(value)
        const allIRIs = Array.from(new Set([...values, ...argIRIs]))
        const entries = (await resource.fetch({ ...args, ...{ iri: allIRIs } },{proxyHeaders:context.proxyHeaders})).values()
        return oneOrMany(
          Array.from(entries),
          !isListType(type)
        )
      }
    }
  })
})

const rootResolvers = {
  Query: queryResolvers,
  ...resourceResolvers,
}

// Log application crashes
process.on('unhandledRejection', (reason, p) => {
  logger.error(reason, `Unhandled Rejection at Promise ${p}`)
})

process.on('uncaughtException', err => {
  logger.error(err, `Uncaught Exception thrown; exiting process.`)
  logger.flush()

  // Ensure process will stop after this
  process.exit(1)
})

// Initiate server

const app = express()

const server = new ApolloServer<Context>({
  introspection: true,
  typeDefs: loader.originalTypeDefs,
  resolvers: rootResolvers,
  status400ForVariableCoercionErrors: true,
  plugins: [
    {
      // Fires whenever a GraphQL request is received from a client.
      async requestDidStart(requestContext) {
        logger.info({ query: requestContext.request.query }, 'GraphQL query received.')
      },
    },
    process.env.NODE_ENV === "production"
      ? ApolloServerPluginLandingPageProductionDefault({ footer: false })
      : ApolloServerPluginLandingPageLocalDefault({ embed: { endpointIsEditable: true }, footer: false }),
  ],
})

await server.start()
const authResponseCode = process.env['AUTH_RESPONSE_CODE'] ? Number(process.env['AUTH_RESPONSE_CODE']) : 401
app.use(
  path,
  cors<cors.CorsRequest>(),
  parser.json(),
  expressMiddleware(server, {
    context: async (ctx) => {
      const proxyHeaders = {"Authorization":ctx.req.get("Authorization") || ""}
      if (process.env['AUTH_URL']) {
        const response = await fetch(process.env["AUTH_URL"], {method: "HEAD", headers: proxyHeaders});
        if (response.status === authResponseCode) {
          throw new GraphQLError('User is not authenticated', {
            extensions: {
              code: 'UNAUTHENTICATED',
              http: { status: 401 },
            },
          });
        }
      }
      return {
        proxyHeaders ,
        loaders: transform(
          resources.root,
          (acc, resource) => {
            acc.set(
              resource,
              // Use DataLoader to pre-load and cache data from sparql endpoint
              new DataLoader(
                async (iris: ReadonlyArray<string>) => {
                  const values = (await resource.fetchByIRIs(iris, {proxyHeaders})).values()
                  return Array.from(values)
                },
                { maxBatchSize }
              )
            )
          },
          new Map<IResource, DataLoader<string, ResourceEntry | null>>()
        ),
      }
    },
  }),
)

app.listen(port, () => {
  logger.info(
    {
      "Resources directory": resourcesDir,
      "Dataloader max. batch size": maxBatchSize,
      "SPARQL cache TTL": process.env.QUERY_CACHE_TTL,
    },
    `🚀 Server ready at http://localhost:${port}${path}`
  )
})

