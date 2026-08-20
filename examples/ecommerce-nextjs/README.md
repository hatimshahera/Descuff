# Ecommerce Next.js Example

This public example uses `fixtures/ecommerce` as the first release validation target.

From the repository root:

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js scan fixtures/ecommerce
node packages/cli/dist/index.js report fixtures/ecommerce
node packages/cli/dist/index.js plan fixtures/ecommerce
node packages/cli/dist/index.js validate fixtures/ecommerce
```

The validated flow proves that Descuff can classify the fixture as ecommerce, detect routes and API operations, select applicable standards, generate an agent plan, and produce a passing validation readiness report.

After npm publication, the intended public command shape is:

```bash
npx descuff scan .
npx descuff report .
npx descuff plan .
npx descuff validate .
```
