let accessToken = "";
let refreshToken = "";
let shopId = null;
let orderSN = "";
let returnSN = ""; // thông tin trả lại đơn hàng sẽ được gán sau khi gọi api kế toán đơn hàng
let itemIds = []; // danh sách item id sẽ được gán sau khi gọi api đơn hàng
let appCodeHeader = "x-misa-app-code:AMISAccounting";
let apiKeyHeader =
  "x-misa-api-key:misa_ci_live_Dcpp1Ja3NQLKUPdjhbdn6ByPmnhewILJko5";

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
