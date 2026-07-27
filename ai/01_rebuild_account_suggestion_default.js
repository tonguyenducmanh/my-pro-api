/**
 * Script build data cho bảng sme.account_suggestion_default
 * -----------------------------------------------------------
 * Luồng xử lý:
 *  1. Đọc toàn bộ file JSON trong 1 thư mục (readFolder)
 *  2. Parse từng file -> ra danh sách record thô (chưa có vector)
 *     - Xác định accounting_system theo tên file (TT133 -> 133, TT200 -> 200, TT201 -> 99)
 *     - Xác định voucher_type theo tên nhóm (key) trong file, nếu file là mảng phẳng
 *       (không có tên loại chứng từ) thì mặc định là GLVoucher = 4 (chứng từ tổng hợp)
 *  3. Sinh id ổn định (deterministic) cho từng record để lần chạy sau delete/insert lại
 *     đúng dòng cũ (không phát sinh id rác mỗi lần chạy)
 *  4. Gọi API embedding theo lô tối đa 20 "description" / 1 request (requestMultiCURL)
 *  5. Build script SQL, chia lô 200 dòng: DELETE theo id rồi INSERT lại 200 dòng đó
 *
 * CHỈ CẦN SỬA vùng CONFIG bên dưới rồi chạy.
 */

// ============================ CONFIG ============================

// Thư mục chứa các file JSON nguồn (ví dụ: "Hạch toán chứng từ tiền mặt, tiền gửi TT133.json", ...)
const SOURCE_FOLDER =
  "/home/tdmanh1-ub/Codes/jira-makt-support/02_other_support/05_rebuild_account_suggest_default_24-07-2026/data_json"; // <-- SỬA lại đường dẫn thực tế

const SCHEMA_NAME = "sme";
const TABLE_NAME = "account_suggestion_default";

const EMBEDDING_BATCH_SIZE = 20; // tối đa 20 inputs (dòng) / 1 curl embedding
const REQUEST_MULTI_BATCH_SIZE = 5; // requestMultiCURL chỉ nhận tối đa 20 curl / 1 lần gọi
const SQL_BATCH_SIZE = 200; // 200 dòng / lô delete + insert

const EMBEDDING_HEADERS_TEXT =
  "Content-Type:application/json\ncache-control:no-cache,no-cache\napi-key:AI_team\nmodel:inf-retriever";

// Mapping tên nhóm nghiệp vụ (key trong file) -> voucher_type (theo enum VoucherType)
const VOUCHER_TYPE_BY_CATEGORY = {
  "Thu tiền mặt": 0, // CAReceipt
  "Thu tiền gửi": 1, // BADeposit
  "Chi tiền mặt": 2, // CAPayment
  "Chi tiền gửi": 3, // BAWithdraw
};
const GL_VOUCHER_DEFAULT = 4; // GLVoucher - dùng cho file không có tên loại chứng từ (chứng từ tổng hợp)

// ============================ HELPERS ============================

// Lấy giá trị field trong 1 record JSON, chấp nhận key có khoảng trắng thừa
// (vd: "Tên nghiệp vụ" vs "Tên nghiệp vụ ")
function getField(record, targetKey) {
  const targetTrim = targetKey.trim();
  for (const key of Object.keys(record)) {
    if (key.trim() === targetTrim) return record[key];
  }
  return undefined;
}

