import { readFile, writeFile } from "node:fs/promises";
import { openApiDocument } from "../src/http/contracts/openapi.js";
const output = new URL("../openapi.json", import.meta.url);
const text = JSON.stringify(openApiDocument(), null, 2) + "\n";
if (process.argv.includes("--check")) {
  if ((await readFile(output, "utf8")).replace(/\r\n/g, "\n") !== text)
    throw new Error("OPENAPI_OUT_OF_DATE");
  console.log("OpenAPI route artifact is current.");
} else {
  await writeFile(output, text);
  console.log("Generated OpenAPI framework contract.");
}
