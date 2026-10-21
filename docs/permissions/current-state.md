# Pha 0 -- Hien trang Schema & Phan quyen

**Ngay tao:** 2026-10-21
**Nguoi tao:** Antigravity (Pha 0 Discovery)
**Trang thai:** CHI DOC -- khong sua schema, khong chay migration

---

## 1. Kien truc phan quyen hien tai

### 1.1 Bang `roles` (he thong)
Cot: id serial PK, name varchar(255) UNIQUE, description varchar(255), created_at

**Du lieu seed hien co** (sau migration 1800500000000):

| id | name            | Nhan tieng Viet      |
|----|-----------------|----------------------|
| 1  | chu_dau_tu      | Chu dau tu           |
| 2  | ban_quan_ly     | Ban quan ly          |
| 3  | ky_su_giam_sat  | Ky su giam sat       |
| 4  | chi_huy_truong  | Chi huy truong       |
| 5  | doi_truong      | Doi truong           |
| 6  | ke_toan         | Ke toan CDT          |
| 7  | khach           | Khach (default-deny) |

### 1.2 Bang `users`
Cot: id, name, email, password_hash, role_id FK->roles, is_system_admin, is_verified,
     failed_login_attempts, locked_until, created_at

- role_id la FK sang roles -- dung cho system-level role (mac dinh khi tham gia he thong)
- KHONG PHAI vai tro trong du an -- vai tro trong du an nam o project_members.role

### 1.3 Bang `project_members` (vai tro trong du an)
Cot: id, project_id FK->projects, user_id FK->users,
     role varchar(50) CHECK IN(7 gia tri),
     created_at, joined_at, invited_by FK->users

- Cot key: role (TEXT, NOT NULL) -- luu truc tiep ten vai tro
- chk_role constraint: role IN ('chu_dau_tu','ban_quan_ly','ky_su_giam_sat','chi_huy_truong','doi_truong','ke_toan','khach')
- KHONG CO cot role_id -- day la TEXT field, khong phai FK

> VE LOI pm.role_id does not exist:
> Khong tim thay bat ky file JS/JSX nao trong codebase hien tai co tham chieu pm.role_id.
> Loi nay khong tai hien duoc tu code nguon. Co the: da duoc sua o commit truoc, hoac 
> den tu query trong DB view/trigger khong co trong source, hoac la loi production khi
> schema cu chua migrate du.

---

## 2. Middleware & Permission Engine

### 2.1 Flow xac thuc request
Request -> requireAuth (session) -> checkProjectAccess (project_members.role)
        -> requirePermission("key") hoac allow([roles]) -> Handler

### 2.2 checkProjectAccess (middleware/projectAccess.js)
- Tra SELECT role FROM project_members WHERE project_id=1 AND user_id=2
- Gan req.projectRole = row.role
- System Admin: bypass (khong can la thanh vien, req.projectRole = "system_admin")

### 2.3 requirePermission(key) -- ma tran trung tam
- Tra PERMISSIONS[key] trong utils/permissions.js
- Neu role khong co trong mang -> 403
- System Admin -> bypass

### 2.4 createProjectRouter() -- Default-Deny (T-07)
- Moi route KHONG khai bao requirePermission() hay allow() deu tu dong 403
- AP DUNG: tat ca router tao bang createProjectRouter()
- NGOAI LE (bug F-02): siteGeofenceRoutes.js va taskLogRoutes.js dung express.Router() thuong

---

## 3. Anh xa vai tro -- Backlog <-> Code <-> Ma tran Excel

| Ten trong Backlog/Ma tran      | Ten trong code (constants.js)  | Nhan hien thi       |
|--------------------------------|--------------------------------|---------------------|
| Chu dau tu / owner             | chu_dau_tu                     | Chu dau tu          |
| Ban quan ly / project_manager  | ban_quan_ly                    | Ban quan ly         |
| Ky su giam sat / site_supervisor | ky_su_giam_sat               | Ky su giam sat      |
| Chi huy truong / site_commander  | chi_huy_truong               | Chi huy truong      |
| Doi truong / team_leader       | doi_truong                     | Doi truong          |
| Ke toan CDT / owner_accountant | ke_toan                        | Ke toan             |
| Khach / guest                  | khach                          | Khach               |
| System Admin                   | is_system_admin=true (flag)    | Quan tri he thong   |

---

## 4. Danh sach phat hien can xu ly (tu permissions-audit/findings.md)

| ID   | Muc do   | Mo ta ngan                                               | Story |
|------|----------|----------------------------------------------------------|-------|
| F-01 | CRITICAL | GET dependencies bi chan hoan toan (thieu permission)    | S-14  |
| F-02 | CRITICAL | 2 router file bo qua Default-Deny                        | NFR   |
| F-03 | CRITICAL | cost.record chi KE_TOAN, BQL bi chan (lech S-47/BL-4)    | S-47  |
| F-04 | CRITICAL | acceptance.approve_official gan BQL thay vi CDT          | S-38  |
| F-05 | CRITICAL | Khong guard xoa BQL cuoi cung                            | S-22  |
| F-06 | HIGH     | CHT duoc sua WBS (lech S-05)                             | S-05  |
| F-07 | HIGH     | ALL_MEMBERS duoc tinh lai CPM (lech S-11)                | S-11  |
| F-08 | MEDIUM   | 11 quyen treo chua co route su dung                      | N/A   |

---

## 5. Ke hoach trien khai (phac thao)

### Pha 1 -- Chuan bi nguon su that (permissions/)
- [ ] Tao docs/permissions/vocabulary.yaml -- danh sach role canonical
- [ ] Doc Ma_tran_phan_quyen_S01_S51.xlsx va xuat docs/permissions/matrix.yaml
- [ ] Tao docs/permissions/overrides.yaml -- ghi 4 BL + 3 OV
- [ ] Tao docs/permissions/DECISIONS.md -- quyet dinh kem ngay

### Pha 2 -- Sua loi Critical (theo findings)
- [ ] F-01: Them requirePermission("project.member") vao dependencyRoutes.js
- [ ] F-02: Doi express.Router() -> createProjectRouter() o 2 file
- [ ] F-03: Xem xet BL-4 (S-47 giu theo backlog: BQL+KE_TOAN)
- [ ] F-04: Sua acceptance.approve_official theo BL/OV da xac nhan
- [ ] F-05: Them guard xoa BQL cuoi

### Pha 3 -- Cap nhat permissions.js theo ma tran
- [ ] Doc tung o ma tran -> cap nhat PERMISSIONS
- [ ] Kiem tra tung route -> ap dung dung permission key

### Pha 4 -- Test
- [ ] Viet test cho tung finding duoc sua
- [ ] Chay test suite hien co de khong regression

---

## 6. Diem DUNG -- Pha 0

DUNG. Bao cao hien trang hoan tat. Cho xac nhan cua chu du an truoc khi thuc hien Pha 1.

Cau hoi can xac nhan:
1. Loi pm.role_id does not exist co con tai hien khong? (Kiem tra tren staging/production)
2. Xac nhan thu tu uu tien sua: sua F-01..F-05 truoc hay doc ma tran xlsx truoc?
3. Co can export ma tran xlsx ra matrix.yaml bang script Python khong?
