//====================================================
// APP.JS - HỆ THỐNG QUẢN LÝ KHÁM SỨC KHỎE
//====================================================

//========== ELEMENT DOM ==========
const txtSearch = document.getElementById("txtSearch");
const btnSearch = document.getElementById("btnSearch");

const btnImport = document.getElementById("btnImport");
const btnExport = document.getElementById("btnExport");
const btnReload = document.getElementById("btnReload");

const excel = document.getElementById("excel");

const tong = document.getElementById("tong");
const dakham = document.getElementById("dakham");
const chuakham = document.getElementById("chuakham");

const tableBody = document.getElementById("tableBody");
const pagination = document.getElementById("pagination");
const pageInfo = document.getElementById("pageInfo");

const progressBox = document.getElementById("progressBox");
const progressBar = document.getElementById("progressBar");

//========== BIẾN TOÀN CỤC ==========
let currentPage = 1;
let currentKeyword = "";
const pageSize = 50;
let debounceTimer = null;

//====================================================
// 1. KHỞI ĐỘNG & XÁC THỰC
//====================================================

async function checkLogin() {
    try {
        const res = await fetch("/api/me");

        if (res.status !== 200) {
            location.href = "login.html";
            return;
        }

        const user = await res.json();

        // Hiển thị tên người dùng
        const userInfo = document.getElementById("userInfo");
        if (userInfo) {
            userInfo.innerText = user.fullname || user.username || "Cán bộ";
        }

        // Bật/Ẩn chức năng theo quyền Admin
        const btnAdminUsers = document.getElementById("btnAdminUsers");
        const btnLogs = document.getElementById("btnLogs");
        const importCard = document.getElementById("importCard");

        if (user.role === "admin") {
            if (btnAdminUsers) btnAdminUsers.classList.remove("d-none");
            if (btnLogs) btnLogs.classList.remove("d-none");
            if (importCard) importCard.classList.remove("d-none");
        }
    } catch (err) {
        console.error("Lỗi xác thực người dùng:", err);
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    await checkLogin();

    // Nút Nhật ký hoạt động
    const btnLogs = document.getElementById("btnLogs");
    if (btnLogs) {
        btnLogs.onclick = (e) => {
            e.preventDefault();
            location.href = "logs.html";
        };
    }

    // Tải dữ liệu ban đầu
    loadStats();
    loadData();

    // Auto focus ô tìm kiếm
    if (txtSearch) txtSearch.focus();
});

//====================================================
// 2. THỐNG KÊ & TẢI DỮ LIỆU BẢNG
//====================================================

async function loadStats() {
    try {
        const res = await fetch("/api/stats");
        if (!res.ok) return;
        const json = await res.json();

        if (tong) tong.innerHTML = json.tong ?? 0;
        if (dakham) dakham.innerHTML = json.dakham ?? 0;
        if (chuakham) chuakham.innerHTML = json.chuakham ?? 0;
    } catch (err) {
        console.error("Lỗi tải thống kê:", err);
    }
}

async function loadData() {
    if (!tableBody) return;

    // Hiển thị trạng thái đang tải
    tableBody.innerHTML = `
        <tr>
            <td colspan="7" class="text-center py-5">
                <div class="spinner-border text-primary" role="status"></div>
                <br><br>
                <span>Đang tải dữ liệu...</span>
            </td>
        </tr>
    `;

    try {
        const url = `/api/search?q=${encodeURIComponent(currentKeyword)}&page=${currentPage}&limit=${pageSize}`;
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`Máy chủ báo lỗi (${res.status})`);
        }

        const json = await res.json();
        renderTable(json.rows || [], json.total || 0, json.totalPages || 1);
    } catch (err) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-danger text-center py-4">
                    <i class="fa-solid fa-triangle-exclamation mb-2 fs-4"></i><br>
                    Không thể tải dữ liệu: ${escapeHtml(err.message)}
                </td>
            </tr>
        `;
    }
}

//====================================================
// 3. HIỂN THỊ BẢNG & PHÂN TRANG
//====================================================

function renderTable(rows, total, totalPages) {
    tableBody.innerHTML = "";

    if (!rows || rows.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-5">
                    Không tìm thấy dữ liệu phù hợp
                </td>
            </tr>
        `;
        if (pagination) pagination.innerHTML = "";
        if (pageInfo) pageInfo.innerHTML = "0 bản ghi";
        return;
    }

    if (pageInfo) {
        pageInfo.innerHTML = `Trang <b>${currentPage}</b>/<b>${totalPages}</b> - Tổng <b>${total}</b> người`;
    }

    rows.forEach((item) => {
        const tr = document.createElement("tr");
        tr.className = "fade-in";

        tr.innerHTML = `
            <td>${escapeHtml(item.stt ?? item.id)}</td>
            <td>
                <strong class="text-primary">${escapeHtml(item.hoten)}</strong>
            </td>
            <td>${escapeHtml(item.ngaysinh ?? "")}</td>
            <td>${escapeHtml(item.gioitinh ?? "")}</td>
            <td>${escapeHtml(item.diachi ?? "")}</td>
            <td>
                ${
                    item.dakham == 1
                        ? `<span class="badge bg-success">Đã khám</span>`
                        : `<span class="badge bg-danger">Chưa khám</span>`
                }
            </td>
            <td>
                <button
                    class="btn btn-sm ${item.dakham == 1 ? "btn-warning" : "btn-success"}"
                    onclick="doiTrangThai(${item.id}, ${item.dakham})"
                >
                    ${item.dakham == 1 ? "Hủy khám" : "Đã khám"}
                </button>
            </td>
        `;

        tableBody.appendChild(tr);
    });

    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    if (!pagination) return;
    pagination.innerHTML = "";

    if (totalPages <= 1) return;

    // Nút Trang trước
    pagination.innerHTML += `
        <li class="page-item ${currentPage == 1 ? "disabled" : ""}">
            <a class="page-link" href="#" onclick="gotoPage(${currentPage - 1}); return false;">«</a>
        </li>
    `;

    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);

    for (let i = start; i <= end; i++) {
        pagination.innerHTML += `
            <li class="page-item ${i == currentPage ? "active" : ""}">
                <a class="page-link" href="#" onclick="gotoPage(${i}); return false;">${i}</a>
            </li>
        `;
    }

    // Nút Trang sau
    pagination.innerHTML += `
        <li class="page-item ${currentPage == totalPages ? "disabled" : ""}">
            <a class="page-link" href="#" onclick="gotoPage(${currentPage + 1}); return false;">»</a>
        </li>
    `;
}

