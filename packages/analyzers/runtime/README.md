# @descuff/analyzer-runtime

Browser/runtime evidence analyzer for Descuff.

This package supports runtime checks used by Descuff validation and release hardening. Most users should install and run the CLI instead:

```bash
npx descuff start .
```

It can inspect configured local routes in a browser, discover browser-registered WebMCP tools, execute only explicit read-only WebMCP scenarios, and produce browser-agent task benchmark observations from that evidence.

Use this package directly only if you are building on Descuff internals.
