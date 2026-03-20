# Codebase Security Audit Report

**Date:** March 2026  
**Target:** `pi.dev` Augmented Coding Harness (Event Logger UI, Extensions, Core APIs)  

## Executive Summary
A comprehensive security review of the pi.dev development harness was conducted. Several critical and high-severity vulnerabilities were identified, primarily affecting the `xtdb-event-logger-ui` web server and the `permission-gate` safety extension. Because this harness runs locally and interacts with sensitive source code, environmental variables, and LLM payloads, these vulnerabilities put the developer's workstation at risk from malicious websites (via CSRF/CORS) and malicious AI outputs (via XSS and prompt injection).

---

## Findings

### 1. Critical: Unauthenticated Destructive Endpoints (Missing CSRF Protection)
**Location:** `xtdb-event-logger-ui/server.ts`  
The web UI exposes an `/api/wipe` endpoint that executes `wipeAllEvents()` (a hard `ERASE` of the entire XTDB database) via a simple `POST` request. 
* **Vulnerability:** There is no authentication, authorization, or Anti-CSRF token check.
* **Impact:** A malicious website visited by the developer can execute a background POST request to `http://localhost:3333/api/wipe`, wiping all development history silently.

### 2. High: Permissive Cross-Origin Resource Sharing (CORS)
**Location:** `xtdb-event-logger-ui/server.ts`  
The server globally applies the wildcard CORS middleware: `app.use("/api/*", cors());`.
* **Vulnerability:** This allows scripts from *any* origin (`*`) to read from the local API.
* **Impact:** A malicious website can query `http://localhost:3333/api/events`, silently exfiltrating the developer's entire event history, including source code snippets, LLM provider API keys sent in payload headers, and proprietary architectural decisions.

### 3. High: Stored Cross-Site Scripting (XSS) via Markdown Parser
**Location:** `xtdb-event-logger-ui/lib/markdown.ts`  
The custom `renderMarkdown` function does not sanitize URLs in markdown links. 
* **Vulnerability:** Under `inline()`, the regex `h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')` blindly trusts the URL. A malicious agent payload or extracted knowledge post-mortem formatted as `[Click Here](javascript:alert('XSS'))` will bypass HTML escaping.
* **Impact:** If an attacker compromises an upstream package or manipulates the LLM to output a `javascript:` payload, viewing the UI will execute arbitrary JavaScript in the developer's browser, potentially reading or wiping their event streams.

### 4. Medium: Naive Regex Bypasses in `permission-gate`
**Location:** `permission-gate/index.ts`  
The extension designed to block dangerous bash commands relies purely on naive regex matching.
* **Vulnerabilities:**
  * `/\brm\s+(-rf?|--recursive)/i`: Blocked, but `rm -r -f`, `rm -r/*`, or `/bin/rm -rf` can bypass it depending on bash expansion.
  * `/\bsudo\b/i`: Blocked, but `su -c` or `s\udo` or `"s"udo` works.
  * `/\bcurl\b.*\|\s*sh\b/i`: Blocked, but `curl ... | bash`, `wget -qO- ... | sh`, or saving to a file and executing it bypasses the gate.
* **Impact:** A compromised or misaligned LLM can easily bypass the safety gate to execute destructive host commands without prompting the user for confirmation.

### 5. Medium: Hardcoded Database Credentials
**Location:** `xtdb-event-logger/endpoints/xtdb.ts` & `xtdb-event-logger-ui/lib/db.ts`  
* **Vulnerability:** Password credentials (`user: "xtdb", password: "xtdb"`) are hardcoded directly into the database connection logic.
* **Impact:** While this is a local development Docker container, hardcoding credentials is an anti-pattern that often leaks into shared staging or production environments.

### 6. Low/Info: Overly Permissive API Access
**Location:** `xtdb-event-logger-ui/server.ts`  
* **Vulnerability:** The web UI runs on port `3333` with zero authentication.
* **Impact:** Anyone on the local network (e.g., public Wi-Fi) who discovers the exposed port can read the developer's raw event streams and source code. 

---

## Recommendations
1. **Implement CSRF Tokens:** Require a short-lived token generated on page load for all state-changing endpoints like `/api/wipe`.
2. **Restrict CORS:** Limit CORS to UI-specific origins or remove it entirely if the UI is served from the same origin as the API.
3. **URL Sanitization:** Update `markdown.ts` to strictly validate `href` values, ensuring they only begin with HTTP/HTTPS, or use a robust established markdown parser like `marked` with `DOMPurify`.
4. **Command Parsing:** Replace the regex blacklist in `permission-gate` with a shell-parsing AST (Abstract Syntax Tree) validator or a rigid whitelist of allowed binary tools.
5. **Environment Variables for Secrets:** Read XTDB credentials cleanly from `.env`.
6. **Localhost Binding:** Ensure the Hono web server binds exclusively to `127.0.0.1` instead of `0.0.0.0` to block local network snooping.
