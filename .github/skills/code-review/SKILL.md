---
name: code-review
description: Generic code review guidelines for GitHub Copilot. Use this when asked to review code, PRs, or diffs. Provides structured priorities, security checks, testing standards, and comment templates.
---

# Generic Code Review Instructions

Comprehensive code review guidelines that can be adapted to any project. Follow these priorities, checks, and comment formats when performing code reviews.

## Review Language

Respond in **English**.

## Review Priorities

### 🔴 CRITICAL (Block merge)
- **Security**: Vulnerabilities, exposed secrets, authentication/authorization issues
- **Correctness**: Logic errors, data corruption risks, race conditions
- **Breaking Changes**: API contract changes without versioning
- **Data Loss**: Risk of data loss or corruption

### 🟡 IMPORTANT (Requires discussion)
- **Code Quality**: Severe violations of SOLID principles, excessive duplication
- **Test Coverage**: Missing tests for critical paths or new functionality
- **Performance**: Obvious performance bottlenecks (N+1 queries, memory leaks)
- **Architecture**: Significant deviations from established patterns

### 🟢 SUGGESTION (Non-blocking improvements)
- **Readability**: Poor naming, complex logic that could be simplified
- **Optimization**: Performance improvements without functional impact
- **Best Practices**: Minor deviations from conventions
- **Documentation**: Missing or incomplete comments/documentation

## General Review Principles

1. **Be specific**: Reference exact lines, files, and provide concrete examples
2. **Provide context**: Explain WHY something is an issue and the potential impact
3. **Suggest solutions**: Show corrected code when applicable
4. **Be constructive**: Focus on improving the code, not criticizing the author
5. **Recognize good practices**: Acknowledge well-written code
6. **Be pragmatic**: Not every suggestion needs immediate implementation
7. **Group related comments**: Avoid multiple comments about the same topic

## Security Review Checklist

- No passwords, API keys, tokens, or PII in code or logs
- All user inputs validated and sanitized
- Parameterized queries (no SQL injection via string concatenation)
- Proper authentication checks before resource access
- Proper authorization (verify user permissions)
- Established crypto libraries (never roll your own)
- No known dependency vulnerabilities

## Testing Standards

- Critical paths and new functionality must have tests
- Descriptive test names explaining what is being tested
- Clear Arrange-Act-Assert or Given-When-Then pattern
- Tests independent of each other and external state
- Specific assertions (not generic assertTrue)
- Edge cases covered: boundary conditions, null, empty collections
- External dependencies mocked; domain logic tested directly

## Performance Checks

- No N+1 queries; use JOINs or eager loading
- Appropriate time/space complexity
- Caching for expensive or repeated operations
- Proper resource cleanup (connections, files, streams)
- Large result sets paginated
- Data loaded lazily when possible

## Comment Format

```markdown
**[PRIORITY] Category: Brief title**

Description of the issue.

**Why this matters:** Impact explanation.

**Suggested fix:** [code example if applicable]
```
