export type NotesSemanticCapabilityReason =
  | "ready"
  | "no_notes"
  | "embeddings_unavailable";

export interface NotesSemanticCapability {
  available: boolean;
  canSearch: boolean;
  canBackfill: boolean;
  reason: NotesSemanticCapabilityReason;
  message: string;
}

export type NotesSemanticErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "embeddings_unavailable"
  | "semantic_search_unavailable"
  | "migration_missing"
  | "note_not_found"
  | "backfill_failed"
  | "embed_failed";

export function hasEmbeddingProviderConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function buildNotesSemanticCapability(noteCount: number): NotesSemanticCapability {
  if (noteCount === 0) {
    return {
      available: false,
      canSearch: false,
      canBackfill: false,
      reason: "no_notes",
      message: "Create or save a few notes first, then semantic search can help you find related ideas by meaning.",
    };
  }

  if (!hasEmbeddingProviderConfigured()) {
    return {
      available: true,
      canSearch: false,
      canBackfill: false,
      reason: "embeddings_unavailable",
      message:
        "Semantic note search is visible here, but embeddings are not configured for this deployment yet. Keyword search and exports still work normally.",
    };
  }

  return {
    available: true,
    canSearch: true,
    canBackfill: true,
    reason: "ready",
    message: "Search notes by meaning and backfill embeddings for older notes when needed.",
  };
}

export function isEmbeddingsUnavailableError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes("GEMINI_API_KEY required for embeddings");
}

export function classifySemanticSearchFailure(message: string): {
  errorCode: "migration_missing" | "semantic_search_unavailable";
  error: string;
  status: number;
} {
  const normalized = message.toLowerCase();
  const looksLikeMissingMigration =
    normalized.includes("match_notes") ||
    normalized.includes("function") ||
    normalized.includes("schema cache") ||
    normalized.includes("vector") ||
    normalized.includes("embedding");

  if (looksLikeMissingMigration) {
    return {
      errorCode: "migration_missing",
      error:
        "Semantic search infrastructure is not ready yet. Apply the semantic-search migration before using meaning-based note search.",
      status: 500,
    };
  }

  return {
    errorCode: "semantic_search_unavailable",
    error: "Semantic search is temporarily unavailable. Keyword search still works while this is being fixed.",
    status: 503,
  };
}
