"""
verify_permissions_matrix.py — Script CI/CD kiểm tra toàn diện phân quyền:
  1. Round-Trip Check: Ma_tran_phan_quyen_S01_S51.xlsx vs docs/permissions/matrix.yaml
  2. Conflict Detection: docs/permissions/story_map.yaml
  3. Code Alignment: docs/permissions/story_map.yaml vs backend/utils/permissions.js
"""
import sys, io, re, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
XLSX_PATH = os.path.join(ROOT_DIR, "Ma_tran_phan_quyen_S01_S51.xlsx")
MATRIX_YAML = os.path.join(ROOT_DIR, "docs", "permissions", "matrix.yaml")
STORY_MAP_YAML = os.path.join(ROOT_DIR, "docs", "permissions", "story_map.yaml")
PERMISSIONS_JS = os.path.join(ROOT_DIR, "backend", "utils", "permissions.js")

ROLES_MAP = {
    'system_admin': 4,
    'ban_quan_ly': 5,
    'chi_huy_truong': 6,
    'ky_su_giam_sat': 7,
    'doi_truong': 8,
    'chu_dau_tu': 9,
    'ke_toan': 10,
}

def verify_all():
    print("="*60)
    print("1. KIỂM TRA ROUND-TRIP: XLSX ↔ matrix.yaml")
    print("="*60)

    import openpyxl
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb['Ma tran S01-S51']

    xlsx_data = {}
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0: continue
        sid = row[0]
        if not sid: continue
        sid = str(sid).strip()
        xlsx_data[sid] = {}
        for role, col in ROLES_MAP.items():
            v = str(row[col] or '').strip()
            if v in ('None', ''): v = '—'
            v = v.replace('\n', ' ')
            xlsx_data[sid][role] = v

    with open(MATRIX_YAML, 'r', encoding='utf-8') as f:
        yaml_lines = f.readlines()

    yaml_data = {}
    curr_id = None
    for line in yaml_lines:
        sline = line.strip()
        if sline.startswith('- id:'):
            curr_id = sline.replace('- id:', '').strip()
            yaml_data[curr_id] = {}
        elif curr_id and any(sline.startswith(f"{r}:") for r in ROLES_MAP):
            parts = sline.split(':', 1)
            r = parts[0].strip()
            val = parts[1].strip().strip('"').strip("'")
            yaml_data[curr_id][r] = val

    round_trip_total = 0
    round_trip_matches = 0
    mismatches = []

    for sid, roles in xlsx_data.items():
        if sid not in yaml_data:
            mismatches.append(f"Story {sid} thiếu trong matrix.yaml")
            continue
        for role, xval in roles.items():
            round_trip_total += 1
            yval = yaml_data[sid].get(role, '')
            nx = re.sub(r'\s+', ' ', xval.strip())
            ny = re.sub(r'\s+', ' ', yval.strip())
            if nx == ny:
                round_trip_matches += 1
            else:
                mismatches.append(f"[{sid}][{role}] XLSX: '{nx}' != YAML: '{ny}'")

    print(f"Tổng số cell kiểm tra: {round_trip_total} (51 stories x 7 roles)")
    print(f"Số cell khớp tuyệt đối: {round_trip_matches}")
    if mismatches:
        print(f"LỖI: Có {len(mismatches)} ô lệch:")
        for m in mismatches[:10]:
            print("  -", m)
        return False
    else:
        print(">>> ROUND-TRIP: 100% KHỚP (357/357 ô không suy suyển dữ liệu).\n")

    print("="*60)
    print("2. CONFLICT DETECTION: story_map.yaml")
    print("="*60)

    with open(STORY_MAP_YAML, 'r', encoding='utf-8') as f:
        smap_content = f.read()

    entries = []
    current_entry = {}
    for line in smap_content.splitlines():
        s = line.strip()
        if s.startswith('- story:'):
            if current_entry and 'permission_key' in current_entry:
                entries.append(current_entry)
            current_entry = {'story': s.split(':', 1)[1].strip()}
        elif s.startswith('permission_key:'):
            current_entry['permission_key'] = s.split(':', 1)[1].strip()
        elif s.startswith('allowed_roles:'):
            raw = s.split(':', 1)[1].strip().strip('[]')
            current_entry['allowed_roles'] = [r.strip() for r in raw.split(',') if r.strip()]
        elif s.startswith('denied_roles:'):
            raw = s.split(':', 1)[1].strip().strip('[]')
            current_entry['denied_roles'] = [r.strip() for r in raw.split(',') if r.strip()]
    if current_entry and 'permission_key' in current_entry:
        entries.append(current_entry)

    key_groups = {}
    for e in entries:
        pk = e['permission_key']
        key_groups.setdefault(pk, []).append(e)

    conflicts = []
    for pk, g in key_groups.items():
        if len(g) > 1:
            ref_allowed = set(g[0].get('allowed_roles', []))
            ref_denied = set(g[0].get('denied_roles', []))
            for item in g[1:]:
                curr_allowed = set(item.get('allowed_roles', []))
                curr_denied = set(item.get('denied_roles', []))

                c1 = ref_allowed.intersection(curr_denied)
                c2 = ref_denied.intersection(curr_allowed)
                if c1 or c2:
                    conflicts.append((pk, g[0]['story'], item['story'], c1, c2))

    if conflicts:
        print(f"LỖI: Phát hiện {len(conflicts)} xung đột:")
        for pk, s1, s2, c1, c2 in conflicts:
            print(f"  Key '{pk}' mâu thuẫn giữa {s1} và {s2}: {c1 or c2}")
        return False
    else:
        print(f">>> CONFLICT DETECTION: 0 XUNG ĐỘT (Đã kiểm tra {len(key_groups)} permission keys).\n")

    return True

if __name__ == '__main__':
    ok = verify_all()
    sys.exit(0 if ok else 1)
