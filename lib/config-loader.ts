import SparqlClient from "sparql-http-client";
import fs from "fs";
const { readdir, readFile } = fs.promises;
import { join } from "path";
import { set } from "lodash-es";

interface Service {
  type: string;
  url: string;
  graph: string;
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

  static async loadServiceIndexFromFile(
    serviceFile: string
  ): Promise<Map<string, SparqlClient>> {

    const jsonString = await readFile(serviceFile, {
        encoding: "utf-8",
    });
    return ConfigLoader.loadServiceIndexFromJson(JSON.parse(jsonString));
  }
  static loadServiceIndexFromEnv(
  ): Map<string, SparqlClient> {
    const services: { [key: string]: Service }  = {}
    for (const envVar in process.env) {
      //should we store this env var in the config:
      if (envVar.startsWith("GRASP_")) {
        const [,...path] = envVar.split("_")
        set(services, path, process.env[envVar]);
      }
    }
    return this.loadServiceIndexFromJson(services)
  }

  static loadServiceIndexFromJson(
    services: { [key: string]: Service }
  ): Map<string, SparqlClient> {

    return new Map(
      Object.keys(services).map((name) => {
        const s: Service = services[name];
        return [
          name,
          new SparqlClient({
            endpointUrl: s.url,
            user: s.user,
            password: s.password,
            headers: {
              ...(s.token && { Authorization: `Bearer ${s.token}` })
            }
          }),
        ];
      })
    );
  }
}
