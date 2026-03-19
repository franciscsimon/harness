import { JSONLD_CONTEXT, piId, piRef, xsdLong, xsdInt, xsdBool, softwareAgent } from "./jsonld/context.ts";
import { ids } from "./jsonld/ids.ts";

console.log("=== Context ===");
console.log(JSON.stringify(JSONLD_CONTEXT, null, 2));

console.log("\n=== ID generation ===");
console.log("decision:", ids.decision());
console.log("requirement:", ids.requirement());
console.log("deployment:", ids.deployment());

console.log("\n=== Helpers ===");
console.log("piId:", piId("dec:abc123"));
console.log("piRef:", JSON.stringify(piRef("proj:xyz")));
console.log("xsdLong:", JSON.stringify(xsdLong(1742360000000)));
console.log("agent:", JSON.stringify(softwareAgent("pi-agent")));

console.log("\n✅ All shared libs working");
