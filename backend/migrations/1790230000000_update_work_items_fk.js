module.exports = {
  up: async (pgm) => {
    // Drop existing foreign key on parent_id
    pgm.dropConstraint("work_items", "work_items_parent_id_fkey", { ifExists: true });

    // Add unique constraint for (project_id, id) so it can be referenced
    pgm.addConstraint("work_items", "work_items_project_id_id_unique", {
      unique: ["project_id", "id"],
    });

    // Add composite foreign key with ON DELETE RESTRICT
    pgm.addConstraint("work_items", "work_items_project_parent_fkey", {
      foreignKeys: {
        columns: ["project_id", "parent_id"],
        references: "work_items(project_id, id)",
        onDelete: "RESTRICT",
      }
    });
  },

  down: async (pgm) => {
    // Drop the new composite foreign key
    pgm.dropConstraint("work_items", "work_items_project_parent_fkey", { ifExists: true });
    
    // Drop the unique constraint
    pgm.dropConstraint("work_items", "work_items_project_id_id_unique", { ifExists: true });

    // Re-add the old foreign key with ON DELETE CASCADE
    pgm.addConstraint("work_items", "work_items_parent_id_fkey", {
      foreignKeys: {
        columns: "parent_id",
        references: "work_items(id)",
        onDelete: "CASCADE",
      }
    });
  },
};
