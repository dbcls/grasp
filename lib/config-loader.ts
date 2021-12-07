import SparqlClient from "sparql-http-client";
import fs from "fs";
const { readdir, readFile } = fs.promises;
import { join } from "path";

interface Service {
  type: string;
  url: string;
  graph: string;
  user: string | undefined;
  password: string | undefined;
}

export default class ConfigLoader {
  serviceIndex: Map<string, SparqlClient>;
  templateIndex: Map<string, string>;

  constructor(
    serviceIndex: Map<string, SparqlClient>,
    templateIndex: Map<string, string>
  ) {
    this.serviceIndex = serviceIndex;
    this.templateIndex = templateIndex;
  }

  static async loadFromFiles(
    serviceFile: string,
    baseDir: string
  ): Promise<ConfigLoader> {
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

    const services: {[key: string]: Service } = JSON.parse(
      await readFile(join(serviceFile), {
        encoding: "utf-8",
      })
    );

    const serviceIndex = new Map(
      Object.keys(services).map((name) => {
        const s: Service = services[name];
        return [
          name,
          new SparqlClient({
            endpointUrl: s.url,
            user: s.user,
            password: s.password,
          }),
        ];
      })
    );

    return new ConfigLoader(serviceIndex, templateIndex);
  }
}
