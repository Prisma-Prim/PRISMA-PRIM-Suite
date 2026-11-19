# Fictional certificate issuance across a UTC day

The native test advances the synthetic server clock to the following UTC day while preserving the declared issuance date. Both browser formats detected the old zero-day expectation and displayed one day. Both passed after the expectation matched that exact value. The scenario reaches certificate transmission and exact register downloads.

[Desktop capture](desktop-certificate-awaiting-transmission.png) · [Narrow capture](narrow-certificate-awaiting-transmission.png) · [Execution and original hashes](proof.json)

The captures were inspected and show fictional data. The clock is restored after the test. [PR #1456](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/pull/1456)
