# Agent Conventions — Mistakes to Never Repeat

## 1. Port, Don't Rewrite

When migrating, unifying, or consolidating existing code:

- **ALWAYS** read the original source file completely before writing any replacement
- **COPY** the rendering/logic functions, then adapt only what must change (data source, imports)
- **NEVER** write a "simplified version" — the original has that formatting for a reason
- **VERIFY** the new file is similar in line count to the original (within 20%). If it's half the size, you deleted functionality
- **DIFF** your new version against the original to confirm only data-source lines changed

### Bad Example
```
// "I'll write a quick sessions page"
const columns = [{ key: "id", label: "ID" }];  // guessing
return renderTable(columns, data);               // 35 lines replacing 108
```

### Good Example
```
// Copy renderSessionList() from xtdb-event-logger-ui/pages/sessions.ts
// Change only: replace `db.query(...)` with `await fetchSessionList()`
// Keep ALL the health color logic, duration formatting, grouping, links
```

## 2. Check Real API Responses Before Coding

Before writing any code that consumes an API endpoint:

1. `curl` the actual endpoint
2. Examine the real JSON keys and structure
3. Use those exact keys in your code
4. Never assume field names — they're always different from what you expect

```bash
# DO THIS FIRST
curl -s http://localhost:3333/api/sessions/list | python3 -m json.tool | head -20
# THEN write code using the real keys: sessionId, eventCount, firstTs, etc.
```

## 3. Don't Run Background Services in Bash Calls

Background processes (`&`, `nohup`) in pi bash calls are fragile:
- They get killed when the bash timeout fires
- They die silently with no error
- Debugging them wastes enormous time

### Instead:
- **For testing:** Use inline test scripts that import the server, setTimeout, test, exit
- **For user verification:** Tell the user to start the service in a separate terminal
- **Always use `--max-time` with curl** to prevent hanging

```typescript
// test-pages.ts — inline test pattern
import "./server.ts";
setTimeout(async () => {
  for (const p of pages) {
    const r = await fetch("http://localhost:3336" + p);
    console.log(r.status, p, (await r.text()).length + "B");
  }
  process.exit(0);
}, 3000);
```

## 4. One Page at a Time, Verified

When building multiple pages:
- Implement ONE page
- Test it against the real API
- Verify the output matches the original visually
- Only then move to the next page
- Never batch-write all pages without testing each

## 5. Delegated Workers Need Full Context

When delegating to worker agents:
- Include the ACTUAL API response shapes (paste curl output)
- Include the ORIGINAL source files to port from (give file paths)
- Specify exact field names, not descriptions
- Set acceptance criteria: "output should match original within 20% line count"
