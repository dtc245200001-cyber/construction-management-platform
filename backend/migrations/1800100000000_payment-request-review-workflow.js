"use strict";

// S-44 / T-114
// Review workflow for payment requests:
// DRAFT -> APPROVED or DRAFT -> RETURNED.
// Returned requests release their acceptance vouchers for a new request.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("payment_requests", {
    reviewed_by: {
      type: "integer",
      notNull: false,
      references: "users",
      onDelete: "RESTRICT",
    },
    reviewed_at: {
      type: "timestamptz",
      notNull: false,
    },
    return_reason: {
      type: "text",
      notNull: false,
    },
  });

  pgm.createTable("payment_request_status_history", {
    id: { type: "serial", primaryKey: true },
    payment_request_id: {
      type: "integer",
      notNull: true,
      references: "payment_requests",
      onDelete: "RESTRICT",
    },
    project_id: {
      type: "integer",
      notNull: true,
      references: "projects",
      onDelete: "RESTRICT",
    },
    action: {
      type: "varchar(20)",
      notNull: true,
    },
    from_status: {
      type: "varchar(20)",
      notNull: false,
    },
    to_status: {
      type: "varchar(20)",
      notNull: true,
    },
    reason: {
      type: "text",
      notNull: false,
    },
    acted_by: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "RESTRICT",
    },
    acted_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint(
    "payment_request_status_history",
    "payment_request_status_history_action_check",
    {
      check: "\"action\" IN ('CREATED', 'APPROVED', 'RETURNED')",
    }
  );

  pgm.addConstraint(
    "payment_request_status_history",
    "payment_request_status_history_to_status_check",
    {
      check: "\"to_status\" IN ('DRAFT', 'APPROVED', 'RETURNED')",
    }
  );

  pgm.createIndex("payment_request_status_history", ["payment_request_id", "acted_at"]);
  pgm.createIndex("payment_request_status_history", ["project_id", "acted_at"]);

  pgm.sql(`
    COMMENT ON TABLE "payment_request_status_history" IS
      'Append-style business history for payment request status changes (S-44/T-114).';
    COMMENT ON COLUMN "payment_requests"."return_reason" IS
      'Reason supplied by the investor when a DRAFT payment request is returned.';
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("payment_request_status_history", { ifExists: true, cascade: true });
  pgm.dropColumns("payment_requests", ["reviewed_by", "reviewed_at", "return_reason"]);
};
