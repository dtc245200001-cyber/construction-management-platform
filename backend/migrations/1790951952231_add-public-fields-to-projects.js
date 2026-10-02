/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.addColumns("projects", {
    province: { type: "varchar(50)", notNull: false },
    project_type: { type: "varchar(50)", notNull: false },
    stage: { type: "varchar(50)", notNull: false },
    description: { type: "text", notNull: false },
    cover_image_url: { type: "varchar(500)", notNull: false },
    expected_completion_date: { type: "date", notNull: false },
    is_public: { type: "boolean", notNull: true, default: false },
    normalized_search_text: { type: "text", notNull: false },
  });
  
  // Create an index on normalized_search_text for fast LIKE '%query%' search (trigram ideally, but simple btree or gin text_pattern_ops)
  // For basic LIKE, no special index unless using pg_trgm, but let's just add a basic index or none for now.
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropColumns("projects", [
    "province",
    "project_type",
    "stage",
    "description",
    "cover_image_url",
    "expected_completion_date",
    "is_public",
    "normalized_search_text"
  ]);
};
