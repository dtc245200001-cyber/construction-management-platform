const fs = require('fs');
const file = 'backend/__tests__/fixtures/k01-expected.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
data.actualScenarios = [
  {
    "id": "ca1_viec_gang_tre_3",
    "today": null,
    "actuals": { "D": { "actualStart": 7, "actualEnd": 15, "percent": 100 } },
    "calculatedBy": "<tên bạn>",
    "calculatedDate": "<yyyy-mm-dd>",
    "expected": [],
    "projectFinish": null
  },
  {
    "id": "ca2_khong_gang_tre_it_hon_float",
    "today": null,
    "actuals": { "C": { "actualStart": 3, "actualEnd": 6, "percent": 100 } },
    "calculatedBy": "<tên bạn>",
    "calculatedDate": "<yyyy-mm-dd>",
    "expected": [],
    "projectFinish": null
  },
  {
    "id": "ca3_khong_gang_tre_qua_float",
    "today": null,
    "actuals": { "E": { "actualStart": 7, "actualEnd": 13, "percent": 100 } },
    "calculatedBy": "<tên bạn>",
    "calculatedDate": "<yyyy-mm-dd>",
    "expected": [],
    "projectFinish": null
  },
  {
    "id": "ca4a_dang_lam_hom_nay_som",
    "today": 8,
    "actuals": { "D": { "actualStart": 7, "actualEnd": null, "percent": 40 } },
    "calculatedBy": "<tên bạn>",
    "calculatedDate": "<yyyy-mm-dd>",
    "expected": [],
    "projectFinish": null
  },
  {
    "id": "ca4b_dang_lam_hom_nay_tre",
    "today": 11,
    "actuals": { "D": { "actualStart": 7, "actualEnd": null, "percent": 40 } },
    "calculatedBy": "<tên bạn>",
    "calculatedDate": "<yyyy-mm-dd>",
    "expected": [],
    "projectFinish": null
  }
];
data.actualScenariosNote = "actualEnd là MỐC EF (offset ngày làm việc, kết thúc xong ở mốc đó), không phải ngày cuối cùng làm việc; today là offset ngày làm việc; \"phần còn lại\" = ceil(thời lượng × (100 − percent) / 100).";
fs.writeFileSync(file, JSON.stringify(data, null, 2));
