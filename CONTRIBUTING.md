# Contributing

Thanks for helping out! Bug reports and feedback are just as useful as code.

1. Install: `npm ci && npm --prefix client ci` (Node 20.19+).
2. Run the checks before opening a pull request: `npm test` and `npm --prefix client run lint`.
3. Game rules live in `src/engine.ts` as a pure reducer. If you change a rule, add or update a test in `tests/`.
4. Keep pull requests small and describe what you tested.
