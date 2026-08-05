//====================================================
// APP.JS - PHẦN 1
//====================================================

//========== ELEMENT ==========

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

//========== BIẾN ==========

let currentPage = 1;

let currentKeyword = "";

const pageSize = 50;

//====================================================
// KHỞI ĐỘNG
//====================================================

async function checkLogin() {

    const res = await fetch("/api/me");

    if (res.status !== 200) {
        location.href = "login.html";
        return;
    }

    const user = await res.json();

    // Hiển thị tên người đăng nhập
    const userInfo = document.getElementById("userInfo");
    if (userInfo) {
        userInfo.innerText = user.fullname;
    }

    const btnUsers = document.getElementById("btnUsers");
    const btnLogs = document.getElementById("btnLogs");
    const importCard = document.getElementById("importCard");

    if (user.role === "admin") {

        if (btnUsers) {
            btnUsers.classList.remove("d-none");
        }

        if (btnLogs) {
            btnLogs.classList.remove("d-none");
        }

        if (importCard) {
            importCard.classList.remove("d-none");
        }

    }

}

window.onload = async () => {

    await checkLogin();

    // Nút Quản lý tài khoản
    const btnUsers = document.getElementById("btnUsers");
    if (btnUsers) {
        btnUsers.onclick = () => {
            location.href = "users.html";
        };
    }

    // Nút Nhật ký
    const btnLogs = document.getElementById("btnLogs");
    if (btnLogs) {
        btnLogs.onclick = () => {
            location.href = "logs.html";
        };
    }

    loadStats();

    loadData();

};

//====================================================
// THỐNG KÊ
//====================================================

async function loadStats() {

    const res = await fetch("/api/stats");

    const json = await res.json();

    tong.innerHTML = json.tong;

    dakham.innerHTML = json.dakham;

    chuakham.innerHTML = json.chuakham;

}

//====================================================
// IMPORT EXCEL
//====================================================

btnImport.onclick = async () => {

    if (excel.files.length === 0) {

        alert("Vui lòng chọn file Excel.");

        return;

    }

    if (!confirm("Import sẽ xóa toàn bộ dữ liệu cũ.\nBạn có chắc không?")) {

        return;

    }

    progressBox.classList.remove("d-none");

    progressBar.style.width = "0%";

    progressBar.innerHTML = "0%";

    let fake = 0;

    const timer = setInterval(() => {

        fake += 5;

        if (fake > 95) fake = 95;

        progressBar.style.width = fake + "%";

        progressBar.innerHTML = fake + "%";

    }, 120);

    const form = new FormData();

    form.append("excel", excel.files[0]);

    try {

        const res = await fetch("/api/import", {

            method: "POST",

            body: form

        });

        const json = await res.json();

        clearInterval(timer);

        progressBar.style.width = "100%";

        progressBar.innerHTML = "100%";

        if (!json.ok) {

            alert(json.message);

            return;

        }

        setTimeout(() => {

            progressBox.classList.add("d-none");

        }, 800);

        alert("Import thành công " + json.total + " người.");

        currentPage = 1;

        loadStats();

        loadData();

    }

    catch (err) {

        clearInterval(timer);

        progressBox.classList.add("d-none");

        alert(err.message);

    }

};

//====================================================
// EXPORT EXCEL
//====================================================

btnExport.onclick = () => {

    window.location = "/api/export";

};

//====================================================
// LÀM MỚI
//====================================================

btnReload.onclick = () => {

    txtSearch.value = "";

    currentKeyword = "";

    currentPage = 1;

    loadStats();

    loadData();

};
//====================================================
// APP.JS - PHẦN 2
// TÌM KIẾM REALTIME + KHÔNG DẤU
//====================================================

let debounceTimer = null;

//=====================================
// BỎ DẤU TIẾNG VIỆT
//=====================================

function removeVietnamese(str) {

    if (!str) return "";

    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .trim();

}

//=====================================
// TÌM KIẾM REALTIME
//=====================================

txtSearch.addEventListener("input", () => {

    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {

        currentKeyword = txtSearch.value.trim();

        currentPage = 1;

        loadData();

    }, 250);

});

//=====================================
// ENTER
//=====================================

