// điền các thông tin dưới đây tùy vào từng dữ liệu cần query
let isBuildMockData = true;
let accessToken = "eyJhbGciOiJIUzI1NiJ9.CJ_UehABGIb5748EIAEon4LC1gYwqJHOuAI4AUABSAM.7zTr6Hiq6i2CIkf2vJEB-cjjZb_PFCualk76rLYYfL0";
let refreshToken = "eyJhbGciOiJIUzI1NiJ9.CJ_UehABGIb5748EIAIon4LC1gYwucDMyA04AUABSAM.8TVZUvAHolYG4AECg_ye9SSDWdLo0DMTJH1QueBTMdc";
let shopId = 1107033222;
let orderSN = "260920GEKERK42";
let returnSN = []; // thông tin trả lại đơn hàng sẽ được gán sau khi gọi api kế toán đơn hàng
let itemIds = []; // danh sách item id sẽ được gán sau khi gọi api đơn hàng
let appCodeHeader = "x-misa-app-code:AMISAccounting";
let apiKeyHeader =
  "x-misa-api-key:misa_ci_live_Dcpp1Ja3NQLKUPdjhbdn6ByPmnhewILJko5";
// danh sách response
let orderRes, escrowDetailBatchRes, buyerInvoiceRes, invItemRes, returnOrderRes;
// mockdata để import vào trong local
let mockData = [];

// ====== CẤU HÌNH CHO PHẦN QUERY DB (system_config + database_id user) ======
let isQuerySqlBuilder = true; // bật true nếu muốn query thêm system_config/database_id và build sqlBuilder
let databaseId = "6070a778-a4d0-461a-88b9-c310f107d01e"; // điền database_id tương ứng với shop cần lấy dữ liệu
let SYSTEM_CONFIG_CONNECTION_STRING = "User ID=smecloud;Password=smecloud12345678@Abc;Host=10.64.157.9;Port=6432;Database=sme_sys_config;Pooling=true;"; // connection string trỏ tới DB system_config
let DATABASE_ID_CONNECTION_STRING = "Username=smecloud;Password=smecloud12345678@Abc;Host=10.64.188.115;Port=6432;Database=db_icfki0_2026;Pooling=False"; // connection string trỏ tới DB của database_id (user db)
let QUERY_AUTH_TOKEN = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmRmYmI1YTQtMDgxMy00NjZjLTlhN2ItNGVlM2Y1OGI0NGY4IiwidXNlcl9uYW1lIjoidGRtYW5oMUBzb2Z0d2FyZS5taXNhLmNvbS52biIsInBob25lX251bWJlciI6IjA5ODEwNzEzMjEiLCJlbWFpbCI6InRkbWFuaDFAc29mdHdhcmUubWlzYS5jb20udm4iLCJsYXN0X25hbWUiOiJN4bqhbmgiLCJmaXJzdF9uYW1lIjoiVMO0IE5ndXnhu4VuIMSQ4bupYyIsImxpc3RfZnVuY3Rpb24iOiJbXCI3YTY5MTdkZC0xZmI4LTQ4MDktOTBmNy0wODM4MmNlZGJmODFcIixcImJjODdmNzNjLTg5NWQtNDY0ZS04ZGUyLTI1ZmVlYjJiNWMyZFwiLFwiZmRiODBhNDctMTAxOS00MzA0LWJkMjctZmJiOWM3ZmZmMTU5XCIsXCI2YmJjNjE2ZS04Y2IxLTRiZTQtOTQ1YS0zNzI2MTk2ZjY4MmRcIixcIjc2NDdmYWUwLWFiMGItNGQzMS1hODg3LTk2ZDc1ZTg4MjM3MVwiLFwiZTE1MTE4ODYtNDRlNS00ZmVjLWIzYWEtODMxNGJjZmZkZTQzXCIsXCI1ZjQzZGNkOC1mNWJlLTRiN2EtODBhZi04Y2NlNzhiYjU2MWNcIixcIjQzZjIyYzEwLTIxYjYtNDhkYS04Y2RlLWM4ZjIyZjkxNmE5YlwiXSIsIm5iZiI6MTc5MjA0OTg0OCwiZXhwIjoxNzkyMDc4NjQ4LCJpYXQiOjE3OTIwNDk4NDgsImlzcyI6Ik1JU0EuU01FLkRCTWFuYWdlbWVudCJ9.VnpbCl5EO5auf0J4ZqsQ5-VKzICkhfIiTiLyXmmsVLg"; // copy từ curl gốc của api Query
let QUERY_API_URL = "https://smecloudmnt.misaonline.vpnlocal/api/dbmntv2/Query";

