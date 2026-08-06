document.getElementById("btnBack").onclick = () => {
    location.href = "index.html";
};

let currentUser = null;

// Kiểm tra quyền người dùng để ẩn/hiện nút Xóa
async function checkAdminPermission() {
    try {
        const res = await fetch("/api/me");
        if (res.ok) {
            currentUser = await res.json();
            
            // Nếu KHÔNG PHẢI ADMIN thì ẩn nút "Xóa tất cả"
            const btnClearAllLogs = document.getElementById("btnClearAllLogs");
            if (btnClearAllLogs && currentUser.role !== "admin") {
                btnClearAllLogs.classList.add("d-none");
            }
        }
    } catch (err) {
        console.error("Lỗi xác thực:", err);
    }
}

// Sự kiện nút Xóa tất cả
const btnClearAllLogs = document.getElementById("btnClearAllLogs");
if (btnClearAllLogs) {
    btnClearAllLogs.onclick = async () => {
        if (!confirm("Bạn có chắc chắn muốn XÓA TOÀN BỘ nhật ký hoạt động không?\nHành động này không thể hoàn tác!")) {
            return;
        }

        try {
            const res = await fetch("/api/logs", { method: "DELETE" });
            const data = await res.json();

            if (res.ok && data.success) {
                alert(data.message);
                loadLogs();
            } else {
                alert("Lỗi: " + (data.message || "Chỉ Admin mới có quyền xóa nhật ký!"));
            }
        } catch (err) {
            alert("Lỗi kết nối: " + err.message);
        }
    };
}

// Hàm tải nhật ký
async function loadLogs() {
    try {
        await checkAdminPermission(); // Lấy thông tin user trước

        const res = await fetch("/api/logs");
        if (res.status !== 200) {
            alert("Bạn không có quyền xem nhật ký hoạt động.");
            location.href = "index.html";
            return;
        }

        const data = await res.json();
        const tbody = document.getElementById("tableBody");
        if (!tbody) return;

        tbody.innerHTML = "";

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Chưa có nhật ký hoạt động nào</td></tr>`;
            return;
        }

        let stt = 1;
        let rowsHtml = "";

        data.forEach(r => {
            const timeStr = r.created_at 
                ? new Date(r.created_at).toLocaleString("vi-VN") 
                : "";
            
            // Chỉ hiển thị cột nút Xóa nếu user là admin
            const actionBtn = (currentUser && currentUser.role === "admin") ? `
                <button class="btn btn-sm btn-outline-danger" title="Xóa dòng này" onclick="deleteSingleLog(${r.id})">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            ` : `<span class="text-muted">-</span>`;

            rowsHtml += `
                <tr>
                    <td data-label="STT">${stt++}</td>
                    <td data-label="Thời gian">${escapeHtml(timeStr)}</td>
                    <td data-label="Người dùng">${escapeHtml(r.username)}</td>
                    <td data-label="Hành động">${escapeHtml(r.action)}</td>
                    <td data-label="Đối tượng">${escapeHtml(r.target_name ?? "")}</td>
                    <td data-label="Thao tác" class="text-center">${actionBtn}</td>
                </tr>
            `;
        });

        tbody.innerHTML = rowsHtml;

    } catch (err) {
        console.error("Lỗi tải nhật ký:", err);
    }
}

// Hàm xóa 1 dòng nhật ký
async function deleteSingleLog(id) {
    if (!confirm("Bạn có chắc muốn xóa dòng nhật ký này không?")) return;

    try {
        const res = await fetch(`/api/logs/${id}`, { method: "DELETE" });
        const data = await res.json();

        if (res.ok && data.success) {
            loadLogs();
        } else {
            alert("Lỗi: " + (data.message || "Chỉ Admin mới có quyền xóa!"));
        }
    } catch (err) {
        alert("Lỗi kết nối: " + err.message);
    }
}
window.deleteSingleLog = deleteSingleLog;

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

loadLogs();