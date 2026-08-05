//====================================================
// SERVER.JS - PHẦN 1
//====================================================

const session = require("express-session");
const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

app.use(session({

    secret:"khamtoanxa",

    resave:false,

    saveUninitialized:false

}));
const PORT = 3000;
//===============================
// dăng nhập
//===============================

app.post("/api/login", (req, res) => {

    const { username, password } = req.body;

    const user = db.prepare(`
        SELECT *
        FROM users
        WHERE username = ?
          AND password = ?
          AND active = 1
    `).get(username, password);

    if (!user) {
        return res.json({
            success: false,
            message: "Sai tài khoản hoặc mật khẩu"
        });
    }

    req.session.user = {
        id: user.id,
        username: user.username,
        fullname: user.fullname,
        role: user.role
    };

    addLog(

    req.session.user,

    "Đăng nhập",

    null,

    ""

);

    res.json({
        success: true
    });

});
app.get("/api/me",(req,res)=>{

    if(!req.session.user){

        return res.status(401).end();

    }

    res.json(req.session.user);

});
app.post("/api/logout",(req,res)=>{

    req.session.destroy(()=>{

        res.json({

            success:true

        });

    });

});

function requireLogin(req, res, next) {

    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Chưa đăng nhập"
        });
    }

    next();

}

function requireAdmin(req, res, next) {

    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Chưa đăng nhập"
        });
    }

    if (req.session.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Không có quyền"
        });
    }

    next();

}
app.post("/api/users", requireAdmin, (req, res) => {

    const {
        username,
        password,
        fullname,
        role
    } = req.body;

    if (!username || !password || !fullname) {
        return res.json({
            success: false,
            message: "Thiếu thông tin"
        });
    }

    const exist = db.prepare(`
        SELECT id
        FROM users
        WHERE username = ?
    `).get(username);

    if (exist) {
        return res.json({
            success: false,
            message: "Tên đăng nhập đã tồn tại"
        });
    }

    // Xác định quyền hợp lệ
    const newRole = role === "admin" ? "admin" : "member";

    db.prepare(`
        INSERT INTO users(
            username,
            password,
            fullname,
            role,
            created_at
        )
        VALUES(?,?,?,?,?)
    `).run(
        username,
        password,
        fullname,
        newRole,
        new Date().toISOString()
    );

    addLog(
        req.session.user,
        "Tạo tài khoản",
        null,
        fullname
    );
    res.json({
        success: true,
        message: "Đã tạo tài khoản"
    });

});


app.get("/api/users", requireAdmin, (req, res) => {

    const users = db.prepare(`
        SELECT
            id,
            username,
            fullname,
            role,
            active,
            created_at
        FROM users
        ORDER BY id
    `).all();

    res.json(users);

});
app.put("/api/users/:id/password", requireAdmin, (req, res) => {

    const id = Number(req.params.id);
    const { password } = req.body;

    if (!password) {
        return res.json({
            success: false,
            message: "Chưa nhập mật khẩu"
        });
    }

    db.prepare(`
        UPDATE users
        SET password = ?
        WHERE id = ?
    `).run(password, id);

    const u=db.prepare(`
SELECT fullname
FROM users
WHERE id=?
`).get(id);

addLog(

    req.session.user,

    "Đổi mật khẩu",

    id,

    u.fullname

);

    res.json({
        success: true,
        message: "Đã đổi mật khẩu"
    });

});
app.put("/api/users/:id/status", requireAdmin, (req, res) => {

    const id = Number(req.params.id);

    const user = db.prepare(`
        SELECT *
        FROM users
        WHERE id = ?
    `).get(id);

    if (!user) {
        return res.json({
            success: false,
            message: "Không tìm thấy tài khoản"
        });
    }

    if (user.username === "admin") {
        return res.json({
            success: false,
            message: "Không được khóa Admin"
        });
    }

    db.prepare(`
        UPDATE users
        SET active = ?
        WHERE id = ?
    `).run(user.active ? 0 : 1, id);

    addLog(

    req.session.user,

    user.active
        ? "Khóa tài khoản"
        : "Mở tài khoản",

    user.id,

    user.fullname

);

    res.json({
        success: true
    });

});
app.delete("/api/users/:id", requireAdmin, (req, res) => {

    const id = Number(req.params.id);

    const user = db.prepare(`
        SELECT *
        FROM users
        WHERE id = ?
    `).get(id);

    addLog(

        req.session.user,

        "Xóa tài khoản",

        user.id,

        user.fullname

    );

    if (!user) {
        return res.json({
            success: false,
            message: "Không tìm thấy"
        });
    }

    if (user.username === "admin") {
        return res.json({
            success: false,
            message: "Không được xóa Admin"
        });
    }
    
    db.prepare(`
        DELETE FROM users
        WHERE id = ?
    `).run(id);

    res.json({
        success: true
    });

});
//===============================

