// ─── Anti-Pattern Detectors (Pure Functions) ──────────────────────
// Each detector takes session state and returns a warning or null.
// Patterns: AI Slop, Answer Injection, Obsess Over Rules,
//   Perfect Recall Fallacy, Tell Me a Lie

export interface DetectorState {
  turnIndex: number;
  toolCalls: { tool: string; path?: string; isError?: boolean }[];
  writtenFiles: string[];
  writtenBytes: number;
  testRuns: number;
  reviewSteps: number;
  userPrompts: string[];
  systemRulesCount: number;
  contextBytes: number;
  contextMsgCount: number;
  sessionDurationMs: number;
}

export interface Detection {
  pattern: string;
  severity: "info" | "warn" | "error";
  message: string;
}

// ── AI Slop ───────────────────────────────────────────────────────
// Detect large bulk output without review or testing.
// "Using AI output without adding human judgment"
export function detectAiSlop(state: DetectorState): Detection | null {
  // Lots of writes, no tests, no human review steps
  if (state.writtenFiles.length >= 5 && state.testRuns === 0 && state.reviewSteps === 0) {
    return {
      pattern: "ai-slop",
      severity: "warn",
      message:
        `⚠️ AI Slop risk: ${state.writtenFiles.length} files written with no tests or review.\n` +
        `  Could anyone with your prompt get the same result? That's slop.\n` +
        `  Run tests, review output, add YOUR judgment.`,
    };
  }

  // Bulk write without verification
  if (state.writtenBytes > 10_000 && state.turnIndex <= 2 && state.testRuns === 0) {
    return {
      pattern: "ai-slop",
      severity: "info",
      message:
        `⚠️ Bulk output (${Math.round(state.writtenBytes / 1024)}KB) in ${state.turnIndex} turns with no verification.\n` +
        `  Review before accepting.`,
    };
  }

  return null;
}

// ── Answer Injection ──────────────────────────────────────────────
// Detect when the user's prompt narrows the solution space.
// "The way you ask limits what AI considers"
export function detectAnswerInjection(state: DetectorState): Detection | null {
  for (const prompt of state.userPrompts) {
    const lower = prompt.toLowerCase();

    // "Give me N" with small arbitrary N
    const countMatch = lower.match(/give me (\d+)|list (\d+)|show (\d+)|provide (\d+)/);
    if (countMatch) {
      const n = Number(countMatch[1] ?? countMatch[2] ?? countMatch[3] ?? countMatch[4]);
      if (n >= 1 && n <= 5) {
        return {
          pattern: "answer-injection",
          severity: "info",
          message:
            `💉 Answer Injection: "Give me ${n}" — why ${n}? This may limit AI's response.\n` +
            `  Consider: "What are the options?" and let AI decide the count.`,
        };
      }
    }

    // Solution in the question: "should I use X to do Y?"
    if (/should i use .+ (to|for) /i.test(prompt) || /how (do i|to) use .+ (to|for) /i.test(prompt)) {
      return {
        pattern: "answer-injection",
        severity: "info",
        message:
          `💉 Answer Injection: Your question suggests a specific solution.\n` +
          `  Try stating the PROBLEM instead: "I need to do Y" — let AI suggest the approach.`,
      };
    }

    // "Which X should I..." (presupposing the category)
    if (/which (library|framework|tool|database|api|service) should/i.test(prompt)) {
      return {
        pattern: "answer-injection",
        severity: "info",
        message:
          `💉 Answer Injection: Question presupposes a solution category.\n` +
          `  Consider: "What's the best way to solve [problem]?" to surface approaches you haven't considered.`,
      };
    }
  }

  return null;
}

