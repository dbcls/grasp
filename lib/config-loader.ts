import SparqlClient from "sparql-http-client";
import fs from "fs";
const { readdir, readFile } = fs.promises;
import { join } from "path";

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
    return ConfigLoader.loadServiceIndexFromJsonString(jsonString);
  }

  static loadServiceIndexFromJsonString(
    jsonString: string
  ): Map<string, SparqlClient> {
    const services: { [key: string]: Service } = JSON.parse(jsonString);

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
              ...(s.token && { Authorization: s.token })
            }
          }),
        ];
      })
    );
  }
}
