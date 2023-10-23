import SparqlClient from "sparql-http-client";
import fs from "fs";
const { readdir, readFile } = fs.promises;
import { join } from "path";
import { set } from "lodash-es";
import logger from "./logger.js";

interface Service {
  type: string;
  url: string;
  graph?: string;
  user?: string;
  password?: string;
  token?: string;
}

export default class ConfigLoader {
  static async loadTemplateIndexFromDirectory(
    baseDir: string
  ): Promise<Map<string, string>> {
    const templateIndex: Map<string, string> = new Map();

    for (const path of await readdir(baseDir)) {
      if (!/^[0-9a-zA-Z].*\.sparql$/.test(path)) {
        continue;
      }

      const query = await readFile(join(baseDir, path), {
        encoding: "utf-8",
      });
      templateIndex.set(path, query);
    }
    return templateIndex;
  }


  static async loadServiceIndex(
  ): Promise<Map<string, SparqlClient>> {

    let services: { [key: string]: Service }  = {}
    if (process.env.SERVICES_FILE) {
      try {
        const jsonString = await readFile(process.env.SERVICES_FILE, {
          encoding: "utf-8",
        });
        services = JSON.parse(jsonString)
      } 
      catch (e) {
        logger.error(e, `Unable to parse services file ${process.env.SERVICES_FILE}.`)
      }
    }
    
    for (const envVar in process.env) {
      //should we store this env var in the config:
      if (envVar.startsWith("GRASP_")) {
        const [,...path] = envVar.split("_")
        set(services, path, process.env[envVar]);
      }
    }
    return ConfigLoader.loadServiceIndexFromJson(services)
  }

  static loadServiceIndexFromJson(
    services: { [key: string]: Service }
  ): Map<string, SparqlClient> {
    const index = new Map()

    for (const name in services) {
      const s: Service = services[name]

      if (!s.url) {
        logger.warn(`Service ${name} was not added to service index; field 'url' is not set.`)
        continue
      }
      
      index.set(name, new SparqlClient({
        endpointUrl: s.url,
        user: s.user,
        password: s.password,
        headers: {
          ...(s.token && { Authorization: `Bearer ${s.token}` })
        }
      }))
      logger.debug(`Added service ${name} to service index.`)
    }

    return index
  }
}
