const express = require("express");
const session = require("express-session");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
//require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Kết nối database đơn giản
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});
//===============================
// CẤU HÌNH MIDDLEWARE & SESSION
//===============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(session({
    secret: "khamtoanxa",
    resave: false,
    saveUninitialized: false
}));

if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
}

const upload = multer({
    dest: "uploads/"
});
// Middleware kiểm tra đăng nhập (Bất kỳ user nào đã đăng nhập đều dùng được)
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    }
    next();
}

// Middleware chỉ dành riêng cho Admin
function requireAdmin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    }
    if (req.session.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Không có quyền thực hiện chức năng này" });
    }
    next();
}
//===============================
// TẠO BẢNG & TẠO TÀI KHOẢN ADMIN MẶC ĐỊNH
//===============================
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS nguoi (
                id SERIAL PRIMARY KEY,
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

            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE,
                password TEXT,
                fullname TEXT,
                role TEXT,
                active INTEGER DEFAULT 1,
                created_at TEXT
            );

            CREATE TABLE IF NOT EXISTS logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                username TEXT,
                action TEXT,
                target_id INTEGER,
                target_name TEXT,
                created_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_stt ON nguoi(stt);
            CREATE INDEX IF NOT EXISTS idx_hoten ON nguoi(hoten_khongdau);
            CREATE INDEX IF NOT EXISTS idx_diachi ON nguoi(diachi_khongdau);
        `);

        // Check & tạo admin mặc định
        const adminCheck = await pool.query("SELECT id FROM users WHERE username = $1", ["admin"]);
        if (adminCheck.rows.length === 0) {
            await pool.query(`
                INSERT INTO users (username, password, fullname, role, created_at)
                VALUES ($1, $2, $3, $4, $5)
            `, ["admin", "admin123", "Quản trị hệ thống", "admin", new Date().toISOString()]);
        }

        console.log("====================================");
        console.log("SUPABASE POSTGRESQL DATABASE READY");
        console.log("====================================");
    } catch (err) {
        console.error("Lỗi khởi tạo Database Postgres:", err);
    }
}
initDatabase();

//===============================
// HÀM BỔ TRỢ & LOGS
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

async function addLog(user, action, targetId, targetName) {
    try {
        await pool.query(`
            INSERT INTO logs (user_id, username, action, target_id, target_name, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            user.id,
            user.fullname,
            action,
            targetId,
            targetName,
            new Date().toISOString()
        ]);
    } catch (err) {
        console.error("Lỗi ghi log:", err);
    }
}

//===============================
// AUTHENTICATION MIDDLEWARES
//===============================
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    }
    if (req.session.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Không có quyền" });
    }
    next();
}

//===============================
// API XÁC THỰC (AUTH)
//===============================
app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query(`
            SELECT * FROM users
            WHERE username = $1 AND password = $2 AND active = 1
        `, [username, password]);

        const user = result.rows[0];
        if (!user) {
            return res.json({ success: false, message: "Sai tài khoản hoặc mật khẩu" });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            fullname: user.fullname,
            role: user.role
        };

        await addLog(req.session.user, "Đăng nhập", null, "");
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/me", (req, res) => {
    if (!req.session.user) {
        return res.status(401).end();
    }
    res.json(req.session.user);
});

app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

