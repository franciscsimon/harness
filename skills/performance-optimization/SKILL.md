---
name: performance-optimization
description: Profile and optimize performance bottlenecks. Measures before and after every change. Use when code is slow and you need measurable improvements.
---

# Performance Optimization

## Workflow

1. **Establish baseline**
   ```bash
   time npm test
   # Or for specific operations:
   node -e "const t=Date.now(); require('./slow-module'); console.log(Date.now()-t+'ms')"
   ```

2. **Profile to find the bottleneck**
   ```bash
   node --prof app.js
   node --prof-process isolate-*.log
   ```
   Or add timing:
   ```typescript
   console.time("operation");
   // ... code ...
   console.timeEnd("operation");
   ```

3. **Identify the hot path** — the 20% of code causing 80% of slowness

4. **Optimize one thing at a time**
   - Make one change
   - Measure again
   - Record: Before Xms → After Yms (Z% improvement)

5. **Verify correctness** — `npm test` must still pass

6. **Report**
   ```
   Bottleneck: <description>
   Before: Xms
   After: Yms
   Improvement: Z%
   Tradeoff: <any readability/complexity cost>
   ```

## Rules

- Never optimize without measuring first
- One change at a time
- Big wins first — don't micro-optimize
- Tests must pass after every change
