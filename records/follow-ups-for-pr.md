## Follow-ups

- Adopt named object arguments for the new Ideas revocation methods (`revokeIdeasReader`, `revokeIdeasRecorder`, `revokeIdeasReviewer`) and private Ideas `findIdea`/`receipt` helpers where adjacent identifiers have the same type. Standards review recorded this as one grouped nonblocking TypeScript discipline finding; current call sites are correct and no acceptance, authorization or regression defect was established. Preserve the bounded implementation for this delivery; handle the signature cleanup separately.
