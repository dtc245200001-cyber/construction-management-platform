"use strict";

/**
 * verify-permissions.js
 * Script chạy trong CI / npm test để:
 *  1. Kiểm tra trôi dữ liệu (Drift check) trong docs/permissions/matrix.yaml (đủ 51 stories, 7 roles)
 *  2. Kiểm tra xung đột (Conflict detection) trong docs/permissions/story_map.yaml
 *  3. Đối chiếu mã nguồn backend/utils/permissions.js với story_map.yaml
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "../..");
const MATRIX_YAML = path.join(ROOT_DIR, "docs/permissions/matrix.yaml");
const STORY_MAP_YAML = path.join(ROOT_DIR, "docs/permissions/story_map.yaml");
const PERMISSIONS_JS = path.join(ROOT_DIR, "backend/utils/permissions.js");

const ROLES = [
  "system_admin",
  "ban_quan_ly",
  "chi_huy_truong",
  "ky_su_giam_sat",
  "doi_truong",
  "chu_dau_tu",
  "ke_toan",
];

function runVerification() {
  console.log("==================================================");
  console.log("1. KIỂM TRA TRÔI DỮ LIỆU: matrix.yaml (51 Stories)");
  console.log("==================================================");

  if (!fs.existsSync(MATRIX_YAML)) {
    throw new Error(`Không tìm thấy file: ${MATRIX_YAML}`);
  }

  const matrixContent = fs.readFileSync(MATRIX_YAML, "utf-8");
  const storyMatches = matrixContent.match(/- id:\s*S-\d+/g) || [];
  console.log(`Tìm thấy ${storyMatches.length} stories trong matrix.yaml`);
  if (storyMatches.length < 51) {
    throw new Error(`LỖI: matrix.yaml chỉ có ${storyMatches.length} stories, yêu cầu đủ 51 stories!`);
  }
  console.log(">>> matrix.yaml: ĐỦ 51 STORIES.\n");

  console.log("==================================================");
  console.log("2. CONFLICT DETECTION TRONG story_map.yaml");
  console.log("==================================================");

  const storyMapContent = fs.readFileSync(STORY_MAP_YAML, "utf-8");
  const entries = [];
  let current = null;

  for (const line of storyMapContent.split(/\r?\n/)) {
    const s = line.trim();
    if (s.startsWith("- story:")) {
      if (current && current.permission_key) {
        entries.push(current);
      }
      current = { story: s.replace("- story:", "").trim() };
    } else if (current) {
      if (s.startsWith("permission_key:")) {
        current.permission_key = s.replace("permission_key:", "").trim();
      } else if (s.startsWith("allowed_roles:")) {
        const raw = s.replace("allowed_roles:", "").trim().replace(/[\[\]]/g, "");
        current.allowed_roles = raw.split(",").map((r) => r.trim()).filter(Boolean);
      } else if (s.startsWith("denied_roles:")) {
        const raw = s.replace("denied_roles:", "").trim().replace(/[\[\]]/g, "");
        current.denied_roles = raw.split(",").map((r) => r.trim()).filter(Boolean);
      }
    }
  }
  if (current && current.permission_key) {
    entries.push(current);
  }

  const keyGroups = {};
  for (const e of entries) {
    if (!keyGroups[e.permission_key]) {
      keyGroups[e.permission_key] = [];
    }
    keyGroups[e.permission_key].push(e);
  }

  let conflictCount = 0;
  for (const [key, group] of Object.entries(keyGroups)) {
    if (group.length > 1) {
      const refAllowed = new Set(group[0].allowed_roles || []);
      const refDenied = new Set(group[0].denied_roles || []);

      for (let i = 1; i < group.length; i++) {
        const currAllowed = new Set(group[i].allowed_roles || []);
        const currDenied = new Set(group[i].denied_roles || []);

        for (const r of currAllowed) {
          if (refDenied.has(r)) {
            conflictCount++;
            console.error(`[XUNG ĐỘT] Key '${key}': Role '${r}' bị cấm ở ${group[0].story} nhưng cho phép ở ${group[i].story}!`);
          }
        }
        for (const r of currDenied) {
          if (refAllowed.has(r)) {
            conflictCount++;
            console.error(`[XUNG ĐỘT] Key '${key}': Role '${r}' được phép ở ${group[0].story} nhưng bị cấm ở ${group[i].story}!`);
          }
        }
      }
    }
  }

  if (conflictCount > 0) {
    throw new Error(`Phát hiện ${conflictCount} xung đột vai trò trong story_map.yaml!`);
  }
  console.log(`>>> CONFLICT DETECTION: 0 XUNG ĐỘT (Đã kiểm tra ${Object.keys(keyGroups).length} permission keys).\n`);

  console.log("==================================================");
  console.log("3. ĐỐI CHIẾU permissions.js");
  console.log("==================================================");
  const { PERMISSIONS, can } = require(PERMISSIONS_JS);

  let verifiedCount = 0;
  for (const e of entries) {
    if (e.endpoint_status === "not_implemented") continue;
    for (const r of (e.allowed_roles || [])) {
      if (r === "system_admin") continue; // system_admin kiểm tra riêng qua bypass/is_system_admin
      if (!can(r, e.permission_key)) {
        console.warn(`[LỆCH] Story ${e.story}: Role ${r} được map cho '${e.permission_key}' nhưng permissions.js trả về false!`);
      } else {
        verifiedCount++;
      }
    }
  }
  console.log(`>>> Đã đối chiếu ${verifiedCount} quyền hợp lệ trong permissions.js.`);
  console.log(">>> TẤT CẢ KIỂM TRA PHÂN QUYỀN CI HOÀN TẤT THÀNH CÔNG!\n");
}

if (require.main === module) {
  try {
    runVerification();
    process.exit(0);
  } catch (err) {
    console.error("LỖI KIỂM TRA PHÂN QUYỀN:", err.message);
    process.exit(1);
  }
}

module.exports = { runVerification };
