---
description: "Cognate provider readiness is model-visible and chart metadata has a native Web presentation."
kind: "architecture"
generated:
  by: "agent/opencode"
  at: "2026-09-14"
---

# Cognate provider readiness and chart presentation

The Cognate tool prompt reports whether the selected provider is available. Providers may supply an actionable unavailable reason, such as the missing `AKASHXDB_URL` setting. The runtime includes that reason in a failed execution instead of exposing a generic unavailable diagnostic.

`render_chart` accepts explicitly supplied bounded rows and never executes SQL. Its persisted presentation metadata is rendered by the Web Tool card as a native SVG chart, so chart presentation does not require a database provider or a third-party browser chart package.
