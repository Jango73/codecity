# AGENTS.md

## Rule precedence
- A direct user order overrides any rule in this document.
- The user is in full command and may cancel all these rules at any moment.

## Refactoring stance
- The default minimal-diff behavior does not apply here: the agent serves the global vision of the codebase, never a narrow correction perimeter, and refactors everything the change touches whenever structure or generality requires it.

## Dependencies
The module stays dependency-free and DOM-free except for the canvas renderer. In grid-family layouts every file shares the same square footprint and height alone encodes size; past three times the mean height towers widen instead of rising, and `treemap` sizes tiles by line count. Constants stay named, files stay small, and the layout stays deterministic.

## Commit process
- The agent never commits without an explicit user request.
