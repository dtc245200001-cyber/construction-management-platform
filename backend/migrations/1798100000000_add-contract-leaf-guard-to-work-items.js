"use strict";

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Tạo hàm plpgsql kiểm tra hạng mục lá và chặn hạng mục cha giữ giá trị hợp đồng
  pgm.sql(`
    CREATE OR REPLACE FUNCTION work_items_contract_leaf_guard()
    RETURNS TRIGGER AS $$
    DECLARE
      v_has_child BOOLEAN;
      v_parent_has_contract BOOLEAN;
    BEGIN
      -- Quy tắc 1: Nếu dòng NEW có bất kỳ trường hợp đồng nào NOT NULL,
      -- kiểm tra xem dòng này có hạng mục con (work_item) nào không.
      -- Chỉ xét work_item con, KHÔNG tính công việc ở bảng tasks.
      IF NEW.quantity IS NOT NULL OR NEW.unit IS NOT NULL OR NEW.unit_price IS NOT NULL THEN
        IF TG_OP = 'UPDATE' AND NEW.id IS NOT NULL THEN
          SELECT EXISTS(
            SELECT 1 FROM work_items WHERE parent_id = NEW.id
          ) INTO v_has_child;

          IF v_has_child THEN
            RAISE EXCEPTION 'Hạng mục cha không được khai khối lượng/đơn giá hợp đồng'
              USING ERRCODE = 'check_violation',
                    CONSTRAINT = 'work_items_contract_leaf_only';
          END IF;
        END IF;
      END IF;

      -- Quy tắc 2: Nếu NEW.parent_id IS NOT NULL (chèn con mới hoặc chuyển con sang cha khác):
      -- Khóa dòng cha bằng SELECT ... FOR SHARE để chống tranh chấp với giao dịch
      -- đang muốn gán giá trị hợp đồng cho cha (quy tắc 1).
      -- Khi giao dịch T1 đang UPDATE cha (giữ exclusive lock trên hàng cha), giao dịch T2
      -- thực hiện SELECT FOR SHARE trên hàng cha sẽ phải chờ T1 kết thúc.
      -- Ngược lại, nếu T2 đã giữ FOR SHARE trên hàng cha, T1 cố UPDATE hàng cha cũng sẽ phải chờ T2.
      -- Nhờ đó, hai thao tác gán giá trị cho cha và thêm con vào cha không thể cùng lọt qua.
      IF NEW.parent_id IS NOT NULL THEN
        PERFORM 1 FROM work_items WHERE id = NEW.parent_id FOR SHARE;

        SELECT (quantity IS NOT NULL OR unit IS NOT NULL OR unit_price IS NOT NULL)
        INTO v_parent_has_contract
        FROM work_items
        WHERE id = NEW.parent_id;

        IF v_parent_has_contract THEN
          RAISE EXCEPTION 'Không thể thêm hoặc chuyển hạng mục con vào hạng mục đã có khối lượng hợp đồng, hãy xoá khối lượng hợp đồng của hạng mục cha trước'
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'work_items_contract_leaf_only';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_work_items_contract_leaf_guard
    BEFORE INSERT OR UPDATE OF parent_id, quantity, unit, unit_price
    ON work_items
    FOR EACH ROW
    EXECUTE FUNCTION work_items_contract_leaf_guard();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_work_items_contract_leaf_guard ON work_items;
    DROP FUNCTION IF EXISTS work_items_contract_leaf_guard();
  `);
};
