async function cleanCloudflareDeployments() {
  // --- CONFIG: Thay thông tin của bạn vào đây ---
  const ACCOUNT_ID = "điền account id";
  const PROJECT_NAME = "điền project name";
  const API_TOKEN = "điền api token";

  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments`;
  const headers = `Authorization: Bearer ${API_TOKEN}`;

  console.log("Bắt đầu tiến trình dọn dẹp...");

  let totalDeleted = 0;
  let hasMore = true;
  let keepLatestId = null;

  while (hasMore) {
    // Luôn lấy Trang 1 (per_page=25) để tránh xáo trộn pagination
    const listRes = await requestCURL(`curl '${baseUrl}?page=1&per_page=25' -H '${headers}'`);
    const listData = parseResponse(listRes);

    if (!listData || !listData.success || !listData.result) {
      console.error("Lỗi khi tải danh sách deployment:", listData?.errors || listRes);
      break;
    }

    let deployments = listData.result;

    // Nếu chạy lần đầu: Lưu lại ID của deployment MỚI NHẤT để không bao giờ xóa nó
    if (!keepLatestId && deployments.length > 0) {
      // Sắp xếp giảm dần theo thời gian tạo để đảm bảo bản mới nhất nằm ở index 0
      deployments.sort((a, b) => new Date(b.created_on) - new Date(a.created_on));
      keepLatestId = deployments[0].id;
      console.log(`GIỮ LẠI (Mới nhất): ${keepLatestId} | Tạo lúc: ${deployments[0].created_on}`);
    }

    // Lọc bỏ ID mới nhất khỏi danh sách cần xóa
    const toDelete = deployments.filter(dep => dep.id !== keepLatestId);

    // Nếu không còn bản nào khác ngoài bản mới nhất
    if (toDelete.length === 0) {
      console.log("Đã duyệt hết! Không còn bản cũ nào để xóa.");
      hasMore = false;
      break;
    }

    console.log(`Phát hiện ${toDelete.length} bản cần xóa ở lô này...`);

    // Tạo các lệnh DELETE
    const deleteCurls = toDelete.map(
      (dep) => `curl -X DELETE '${baseUrl}/${dep.id}' -H '${headers}'`
    );

    // Gửi xóa song song
    const responses = await requestMultiCURL(deleteCurls);
    const results = parseResponseMulti(responses);

    let deletedInBatch = 0;
    results.forEach((res) => {
      if (res && res.status === 200) {
        deletedInBatch++;
      }
    });

    totalDeleted += deletedInBatch;
    console.log(`Đã xóa thành công ${deletedInBatch}/${toDelete.length} bản trong đợt này. Total: ${totalDeleted}`);

    // Nghỉ 1.5 giây để Cloudflare cập nhật lại state trên DB của họ
    await delay(1.5);
  }

  console.log(`\n Hoàn tất! Tổng cộng đã xóa ${totalDeleted} deployment cũ.`);
}

// Chạy script
await cleanCloudflareDeployments();
