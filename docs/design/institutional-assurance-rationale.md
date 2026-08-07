# Institutional Assurance direction

## Thesis

Institutional Assurance treats each Client Request as a controlled governance
dossier. A stable register locates the work; the dossier header establishes
state, responsibility, and timing; evidence and AI-proposed fields are reviewed
as attributable records before any downstream action becomes available.

The visual language is calm and deliberately formal without imitating a generic
administration dashboard. Paper-like surfaces, fine rules, registry references,
serif headings, and a deep institutional green reinforce continuity and care.
Status meaning never depends on color: every Extracted Field has a word, symbol,
and explicit review instruction.

## Strongest use cases

- Professional audit and certification work where ownership, source history,
  and the next safe decision matter more than speed alone.
- Client Requests with several Request Sources that must remain distinguishable
  from later Analysis proposals.
- Review by occasional Internal Users who benefit from conventional dossier and
  register cues, explicit terminology, and a visible Approval boundary.
- Future governed records such as Offer Versions, Contract Versions, Quality
  Checks, Approvals, and Approved Documents.

## Deliberate trade-offs

- The direction favors attributable records over maximum queue throughput. It
  is less compact than an operations cockpit and asks the user to read before
  acting.
- Provenance is disclosed within each Extracted Field rather than kept in a
  permanently open secondary pane. This preserves the ledger scan while adding
  one interaction for detailed source comparison.
- Mobile converts the persistent register into a top tab strip and stacks the
  dossier in reading order. This keeps terminology visible but gives up
  simultaneous navigation and content.

## Risks

- Fine rules and formal typography could feel bureaucratic if later screens add
  unnecessary metadata or ceremonial language.
- Long multilingual labels may pressure the compact register navigation and
  field headers; localization testing would be essential before consolidation.
- Large evidence sets need progressive disclosure, filtering, and keyboard
  behavior beyond this bounded prototype.
- The restrained palette needs continued contrast checks so hierarchy does not
  become dependent on subtle shades.

## Visual critique after browser inspection

The six reference captures confirm that the register model remains coherent at
both viewports. On desktop, the persistent numbered navigation establishes a
stable institutional frame without competing with the dossier. The Dashboard
puts the blocking condition, responsible person, workflow, and next review link
above decorative reporting; its remaining whitespace reads as calm rather than
unfinished because the responsibility ledger balances the main record. The
Client Request makes the governed Client record and source register visibly
different kinds of evidence. The Analysis review is the strongest expression of
the thesis: proposal authority, deterministic gate, human correction, state key,
and provenance each occupy a distinct and inspectable layer.

The initial browser pass also exposed three weaknesses. Small assurance labels
in the Analysis ledger reduced legibility at 1440×900, the empty value treatment
made Contradictory resemble Missing, and the four-state comparison fell below
the first 390×844 viewport. The revised prototype increases operational label
sizes, names the contradictory value condition as “Incompatible source values,”
and adds a compact text-and-symbol state strip on narrow screens. The second
browser pass verifies these changes without introducing horizontal overflow.

Mobile deliberately becomes a sequential dossier: the top register remains
available, cards stack in governance order, and long source records require
vertical scrolling. This is understandable and touch-friendly, but it sacrifices
desktop simultaneity; the Dashboard's responsibility ledger and the Client
Request's source register are not visible in the first viewport. Source excerpts
also use bounded, keyboard-focusable scroll areas on desktop to keep all three
sources comparable. That density is useful for verification, though large source
sets would need a dedicated evidence-reading interaction in a later iteration.

This direction is an exploration artifact. It does not close the design gate,
declare approval, or define production design tokens.
