const table = document.querySelector("#tableUsers");

const txtUsername = document.querySelector("#username");
const txtPassword = document.querySelector("#password");
const txtFullname = document.querySelector("#fullname");
const cboRole = document.querySelector("#role");
const btnAdd = document.querySelector("#btnAdd");

//========================
// Load danh sách
//========================
async function loadUsers() {

    const res = await fetch("/api/users");

    if (res.status == 401) {
        location.href = "login.html";
        return;
    }

    if (res.status == 403) {
        alert("Bạn không có quyền");
        location.href = "index.html";
        return;
    }

    const users = await res.json();

    table.innerHTML = "";

    users.forEach(user => {

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.fullname}</td>
            <td>${user.role}</td>
            <td>
                ${
                    user.active
                    ? '<span class="badge bg-success">Hoạt động</span>'
                    : '<span class="badge bg-danger">Đã khóa</span>'
                }
            </td>
            <td>

                <button
                    class="btn btn-warning btn-sm"
                    onclick="changePassword(${user.id})">

                    Đổi mật khẩu

                </button>

                <button
                    class="btn btn-info btn-sm"
                    onclick="changeStatus(${user.id})">

                    ${user.active ? "Khóa" : "Mở"}

                </button>

                ${
                    user.username == "admin"
                    ? ""
                    : `
                    <button
                        class="btn btn-danger btn-sm"
                        onclick="deleteUser(${user.id})">

                        Xóa

                    </button>
                    `
                }

            </td>
        `;

        table.appendChild(tr);

    });

}

//========================
// Thêm tài khoản
//========================
btnAdd.onclick = async () => {

    const username = txtUsername.value.trim();
    const password = txtPassword.value.trim();
    const fullname = txtFullname.value.trim();

    if (!username || !password || !fullname) {

        alert("Nhập đầy đủ thông tin");

        return;

    }

    const res = await fetch("/api/users", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({

            username,
            password,
            fullname,
            role: cboRole.value

        })

    });

    const data = await res.json();

    alert(data.message);

    if (data.success) {

        txtUsername.value = "";
        txtPassword.value = "";
        txtFullname.value = "";

        loadUsers();

    }

};

//========================
// Đổi mật khẩu
//========================
async function changePassword(id) {

    const password = prompt("Nhập mật khẩu mới");

    if (!password) return;

    const res = await fetch(`/api/users/${id}/password`, {

        method: "PUT",

        headers: {

            "Content-Type": "application/json"

        },

        body: JSON.stringify({

            password

        })

    });

    const data = await res.json();

    alert(data.message);

}

//========================
// Khóa tài khoản
//========================
async function changeStatus(id) {

    const res = await fetch(`/api/users/${id}/status`, {

        method: "PUT"

    });

    const data = await res.json();

    if (data.message)
        alert(data.message);

    loadUsers();

}

//========================
// Xóa
//========================
async function deleteUser(id) {

    if (!confirm("Xóa tài khoản này?"))
        return;

    const res = await fetch(`/api/users/${id}`, {

        method: "DELETE"

    });

    const data = await res.json();

    if (data.message)
        alert(data.message);

    loadUsers();

}

loadUsers();