txtSearch.addEventListener("keydown", e => {

    if (e.key === "Enter") {

        clearTimeout(debounceTimer);

        currentKeyword = txtSearch.value.trim();

        currentPage = 1;

        loadData();

    }

});

//=====================================
// NÚT TÌM KIẾM
//=====================================

btnSearch.onclick = () => {

    currentKeyword = txtSearch.value.trim();

    currentPage = 1;

    loadData();

};

//=====================================
// LOAD DỮ LIỆU
//=====================================

async function loadData() {

    tableBody.innerHTML = `

<tr>

<td colspan="7" class="text-center py-5">

<div class="spinner-border text-primary"></div>

<br><br>

Đang tải dữ liệu...

</td>

</tr>

`;

    try {

        let url = `/api/search?q=${encodeURIComponent(currentKeyword)}&page=${currentPage}&limit=${pageSize}`;

        const res = await fetch(url);

        const json = await res.json();

        renderTable(

            json.rows,

            json.total,

            json.totalPages

        );

    }

    catch (err) {

        tableBody.innerHTML = `

<tr>

<td colspan="7" class="text-danger text-center">

${err.message}

</td>

</tr>

`;

    }

}
//====================================================
// APP.JS - PHẦN 3
// HIỂN THỊ BẢNG + PHÂN TRANG + ĐỔI TRẠNG THÁI
//====================================================

//=====================================
// HIỂN THỊ DANH SÁCH
//=====================================

function renderTable(rows, total, totalPages) {

    tableBody.innerHTML = "";

    if (!rows || rows.length === 0) {

        tableBody.innerHTML = `

<tr>

<td colspan="7" class="text-center text-danger py-5">

Không tìm thấy dữ liệu

</td>

</tr>

`;

        pagination.innerHTML = "";

        pageInfo.innerHTML = "0 bản ghi";

        return;

    }

    pageInfo.innerHTML =
        `Trang ${currentPage}/${totalPages}
        - Tổng ${total} người`;

    rows.forEach(item => {

        const tr = document.createElement("tr");

        tr.className = "fade-in";

        tr.innerHTML = `

<td>${item.stt}</td>

<td>

    <strong class="text-primary">

        ${item.hoten}

    </strong>

</td>

<td>${item.ngaysinh}</td>

<td>${item.gioitinh}</td>

<td>${item.diachi}</td>

<td>

    ${
        item.dakham==1
        ?

        `<span class="badge badge-success">

            Đã khám

        </span>`

        :

        `<span class="badge badge-danger">

            Chưa khám

        </span>`
    }

</td>

<td>

<button

class="btn btn-sm ${item.dakham==1?"btn-warning":"btn-success"}"

onclick="doiTrangThai(${item.id},${item.dakham})">

${item.dakham==1?"Hủy khám":"Đã khám"}

</button>

</td>

`;

        tableBody.appendChild(tr);

    });

    renderPagination(totalPages);

}
document.getElementById("btnLogout").onclick = async () => {

    await fetch("/api/logout", {
        method: "POST"
    });

    location.href = "login.html";

};
//=====================================
// ĐỔI TRẠNG THÁI
//=====================================

async function doiTrangThai(id,value){

    try{

        const res=await fetch("/api/update",{

            method:"POST",

            headers:{

                "Content-Type":"application/json"

            },

            body:JSON.stringify({

                id:id,

                value:value?0:1

            })

        });

        const json=await res.json();

        if(!json.ok){

            alert(json.message);

            return;

        }

        loadStats();

        loadData();

    }

    catch(err){

        alert(err.message);

    }

}

window.doiTrangThai=doiTrangThai;

//=====================================
// PHÂN TRANG
//=====================================

function renderPagination(totalPages){

    pagination.innerHTML="";

    if(totalPages<=1){

        return;

    }

            pagination.innerHTML+=`
        <li class="page-item ${currentPage==1?"disabled":""}">
        <a class="page-link"
        href="#"
        onclick="gotoPage(${currentPage-1})">
        «
        </a>
        </li>
        `;

            const start=Math.max(1,currentPage-2);

            const end=Math.min(totalPages,currentPage+2);

            for(let i=start;i<=end;i++){

                pagination.innerHTML+=`
        <li class="page-item ${i==currentPage?"active":""}">
        <a
        class="page-link"
        href="#"
        onclick="gotoPage(${i})">
        ${i}
        </a>
        </li>
        `;

            }

            pagination.innerHTML+=`
        <li class="page-item ${currentPage==totalPages?"disabled":""}">
        <a
        class="page-link"
        href="#"
        onclick="gotoPage(${currentPage+1})">
        »
        </a>
        </li>
        `;

        }

