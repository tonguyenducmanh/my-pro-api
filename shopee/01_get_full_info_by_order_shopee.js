// điền các thông tin dưới đây tùy vào từng dữ liệu cần query
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
let orderRes, escrowDetailBatchRes, buyerInvoice, invItemRes, returnOrderRes;
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
let resStepOne = await requestMultiCURL(curlStepOne);
[orderRes, escrowDetailBatchRes, buyerInvoice] = parseResponseMulti(resStepOne);
// lọc ra thông tin danh sách vật tư và đơn trả lại
if (
  orderRes &&
  orderRes.order_list &&
  escrowDetailBatchRes &&
  escrowDetailBatchRes.response
) {
  let orderFound = orderRes.order_list.find((x) => x.order_sn == orderSN);
  if (orderFound && orderFound.item_list) {
    itemIds = orderFound.item_list.map((x) => x.item_id);
  }
  let escrowFound = escrowDetailBatchRes.response.find(
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

let resStepTwo = await requestMultiCURL(curlStepTwo);
[invItemRes, returnOrderRes] = parseResponseMulti(resStepTwo);

// trả về toàn bộ response
return {
  orderRes,
  escrowDetailBatchRes,
  buyerInvoice,
  invItemRes,
  returnOrderRes,
};