let connectionId = null;
let systemConfigRes, 
  connectionInfoRes,
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
curl 'https://ecommerce.misa.vn/backend-api/Shopees/orders/detail' \
--request POST \
--header '${appCodeHeader}' \
--header '${apiKeyHeader}' \
--header 'Content-Type:application/json' \
--data '{
  "accessToken": "${accessToken}",
  "refreshToken": "${refreshToken}",
  "isPublishAPI": false,
  "ShopId": ${shopId},
  "orderSnList": "${orderSN}",
  "requestOrderStatusPending": true
}'
`;

// goi api kế toán của đơn hàng
let curlEscrowDetailBatch = `
curl 'https://ecommerce.misa.vn/backend-api/Shopees/orders/accounting-batch' \
--request POST \
--header '${appCodeHeader}' \
--header '${apiKeyHeader}' \
--header 'Content-Type:application/json' \
--data '{
  "accessToken": "${accessToken}",
  "refreshToken": "${refreshToken}",
  "isPublishAPI": false,
  "ShopId": ${shopId},
  "objRequest": {
    "order_sn_list": [
      "${orderSN}"
    ]
  }
}'
`;

// gọi api thông tin hóa đơn của đơn hàng
let curlBuyerInvoice = `
curl 'https://ecommerce.misa.vn/backend-api/Shopees/orders/buyer-invoice-info' \
--request POST \
--header '${appCodeHeader}' \
--header '${apiKeyHeader}' \
--header 'Content-Type:application/json' \
--data '{
  "accessToken": "${accessToken}",
  "refreshToken": "${refreshToken}",
  "objRequest": {
    "shop_id": ${shopId},
    "queries": [
      {
        "order_sn": "${orderSN}"
      }
    ]
  },
  "ShopId": ${shopId}
}'
`;

// step 1: gọi toàn bộ các api đồng thời trước
let curlStepOne = [curlOrderAPI, curlEscrowDetailBatch, curlBuyerInvoice];
[orderRes, escrowDetailBatchRes, buyerInvoiceRes] =
  await requestMultiCURL(curlStepOne);
// lọc ra thông tin danh sách vật tư và đơn trả lại
let orderResParse = parseResponse(orderRes);
let escrowDetailBatchResParse = parseResponse(escrowDetailBatchRes);

if (
  orderResParse &&
  orderResParse.order_list &&
  escrowDetailBatchResParse &&
  escrowDetailBatchResParse.response
) {
  let orderFound = orderResParse.order_list.find((x) => x.order_sn == orderSN);
  if (orderFound && orderFound.item_list) {
    itemIds = orderFound.item_list.map((x) => x.item_id);
  }
  let escrowFound = escrowDetailBatchResParse.response.find(
    (x) => x.escrow_detail && x.escrow_detail.order_sn == orderSN,
  );
  if (
    escrowFound &&
    escrowFound.escrow_detail &&
    escrowFound.escrow_detail.return_order_sn_list
  ) {
    returnSN = escrowFound.escrow_detail.return_order_sn_list.join(",");
  }
}

// thông tin vật tư của đơn hàng
let curlInventoryItem = `
curl 'https://ecommerce.misa.vn/backend-api/Shopees/products/item' \
--request POST \
--header '${appCodeHeader}' \
--header '${apiKeyHeader}' \
--header 'Content-Type:application/json' \
--header 'Cookie:TS016f3c7c=019ba1692daead2499566dc136806570e5375ced501c98665255f2df5502cac7dfaea3d28987b426d528ddc4a824cf24b7b6c65bc0' \
--data '{
  "accessToken": "${accessToken}",
  "refreshToken": "${refreshToken}",
  "isPublishAPI": false,
  "shopeeItemIds": [
    "${itemIds.join('", "')}"
  ],
  "ShopId": ${shopId},
  "isGetModel": true
}'
`;

// thông tin trả lại của đơn hàng
let curlReturnOrder = `
curl 'https://ecommerce.misa.vn/backend-api/Shopees/returns/detail' \
--request POST \
--header 'Content-Type:application/json' \
--header 'cache-control:no-cache' \
--header '${appCodeHeader}' \
--header '${apiKeyHeader}' \
--data '{
  "accessToken": "${accessToken}",
  "refreshToken": "${refreshToken}",
  "isPublishAPI": false,
  "ShopId": ${shopId},
  "ReturnSN": "${returnSN}"
}'
`;

// step 2, gọi thông tin vật tư và thông tin trả lại
let curlStepTwo = [curlInventoryItem];
if (returnSN) {
  curlStepTwo.push(curlReturnOrder);
}
[invItemRes, returnOrderRes] = await requestMultiCURL(curlStepTwo);

// ====== STEP 3: connection string #1 - SYSTEM_CONFIG_CONNECTION_STRING ======
// -> lấy connection_id, đồng thời build luôn 1 sqlBuilder duy nhất cho connection string này
if (isQuerySqlBuilder) {
  let curlSystemConfig = buildQueryCurl(
    SYSTEM_CONFIG_CONNECTION_STRING,
    `select * from sme.shopee_connect_mnt where shop_id = ${shopId} and database_id = '${databaseId}' limit 1;`,
  );
  systemConfigRes = await requestCURL(curlSystemConfig);
  let systemConfigRows = extractRows(systemConfigRes);

  if (systemConfigRows.length > 0) {
    connectionId = systemConfigRows[0].connection_id;

    // 1 connection string -> 1 sqlBuilder -> 1 content sql duy nhất
    sqlBuilder.system_config = buildSingleSqlForConnection([
      convertJSONToPostgreSQL(systemConfigRows, {
        tableName: "shopee_connect_mnt",
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
  // item_id_shopee = any(array[...]) cần các item id dạng string, escape dấu nháy đơn nếu có
  let itemIdsArrayLiteral =
    "ARRAY[" +
    itemIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(",") +
    "]";

  let curlConnectionInfo = buildQueryCurl(
    DATABASE_ID_CONNECTION_STRING,
    `select * from sme.shopee_connection_info where connection_id = '${connectionId}' limit 1;`,
  );
  let curlSettingSyncOrder = buildQueryCurl(
    DATABASE_ID_CONNECTION_STRING,
    `select * from sme.setting_sync_order_shopee where connection_id = '${connectionId}' limit 1;`,
  );
  let curlSettingItem = buildQueryCurl(
    DATABASE_ID_CONNECTION_STRING,
    `select * from sme.setting_map_item_shopee where connection_id = '${connectionId}' and item_id_shopee::text = any(${itemIdsArrayLiteral}) limit 1000;`,
  );
  let curlSettingStock = buildQueryCurl(
    DATABASE_ID_CONNECTION_STRING,
    `select * from sme.setting_map_stock_shopee where connection_id = '${connectionId}' limit 1000;`,
  );

  let curlStepFour = [
    curlConnectionInfo,
    curlSettingSyncOrder,
    curlSettingItem,
    curlSettingStock,
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
        tableName: "shopee_connection_info",
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
        tableName: "setting_sync_order_shopee",
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
        tableName: "setting_map_item_shopee",
        schemaName: "sme",
        enableCreateTable: false,
        enableDeleteScript: true,
      }),
    );
  }

  if (settingMappingStockRows.length > 0) {
    databaseIdSqlParts.push(
      convertJSONToPostgreSQL(settingMappingStockRows, {
        tableName: "setting_map_stock_shopee",
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
      request: curlEscrowDetailBatch,
      response: escrowDetailBatchRes,
    },
    {
      request: curlBuyerInvoice,
      response: buyerInvoiceRes,
    },
    {
      request: curlInventoryItem,
      response: invItemRes,
    },
    {
      request: curlReturnOrder,
      response: returnOrderRes,
    },
  ]);
}
// trả về toàn bộ response
return {
  apiResponseData: {
    order_res: orderResParse,
    escrow_detail_batch_res: escrowDetailBatchResParse,
    buyer_invoice: parseResponse(buyerInvoiceRes),
    inv_item_res: invItemRes ? parseResponse(invItemRes) : null,
    return_order_res: returnOrderRes ? parseResponse(returnOrderRes) : null,
  },
  mockData,
  queryResponseData: {
    connection_id: connectionId,
    system_config_res: systemConfigRes
      ? extractRows(systemConfigRes)
      : null,
    connection_info_res: connectionInfoRes
      ? extractRows(connectionInfoRes)
      : null,
    setting_sync_order_res: settingSyncOrderRes
      ? extractRows(settingSyncOrderRes)
      : null,
    setting_map_item_res: settingMappingItemRes
      ? extractRows(settingMappingItemRes)
      : null,
    setting_map_stock_res: settingMappingStockRes
      ? extractRows(settingMappingStockRes)
      : null,
  },
  sqlBuilder,
};
