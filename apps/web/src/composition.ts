import "server-only"

/**
 * Composition root (ADR 0005): the one place that wires application use cases to their
 * infrastructure adapters. Feature modules add entries here, e.g.
 *
 *   forms: { publish: (input) => publishForm(input, { forms: prismaFormRepository(getDb()) }) }
 *
 * Plain functions only — no DI container.
 */
export const useCases = {} as const