//===============================
// CẤU HÌNH
//===============================


app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
}

const upload = multer({
    dest: "uploads/"
});

//===============================
// SQLITE
//===============================

const db = new Database("database.db");

// Tăng tốc SQLite
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("temp_store = MEMORY");
db.pragma("cache_size = -64000");
db.pragma("foreign_keys = ON");

//===============================
// TẠO BẢNG
//===============================

db.exec(`

CREATE TABLE IF NOT EXISTS nguoi(

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    stt INTEGER,

    hoten TEXT,

    hoten_khongdau TEXT,

    ngaysinh TEXT,

    gioitinh TEXT,

    diachi TEXT,

    diachi_khongdau TEXT,

    dakham INTEGER DEFAULT 0,

    checked_by INTEGER,

    checked_by_name TEXT,

    checked_at TEXT

);

CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    fullname TEXT,
    role TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT
);
 CREATE TABLE IF NOT EXISTS logs(

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    user_id INTEGER,

    username TEXT,

    action TEXT,

    target_id INTEGER,

    target_name TEXT,

    created_at TEXT

);

`);

try {
    db.prepare("ALTER TABLE nguoi ADD COLUMN checked_by INTEGER").run();
} catch {}

try {
    db.prepare("ALTER TABLE nguoi ADD COLUMN checked_by_name TEXT").run();
} catch {}

try {
    db.prepare("ALTER TABLE nguoi ADD COLUMN checked_at TEXT").run();
} catch {}

function addLog(user, action, targetId, targetName){

    db.prepare(`
        INSERT INTO logs(
            user_id,
            username,
            action,
            target_id,
            target_name,
            created_at
        )
        VALUES(?,?,?,?,?,?)
    `).run(

        user.id,

        user.fullname,

        action,

        targetId,

        targetName,

        new Date().toISOString()

    );

}
const admin = db.prepare(`
    SELECT id
    FROM users
    WHERE username = ?
`).get("admin");

if (!admin) {
    db.prepare(`
        INSERT INTO users (
            username,
            password,
            fullname,
            role,
            created_at
        )
        VALUES (?, ?, ?, ?, ?)
    `).run(
        "admin",
        "admin123",
        "Quản trị hệ thống",
        "admin",
        new Date().toISOString()
    );
}

//===============================
// INDEX TĂNG TỐC TÌM KIẾM
//===============================

db.exec(`

CREATE INDEX IF NOT EXISTS idx_stt
ON nguoi(stt);

CREATE INDEX IF NOT EXISTS idx_hoten
ON nguoi(hoten_khongdau);

CREATE INDEX IF NOT EXISTS idx_diachi
ON nguoi(diachi_khongdau);

`);

//===============================
// HÀM BỎ DẤU TIẾNG VIỆT
//===============================

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

//===============================
// CHUYỂN NGÀY EXCEL
//===============================

function excelDate(value) {

    if (!value) return "";

    if (typeof value === "number") {

        const date = XLSX.SSF.parse_date_code(value);

        if (!date) return "";

        return String(date.d).padStart(2, "0") + "/" +
            String(date.m).padStart(2, "0") + "/" +
            date.y;

    }

    return String(value);

}

console.log("================================");
console.log("DATABASE READY");
console.log("================================");
//====================================================
// API IMPORT EXCEL
//====================================================

