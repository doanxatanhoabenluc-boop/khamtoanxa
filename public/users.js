let editModalObj = null;

document.addEventListener("DOMContentLoaded", () => {
    // Khởi tạo Bootstrap Modal
    const modalEl = document.getElementById('editModal');
    if (modalEl) {
        editModalObj = new bootstrap.Modal(modalEl);
    }

    loadUsers();
    document.getElementById("btnAdd").addEventListener("click", createUser);
});

// 1. Tải danh sách user
async function loadUsers() {
    try {
        const res = await fetch("/api/users");
        if (!res.ok) {
            if (res.status === 403) {
                alert("Bạn không có quyền truy cập trang quản lý tài khoản!");
                window.location.href = "/";
                return;
            }
            throw new Error("Không thể tải danh sách tài khoản");
        }

        const users = await res.json();
        renderTable(users);
    } catch (err) {
        console.error(err);
        alert("Lỗi khi tải danh sách: " + err.message);
    }
}

// 2. Hiển thị ra bảng
function renderTable(users) {
    const tbody = document.getElementById("tableUsers");
    tbody.innerHTML = "";

    users.forEach(u => {
        const tr = document.createElement("tr");

        let roleBadge = '<span class="badge bg-secondary">Member</span>';
        if (u.role === "admin") {
            roleBadge = '<span class="badge bg-danger">Admin</span>';
        } else if (u.role === "lanh_dao") {
            roleBadge = '<span class="badge bg-warning text-dark">Lãnh đạo</span>';
        }

        const statusBadge = u.active === 1 
            ? '<span class="badge bg-success">Hoạt động</span>' 
            : '<span class="badge bg-secondary">Đã khóa</span>';

        tr.innerHTML = `
            <td>${u.id}</td>
            <td><strong>${escapeHtml(u.username)}</strong></td>
            <td>${escapeHtml(u.fullname)}</td>
            <td>${roleBadge}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn btn-sm btn-info text-white me-1" onclick="openEditModal(${u.id}, '${escapeHtml(u.username)}', '${escapeHtml(u.fullname)}', '${u.role}')">
                    <i class="fa-solid fa-pen"></i> Sửa
                </button>
                <button class="btn btn-sm btn-warning me-1" onclick="changePassword(${u.id})">
                    <i class="fa-solid fa-key"></i> Đổi MK
                </button>
                <button class="btn btn-sm ${u.active === 1 ? 'btn-secondary' : 'btn-success'} me-1" onclick="toggleStatus(${u.id})">
                    <i class="fa-solid ${u.active === 1 ? 'fa-lock' : 'fa-lock-open'}"></i> 
                    ${u.active === 1 ? 'Khóa' : 'Mở'}
                </button>
                ${u.username !== 'admin' ? `
                    <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}')">
                        <i class="fa-solid fa-trash"></i> Xóa
                    </button>
                ` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 3. Mở Modal Chỉnh Sửa
function openEditModal(id, username, fullname, role) {
    document.getElementById("editId").value = id;
    document.getElementById("editUsername").value = username;
    document.getElementById("editFullname").value = fullname;
    document.getElementById("editRole").value = role;

    if (editModalObj) {
        editModalObj.show();
    }
}

// 4. Lưu Thông tin Sửa
async function saveEditUser() {
    const id = document.getElementById("editId").value;
    const fullname = document.getElementById("editFullname").value.trim();
    const role = document.getElementById("editRole").value;

    if (!fullname) {
        alert("Họ tên không được để trống!");
        return;
    }

    try {
        const res = await fetch(`/api/users/${id}/info`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fullname, role })
        });

        const data = await res.json();
        if (data.success) {
            if (editModalObj) editModalObj.hide();
            loadUsers();
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (err) {
        alert("Lỗi kết nối server: " + err.message);
    }
}

// 5. Thêm user mới
async function createUser() {
    const username = document.getElementById("username").value.trim();
    const fullname = document.getElementById("fullname").value.trim();
    const password = document.getElementById("password").value.trim();
    const role = document.getElementById("role").value;

    if (!username || !fullname || !password) {
        alert("Vui lòng điền đầy đủ Tên đăng nhập, Họ tên và Mật khẩu!");
        return;
    }

    try {
        const res = await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, fullname, role })
        });

        const data = await res.json();
        if (data.success) {
            document.getElementById("username").value = "";
            document.getElementById("fullname").value = "";
            document.getElementById("password").value = "";
            document.getElementById("role").value = "member";
            loadUsers();
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (err) {
        alert("Lỗi kết nối server: " + err.message);
    }
}

// 6. Đổi mật khẩu
async function changePassword(id) {
    const newPassword = prompt("Nhập mật khẩu mới:");
    if (!newPassword || newPassword.trim() === "") return;

    try {
        const res = await fetch(`/api/users/${id}/password`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: newPassword.trim() })
        });

        const data = await res.json();
        if (data.success) {
            alert("Đã đổi mật khẩu thành công!");
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (err) {
        alert("Lỗi kết nối server: " + err.message);
    }
}

// 7. Khóa / Mở
async function toggleStatus(id) {
    try {
        const res = await fetch(`/api/users/${id}/status`, { method: "PUT" });
        const data = await res.json();
        if (data.success) {
            loadUsers();
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (err) {
        alert("Lỗi kết nối server: " + err.message);
    }
}

// 8. Xóa user
async function deleteUser(id, username) {
    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${username}" không?`)) return;

    try {
        const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (data.success) {
            loadUsers();
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (err) {
        alert("Lỗi kết nối server: " + err.message);
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}