//=====================================
// CHUYỂN TRANG
//=====================================

function gotoPage(page){

    if(page<1){

        return;

    }

    currentPage=page;

    loadData();

}

window.gotoPage=gotoPage;
//====================================================
// APP.JS - PHẦN 4
// TOAST + LOADING + TIỆN ÍCH
//====================================================

//=====================================
// TOAST
//=====================================

function showToast(message, type = "success") {

    const old = document.getElementById("toastMessage");

    if (old) old.remove();

    const div = document.createElement("div");

    div.id = "toastMessage";

    div.className =
        "toast align-items-center text-bg-" +
        (type === "success" ? "success" : "danger") +
        " border-0 position-fixed top-0 end-0 m-3 show";

    div.style.zIndex = "99999";

    div.innerHTML = `

<div class="d-flex">

<div class="toast-body">

${message}

</div>

<button
type="button"
class="btn-close btn-close-white me-2 m-auto"
onclick="this.parentNode.parentNode.remove()">

</button>

</div>

`;

    document.body.appendChild(div);

    setTimeout(() => {

        if (div.parentNode) {

            div.remove();

        }

    }, 3000);

}

//=====================================
// LOADING
//=====================================

function showLoading() {

    tableBody.innerHTML = `

<tr>

<td colspan="7" class="text-center py-5">

<div class="spinner-border text-primary"></div>

<br><br>

Đang tải dữ liệu...

</td>

</tr>

`;

}

//=====================================
// ẨN LOADING
//=====================================

function hideLoading() {

}

//=====================================
// FORMAT TRẠNG THÁI
//=====================================

function statusBadge(value) {

    if (value == 1) {

        return `

<span class="badge bg-success">

Đã khám

</span>

`;

    }

    return `

<span class="badge bg-danger">

Chưa khám

</span>

`;

}

//=====================================
// FORMAT NÚT
//=====================================

function actionButton(item) {

    if (item.dakham == 1) {

        return `

<button

class="btn btn-warning btn-sm"

onclick="doiTrangThai(${item.id},1)">

<i class="fa fa-rotate-left"></i>

Hủy

</button>

`;

    }

    return `

<button

class="btn btn-success btn-sm"

onclick="doiTrangThai(${item.id},0)">

<i class="fa fa-check"></i>

Đã khám

</button>

`;

}

//=====================================
// ESCAPE HTML
//=====================================

function escapeHtml(text) {

    if (text == null) return "";

    return String(text)

        .replace(/&/g, "&amp;")

        .replace(/</g, "&lt;")

        .replace(/>/g, "&gt;")

        .replace(/"/g, "&quot;")

        .replace(/'/g, "&#039;");

}

//=====================================
// LÀM MỚI THỐNG KÊ
//=====================================

async function refresh() {

    await loadStats();

    await loadData();

}

//=====================================
// PHÍM F5
//=====================================

document.addEventListener("keydown", function (e) {

    if (e.key === "F5") {

        e.preventDefault();

        refresh();

    }

});

//=====================================
// CTRL + F
//=====================================

document.addEventListener("keydown", function (e) {

    if (e.ctrlKey && e.key.toLowerCase() === "f") {

        e.preventDefault();

        txtSearch.focus();

        txtSearch.select();

    }

});

//=====================================
// AUTO FOCUS
//=====================================

window.addEventListener("load", () => {

    txtSearch.focus();

});

//=====================================
// EXPORT
//=====================================

btnExport.addEventListener("click", () => {

    window.location.href = "/api/export";

});

//=====================================
// KẾT THÚC APP
//=====================================

console.log("====================================");

console.log("KHAM TOAN XA 2.0");

console.log("APP READY");

console.log("====================================");
