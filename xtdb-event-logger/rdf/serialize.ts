import { JsonLdSerializer } from "jsonld-streaming-serializer";
import { JSONLD_CONTEXT } from "./namespaces.ts";

/**
 * Serialize an array of N3 triples into a JSON-LD string.
 *
 * Uses jsonld-streaming-serializer (proper RDF/JS Sink interface).
 * Each triple is written into a streaming transform; output is collected
 * and returned as a single pretty-printed JSON-LD document.
 *
 * @param triples  Array of N3 Triple/Quad objects from eventToTriples()
 * @returns        Promise resolving to the JSON-LD string
 */
export function triplesToJsonLd(triples: readonly any[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const serializer = new JsonLdSerializer({
      space: "  ",
      context: JSONLD_CONTEXT,
    });

    let output = "";
    serializer.on("data", (chunk: string) => {
      output += chunk;
    });
    serializer.on("end", () => {
      resolve(output);
    });
    serializer.on("error", (err: Error) => {
      reject(err);
    });

    for (const t of triples) {
      serializer.write(t);
    }
    serializer.end();
  });
}
