// điền các thông tin dưới đây tùy vào từng dữ liệu cần query
let isBuildMockData = false;
let accessToken = "";
let shopCipher = "";
let orderId = ""; // order id cần query, dùng chung cho orders/details, return_refund/search, cancellation/search
let productIds = []; // danh sách product id sẽ được gán sau khi gọi api đơn hàng
let appCodeHeader = "x-misa-app-code:AMISAccounting";
let apiKeyHeader =
  "x-misa-api-key:misa_ci_live_Dcpp1Ja3NQLKUPdjhbdn6ByPmnhewILJko5";
// danh sách response
let orderRes, returnRefundRes, cancellationRes, stockRes;
let productDetailResList = [];
// mockdata để import vào trong local
let mockData = [];

// ====== CẤU HÌNH CHO PHẦN QUERY DB (system_config + database_id user) ======
let isQuerySqlBuilder = false; // bật true nếu muốn query thêm system_config/database_id và build sqlBuilder
let databaseId = null; // điền database_id tương ứng với shop cần lấy dữ liệu
let SYSTEM_CONFIG_CONNECTION_STRING = "điền vào đây"; // connection string trỏ tới DB system_config
let DATABASE_ID_CONNECTION_STRING = "điền vào đây"; // connection string trỏ tới DB của database_id (user db)
let QUERY_AUTH_TOKEN = "Bearer đây"; // copy từ curl gốc của api Query
let QUERY_API_URL = "https://smecloudmnt.misaonline.vpnlocal/api/dbmntv2/Query";

let connectionId = null;
let connectionInfoRes,
  settingSyncOrderRes,
  settingMappingItemRes,
  settingMappingStockRes;

// sqlBuilder được build theo từng connection string: mỗi key = 1 connection string,
// value = 1 chuỗi SQL duy nhất gộp toàn bộ các bảng đã query trên connection đó
let sqlBuilder = {};

// helper build curl cho api Query (dùng chung cho system_config và database_id user)
function buildQueryCurl(connectionString, sql) {
  const body = JSON.stringify({
    ConnectionString: connectionString,
    Sql: sql,
  });

  const escapedBody = body.replace(/'/g, `'\\''`);

  return `curl '${QUERY_API_URL}' \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'Authorization: ${QUERY_AUTH_TOKEN}' \
  -H 'Content-Type: application/json' \
  --data-raw '${escapedBody}' \
  --insecure`;
}

// lấy danh sách rows từ response của api Query, tuỳ cấu trúc trả về mà lấy field cho đúng
function extractRows(res) {
  const data = parseResponse(res);
  const rows = data?.Data ?? data?.Result ?? data;
  return Array.isArray(rows) ? rows : [];
}

// helper: gộp nhiều đoạn SQL (create table / insert / delete...) của nhiều bảng
// thuộc CÙNG 1 connection string thành 1 chuỗi SQL duy nhất
function buildSingleSqlForConnection(parts) {
  return parts.filter(Boolean).join("\n\n");
}

// gọi api đơn hàng
let curlOrderAPI = `
curl 'https://ecommerce.misa.vn/backend-api/TikToks/orders/details' \
--request POST \
--header '${appCodeHeader}' \
--header '${apiKeyHeader}' \
--header 'Content-Type:application/json' \
--data '{
  "AccessToken": "${accessToken}",
  "ShopCipher": "${shopCipher}",
  "IDs": [
    "${orderId}"
  ]
}'
`;

// gọi api tìm kiếm trả hàng / hoàn tiền
let curlReturnRefund = `
curl 'https://ecommerce.misa.vn/backend-api/TikToks/return_refund/search' \
--request POST \
--header '${appCodeHeader}' \
--header '${apiKeyHeader}' \
--header 'Content-Type:application/json' \
--data '{
  "PageSize": "50",
  "PageToken": "",
  "AccessToken": "${accessToken}",
  "ShopCipher": "${shopCipher}",
  "Body": {
    "order_ids": [
      "${orderId}"
    ]
  }
}'
`;

// gọi api tìm kiếm hủy đơn
let curlCancellation = `
curl 'https://ecommerce.misa.vn/backend-api/TikToks/cancellation/search' \
--request POST \
--header '${appCodeHeader}' \
--header '${apiKeyHeader}' \
--header 'Content-Type:application/json' \
--data '{
  "PageSize": "50",
  "ShopCipher": "${shopCipher}",
  "PageToken": "",
  "AccessToken": "${accessToken}",
  "Body": {
    "order_ids": [
      "${orderId}"
    ]
  }
}'
`;

// gọi api kho đầy đủ (không phụ thuộc đơn hàng nên có thể gọi song song ngay từ đầu)
let curlFullStock = `
curl 'https://ecommerce.misa.vn/backend-api/TikToks/stocks/get-full-stock' \
--request POST \
--header 'Content-Type:application/json' \
--header '${appCodeHeader}' \
--header '${apiKeyHeader}' \
--data '{
  "AccessToken": "${accessToken}",
  "ShopCipher": "${shopCipher}"
}'
`;

// step 1: gọi toàn bộ các api đồng thời trước (đều chỉ cần orderId đã biết trước)
let curlStepOne = [
  curlOrderAPI,
  curlReturnRefund,
  curlCancellation,
  curlFullStock,
];
[orderRes, returnRefundRes, cancellationRes, stockRes] =
  await requestMultiCURL(curlStepOne);

// lọc ra thông tin danh sách product id từ đơn hàng để gọi api chi tiết sản phẩm
// LƯU Ý: field "orders" / "line_items" / "product_id" bên dưới là giả định theo cấu trúc
// response phổ biến của TikTok Shop order detail, cần đối chiếu lại với response thực tế
// trả về từ api orders/details và chỉnh sửa lại đường dẫn field cho đúng.
let orderResParse = parseResponse(orderRes);
if (orderResParse && orderResParse.orders && orderResParse.orders.length) {
  let orderFound = orderResParse.orders.find((x) => x.id == orderId);
  if (orderFound && orderFound.line_items) {
    productIds = [...new Set(orderFound.line_items.map((x) => x.product_id))];
  }
}

// step 2: gọi api chi tiết sản phẩm cho từng product id tìm được ở step 1
// (api products/detail chỉ nhận 1 "ID" mỗi lần gọi nên phải build nhiều curl tương ứng)
let curlStepTwo = productIds.map(
  (productId) => `
