# Late automatic provider finding disposition

The independent review/one sensitive confirmation of the original correction completed on 9fe03efcf461111c965324b995112be9fd1ea646. Opening PR #835 then automatically triggered the configured provider review; no second review request was sent. Its P1 finding is valid: Task result transactions called TaskService.read(), which always acquired another connection through DatabaseContext.transaction(). Concurrent callers could exhaust the pool, and the Task read was outside the owning result snapshot.

A real App/public REST regression with an actual one-connection PostgreSQL application pool and a finite acquisition deadline failed before the fix: reads returned 500 and first declaration returned 500 with connection-acquisition timeouts. The same two scenarios pass after the fix, covering current/history/eligible reads, first record/correction, and ordinary Task read compatibility. No owning module is mocked.

## Focused correction boundary

Extract the existing ordinary Task read gates into TaskService.readWithinTransaction({ actor, taskId }). Ordinary Task reads retain their existing repeatable-read wrapper. All four Task result call sites use the caller-owned transaction, including commands. DatabaseContext, production pool configuration, permissions, Task fields/receipts/lifecycle, and Document qualification are unchanged. The harness-only bounded pool option proves the resource boundary without changing runtime capacity.

## Standards then Spec delta examination

Standards: typed named inputs; UUID validation remains at each public owner; exact existing read body reused; no assertion, dependency, broad transaction behavior or production pool workaround. Real public PostgreSQL tests exercise the owning service. No remaining blocking Standards finding in this delta.

Spec: all Task/Project/original-Client gates execute on the result's connection before result access. Read transactions retain repeatable-read isolation; write gates, result locks and atomic commit remain on the owning command connection. All result entry points are covered by the replacement. Ordinary Task read behavior and mutable calculation remain identical. No new business permission, state transition, scope or acceptance criterion. No remaining blocking Spec finding in this delta.

This late automatic finding is incorporated by amending the single correction commit; the reviewed original correction bytes are retained unchanged. The earlier independent confirmation is evidence for those original authorization/OpenAPI changes only; it does not attest to this later transaction delta. No third review is requested. Full verification must be repeated on the amended source. The pre-fix final CI run 40054370284 was deliberately cancelled and is superseded, never recorded as successful.
