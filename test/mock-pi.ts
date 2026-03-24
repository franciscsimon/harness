// Mock ExtensionAPI for load-testing extensions.
// Shared between quality-hooks (Layer 2) and test/ext-load-test.ts (Layer 1).

const KNOWN_METHODS = new Set([
  "on",
  "registerTool",
  "registerCommand",
  "registerShortcut",
  "registerFlag",
  "registerMessageRenderer",
  "registerProvider",
  "unregisterProvider",
  "getFlag",
  "getActiveTools",
  "getAllTools",
  "getCommands",
  "getSessionName",
  "getThinkingLevel",
  "setActiveTools",
  "setLabel",
  "setModel",
  "setSessionName",
  "setThinkingLevel",
  "appendEntry",
  "exec",
  "sendMessage",
  "sendUserMessage",
]);

export interface ApiCall {
  method: string;
  args: any[];
}

export function createMockPi(): { pi: any; calls: ApiCall[] } {
  const calls: ApiCall[] = [];
  const pi = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "then") return undefined;
        return (...args: any[]) => {
          calls.push({ method: prop, args });
          if (!KNOWN_METHODS.has(prop)) {
            throw new Error(`Unknown ExtensionAPI method: pi.${prop}()`);
          }
          if (prop === "exec") return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
          if (prop === "getFlag") return undefined;
          if (prop === "getSessionName") return undefined;
          if (prop === "getThinkingLevel") return "normal";
          if (prop === "getActiveTools") return [];
          if (prop === "getAllTools") return [];
          if (prop === "getCommands") return [];
        };
      },
    },
  );
  return { pi, calls };
}