function gotoPage(page) {
    if (page < 1) return;
    currentPage = page;
    loadData();
}
window.gotoPage = gotoPage;

//====================================================
// 4. CẬP NHẬT TRẠNG THÁI KHÁM
//====================================================

async function doiTrangThai(id, currentValue) {
    try {
        const res = await fetch("/api/update", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                id: id,
                value: currentValue ? 0 : 1
            })
        });

        const json = await res.json();

        if (!res.ok || !json.ok) {
            alert(json.message || "Cập nhật trạng thái thất bại");
            return;
        }

        loadStats();
        loadData();
    } catch (err) {
        alert("Lỗi kết nối: " + err.message);
    }
}
window.doiTrangThai = doiTrangThai;

//====================================================
// 5. TÌM KIẾM DỮ LIỆU
//====================================================

if (txtSearch) {
    txtSearch.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            currentKeyword = txtSearch.value.trim();
            currentPage = 1;
            loadData();
        }, 300);
    });

    txtSearch.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            clearTimeout(debounceTimer);
            currentKeyword = txtSearch.value.trim();
            currentPage = 1;
            loadData();
        }
    });
}

if (btnSearch) {
    btnSearch.onclick = () => {
        currentKeyword = txtSearch ? txtSearch.value.trim() : "";
        currentPage = 1;
        loadData();
    };
}

//====================================================
// 6. IMPORT / EXPORT / REFRESH EXCEL
//====================================================

if (btnImport) {
    btnImport.onclick = async () => {
        if (!excel || excel.files.length === 0) {
            alert("Vui lòng chọn file Excel.");
            return;
        }

        if (!confirm("Import sẽ cập nhật lại toàn bộ danh sách dữ liệu.\nBạn có chắc chắn tiếp tục?")) {
            return;
        }

        if (progressBox) progressBox.classList.remove("d-none");
        if (progressBar) {
            progressBar.style.width = "0%";
            progressBar.innerHTML = "0%";
        }

        let fake = 0;
        const timer = setInterval(() => {
            fake += 5;
            if (fake > 95) fake = 95;
            if (progressBar) {
                progressBar.style.width = fake + "%";
                progressBar.innerHTML = fake + "%";
            }
        }, 100);

        const form = new FormData();
        form.append("excel", excel.files[0]);

        try {
            const res = await fetch("/api/import", {
                method: "POST",
                body: form
            });

            const json = await res.json();
            clearInterval(timer);

            if (progressBar) {
                progressBar.style.width = "100%";
                progressBar.innerHTML = "100%";
            }

            if (!json.ok) {
                alert(json.message || "Import không thành công");
                if (progressBox) progressBox.classList.add("d-none");
                return;
            }

            setTimeout(() => {
                if (progressBox) progressBox.classList.add("d-none");
            }, 800);

            alert("Import thành công " + (json.total || 0) + " người.");
            currentPage = 1;
            loadStats();
            loadData();
        } catch (err) {
            clearInterval(timer);
            if (progressBox) progressBox.classList.add("d-none");
            alert("Lỗi khi import: " + err.message);
        }
    };
}

if (btnExport) {
    btnExport.onclick = () => {
        window.location.href = "/api/export";
    };
}

if (btnReload) {
    btnReload.onclick = () => {
        if (txtSearch) txtSearch.value = "";
        currentKeyword = "";
        currentPage = 1;
        loadStats();
        loadData();
    };
}

// Đăng xuất
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
    btnLogout.onclick = async () => {
        await fetch("/api/logout", { method: "POST" });
        location.href = "login.html";
    };
}

//====================================================
// 7. TIỆN ÍCH & PHÍM TẮT
//====================================================

function escapeHtml(text) {
    if (text == null) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

document.addEventListener("keydown", (e) => {
    // Phím F5: Làm mới dữ liệu
    if (e.key === "F5") {
        e.preventDefault();
        loadStats();
        loadData();
    }
    // Ctrl + F: Nhảy vào ô tìm kiếm
    if (e.ctrlKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (txtSearch) {
            txtSearch.focus();
            txtSearch.select();
        }
    }
});

console.log("====================================");
console.log("KHÁM TOÀN XÃ 2.0 - READY");
console.log("====================================");