curl 'https://ecommerce.misa.vn/backend-api/TikToks/products/detail' \
--request POST \
--header '${appCodeHeader}' \
--header '${apiKeyHeader}' \
--header 'Content-Type:application/json' \
--data '{
  "AccessToken": "${accessToken}",
  "ShopCipher": "${shopCipher}",
  "ID": "${productId}"
}'
`,
);

if (curlStepTwo.length) {
  productDetailResList = await requestMultiCURL(curlStepTwo);
}

// ====== STEP 3: connection string #1 - SYSTEM_CONFIG_CONNECTION_STRING ======
// -> lấy connection_id, đồng thời build luôn 1 sqlBuilder duy nhất cho connection string này
if (isQuerySqlBuilder) {
  let curlSystemConfig = buildQueryCurl(
    SYSTEM_CONFIG_CONNECTION_STRING,
    `select * from sme.tiktok_connect_mnt where shop_cipher = '${shopCipher}' and database_id = '${databaseId}' limit 1;`,
  );
  let systemConfigRes = await requestCURL(curlSystemConfig);
  let systemConfigRows = extractRows(systemConfigRes);

  if (systemConfigRows.length > 0) {
    connectionId = systemConfigRows[0].connection_id;

    // 1 connection string -> 1 sqlBuilder -> 1 content sql duy nhất
    sqlBuilder.system_config = buildSingleSqlForConnection([
      convertJSONToPostgreSQL(systemConfigRows, {
        tableName: "tiktok_connect_mnt",
        schemaName: "sme",
        primaryKeyField: "connection_id",
        enableCreateTable: false,
        enableDeleteScript: true,
      }),
    ]);
  }
}

// ====== STEP 4: connection string #2 - DATABASE_ID_CONNECTION_STRING ======
// -> query 4 bảng liên quan, nhưng vẫn gộp lại thành 1 sqlBuilder duy nhất cho connection string này
if (isQuerySqlBuilder && connectionId) {
  // item_id_tiktok = any(array[...]) cần các item id dạng string, escape dấu nháy đơn nếu có
  let itemIdsArrayLiteral =
    "ARRAY[" +
    productIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(",") +
    "]";

  let curlConnectionInfo = buildQueryCurl(
    DATABASE_ID_CONNECTION_STRING,
    `select * from sme.tiktok_connection_info where connection_id = '${connectionId}' limit 1;`,
  );
  let curlSettingSyncOrder = buildQueryCurl(
    DATABASE_ID_CONNECTION_STRING,
    `select * from sme.setting_sync_order_tiktok where connection_id = '${connectionId}' limit 1;`,
  );
  let curlSettingMappingItem = buildQueryCurl(
    DATABASE_ID_CONNECTION_STRING,
    `select * from sme.setting_map_item_tiktok where connection_id = '${connectionId}' and item_id_tiktok::text = any(${itemIdsArrayLiteral}) limit 1000;`,
  );
  let curlSettingMappingStock = buildQueryCurl(
    DATABASE_ID_CONNECTION_STRING,
    `select * from sme.setting_map_stock_tiktok where connection_id = '${connectionId}' limit 100;`,
  );

  let curlStepFour = [
    curlConnectionInfo,
    curlSettingSyncOrder,
    curlSettingMappingItem,
    curlSettingMappingStock,
  ];

  [
    connectionInfoRes,
    settingSyncOrderRes,
    settingMappingItemRes,
    settingMappingStockRes,
  ] = await requestMultiCURL(curlStepFour);

  let connectionInfoRows = extractRows(connectionInfoRes);
  let settingSyncOrderRows = extractRows(settingSyncOrderRes);
  let settingMappingItemRows = extractRows(settingMappingItemRes);
  let settingMappingStockRows = extractRows(settingMappingStockRes);

  // gom SQL của cả 4 bảng lại thành 1 mảng, rồi build ra 1 content duy nhất
  let databaseIdSqlParts = [];

  if (connectionInfoRows.length > 0) {
    databaseIdSqlParts.push(
      convertJSONToPostgreSQL(connectionInfoRows, {
        tableName: "tiktok_connection_info",
        schemaName: "sme",
        primaryKeyField: "connection_id",
        enableCreateTable: false,
        enableDeleteScript: true,
      }),
    );
  }

  if (settingSyncOrderRows.length > 0) {
    databaseIdSqlParts.push(
      convertJSONToPostgreSQL(settingSyncOrderRows, {
        tableName: "setting_sync_order_tiktok",
        schemaName: "sme",
        primaryKeyField: "connection_id",
        enableCreateTable: false,
        enableDeleteScript: true,
      }),
    );
  }

  if (settingMappingItemRows.length > 0) {
    databaseIdSqlParts.push(
      convertJSONToPostgreSQL(settingMappingItemRows, {
        tableName: "setting_mapping_item_tiktok",
        schemaName: "sme",
        enableCreateTable: false,
        enableDeleteScript: true,
      }),
    );
  }

  if (settingMappingStockRows.length > 0) {
    databaseIdSqlParts.push(
      convertJSONToPostgreSQL(settingMappingStockRows, {
        tableName: "setting_mapping_stock_tiktok",
        schemaName: "sme",
        enableCreateTable: false,
        enableDeleteScript: true,
      }),
    );
  }

  if (databaseIdSqlParts.length > 0) {
    // 1 connection string -> 1 sqlBuilder -> 1 content sql duy nhất (đã gộp cả 4 bảng)
    sqlBuilder.database_id = buildSingleSqlForConnection(databaseIdSqlParts);
  }
}

// step 6, build ra mock data để gọi ở trong local (option)
if (isBuildMockData) {
  mockData = createMockResponse([
    {
      request: curlOrderAPI,
      response: orderRes,
    },
    {
      request: curlReturnRefund,
      response: returnRefundRes,
    },
    {
      request: curlCancellation,
      response: cancellationRes,
    },
    {
      request: curlFullStock,
      response: stockRes,
    },
    ...curlStepTwo.map((curl, idx) => ({
      request: curl,
      response: productDetailResList[idx],
    })),
  ]);
}

// trả về toàn bộ response
return {
  apiResponseData: {
    order_res: orderResParse,
    return_refund_res: parseResponse(returnRefundRes),
    cancellation_res: parseResponse(cancellationRes),
    stock_res: parseResponse(stockRes),
    product_detail_res: productDetailResList.map((res) => parseResponse(res)),
  },
  mockData,
  queryResponseData: {
    connection_id: connectionId,
    connection_info_res: connectionInfoRes
      ? extractRows(connectionInfoRes)
      : null,
    setting_sync_order_res: settingSyncOrderRes
      ? extractRows(settingSyncOrderRes)
      : null,
    setting_mapping_item_res: settingMappingItemRes
      ? extractRows(settingMappingItemRes)
      : null,
    setting_mapping_stock_res: settingMappingStockRes
      ? extractRows(settingMappingStockRes)
      : null,
  },
  sqlBuilder,
};
