import SchemaLoader from "../lib/schema-loader";
describe("schema-loader", () => {
    describe("constructed with empty string", () => {
        it("should throw error", async () => {
            return expect(() => new SchemaLoader("")).toThrow()
        });
    });
});