// ── Obsess Over Rules ─────────────────────────────────────────────
// Detect when too many rules are loaded into context.
// "More rules = more ignored rules"
export function detectObsessOverRules(state: DetectorState): Detection | null {
  if (state.systemRulesCount > 15) {
    return {
      pattern: "obsess-over-rules",
      severity: "warn",
      message:
        `📏 Obsess Over Rules: ${state.systemRulesCount} rules in context.\n` +
        `  More rules → more get ignored (Limited Focus).\n` +
        `  Consider: Use Focused Agents with fewer rules, or Refinement Loop to iterate.`,
    };
  }

  // Large initial context suggests rule bloat
  if (state.contextBytes > 50_000 && state.turnIndex <= 1) {
    return {
      pattern: "obsess-over-rules",
      severity: "info",
      message:
        `📏 Large initial context (${Math.round(state.contextBytes / 1024)}KB) — possible rule overload.\n` +
        `  AI may ignore some instructions. Keep rules focused and minimal.`,
    };
  }

  return null;
}

// ── Perfect Recall Fallacy ────────────────────────────────────────
// Detect assumptions that AI remembers everything.
// "Don't expect perfect recall from training data"
export function detectPerfectRecallFallacy(state: DetectorState): Detection | null {
  // Context is old (many messages) and agent is referencing things from early in session
  if (state.contextMsgCount > 30 && state.contextBytes > 80_000) {
    return {
      pattern: "perfect-recall-fallacy",
      severity: "warn",
      message:
        `🧠 Perfect Recall Fallacy: ${state.contextMsgCount} messages, ${Math.round(state.contextBytes / 1024)}KB.\n` +
        `  AI may not accurately recall details from early in this session.\n` +
        `  Consider: /compact, or re-state important context explicitly.`,
    };
  }

  // Long session without knowledge extraction
  if (state.sessionDurationMs > 30 * 60_000 && state.turnIndex > 15) {
    return {
      pattern: "perfect-recall-fallacy",
      severity: "info",
      message:
        `🧠 Long session (${Math.round(state.sessionDurationMs / 60_000)}min, ${state.turnIndex} turns).\n` +
        `  Extract key decisions to a knowledge doc before they're lost in context.`,
    };
  }

  return null;
}

// ── Tell Me a Lie ─────────────────────────────────────────────────
// Detect prompts that force AI into impossible answers.
// "User's prompt forces AI to fabricate"
export function detectTellMeALie(state: DetectorState): Detection | null {
  for (const prompt of state.userPrompts) {
    const lower = prompt.toLowerCase();

    // Forced structure: "give me exactly N" for something that might not have N answers
    if (/give me exactly \d+|list exactly \d+|name exactly \d+/i.test(prompt)) {
      return {
        pattern: "tell-me-a-lie",
        severity: "warn",
        message:
          `🤥 Tell Me a Lie: "Exactly N" forces AI to fabricate if fewer exist.\n` +
          `  Consider: "What are the options?" or "List the main ones."`,
      };
    }

    // "Is it possible to..." (often forces yes)
    if (/^is it possible to .{20,}/i.test(prompt)) {
      return {
        pattern: "tell-me-a-lie",
        severity: "info",
        message:
          `🤥 Tell Me a Lie: "Is it possible?" may trigger compliance bias (AI defaults to "yes").\n` +
          `  Consider: "What are the constraints of doing X?" for a more honest answer.`,
      };
    }

    // "Can you guarantee..."
    if (/can you (guarantee|ensure|promise|always)/i.test(prompt)) {
      return {
        pattern: "tell-me-a-lie",
        severity: "info",
        message:
          `🤥 Tell Me a Lie: AI can't guarantee deterministic results.\n` +
          `  Frame as: "What's the most reliable way to achieve X?"`,
      };
    }
  }

  return null;
}

// ── Run all detectors ─────────────────────────────────────────────
export function runAllDetectors(state: DetectorState): Detection[] {
  const detections: Detection[] = [];
  const fns = [
    detectAiSlop,
    detectAnswerInjection,
    detectObsessOverRules,
    detectPerfectRecallFallacy,
    detectTellMeALie,
  ];
  for (const fn of fns) {
    const d = fn(state);
    if (d) detections.push(d);
  }
  return detections;
}