function toAccountCode(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function toIsForeignCurrency(value) {
  if (value === undefined || value === null) return false;
  return String(value).trim() === "Có";
}

// Xác định accounting_system từ tên file: TT133 -> 133, TT200 -> 200, TT201 -> 99 (theo yêu cầu riêng)
function resolveAccountingSystem(fileName) {
  const match = fileName.match(/TT\s*(\d+)/i);
  if (!match) return null;
  const ttNumber = parseInt(match[1], 10);
  if (ttNumber === 201) return 99;
  return ttNumber;
}

function sqlEscape(str) {
  return String(str).replace(/'/g, "''");
}

// ============================ 1-2. ĐỌC & PARSE FILE ============================

async function loadRawRecords() {
  const files = await readFolder(SOURCE_FOLDER);
  const jsonFiles = files.filter((f) => f.name.toLowerCase().endsWith(".json"));

  const records = [];

  for (const file of jsonFiles) {
    const accountingSystem = resolveAccountingSystem(file.name);
    if (accountingSystem === null) {
      console.warn(`Bỏ qua file không xác định được thông tư: ${file.name}`);
      continue;
    }

    let json;
    try {
      json = JSON.parse(file.content);
    } catch (e) {
      console.warn(`Bỏ qua file JSON không hợp lệ: ${file.name}`);
      continue;
    }

    if (Array.isArray(json)) {
      // File dạng mảng phẳng, không có tên loại chứng từ -> mặc định chứng từ tổng hợp
      for (const item of json) {
        records.push(
          buildRecord(item, GL_VOUCHER_DEFAULT, accountingSystem, file.name),
        );
      }
    } else if (json && typeof json === "object") {
      // File dạng object, key là tên loại chứng từ (Thu tiền mặt, Thu tiền gửi, ...)
      for (const [category, items] of Object.entries(json)) {
        const voucherType = VOUCHER_TYPE_BY_CATEGORY[category.trim()];
        if (voucherType === undefined) {
          console.warn(
            `Bỏ qua nhóm không xác định "${category}" trong file ${file.name}`,
          );
          continue;
        }
        for (const item of items) {
          records.push(
            buildRecord(item, voucherType, accountingSystem, file.name),
          );
        }
      }
    }
  }

  return records;
}

function buildRecord(item, voucherType, accountingSystem, fileName) {
  const description = toAccountCode(getField(item, "Tên nghiệp vụ"));
  const debitAccount = toAccountCode(getField(item, "TK Nợ"));
  const creditAccount = toAccountCode(getField(item, "TK Có"));
  const isForeignCurrency = toIsForeignCurrency(
    getField(item, "Có hạch toán ngoại tệ"),
  );

  const id = uuid();

  return {
    id,
    voucher_type: voucherType,
    is_foreign_currency: isForeignCurrency,
    description,
    debit_account: debitAccount,
    credit_account: creditAccount,
    accounting_system: accountingSystem,
    _sourceFile: fileName,
  };
}

// ============================ 3. GỌI EMBEDDING THEO LÔ 20 ============================

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Cố gắng lấy mảng embedding từ response, chấp nhận vài dạng shape phổ biến.
// Chỉnh lại hàm này nếu API trả về cấu trúc khác.
function extractEmbeddings(parsed, expectedCount) {
  let list = null;
  // Format thật của API: response là mảng thuần, mỗi phần tử là 1 vector (mảng số),
  // đúng theo thứ tự "inputs" đã gửi lên. Ví dụ: [[0.01, 0.02, ...], [0.03, ...]]
  if (Array.isArray(parsed) && Array.isArray(parsed[0])) list = parsed;
  else if (Array.isArray(parsed?.embeddings)) list = parsed.embeddings;
  else if (Array.isArray(parsed?.data))
    list = parsed.data.map((d) => d.embedding ?? d);
  else if (Array.isArray(parsed?.outputs))
    list = parsed.outputs.map((d) => d.embedding ?? d);
  else if (Array.isArray(parsed)) list = parsed;

  if (!list || list.length !== expectedCount) {
    throw new Error(
      `Không parse được embedding response đúng số lượng mong đợi (${expectedCount}). Response: ${JSON.stringify(
        parsed,
      ).slice(0, 300)}`,
    );
  }
  return list;
}

async function fillEmbeddings(records) {
  const batches = chunkArray(records, EMBEDDING_BATCH_SIZE);

  const curlList = batches.map((batch) => {
    const inputs = batch.map((r) => r.description);
    const bodyText = JSON.stringify({
      embedding_size: 384,
      embedding_start: null,
      normalize: true,
      inputs,
    });
    return stringifyCURL({
      apiUrl: "https://aiservice.misa.vn/embedding-proxy/infly/embed",
      httpMethod: "POST",
      headersText: EMBEDDING_HEADERS_TEXT,
      bodyText,
    });
  });

  // requestMultiCURL chỉ nhận tối đa REQUEST_MULTI_BATCH_SIZE curl / 1 lần gọi
  // -> chia curlList thành các nhóm nhỏ, gọi tuần tự từng nhóm rồi gộp kết quả lại
  const curlGroups = chunkArray(curlList, REQUEST_MULTI_BATCH_SIZE);
  const parsedResponses = [];
  for (const group of curlGroups) {
    const responses = await requestMultiCURL(group);
    await delay(2);
    parsedResponses.push(...parseResponseMulti(responses));
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const vectors = extractEmbeddings(parsedResponses[i], batch.length);
    for (let j = 0; j < batch.length; j++) {
      batch[j].bindingvector = `[${vectors[j].join(",")}]`;
    }
  }

  return records;
}

// ============================ 4. BUILD SQL THEO LÔ 200 ============================

function buildInsertValuesRow(r) {
  return (
    `('${r.id}', ` +
    `${r.voucher_type}, ` +
    `${r.is_foreign_currency ? "true" : "false"}, ` +
    `'${sqlEscape(r.description)}', ` +
    `'${sqlEscape(r.bindingvector)}', ` +
    `'${sqlEscape(r.debit_account)}', ` +
    `'${sqlEscape(r.credit_account)}', ` +
    `${r.accounting_system})`
  );
}

function buildSql(records) {
  const batches = chunkArray(records, SQL_BATCH_SIZE);
  const sqlParts = [];

  sqlParts.push(
    `-- Tổng số dòng: ${records.length}, chia làm ${batches.length} lô (mỗi lô tối đa ${SQL_BATCH_SIZE})\n`,
  );

  batches.forEach((batch, idx) => {
    const ids = batch.map((r) => `'${r.id}'`).join(", ");
    const values = batch.map(buildInsertValuesRow).join(",\n");

    sqlParts.push(
      `-- ===== Lô ${idx + 1}/${batches.length} (${batch.length} dòng) =====`,
    );
    sqlParts.push(
      `DELETE FROM ${SCHEMA_NAME}.${TABLE_NAME} WHERE id IN (${ids});`,
    );
    sqlParts.push(
      `INSERT INTO ${SCHEMA_NAME}.${TABLE_NAME} ` +
        `(id, voucher_type, is_foreign_currency, description, bindingvector, debit_account, credit_account, accounting_system) VALUES\n` +
        `${values};\n`,
    );
  });

  return sqlParts.join("\n");
}

// ============================ MAIN ============================
debugger
const rawRecords = await loadRawRecords();
console.log(`Đã đọc ${rawRecords.length} record từ ${SOURCE_FOLDER}`);

const recordsWithVector = await fillEmbeddings(rawRecords);

const sql = buildSql(recordsWithVector);
console.log(sql);

return sql;