app.post("/api/import", upload.single("excel"), (req, res) => {

    try {

        if (!req.file) {

            return res.status(400).json({

                ok: false,

                message: "Chưa chọn file Excel"

            });

        }

        console.log("Đang import...");

        const workbook = XLSX.readFile(req.file.path);

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json(sheet, {

            defval: ""

        });

        console.log("Đọc được:", rows.length, "dòng");

        // Xóa dữ liệu cũ

        db.prepare("DELETE FROM nguoi").run();

        // Reset ID

        db.prepare("DELETE FROM sqlite_sequence WHERE name='nguoi'").run();

        const insert = db.prepare(`

            INSERT INTO nguoi(

                stt,

                hoten,

                hoten_khongdau,

                ngaysinh,

                gioitinh,

                diachi,

                diachi_khongdau,

                dakham

            )

            VALUES(

                ?,?,?,?,?,?,?,?

            )

        `);

        // Transaction cực nhanh

        const transaction = db.transaction((list) => {

            for (const r of list) {

                const stt = Number(r["STT"] || 0);

                const hoten = String(

                    r["Họ và tên"] ||

                    r["HỌ VÀ TÊN"] ||

                    ""

                ).trim();

                const ngaysinh = excelDate(

                    r["Ngày sinh"]

                );

                const gioitinh = String(

                    r["Giới tính"] ||

                    ""

                ).trim();

                const diachi = String(

                    r["Nơi thường trú"] ||

                    r["Địa chỉ"] ||

                    ""

                ).trim();

                // Nếu Excel có cột "Đã khám"/"Chưa khám"
                let dakham = 0;

                const trangthai = String(
                    r["Trạng thái"] ||
                    r["Kết quả"] ||
                    r["__EMPTY"] ||
                    ""
                ).toLowerCase();

                if (trangthai.includes("đã") || trangthai.includes("da")) {

                    dakham = 1;

                }

                insert.run(

                    stt,

                    hoten,

                    removeVietnamese(hoten),

                    ngaysinh,

                    gioitinh,

                    diachi,

                    removeVietnamese(diachi),

                    dakham

                );

            }

        });

        transaction(rows);

        fs.unlinkSync(req.file.path);

        const tong = db.prepare(

            "SELECT COUNT(*) AS c FROM nguoi"

        ).get().c;

        console.log("Import thành công:", tong);

        res.json({

            ok: true,

            total: tong

        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({

            ok: false,

            message: err.message

        });

    }

});

app.get("/api/logs",requireAdmin,(req,res)=>{

    const rows=db.prepare(`

SELECT

id,

username,

action,

target_name,

created_at

FROM logs

ORDER BY id DESC

`).all();

    res.json(rows);

});
//====================================================
// API TÌM KIẾM
//====================================================

//====================================================
// API SEARCH (PHÂN TRANG + KHÔNG DẤU)
//====================================================

app.get("/api/search", (req, res) => {

    try {

        const keyword = String(req.query.q || "").trim();

        const page = parseInt(req.query.page || "1");

        const limit = parseInt(req.query.limit || "50");

        const offset = (page - 1) * limit;

        let rows = [];

        let total = 0;

        //====================================
        // KHÔNG NHẬP GÌ
        //====================================

        if (keyword === "") {

            total = db.prepare(`
                SELECT COUNT(*) c
                FROM nguoi
            `).get().c;

            rows = db.prepare(`
                SELECT *
                FROM nguoi
                ORDER BY stt
                LIMIT ?
                OFFSET ?
            `).all(limit, offset);

        }

        //====================================
        // TÌM THEO STT
        //====================================

        else if (!isNaN(keyword)) {

            total = db.prepare(`
                SELECT COUNT(*) c
                FROM nguoi
                WHERE stt=?
            `).get(Number(keyword)).c;

            rows = db.prepare(`
                SELECT *
                FROM nguoi
                WHERE stt=?
            `).all(Number(keyword));

        }

        //====================================
        // TÌM KHÔNG DẤU
        //====================================

        else {

            const q = "%" + removeVietnamese(keyword) + "%";

            total = db.prepare(`
                SELECT COUNT(*) c
                FROM nguoi
                WHERE
                    hoten_khongdau LIKE ?
                    OR
                    diachi_khongdau LIKE ?
            `).get(q, q).c;

            rows = db.prepare(`
                SELECT *
                FROM nguoi
                WHERE
                    hoten_khongdau LIKE ?
                    OR
                    diachi_khongdau LIKE ?
                ORDER BY stt
                LIMIT ?
                OFFSET ?
            `).all(q, q, limit, offset);

        }

        res.json({

            rows,

            total,

            page,

            limit,

            totalPages: Math.ceil(total / limit)

        });

    }

    catch (err) {

        res.status(500).json({

            ok: false,

            message: err.message

        });

    }

});
app.get("/api/logs", requireAdmin, (req, res) => {

    const rows = db.prepare(`
        SELECT
            id,
            username,
            action,
            target_name,
            created_at
        FROM logs
        ORDER BY id DESC
    `).all();

    res.json(rows);

});

//====================================================
// API THỐNG KÊ
//====================================================

app.get("/api/stats",(req,res)=>{

    const tong=db.prepare(

        "SELECT COUNT(*) c FROM nguoi"

    ).get().c;

    const dakham=db.prepare(

        "SELECT COUNT(*) c FROM nguoi WHERE dakham=1"

    ).get().c;

    res.json({

        tong,

        dakham,

        chuakham:tong-dakham

    });

});


//====================================================
// API ĐỔI TRẠNG THÁI
//====================================================

app.post("/api/update", requireLogin, (req, res) => {

    try {

        const id = Number(req.body.id);
        const value = Number(req.body.value);

        // Lấy thông tin người dân
        const person = db.prepare(`
            SELECT *
            FROM nguoi
            WHERE id = ?
        `).get(id);

        if (!person) {
            return res.status(404).json({
                ok: false,
                message: "Không tìm thấy người dân"
            });
        }

        if (value === 1) {

            db.prepare(`
                UPDATE nguoi
                SET
                    dakham = ?,
                    checked_by = ?,
                    checked_by_name = ?,
                    checked_at = ?
                WHERE id = ?
            `).run(
                1,
                req.session.user.id,
                req.session.user.fullname,
                new Date().toISOString(),
                id
            );

            addLog(
                req.session.user,
                "Đánh dấu đã khám",
                id,
                person.hoten
            );

        } else {

            db.prepare(`
                UPDATE nguoi
                SET
                    dakham = 0,
                    checked_by = NULL,
                    checked_by_name = NULL,
                    checked_at = NULL
                WHERE id = ?
            `).run(id);

            addLog(
                req.session.user,
                "Bỏ đánh dấu khám",
                id,
                person.hoten
            );

        }

        res.json({
            ok: true
        });

    } catch (err) {

        res.status(500).json({
            ok: false,
            message: err.message
        });

    }

});


//====================================================
// API LẤY DANH SÁCH
//====================================================

app.get("/api/list",(req,res)=>{

    const page=parseInt(req.query.page||"1");

    const limit=parseInt(req.query.limit||"50");

    const offset=(page-1)*limit;

    const rows=db.prepare(`

        SELECT *

        FROM nguoi

        ORDER BY stt

        LIMIT ?

        OFFSET ?

    `).all(

        limit,

        offset

    );

    res.json(rows);

});


//====================================================
// API THÔNG TIN 1 NGƯỜI
//====================================================

app.get("/api/person/:id",(req,res)=>{

    const row=db.prepare(`

        SELECT *

        FROM nguoi

        WHERE id=?

    `).get(

        req.params.id

    );

    if(!row){

        return res.status(404).json({

            ok:false

        });

    }

    res.json(row);

});
//====================================================
// API EXPORT EXCEL
//====================================================

app.get("/api/export", requireAdmin, (req, res) => {

    try {

        const rows = db.prepare(`
            SELECT
                stt AS "STT",
                hoten AS "Họ và tên",
                ngaysinh AS "Ngày sinh",
                gioitinh AS "Giới tính",
                diachi AS "Nơi thường trú",
                CASE
                    WHEN dakham = 1 THEN 'Đã khám'
                    ELSE 'Chưa khám'
                END AS "Trạng thái",
                checked_by_name AS "Người đánh dấu",
                CASE
                    WHEN checked_at IS NULL THEN ''
                    ELSE datetime(checked_at,'localtime')
                END AS "Thời gian đánh dấu"
            FROM nguoi
            ORDER BY stt
        `).all();

        const wb = XLSX.utils.book_new();

        const ws = XLSX.utils.json_to_sheet(rows);

        XLSX.utils.book_append_sheet(wb, ws, "DanhSach");

        const file = path.join(__dirname, "danhsach_export.xlsx");

        XLSX.writeFile(wb, file);

        res.download(file);

    } catch (err) {

        console.log(err);

        res.status(500).json({
            ok: false,
            message: err.message
        });

    }

});

//====================================================
// API BACKUP DATABASE
//====================================================

app.get("/api/backup", (req, res) => {

    try {

        const backupDir = path.join(__dirname, "backup");

        if (!fs.existsSync(backupDir)) {

            fs.mkdirSync(backupDir);

        }

        const now = new Date();

        const filename =
            "database_" +
            now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, "0") +
            String(now.getDate()).padStart(2, "0") +
            "_" +
            String(now.getHours()).padStart(2, "0") +
            String(now.getMinutes()).padStart(2, "0") +
            String(now.getSeconds()).padStart(2, "0") +
            ".db";

        const dest = path.join(backupDir, filename);

        fs.copyFileSync("database.db", dest);

        res.download(dest);

    } catch (err) {

        res.status(500).json({

            ok: false,

            message: err.message

        });

    }

});

//====================================================
// TRANG CHỦ
//====================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );

});

//====================================================
// 404
//====================================================

app.use((req, res) => {

    res.status(404).json({

        ok: false,

        message: "API không tồn tại"

    });

});

//====================================================
// XỬ LÝ LỖI
//====================================================

app.use((err, req, res, next) => {

    console.error(err);

    res.status(500).json({

        ok: false,

        message: err.message

    });

});

//====================================================
// KHỞI ĐỘNG SERVER
//====================================================

app.listen(PORT, () => {

    console.log("");
    console.log("======================================");
    console.log(" HỆ THỐNG QUẢN LÝ KHÁM TOÀN XÃ ");
    console.log("======================================");
    console.log("Server : http://localhost:" + PORT);
    console.log("Database : database.db");
    console.log("======================================");
    console.log("");

});

//====================================================
// ĐÓNG DATABASE KHI THOÁT
//====================================================

process.on("SIGINT", () => {

    console.log("\nĐang đóng Database...");

    db.close();

    console.log("Đã đóng.");

    process.exit();

});

process.on("SIGTERM", () => {

    db.close();

    process.exit();

});