# Contributing to Republic SDK

Thank you for your interest in contributing to Republic SDK!

## Development Setup

```bash
git clone https://github.com/eren-karakus0/republic-sdk.git
cd republic-sdk
npm install
```

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. Make your changes and ensure quality:
   ```bash
   npm run lint    # Code style check
   npm run test    # Run all tests
   npm run build   # Verify build
   ```

3. Write tests for new functionality (target: maintain or increase coverage).

4. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat(scope): add new feature
   fix(scope): fix specific bug
   docs: update documentation
   refactor: code restructuring
   test: add or update tests
   chore: maintenance tasks
   ```

5. Open a Pull Request against `main`.

## Code Standards

- TypeScript strict mode enabled
- ESLint for code style enforcement
- Follow existing patterns in the codebase
- Keep functions focused (Single Responsibility)
- Add JSDoc comments for public API methods

## Testing

- Use [Vitest](https://vitest.dev/) for testing
- Follow AAA pattern: Arrange, Act, Assert
- Mock external dependencies (axios, network calls)
- Test both success and error paths

## Project Structure

```
src/
  client.ts       # RPC/REST client with retry
  key.ts          # Key management (ethsecp256k1)
  transaction.ts  # Message builders & signing
  protobuf.ts     # Minimal protobuf encoder
  job.ts          # Job submission & monitoring
  types.ts        # TypeScript interfaces
  constants.ts    # Chain config & message types
  errors.ts       # Custom error hierarchy
  utils.ts        # Shared utilities
  index.ts        # Public API exports
bin/
  cli.ts          # CLI tool
tests/
  *.test.ts       # Test files
```

## Reporting Issues

Use the GitHub issue templates:
- **Bug Report** for bugs
- **Feature Request** for new ideas

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
