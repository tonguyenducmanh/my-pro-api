// điền các thông tin dưới đây tùy vào từng dữ liệu cần query
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

// step3, build ra mock data để gọi ở trong local (option)
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
};
