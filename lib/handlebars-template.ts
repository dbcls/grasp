import Handlebars from "handlebars";
import { ensureArray } from "./utils";

export default function() {
  const handlebars = Handlebars.create();

  handlebars.registerHelper(
    "join",
    function (separator: string, strs: string | string[]): string {
      return ensureArray(strs).join(separator);
    }
  );

  handlebars.registerHelper(
    "as-iriref",
    function (strs: string | string[]): string[] {
      return ensureArray(strs).map((str) => `<${str}>`);
    }
  );

  handlebars.registerHelper(
    "as-string",
    function (strs: string | string[]): string[] {
      return ensureArray(strs).map((str) => `"${str}"`);
    }
  );
  return handlebars;
}