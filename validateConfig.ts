
import SchemaLoader from "./lib/schema-loader.js"
const resourcesDir = process.env.RESOURCES_DIR || "./resources"
await SchemaLoader.loadFromDirectory(resourcesDir)
