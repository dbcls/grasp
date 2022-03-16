import SchemaLoader from "../lib/schema-loader";
import { join } from "path";

describe("schema-loader", () => {
  describe("constructed with empty string", () => {
    it("should throw error", async () => {
      return expect(() => new SchemaLoader("")).toThrow();
    });
  });
  describe("constructed with simple schema", () => {
    const graphql = `
        type Query {
            test: Test
        }
        
        type Test {
            id: ID!
        }
        `;

    const loader = new SchemaLoader(graphql);

    it("should return SchemaLoader", async () => {
      return expect(loader).toBeInstanceOf(SchemaLoader);
    });

    it("should have query definition", async () => {
      return expect(loader.queryDef).not.toBeUndefined();
    });
    it("should have query definition with type Query", async () => {
      expect(loader.queryDef.name).toHaveProperty("value");
      return expect(loader.queryDef.name.value).toBe("Query");
    });

    it("should have one resource type definition", async () => {
      return expect(loader.resourceTypeDefs).toHaveLength(1);
    });
    it("should not contain definitions of type Query", async () => {
      return expect(loader.resourceTypeDefs).not.toContain(
        expect.objectContaining({
          name: {
            value: "Query",
          },
        })
      );
    });
  });

  describe("constructed with two query definitions", () => {
    const graphql = `
        type Query {
            test: Query
        }
        
        type Query {
            id: ID!
        }
        `;

    it("should throw error", async () => {
      return expect(() => new SchemaLoader(graphql)).toThrow();
    });
  });

  describe("constructed with no query definition", () => {
    const graphql = `
        type Test {
            test: Query
        }

        type Test2 {
            test: String
        }
        `;

    it("should throw error", async () => {
      return expect(() => new SchemaLoader(graphql)).toThrow();
    });
  });

  describe("loadFromDirectory", () => {
    describe("should throw", () => {
      it("if dir does not exist", () => {
        return expect(
          SchemaLoader.loadFromDirectory("./xyz")
        ).rejects.toThrow();
      });
      it("if dir is empty", () => {
        const dirPath = join(__dirname, "./assets/resources-empty");
        return expect(
          SchemaLoader.loadFromDirectory(dirPath)
        ).rejects.toThrow();
      });
    });
    describe("with files in dir", () => {
      const dirPath = join(__dirname, "./assets/resources");

      it("should have query def", async () => {
        const loader = await SchemaLoader.loadFromDirectory(dirPath);
        expect(loader.queryDef.name).toHaveProperty("value");
        return expect(loader.queryDef.name.value).toBe("Query");
      });
      it("should have four resource type definition", async () => {
        const loader = await SchemaLoader.loadFromDirectory(dirPath);
        return expect(loader.resourceTypeDefs).toHaveLength(4);
      });
      it("should not contain definitions of type Query", async () => {
        const loader = await SchemaLoader.loadFromDirectory(dirPath);
        return expect(loader.resourceTypeDefs).not.toContain(
          expect.objectContaining({
            name: {
              value: "Query",
            },
          })
        );
      });
    });
  });
  describe("loadFromFile", () => {
    it("should throw if file is not parseable", async () => {
      const dirPath = join(__dirname, "./assets/invalid.graphql");
      return expect(SchemaLoader.loadFromFile(dirPath)).rejects.toThrow();
    });
  });
});
