"use strict";

module.exports = {
  up: (pgm) => {
    pgm.addConstraint("project_members", "project_members_project_user_unique", {
      unique: ["project_id", "user_id"],
    });
  },

  down: (pgm) => {
    pgm.dropConstraint("project_members", "project_members_project_user_unique");
  },
};
