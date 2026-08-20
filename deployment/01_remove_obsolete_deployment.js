async function cleanCloudflareDeployments() {
  // --- CONFIG: Thay thông tin của bạn vào đây ---
  const ACCOUNT_ID = "điền account id";
  const PROJECT_NAME = "điền project name";
  const API_TOKEN = "điền api token";

  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments`;
  const headers = `Authorization: Bearer ${API_TOKEN}`;

  console.log("=== BẮT ĐẦU QUÁ TRÌNH DỌN DẸP LÊN TỤC ===");

  // Step 1: Lấy ID bản Production đang active để TUYỆT ĐỐI KHÔNG XÓA
  const projRes = await requestCURL(`curl '${baseUrl.replace('/deployments', '')}' -H '${headers}'`);
  const projData = parseResponse(projRes);
  const activeProdId = projData?.result?.canonical_deployment?.id;
  
  if (activeProdId) {
    console.log(`[Bảo vệ] Bản Production Active hiện tại: ${activeProdId}`);
  }

  let hasMore = true;
  let totalDeletedCount = 0;
  let loopCount = 0;

  // Lặp lại việc fetch Trang 1 cho đến khi không còn bản preview cũ nào
  while (hasMore) {
    loopCount++;
    console.log(`\n--- Đang quét lượt thứ ${loopCount} (Luôn tải Trang 1 để tránh lệch phân trang) ---`);

    // Luôn lấy 50 bản ghi ở Trang 1
    const res = await requestCURL(`curl '${baseUrl}?page=1&per_page=50' -H '${headers}'`);
    const data = parseResponse(res);

    if (!data || !data.success || !data.result || data.result.length === 0) {
      console.log("Không còn deployment nào để xử lý.");
      break;
    }

    const currentBatch = data.result;

    // Lọc ra danh sách CẦN XÓA:
    // 1. Không phải là bản Production đang Active
    // 2. Lấy tất cả Preview Deployments (trừ trường hợp muốn giữ đúng 1 bản Preview mới nhất)
    const toDelete = currentBatch.filter(dep => {
      if (dep.id === activeProdId) return false; // Không xóa Prod Active
      return true; // Chọn xóa toàn bộ các bản ghi còn lại trong trang này
    });

    // Nếu trong 50 bản ghi này chỉ toàn bản Active Prod hoặc không còn gì xóa được nữa
    if (toDelete.length === 0) {
      console.log("Đã duyệt hết các bản có thể xóa.");
      hasMore = false;
      break;
    }

    console.log(`Phát hiện ${toDelete.length} bản cần xóa trong đợt này...`);

    // Tạo danh sách CURL kèm force=true
    const deleteCurls = toDelete.map(
      (dep) => `curl -X DELETE '${baseUrl}/${dep.id}?force=true' -H '${headers}'`
    );

    // Gửi xóa song song
    const responses = await requestMultiCURL(deleteCurls);
    const results = parseResponseMulti(responses);

    let deletedInThisLoop = 0;
    results.forEach((r, idx) => {
      if (r && r.success) {
        deletedInThisLoop++;
        totalDeletedCount++;
      } else {
        console.error(`Xóa thất bại ID [${toDelete[idx].id}]:`, r?.errors || r);
      }
    });

    console.log(`Đã xóa thành công ${deletedInThisLoop}/${toDelete.length} bản trong lượt này.`);

    // Nếu không xóa được bản nào trong lượt (ví dụ bị vướng lỗi API) -> Dừng vòng lặp tránh lặp vô tận
    if (deletedInThisLoop === 0) {
      console.warn("Không thể xóa thêm bản nào nữa (Có thể do lỗi hằng số API hoặc hết quyền). Dừng script.");
      hasMore = false;
      break;
    }

    // Nghỉ 1 giây để tránh Rate Limit API
    await delay(1);
  }

  console.log(`\n==========================================`);
  console.log(`TỔNG CỘNG ĐÃ XÓA THÀNH CÔNG: ${totalDeletedCount} deployments.`);
  console.log(`==========================================\n`);
}

await cleanCloudflareDeployments();
