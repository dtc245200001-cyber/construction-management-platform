# S-10: Tính tay tiến độ mạng CPM

Tài liệu này dùng để tính tay các thông số của mạng CPM nhằm tạo bộ test độc lập với code.
**Hướng dẫn:** Người thứ hai kiểm chéo cần tính lại ĐỘC LẬP, KHÔNG nhìn đáp án của người thứ nhất.

## Công thức duyệt xuôi (Forward Pass)
*Khởi tạo:* Việc không có việc trước thì `ES = Thời điểm bắt đầu dự án`.
* `EF = ES + duration`
* **FS (Finish-to-Start):** `ES = max(EF(trước) + lag)`
* **SS (Start-to-Start):** `ES = max(ES(trước) + lag)`
* **FF (Finish-to-Finish):** `EF = max(EF(trước) + lag)`, sau đó suy ra `ES = EF - duration`
* **SF (Start-to-Finish):** `EF = max(ES(trước) + lag)`, sau đó suy ra `ES = EF - duration`

*(Lưu ý: Nếu một việc bị chi phối bởi nhiều quan hệ, cần tính tất cả các ràng buộc rồi lấy giá trị lớn nhất cho phép thoả mãn toàn bộ).*

## Công thức duyệt ngược (Backward Pass)
*Khởi tạo:* Việc không có việc sau thì `LF = Thời điểm kết thúc dự án`.
* `LS = LF - duration`
* **FS (Finish-to-Start):** `LF = min(LS(sau) - lag)`
* **SS (Start-to-Start):** `LS = min(LS(sau) - lag)`, sau đó suy ra `LF = LS + duration`
* **FF (Finish-to-Finish):** `LF = min(LF(sau) - lag)`, sau đó suy ra `LS = LF - duration`
* **SF (Start-to-Finish):** `LS = min(LF(sau) - lag)`, sau đó suy ra `LF = LS + duration`

*(Lưu ý: Nếu một việc chi phối nhiều việc sau, cần tính tất cả các ràng buộc rồi lấy giá trị nhỏ nhất).*

## Thông số chung
- `Float (Dự trữ) = LS - ES` (hoặc `LF - EF`)
- `Critical (Găng)`: Có (True) nếu `Float == 0`, Không (False) nếu `Float > 0`.

---

## Mạng 1: Đủ 4 loại quan hệ và độ trễ âm

**Người tính:** ................................... **Ngày tính:** ...................................
**Người kiểm chéo:** .......................... **Ngày kiểm chéo:** ..........................

### Thông tin mạng 1
| Việc | Thời lượng | Phụ thuộc vào | Loại quan hệ | Độ trễ (Lag) |
|---|---|---|---|---|
| A | 4 | - | - | - |
| B | 3 | A | FS | 0 |
| C | 5 | A | SS | 1 |
| D | 2 | B | FF | 0 |
| D | 2 | C | SF | 6 |
| E | 4 | D | FS | 0 |
| F | 3 | C | FS | -1 |
| G | 2 | E | FS | 0 |
| G | 2 | F | FS | 0 |

### Bảng điền đáp án (Mạng 1)
| Việc | Thời lượng | ES | EF | LS | LF | Float | Găng (Yes/No) |
|---|---|---|---|---|---|---|---|
| A | 4 | | | | | | |
| B | 3 | | | | | | |
| C | 5 | | | | | | |
| D | 2 | | | | | | |
| E | 4 | | | | | | |
| F | 3 | | | | | | |
| G | 2 | | | | | | |

---

## Mạng 2: Nhánh song song, lệch pha

**Người tính:** ................................... **Ngày tính:** ...................................
**Người kiểm chéo:** .......................... **Ngày kiểm chéo:** ..........................

### Thông tin mạng 2
| Việc | Thời lượng | Phụ thuộc vào | Loại quan hệ | Độ trễ (Lag) |
|---|---|---|---|---|
| A | 2 | - | - | - |
| B | 6 | A | FS | 0 |
| C | 2 | A | FS | 3 |
| D | 4 | B | FS | 0 |
| E | 2 | C | FS | 0 |
| F | 1 | D | FS | 0 |
| F | 1 | E | FS | 0 |

### Bảng điền đáp án (Mạng 2)
| Việc | Thời lượng | ES | EF | LS | LF | Float | Găng (Yes/No) |
|---|---|---|---|---|---|---|---|
| A | 2 | | | | | | |
| B | 6 | | | | | | |
| C | 2 | | | | | | |
| D | 4 | | | | | | |
| E | 2 | | | | | | |
| F | 1 | | | | | | |

