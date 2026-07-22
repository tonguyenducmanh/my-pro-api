// ====== CẤU HÌNH ======
const CONNECTION_STRING = "điền vào đây"; // copy từ curl gốc
const AUTH_TOKEN = "Bearer đây"; // copy từ curl gốc
const API_URL = "https://smecloudmnt.misaonline.vpnlocal/api/dbmntv2/Query";

const TABLE = "sme.refno_management";
const WHERE_CLAUSE = "reftype_category = 352";
const ORDER_COLUMN = "created_date";
const BATCH_SIZE = 5000;
const CONCURRENCY_CHUNK = 5; // số request gửi song song mỗi đợt

// Hàm build 1 curl string cho 1 câu SQL bất kỳ
function buildCurl(sql) {
  const body = JSON.stringify({
    ConnectionString: CONNECTION_STRING,
    Sql: sql,
  });

  const escapedBody = body.replace(/'/g, `'\\''`);

  return `curl '${API_URL}' \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'Authorization: ${AUTH_TOKEN}' \
  -H 'Content-Type: application/json' \
  --data-raw '${escapedBody}' \
  --insecure`;
}

// Hàm lấy tổng số dòng bằng COUNT(*)
async function getTotalRows() {
  const sql = `SELECT count(1) AS total FROM ${TABLE} WHERE ${WHERE_CLAUSE} limit 1;`;
  const res = await requestCURL(buildCurl(sql));
  const data = parseResponse(res);

  // Tuỳ cấu trúc API trả về, chỉnh lại field cho đúng
  const rows = data?.Data ?? data?.Result ?? data;

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      "Không lấy được count, kiểm tra lại response: " + JSON.stringify(data),
    );
  }

  // Lấy giá trị total, tuỳ tên field trả về là "total", "count", "count(1)"...
  const firstRow = rows[0];
  const total =
    firstRow.total ??
    firstRow.count ??
    firstRow["count(1)"] ??
    Object.values(firstRow)[0];

  const totalNum = parseInt(total, 10);

  if (isNaN(totalNum)) {
    throw new Error(
      "Không parse được số lượng dòng: " + JSON.stringify(firstRow),
    );
  }

  return totalNum;
}

async function fetchAllRows() {
  // 1. Tự động lấy tổng số dòng
  const totalRows = await getTotalRows();
  console.log(`Tổng số dòng cần lấy: ${totalRows}`);

  // 2. Tạo danh sách câu SQL theo từng batch (OFFSET tăng dần)
  const sqlBatches = [];
  for (let offset = 0; offset < totalRows; offset += BATCH_SIZE) {
    const sql = `SELECT * FROM ${TABLE} WHERE ${WHERE_CLAUSE} ORDER BY ${ORDER_COLUMN} LIMIT ${BATCH_SIZE} OFFSET ${offset};`;
    sqlBatches.push(sql);
  }

  console.log(`Tổng số batch cần gọi: ${sqlBatches.length}`);

  // 3. Build curl commands
  const curlCommands = sqlBatches.map(buildCurl);

  // 4. Gửi theo từng đợt song song
  let allRows = [];

  for (let i = 0; i < curlCommands.length; i += CONCURRENCY_CHUNK) {
    const chunk = curlCommands.slice(i, i + CONCURRENCY_CHUNK);
    console.log(
      `Đang gọi batch ${i + 1} - ${i + chunk.length} / ${curlCommands.length}...`,
    );

    const responses = await requestMultiCURL(chunk);

    for (const res of responses) {
      const data = parseResponse(res);
      const rows = data?.Data ?? data?.Result ?? data;

      if (Array.isArray(rows)) {
        allRows = allRows.concat(rows);
      } else {
        console.warn("Response không đúng định dạng mong đợi:", data);
      }
    }
  }

  console.log(`Tổng số dòng lấy được: ${allRows.length}`);
  return allRows;
}

// ====== CHẠY ======
const result = await fetchAllRows();
console.log(result);

return result;