//===============================
// API QUẢN LÝ TÀI KHOẢN (USERS)
//===============================
app.post("/api/users", requireAdmin, async (req, res) => {
    try {
        const { username, password, fullname, role } = req.body;
        if (!username || !password || !fullname) {
            return res.json({ success: false, message: "Thiếu thông tin" });
        }

        const exist = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
        if (exist.rows.length > 0) {
            return res.json({ success: false, message: "Tên đăng nhập đã tồn tại" });
        }

        const newRole = role === "admin" ? "admin" : "member";
        await pool.query(`
            INSERT INTO users (username, password, fullname, role, created_at)
            VALUES ($1, $2, $3, $4, $5)
        `, [username, password, fullname, newRole, new Date().toISOString()]);

        await addLog(req.session.user, "Tạo tài khoản", null, fullname);
        res.json({ success: true, message: "Đã tạo tài khoản" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get("/api/users", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, username, fullname, role, active, created_at
            FROM users ORDER BY id
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put("/api/users/:id/password", requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { password } = req.body;

        if (!password) {
            return res.json({ success: false, message: "Chưa nhập mật khẩu" });
        }

        await pool.query("UPDATE users SET password = $1 WHERE id = $2", [password, id]);
        const u = await pool.query("SELECT fullname FROM users WHERE id = $1", [id]);

        if (u.rows.length > 0) {
            await addLog(req.session.user, "Đổi mật khẩu", id, u.rows[0].fullname);
        }

        res.json({ success: true, message: "Đã đổi mật khẩu" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put("/api/users/:id/status", requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
        const user = userRes.rows[0];

        if (!user) {
            return res.json({ success: false, message: "Không tìm thấy tài khoản" });
        }

        if (user.username === "admin") {
            return res.json({ success: false, message: "Không được khóa Admin" });
        }

        const newActive = user.active ? 0 : 1;
        await pool.query("UPDATE users SET active = $1 WHERE id = $2", [newActive, id]);

        await addLog(
            req.session.user,
            user.active ? "Khóa tài khoản" : "Mở tài khoản",
            user.id,
            user.fullname
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete("/api/users/:id", requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
        const user = userRes.rows[0];

        if (!user) {
            return res.json({ success: false, message: "Không tìm thấy" });
        }

        if (user.username === "admin") {
            return res.json({ success: false, message: "Không được xóa Admin" });
        }

        await pool.query("DELETE FROM users WHERE id = $1", [id]);
        await addLog(req.session.user, "Xóa tài khoản", user.id, user.fullname);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

//===============================
// API IMPORT EXCEL (BULK INSERT NHANH)
//===============================
app.post("/api/import", upload.single("excel"), async (req, res) => {
    const client = await pool.connect();
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, message: "Chưa chọn file Excel" });
        }

        console.log("Đang đọc file Excel...");
        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        await client.query("BEGIN");
        await client.query("TRUNCATE TABLE nguoi RESTART IDENTITY");

        const BATCH_SIZE = 300;
        let batchValues = [];
        let valueStrings = [];
        let paramIndex = 1;

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const stt = Number(r["STT"] || 0);
            const hoten = String(r["Họ và tên"] || r["HỌ VÀ TÊN"] || "").trim();
            const ngaysinh = excelDate(r["Ngày sinh"]);
            const gioitinh = String(r["Giới tính"] || "").trim();
            const diachi = String(r["Nơi thường trú"] || r["Địa chỉ"] || "").trim();

            let dakham = 0;
            const trangthai = String(
                r["Trạng thái"] || r["Kết quả"] || r["__EMPTY"] || ""
            ).toLowerCase();

            if (trangthai.includes("đã") || trangthai.includes("da")) {
                dakham = 1;
            }

            valueStrings.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7})`);
            batchValues.push(
                stt,
                hoten,
                removeVietnamese(hoten),
                ngaysinh,
                gioitinh,
                diachi,
                removeVietnamese(diachi),
                dakham
            );
            paramIndex += 8;

            if (valueStrings.length === BATCH_SIZE || i === rows.length - 1) {
                const queryText = `
                    INSERT INTO nguoi (stt, hoten, hoten_khongdau, ngaysinh, gioitinh, diachi, diachi_khongdau, dakham)
                    VALUES ${valueStrings.join(", ")}
                `;
                await client.query(queryText, batchValues);

                valueStrings = [];
                batchValues = [];
                paramIndex = 1;
            }
        }

        await client.query("COMMIT");
        fs.unlinkSync(req.file.path);

        const countRes = await pool.query("SELECT COUNT(*) AS c FROM nguoi");
        const tong = parseInt(countRes.rows[0].c);

        console.log("Import thành công:", tong);
        res.json({ ok: true, total: tong });
    } catch (err) {
        await client.query("ROLLBACK");
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error(err);
        res.status(500).json({ ok: false, message: err.message });
    } finally {
        client.release();
    }
});

//===============================
// API TÌM KIẾM & DANH SÁCH
//===============================
app.get("/api/search", async (req, res) => {
    try {
        const keyword = String(req.query.q || "").trim();
        const page = parseInt(req.query.page || "1");
        const limit = parseInt(req.query.limit || "50");
        const offset = (page - 1) * limit;

        let rows = [];
        let total = 0;

        if (keyword === "") {
            const totalRes = await pool.query("SELECT COUNT(*) c FROM nguoi");
            total = parseInt(totalRes.rows[0].c);

            const rowsRes = await pool.query(`
                SELECT * FROM nguoi ORDER BY stt LIMIT $1 OFFSET $2
            `, [limit, offset]);
            rows = rowsRes.rows;
        } else if (!isNaN(keyword)) {
            const totalRes = await pool.query("SELECT COUNT(*) c FROM nguoi WHERE stt = $1", [Number(keyword)]);
            total = parseInt(totalRes.rows[0].c);

            const rowsRes = await pool.query("SELECT * FROM nguoi WHERE stt = $1", [Number(keyword)]);
            rows = rowsRes.rows;
        } else {
            const q = "%" + removeVietnamese(keyword) + "%";

            const totalRes = await pool.query(`
                SELECT COUNT(*) c FROM nguoi
                WHERE hoten_khongdau LIKE $1 OR diachi_khongdau LIKE $2
            `, [q, q]);
            total = parseInt(totalRes.rows[0].c);

            const rowsRes = await pool.query(`
                SELECT * FROM nguoi
                WHERE hoten_khongdau LIKE $1 OR diachi_khongdau LIKE $2
                ORDER BY stt LIMIT $3 OFFSET $4
            `, [q, q, limit, offset]);
            rows = rowsRes.rows;
        }

        res.json({
            rows,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.get("/api/list", async (req, res) => {
    try {
        const page = parseInt(req.query.page || "1");
        const limit = parseInt(req.query.limit || "50");
        const offset = (page - 1) * limit;

        const result = await pool.query(`
            SELECT * FROM nguoi ORDER BY stt LIMIT $1 OFFSET $2
        `, [limit, offset]);

        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.get("/api/person/:id", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM nguoi WHERE id = $1", [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ ok: false });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

//===============================
// API CẬP NHẬT TRẠNG THÁI KHÁM
//===============================
app.post("/api/update", requireLogin, async (req, res) => {
    try {
        const id = Number(req.body.id);
        const value = Number(req.body.value);

        const personRes = await pool.query("SELECT * FROM nguoi WHERE id = $1", [id]);
        const person = personRes.rows[0];

        if (!person) {
            return res.status(404).json({ ok: false, message: "Không tìm thấy người dân" });
        }

        if (value === 1) {
            await pool.query(`
                UPDATE nguoi
                SET dakham = 1, checked_by = $1, checked_by_name = $2, checked_at = $3
                WHERE id = $4
            `, [
                req.session.user.id,
                req.session.user.fullname,
                new Date().toISOString(),
                id
            ]);

            await addLog(req.session.user, "Đánh dấu đã khám", id, person.hoten);
        } else {
            await pool.query(`
                UPDATE nguoi
                SET dakham = 0, checked_by = NULL, checked_by_name = NULL, checked_at = NULL
                WHERE id = $1
            `, [id]);

            await addLog(req.session.user, "Bỏ đánh dấu khám", id, person.hoten);
        }

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

//===============================
// API THỐNG KÊ & LOGS
//===============================
app.get("/api/stats", async (req, res) => {
    try {
        const tongRes = await pool.query("SELECT COUNT(*) c FROM nguoi");
        const dakhamRes = await pool.query("SELECT COUNT(*) c FROM nguoi WHERE dakham = 1");

        const tong = parseInt(tongRes.rows[0].c);
        const dakham = parseInt(dakhamRes.rows[0].c);

        res.json({
            tong,
            dakham,
            chuakham: tong - dakham
        });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// API Thống kê người chưa khám theo từng Ấp
//===============================
// API THỐNG KÊ CHI TIẾT THEO ẤP (ĐÃ TÁCH SỐ NHÀ)
//===============================
app.get("/api/stats-by-ap", requireLogin, async (req, res) => {
    try {
        // Sử dụng CASE WHEN / REGEXP_MATCHES để chuẩn hóa tên Ấp từ địa chỉ
        const result = await pool.query(`
            WITH ap_extracted AS (
                SELECT 
                    id,
                    dakham,
                    CASE 
                        WHEN UPPER(diachi) LIKE '%ẤP 6A%' OR UPPER(diachi) LIKE '%AP 6A%' THEN 'Ấp 6A'
                        WHEN UPPER(diachi) LIKE '%ẤP 6B%' OR UPPER(diachi) LIKE '%AP 6B%' THEN 'Ấp 6B'
                        WHEN UPPER(diachi) LIKE '%ẤP 7A%' OR UPPER(diachi) LIKE '%AP 7A%' THEN 'Ấp 7A'
                        WHEN UPPER(diachi) LIKE '%ẤP 10%' OR UPPER(diachi) LIKE '%AP 10%' THEN 'Ấp 10'
                        WHEN UPPER(diachi) LIKE '%ẤP 1%' OR UPPER(diachi) LIKE '%AP 1%' THEN 'Ấp 1'
                        WHEN UPPER(diachi) LIKE '%ẤP 2%' OR UPPER(diachi) LIKE '%AP 2%' THEN 'Ấp 2'
                        WHEN UPPER(diachi) LIKE '%ẤP 3%' OR UPPER(diachi) LIKE '%AP 3%' THEN 'Ấp 3'
                        WHEN UPPER(diachi) LIKE '%ẤP 4%' OR UPPER(diachi) LIKE '%AP 4%' THEN 'Ấp 4'
                        WHEN UPPER(diachi) LIKE '%ẤP 5%' OR UPPER(diachi) LIKE '%AP 5%' THEN 'Ấp 5'
                        WHEN UPPER(diachi) LIKE '%ẤP 6%' OR UPPER(diachi) LIKE '%AP 6%' THEN 'Ấp 6'
                        WHEN UPPER(diachi) LIKE '%ẤP 7%' OR UPPER(diachi) LIKE '%AP 7%' THEN 'Ấp 7'
                        WHEN UPPER(diachi) LIKE '%ẤP 8%' OR UPPER(diachi) LIKE '%AP 8%' THEN 'Ấp 8'
                        WHEN UPPER(diachi) LIKE '%ẤP 9%' OR UPPER(diachi) LIKE '%AP 9%' THEN 'Ấp 9'
                        ELSE 'Khác / Chưa rõ Ấp'
                    END AS ten_ap
                FROM nguoi
                WHERE dakham = 0
            )
            SELECT 
                ten_ap AS ap, 
                COUNT(*) AS chuakham_count
            FROM ap_extracted
            GROUP BY ten_ap
            ORDER BY 
                CASE ten_ap
                    WHEN 'Ấp 1' THEN 1
                    WHEN 'Ấp 2' THEN 2
                    WHEN 'Ấp 3' THEN 3
                    WHEN 'Ấp 4' THEN 4
                    WHEN 'Ấp 5' THEN 5
                    WHEN 'Ấp 6' THEN 6
                    WHEN 'Ấp 6A' THEN 7
                    WHEN 'Ấp 6B' THEN 8
                    WHEN 'Ấp 7' THEN 9
                    WHEN 'Ấp 7A' THEN 10
                    WHEN 'Ấp 8' THEN 11
                    WHEN 'Ấp 9' THEN 12
                    WHEN 'Ấp 10' THEN 13
                    ELSE 99
                END ASC
        `);
        res.json({ ok: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});
// API LẤY DANH SÁCH CHI TIẾT TỪNG NGƯỜI CHƯA KHÁM THEO ẤP
app.get("/api/danh-sach-chi-tiet-ap", requireLogin, async (req, res) => {
    try {
        const ap = req.query.ap ? String(req.query.ap).trim() : "";
        if (!ap) return res.json({ ok: false, message: "Thiếu tên Ấp" });

        let whereClause = ` WHERE dakham = 0 `;
        let params = [];

        // Xử lý lọc chuẩn tên Ấp từ địa chỉ chi tiết
        if (ap === 'Ấp 6A') {
            whereClause += ` AND (UPPER(diachi) LIKE '%ẤP 6A%' OR UPPER(diachi) LIKE '%AP 6A%') `;
        } else if (ap === 'Ấp 6B') {
            whereClause += ` AND (UPPER(diachi) LIKE '%ẤP 6B%' OR UPPER(diachi) LIKE '%AP 6B%') `;
        } else if (ap === 'Ấp 7A') {
            whereClause += ` AND (UPPER(diachi) LIKE '%ẤP 7A%' OR UPPER(diachi) LIKE '%AP 7A%') `;
        } else if (ap === 'Ấp 6') {
            whereClause += ` AND (UPPER(diachi) LIKE '%ẤP 6%' OR UPPER(diachi) LIKE '%AP 6%') AND UPPER(diachi) NOT LIKE '%6A%' AND UPPER(diachi) NOT LIKE '%6B%' `;
        } else if (ap === 'Ấp 7') {
            whereClause += ` AND (UPPER(diachi) LIKE '%ẤP 7%' OR UPPER(diachi) LIKE '%AP 7%') AND UPPER(diachi) NOT LIKE '%7A%' `;
        } else if (ap === 'Ấp 1') {
            whereClause += ` AND (UPPER(diachi) LIKE '%ẤP 1%' OR UPPER(diachi) LIKE '%AP 1%') AND UPPER(diachi) NOT LIKE '%10%' `;
        } else {
            whereClause += ` AND (UPPER(diachi) LIKE $1 OR UPPER(diachi) LIKE $2) `;
            const apNoAccent = removeVietnamese(ap).toUpperCase();
            params.push(`%${ap.toUpperCase()}%`, `%${apNoAccent}%`);
        }

        const queryText = `
            SELECT stt, hoten, ngaysinh, gioitinh, diachi 
            FROM nguoi 
            ${whereClause} 
            ORDER BY stt ASC
        `;

        const result = await pool.query(queryText, params);
        res.json({ ok: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.get("/api/logs", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, username, action, target_name, created_at
            FROM logs ORDER BY id DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

//===============================
// API EXPORT EXCEL
//===============================
app.get("/api/export", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                stt AS "STT",
                hoten AS "Họ và tên",
                ngaysinh AS "Ngày sinh",
                gioitinh AS "Giới tính",
                diachi AS "Nơi thường trú",
                CASE WHEN dakham = 1 THEN 'Đã khám' ELSE 'Chưa khám' END AS "Trạng thái",
                checked_by_name AS "Người đánh dấu",
                checked_at AS "Thời gian đánh dấu"
            FROM nguoi
            ORDER BY stt
        `);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(result.rows);
        XLSX.utils.book_append_sheet(wb, ws, "DanhSach");

        const file = path.join(__dirname, "danhsach_export.xlsx");
        XLSX.writeFile(wb, file);

        res.download(file);
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, message: err.message });
    }
});

// API Xuất danh sách người chưa khám theo Ấp
//===============================
// API EXPORT DÂN CHƯA KHÁM THEO ẤP (ĐÃ TÁCH SỐ NHÀ)
//===============================
app.get("/api/export-chua-kham", requireLogin, async (req, res) => {
    try {
        const ap = req.query.ap ? String(req.query.ap).trim() : "";

        let queryText = `
            SELECT 
                stt AS "STT",
                hoten AS "Họ và tên",
                ngaysinh AS "Ngày sinh",
                gioitinh AS "Giới tính",
                diachi AS "Địa chỉ chi tiết",
                'Chưa khám' AS "Trạng thái"
            FROM nguoi
            WHERE dakham = 0
        `;
        let queryParams = [];

        if (ap && ap !== "ALL") {
            // Lọc theo ấp tương ứng
            queryText += ` AND (
                UPPER(diachi) LIKE $1 
                OR UPPER(diachi) LIKE $2
            )`;
            
            // Xử lý loại trừ để tránh Ấp 6A bị lẫn vào Ấp 6
            if (ap === 'Ấp 6') {
                queryText += ` AND UPPER(diachi) NOT LIKE '%6A%' AND UPPER(diachi) NOT LIKE '%6B%'`;
            } else if (ap === 'Ấp 7') {
                queryText += ` AND UPPER(diachi) NOT LIKE '%7A%'`;
            } else if (ap === 'Ấp 1') {
                queryText += ` AND UPPER(diachi) NOT LIKE '%10%'`;
            }

            const apNoAccent = removeVietnamese(ap).toUpperCase();
            queryParams.push(`%${ap.toUpperCase()}%`, `%${apNoAccent}%`);
        }

        queryText += ` ORDER BY stt`;

        const result = await pool.query(queryText, queryParams);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(result.rows);
        XLSX.utils.book_append_sheet(wb, ws, "ChuaKham");

        const fileName = ap && ap !== "ALL" ? `ChuaKham_${ap.replace(/\s+/g, '_')}.xlsx` : `DanhSach_ChuaKham_ToanXa.xlsx`;
        const filePath = path.join(__dirname, fileName);

        XLSX.writeFile(wb, filePath);
        res.download(filePath, (err) => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, message: err.message });
    }
});
//===============================
// TRANG CHỦ, ROUTE TRANG THỐNG KÊ & 404
//===============================
app.get("/thongke", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "thongke.html"));
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Hứng lỗi 404 (Bắt buộc phải nằm ở gần cuối cùng)
app.use((req, res) => {
    res.status(404).json({ ok: false, message: "API không tồn tại" });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ ok: false, message: err.message });
});

//===============================
// KHỞI ĐỘNG SERVER
//===============================
app.listen(PORT, () => {
    console.log("");
    console.log("======================================");
    console.log(" HỆ THỐNG QUẢN LÝ KHÁM TOÀN XÃ ");
    console.log("======================================");
    console.log("Server running on port: " + PORT);
    console.log("Database: Supabase PostgreSQL");
    console.log("======================================");
    console.log("");
});