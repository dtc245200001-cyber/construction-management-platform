
"use strict";

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION check_acceptance_contract_quantity()
    RETURNS TRIGGER AS $$
    DECLARE
      item RECORD;
      contract_qty NUMERIC(14,3);
      approved_qty NUMERIC(14,3);
    BEGIN
      -- Chỉ kiểm tra khi chuyển phiếu sang approved.
      -- Khong cho thay doi trang thai cua phieu da duyet.
IF OLD.status = 'approved' THEN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'Cannot change status of an approved acceptance voucher'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END IF;

-- Chi kiem tra gioi han khi chuyen sang approved.
IF NEW.status <> 'approved' THEN
  RETURN NEW;
END IF;

      -- Khóa các hạng mục theo thứ tự cố định.
      -- Mọi transaction duyệt phải dùng chung quy tắc này.
      FOR item IN
        SELECT avi.work_item_id, avi.cumulative_quantity
        FROM acceptance_voucher_items avi
        WHERE avi.voucher_id = NEW.id
        ORDER BY avi.work_item_id
      LOOP
        SELECT wi.quantity
        INTO contract_qty
        FROM work_items wi
        WHERE wi.id = item.work_item_id
          AND wi.project_id = NEW.project_id
        FOR UPDATE;

        IF NOT FOUND OR contract_qty IS NULL THEN
          RAISE EXCEPTION
            'Hạng mục % không có khối lượng hợp đồng hợp lệ',
            item.work_item_id
            USING ERRCODE = '23514';
        END IF;

        SELECT COALESCE((
          SELECT avi.cumulative_quantity
          FROM acceptance_voucher_items avi
          JOIN acceptance_vouchers av
            ON av.id = avi.voucher_id
          WHERE avi.work_item_id = item.work_item_id
            AND av.project_id = NEW.project_id
            AND av.status = 'approved'
            AND av.id <> NEW.id
          ORDER BY av.reviewed_at DESC NULLS LAST, av.id DESC
          LIMIT 1
        ), 0)
        INTO approved_qty;

        IF item.cumulative_quantity > contract_qty THEN
          RAISE EXCEPTION
            'Hạng mục % vượt hợp đồng: hợp đồng %, đã duyệt %, đề nghị %, vượt %',
            item.work_item_id,
            contract_qty,
            approved_qty,
            item.cumulative_quantity,
            item.cumulative_quantity - contract_qty
            USING ERRCODE = '23514';
        END IF;

        IF item.cumulative_quantity < approved_qty THEN
          RAISE EXCEPTION
            'Hạng mục % có lũy kế thấp hơn mức đã duyệt %',
            item.work_item_id, approved_qty
            USING ERRCODE = '23514';
        END IF;
      END LOOP;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_acceptance_contract_quantity
BEFORE UPDATE OF status ON acceptance_vouchers
FOR EACH ROW
WHEN (OLD.status = 'approved' OR NEW.status = 'approved')
EXECUTE FUNCTION check_acceptance_contract_quantity();
CREATE OR REPLACE FUNCTION prevent_approved_acceptance_item_changes()
RETURNS TRIGGER AS $$
DECLARE
  old_status VARCHAR(20);
  new_status VARCHAR(20);
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT status INTO old_status
    FROM acceptance_vouchers
    WHERE id = OLD.voucher_id
    FOR UPDATE;

    IF old_status = 'approved' THEN
      RAISE EXCEPTION
        'Cannot modify items of an approved acceptance voucher'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT status INTO new_status
    FROM acceptance_vouchers
    WHERE id = NEW.voucher_id
    FOR UPDATE;

    IF new_status = 'approved' THEN
      RAISE EXCEPTION
        'Cannot add or move items into an approved acceptance voucher'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_approved_acceptance_item_changes
BEFORE INSERT OR UPDATE OR DELETE
ON acceptance_voucher_items
FOR EACH ROW
EXECUTE FUNCTION prevent_approved_acceptance_item_changes();
CREATE OR REPLACE FUNCTION prevent_contract_quantity_below_approved()
RETURNS TRIGGER AS $$
DECLARE
  max_approved_qty NUMERIC(14,3);
BEGIN
  IF NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN
    RETURN NEW;
  END IF;

  SELECT MAX(avi.cumulative_quantity)
  INTO max_approved_qty
  FROM acceptance_voucher_items avi
  JOIN acceptance_vouchers av
    ON av.id = avi.voucher_id
  WHERE avi.work_item_id = OLD.id
    AND av.status = 'approved';

  IF max_approved_qty IS NOT NULL
     AND (
       NEW.quantity IS NULL
       OR NEW.quantity < max_approved_qty
     ) THEN
    RAISE EXCEPTION
      'Contract quantity cannot be lower than approved quantity'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_contract_quantity_below_approved
BEFORE UPDATE OF quantity
ON work_items
FOR EACH ROW
EXECUTE FUNCTION prevent_contract_quantity_below_approved();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_prevent_contract_quantity_below_approved
ON work_items;

DROP FUNCTION IF EXISTS prevent_contract_quantity_below_approved();
    DROP TRIGGER IF EXISTS trg_prevent_approved_acceptance_item_changes
ON acceptance_voucher_items;

DROP FUNCTION IF EXISTS prevent_approved_acceptance_item_changes();
    DROP TRIGGER IF EXISTS trg_acceptance_contract_quantity
      ON acceptance_vouchers;

    DROP FUNCTION IF EXISTS check_acceptance_contract_quantity();
  `);
};
