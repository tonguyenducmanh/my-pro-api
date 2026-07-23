// điền các thông tin dưới đây tùy vào từng dữ liệu cần query
let isBuildMockData = false;
let accessToken = "";
let refreshToken = "";
let shopId = null;
let orderSN = "";
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

// ====== STEP 3: lấy connection_id từ system_config (chỉ chạy khi isQuerySqlBuilder = true) ======
if (isQuerySqlBuilder) {
  let curlSystemConfig = buildQueryCurl(
    SYSTEM_CONFIG_CONNECTION_STRING,
    `select * from sme.shopee_connect_mnt where shop_id = ${shopId} and database_id = '${databaseId}' limit 1;`,
  );
  let systemConfigRes = await requestCURL(curlSystemConfig);
  let systemConfigRows = extractRows(systemConfigRes);

  if (systemConfigRows.length > 0) {
    connectionId = systemConfigRows[0].connection_id;
  }
}

// ====== STEP 4: dùng connection_id để query các bảng bên database_id user ======
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
  let curlSettingMappingItem = buildQueryCurl(
    DATABASE_ID_CONNECTION_STRING,
    `select * from sme.setting_map_item_shopee where connection_id = '${connectionId}' and item_id_shopee::text = any(${itemIdsArrayLiteral}) limit 1000;`,
  );
  let curlSettingMappingStock = buildQueryCurl(
    DATABASE_ID_CONNECTION_STRING,
    `select * from sme.setting_map_stock_shopee where connection_id = '${connectionId}' limit 1000;`,
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

  // ====== STEP 5: build sqlBuilder từ kết quả các bảng trên ======
  let connectionInfoRows = extractRows(connectionInfoRes);
  let settingSyncOrderRows = extractRows(settingSyncOrderRes);
  let settingMappingItemRows = extractRows(settingMappingItemRes);
  let settingMappingStockRows = extractRows(settingMappingStockRes);

  if (connectionInfoRows.length > 0) {
    sqlBuilder.shopee_connection_info = convertJSONToPostgreSQL(
      connectionInfoRows,
      {
        tableName: "shopee_connection_info",
        schemaName: "sme",
        primaryKeyField: "connection_id",
        enableCreateTable: true,
        enableDeleteScript: true,
      },
    );
  }

  if (settingSyncOrderRows.length > 0) {
    sqlBuilder.setting_sync_order_shopee = convertJSONToPostgreSQL(
      settingSyncOrderRows,
      {
        tableName: "setting_sync_order_shopee",
        schemaName: "sme",
        primaryKeyField: "connection_id",
        enableCreateTable: true,
        enableDeleteScript: true,
      },
    );
  }

  if (settingMappingItemRows.length > 0) {
    sqlBuilder.setting_mapping_item_shopee = convertJSONToPostgreSQL(
      settingMappingItemRows,
      {
        tableName: "setting_mapping_item_shopee",
        schemaName: "sme",
        enableCreateTable: true,
        enableDeleteScript: true,
      },
    );
  }

  if (settingMappingStockRows.length > 0) {
    sqlBuilder.setting_mapping_stock_shopee = convertJSONToPostgreSQL(
      settingMappingStockRows,
      {
        tableName: "setting_mapping_stock_shopee",
        schemaName: "sme",
        enableCreateTable: true,
        enableDeleteScript: true,
      },
    );
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
