---
name: security-audit
description: Security vulnerability audit following OWASP Top 10. Reviews code for injection, broken auth, XSS, secrets exposure, and misconfigurations. Use before deploying or reviewing sensitive code.
---

# Security Audit

## Workflow

1. **Scan for hardcoded secrets**
   ```bash
   grep -rn "password\|secret\|api_key\|token\|credential" --include="*.ts" --include="*.js" --include="*.env" .
   ```

2. **Check OWASP Top 10**
   - Injection (SQL, NoSQL, OS command, LDAP)
   - Broken authentication (weak passwords, session management)
   - Sensitive data exposure (unencrypted storage/transport)
   - XML external entities (XXE)
   - Broken access control (missing auth checks)
   - Security misconfiguration (defaults, verbose errors)
   - Cross-site scripting (XSS — reflected, stored, DOM)
   - Insecure deserialization
   - Using components with known vulnerabilities
   - Insufficient logging and monitoring

3. **Check dependencies**
   ```bash
   npm audit
   ```

4. **Trace user input** — follow every user-supplied value from entry to use

5. **Report** — table with: Severity | File:Line | Finding | Remediation
