"use strict";

// S-45 / T-116
// Project-level retention configuration + immutable snapshot values on each payment request.
//
// Product assumptions documented for this implementation:
// - retention rate is a percentage in [0, 100], with max 2 decimal places.
// - optional retention cap is a VND amount; NULL means "no separate cap".
// - retention is rounded half-up to whole VND for each request.
// - approved requests keep their snapshot values when project configuration changes.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("projects", {
    payment_retention_rate: {
      type: "numeric(5,2)",
      notNull: true,
      default: 0,
    },
    payment_retention_cap_amount: {
      type: "numeric(18,2)",
      notNull: false,
    },
  });

  pgm.addConstraint("projects", "projects_payment_retention_rate_check", {
    check: '"payment_retention_rate" >= 0 AND "payment_retention_rate" <= 100',
  });
  pgm.addConstraint("projects", "projects_payment_retention_cap_check", {
    check: '"payment_retention_cap_amount" IS NULL OR "payment_retention_cap_amount" >= 0',
  });

  pgm.addColumns("payment_requests", {
    retention_rate: {
      type: "numeric(5,2)",
      notNull: true,
      default: 0,
    },
    retention_cap_amount: {
      type: "numeric(18,2)",
      notNull: false,
    },
    retention_amount: {
      type: "numeric(18,2)",
      notNull: true,
      default: 0,
    },
    payable_amount: {
      type: "numeric(18,2)",
      notNull: true,
      default: 0,
    },
    cumulative_retention_amount: {
      type: "numeric(18,2)",
      notNull: true,
      default: 0,
    },
  });

  // Existing requests pre-date retention: treat them as 0% retained.
  pgm.sql(`
    UPDATE payment_requests
    SET retention_rate = 0,
        retention_amount = 0,
        payable_amount = total_amount,
        cumulative_retention_amount = 0
  `);

  pgm.addConstraint("payment_requests", "payment_requests_retention_rate_check", {
    check: '"retention_rate" >= 0 AND "retention_rate" <= 100',
  });
  pgm.addConstraint("payment_requests", "payment_requests_retention_cap_check", {
    check: '"retention_cap_amount" IS NULL OR "retention_cap_amount" >= 0',
  });
  pgm.addConstraint("payment_requests", "payment_requests_retention_amount_check", {
    check: '"retention_amount" >= 0 AND "retention_amount" <= "total_amount"',
  });
  pgm.addConstraint("payment_requests", "payment_requests_payable_amount_check", {
    check: '"payable_amount" = "total_amount" - "retention_amount"',
  });
  pgm.addConstraint("payment_requests", "payment_requests_cumulative_retention_check", {
    check: '"cumulative_retention_amount" >= "retention_amount"',
  });

  pgm.sql(`
    COMMENT ON COLUMN projects.payment_retention_rate IS
      'Retention percentage for new payment requests. Range 0..100 inclusive.';
    COMMENT ON COLUMN projects.payment_retention_cap_amount IS
      'Optional total retention cap in VND. NULL means no separate cap.';
    COMMENT ON COLUMN payment_requests.retention_rate IS
      'Snapshot retention rate used by this request.';
    COMMENT ON COLUMN payment_requests.retention_amount IS
      'Retention for this request, rounded half-up to whole VND.';
    COMMENT ON COLUMN payment_requests.payable_amount IS
      'Actual payable = total_amount - retention_amount.';
    COMMENT ON COLUMN payment_requests.cumulative_retention_amount IS
      'Approved retention before this request plus this request retention.';
  `);
};

exports.down = (pgm) => {
  pgm.dropColumns("payment_requests", [
    "retention_rate",
    "retention_cap_amount",
    "retention_amount",
    "payable_amount",
    "cumulative_retention_amount",
  ]);
  pgm.dropColumns("projects", [
    "payment_retention_rate",
    "payment_retention_cap_amount",
  ]);
};
