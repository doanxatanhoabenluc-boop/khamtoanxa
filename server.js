const express = require("express");
const session = require("express-session");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
// require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Kết nối database
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

const upload = multer({ dest: "uploads/" });

// 1. Middleware kiểm tra đăng nhập chung
function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    }
    next();
}

// 2. Middleware chỉ dành riêng cho Admin tối cao (Quản lý user, Import Excel, Xem Logs)
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    }
    if (req.session.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Không có quyền thực hiện chức năng này. Chỉ Admin mới được phép!" });
    }
    next();
}

// 3. Middleware dành cho Cả Admin VÀ Lãnh đạo (Xem thống kê, báo cáo, chi tiết Ấp, Xuất Excel)
function requireAdminOrLanhDao(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: "Chưa đăng nhập" });
    }
    const role = req.session.user.role;
    if (role !== "admin" && role !== "lanh_dao") {
        return res.status(403).json({ success: false, message: "Chỉ lãnh đạo hoặc Admin mới có quyền thực hiện chức năng này" });
    }
    next();
}

// Middleware cho phép Admin hoặc Lãnh đạo
function requireLeaderOrAdmin(req, res, next) {
    const user = req.session?.user;
    if (user && (user.role === 'admin' || user.role === 'lanh_dao')) {
        return next();
    }
    return res.status(403).json({ success: false, message: "Chỉ Admin hoặc Lãnh đạo mới có quyền thực hiện thao tác này!" });
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
                ap TEXT,
                dakham INTEGER DEFAULT 0,
                checked_by INTEGER,
                checked_by_name TEXT,
                checked_at TEXT
            );

            -- Tự động bổ sung cột ap nếu bảng 'nguoi' đã được tạo từ trước
            ALTER TABLE nguoi ADD COLUMN IF NOT EXISTS ap TEXT;

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
            CREATE INDEX IF NOT EXISTS idx_ap ON nguoi(ap);
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

// Hàm tự động lọc bóc tách tên Ấp từ chuỗi địa chỉ
// Hàm tự động trích xuất Tên Ấp chuẩn xác từ địa chỉ
// Hàm trích xuất tên Ấp cực kỳ chuẩn xác cho Tiếng Việt
function extractAp(diachi) {
    if (!diachi) return "Khác / Chưa rõ Ấp";
    let str = String(diachi).trim();

    // 1. Tìm vị trí xuất hiện của chữ "Ấp" hoặc "Ap"
    const apMatch = str.match(/(?:ấp|ap)\s+/i);
    if (!apMatch) return "Khác / Chưa rõ Ấp";

    // Lấy phần chuỗi bắt đầu ngay sau chữ "Ấp "
    let rawAp = str.substring(apMatch.index + apMatch[0].length).trim();

    // 2. Cắt bỏ ngay lập tức nếu gặp dấu phẩy (,) hoặc các từ chỉ hành chính: xã, xa, huyện, huyen, tỉnh, tinh
    // KHÔNG dùng \b để tránh lỗi Unicode tiếng Việt
    const stopRegex = /\s*(?:,|\s+(?:xã|xa|huyện|huyen|tỉnh|tinh)(?:\s+|$))/i;
    const stopMatch = rawAp.match(stopRegex);
    
    if (stopMatch) {
        rawAp = rawAp.substring(0, stopMatch.index).trim();
    }

    if (!rawAp) return "Khác / Chưa rõ Ấp";

    // 3. Chuẩn hóa hiển thị
    // - Nếu là số: "07" -> "7"
    if (/^\d+$/.test(rawAp)) {
        rawAp = String(parseInt(rawAp, 10));
    } 
    // - Nếu là La Mã: "I" -> "1"
    else if (rawAp.toUpperCase() === 'I') {
        rawAp = '1';
    } 
    // - Viết hoa chữ cái đầu từng từ (ví dụ: "tân bửu" -> "Tân Bửu")
    else {
        rawAp = rawAp
            .toLowerCase()
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        // Chuẩn hóa dạng 6a -> 6A, 7a -> 7A
        rawAp = rawAp.replace(/(\d+)\s*([a-z])/gi, (m, p1, p2) => p1 + p2.toUpperCase());
    }

    return `Ấp ${rawAp}`;
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
        res.json({ success: true, role: user.role });
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
// API QUẢN LÝ TÀI KHOẢN (CHỈ ADMIN)
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

        // Hỗ trợ cả 3 role: admin, lanh_dao, member
        let newRole = "member";
        if (role === "admin") newRole = "admin";
        else if (role === "lanh_dao") newRole = "lanh_dao";

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
// API Cập nhật thông tin User (Họ tên & Quyền)
// API Cập nhật Họ tên và Quyền người dùng
app.put("/api/users/:id/info", requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { fullname, role } = req.body;

        if (!fullname || !role) {
            return res.json({ success: false, message: "Thiếu thông tin Họ tên hoặc Quyền" });
        }

        const userRes = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
        const user = userRes.rows[0];

        if (!user) {
            return res.json({ success: false, message: "Tài khoản không tồn tại" });
        }

        // Chặn đổi quyền của Admin mặc định
        if (user.username === "admin" && role !== "admin") {
            return res.json({ success: false, message: "Không thể giáng quyền tài khoản Admin tối cao" });
        }

        await pool.query(
            "UPDATE users SET fullname = $1, role = $2 WHERE id = $3",
            [fullname, role, id]
        );

        await addLog(req.session.user, "Sửa thông tin tài khoản", id, `${fullname} (${role})`);

        res.json({ success: true, message: "Cập nhật thành công" });
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
// API IMPORT EXCEL (CHỈ ADMIN)
//===============================
//===============================
// API IMPORT EXCEL (CHỈ ADMIN)
//===============================
app.post("/api/import", requireAdmin, upload.single("excel"), async (req, res) => {
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
            const stt = Number(r["STT"] || r["stt"] || 0);
            const hoten = String(r["Họ và tên"] || r["HỌ VÀ TÊN"] || r["hoten"] || "").trim();
            const ngaysinh = String(r["Ngày sinh"] || r["ngaysinh"] || "").trim();
            const gioitinh = String(r["Giới tính"] || r["gioitinh"] || "").trim();
            const diachi = String(r["Nơi thường trú"] || r["Địa chỉ"] || r["diachi"] || "").trim();

            // TỰ ĐỘNG BÓC TÁCH TÊN ẤP
            const ap = extractAp(diachi);

            // XỬ LÝ TRẠNG THÁI ĐÃ KHÁM / CHƯA KHÁM
            let dakham = 0;
            const trangthai = String(
                r["Trạng thái"] || r["Kết quả"] || r["dakham"] || r["__EMPTY"] || ""
            ).toLowerCase();

            if (trangthai.includes("đã") || trangthai.includes("da") || trangthai === "1" || trangthai === "true") {
                dakham = 1;
            }

            // LẤY NGƯỜI ĐÁNH DẤU VÀ THỜI GIAN (NẾU CÓ TRONG FILE EXPORT)
            const checked_by_name = String(r["Người đánh dấu"] || "").trim();
            const checked_at = String(r["Thời gian đánh dấu"] || "").trim();

            valueStrings.push(
                `($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6}, $${paramIndex+7}, $${paramIndex+8}, $${paramIndex+9}, $${paramIndex+10})`
            );

            batchValues.push(
                stt,
                hoten,
                removeVietnamese(hoten),
                ngaysinh,
                gioitinh,
                diachi,
                removeVietnamese(diachi),
                ap,
                dakham,
                checked_by_name || null,
                checked_at || null
            );
            paramIndex += 11;

            if (valueStrings.length === BATCH_SIZE || i === rows.length - 1) {
                const queryText = `
                    INSERT INTO nguoi (
                        stt, hoten, hoten_khongdau, ngaysinh, gioitinh, 
                        diachi, diachi_khongdau, ap, dakham, 
                        checked_by_name, checked_at
                    )
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
        console.error("Lỗi Import:", err);
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
// API CẬP NHẬT TRẠNG THÁI KHÁM & CRUD NGUỜI
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

app.get("/api/nguoi", requireLogin, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM nguoi ORDER BY id DESC");
        res.json({ success: true, data: result.rows, currentUser: req.session.user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post("/api/nguoi", requireLogin, async (req, res) => {
    const { stt, hoten, hoten_khongdau, ngaysinh, gioitinh, diachi, diachi_khongdau, dakham } = req.body;
    try {
        const isKham = (dakham === 1 || dakham === "1" || dakham === true) ? 1 : 0;
        
        const result = await pool.query(
            `INSERT INTO nguoi (stt, hoten, hoten_khongdau, ngaysinh, gioitinh, diachi, diachi_khongdau, dakham, checked_by, checked_by_name, checked_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [
                stt, 
                hoten, 
                hoten_khongdau || removeVietnamese(hoten), 
                ngaysinh, 
                gioitinh, 
                diachi, 
                diachi_khongdau || removeVietnamese(diachi), 
                isKham,
                req.session.user.id,
                req.session.user.fullname,
                new Date().toISOString()
            ]
        );
        
        await addLog(req.session.user, "Thêm người dân", result.rows[0].id, hoten);
        res.json({ success: true, message: "Thêm thành công!", data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put("/api/nguoi/:id", requireLogin, async (req, res) => {
    const { id } = req.params;
    const { stt, hoten, hoten_khongdau, ngaysinh, gioitinh, diachi, diachi_khongdau, dakham } = req.body;
    try {
        const isKham = (dakham === 1 || dakham === "1" || dakham === true) ? 1 : 0;
        
        // 💡 Tự động phân tích tên Ấp mới từ địa chỉ vừa chỉnh sửa
        const apCalculated = extractAp(diachi);

        await pool.query(
            `UPDATE nguoi 
             SET stt=$1, 
                 hoten=$2, 
                 hoten_khongdau=$3, 
                 ngaysinh=$4, 
                 gioitinh=$5, 
                 diachi=$6, 
                 diachi_khongdau=$7, 
                 dakham=$8,
                 ap=$9 -- 💡 Thêm cập nhật cột ap ở đây
             WHERE id=$10`,
            [
                stt, 
                hoten, 
                hoten_khongdau || removeVietnamese(hoten), 
                ngaysinh, 
                gioitinh, 
                diachi, 
                diachi_khongdau || removeVietnamese(diachi), 
                isKham, 
                apCalculated, // 💡 Giá trị ap mới (ví dụ: 'Ấp 6A' hoặc 'Ấp Tân Phú')
                id
            ]
        );
        res.json({ success: true, message: "Cập nhật thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Áp dụng middleware mới vào Route
app.delete("/api/nguoi/:id", requireLeaderOrAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM nguoi WHERE id = $1", [id]);
        res.json({ success: true, message: "Đã xóa thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

//===============================
// API THỐNG KÊ & LOGS (ADMIN & LÃNH ĐẠO VÀO ĐƯỢC)
//===============================
app.get("/api/stats", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) AS tong,
                COUNT(CASE WHEN dakham = 1 THEN 1 END) AS dakham,
                COUNT(CASE WHEN dakham = 0 OR dakham IS NULL THEN 1 END) AS chuakham
            FROM nguoi
        `);

        const stats = result.rows[0];
        res.json({
            tong: parseInt(stats.tong || 0),
            dakham: parseInt(stats.dakham || 0),
            chuakham: parseInt(stats.chuakham || 0)
        });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.get("/api/stats-by-ap", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COALESCE(ap, 'Khác / Chưa rõ Ấp') AS ap, 
                COUNT(*) AS tong_so,
                COUNT(CASE WHEN dakham = 1 THEN 1 END) AS dakham_count,
                COUNT(CASE WHEN dakham = 0 OR dakham IS NULL THEN 1 END) AS chuakham_count
            FROM nguoi
            GROUP BY ap
            -- ĐIỀU KIỆN TỰ ĐỘNG XÓA/ẨN: Chỉ lấy những Ấp có tổng số người lớn hơn 0
            HAVING COUNT(*) > 0
            ORDER BY 
                CASE WHEN ap = 'Khác / Chưa rõ Ấp' OR ap IS NULL THEN 2 ELSE 1 END,
                NULLIF(SUBSTRING(ap FROM 'Ấp ([0-9]+)'), '')::INTEGER ASC NULLS LAST,
                ap ASC
        `);
        res.json({ ok: true, data: result.rows });
    } catch (err) {
        console.error("Lỗi API Thống kê theo Ấp:", err);
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.get("/api/danh-sach-chi-tiet-ap", requireLogin, async (req, res) => {
    try {
        const { ap, status } = req.query;

        let statusCondition = "";
        if (status === "0") {
            statusCondition = "AND (dakham = 0 OR dakham IS NULL)";
        } else if (status === "1") {
            statusCondition = "AND dakham = 1";
        }

        let apCondition = "";
        if (ap === "Khác / Chưa rõ Ấp") {
            apCondition = `
                AND UPPER(diachi) NOT LIKE '%ẤP 1%' AND UPPER(diachi) NOT LIKE '%AP 1%'
                AND UPPER(diachi) NOT LIKE '%ẤP 2%' AND UPPER(diachi) NOT LIKE '%AP 2%'
                AND UPPER(diachi) NOT LIKE '%ẤP 3%' AND UPPER(diachi) NOT LIKE '%AP 3%'
                AND UPPER(diachi) NOT LIKE '%ẤP 4%' AND UPPER(diachi) NOT LIKE '%AP 4%'
                AND UPPER(diachi) NOT LIKE '%ẤP 5%' AND UPPER(diachi) NOT LIKE '%AP 5%'
                AND UPPER(diachi) NOT LIKE '%ẤP 6%' AND UPPER(diachi) NOT LIKE '%AP 6%'
                AND UPPER(diachi) NOT LIKE '%ẤP 7%' AND UPPER(diachi) NOT LIKE '%AP 7%'
                AND UPPER(diachi) NOT LIKE '%ẤP 8%' AND UPPER(diachi) NOT LIKE '%AP 8%'
                AND UPPER(diachi) NOT LIKE '%ẤP 9%' AND UPPER(diachi) NOT LIKE '%AP 9%'
                AND UPPER(diachi) NOT LIKE '%ẤP 10%' AND UPPER(diachi) NOT LIKE '%AP 10%'
            `;
        } else if (ap) {
            apCondition = `AND (UPPER(diachi) LIKE UPPER($1) OR UPPER(diachi) LIKE UPPER($2))`;
        }

        let queryParams = [];
        if (ap && ap !== "Khác / Chưa rõ Ấp") {
            const cleanAp = ap.replace('Ấp ', '');
            queryParams = [`%ẤP ${cleanAp}%`, `%AP ${cleanAp}%`];
        }

        const sql = `
            SELECT id, hoten, ngaysinh, gioitinh, diachi, dakham
            FROM nguoi
            WHERE 1=1 ${statusCondition} ${apCondition}
            ORDER BY hoten ASC
        `;

        const result = await pool.query(sql, queryParams);
        res.json({ ok: true, data: result.rows });

    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// Nhật ký hoạt động (Chỉ Admin)
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
// API EXPORT EXCEL (ADMIN & LÃNH ĐẠO VÀO ĐƯỢC)
//===============================
app.get("/api/export", requireAdminOrLanhDao, async (req, res) => {
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

        res.download(file, (err) => {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, message: err.message });
    }
});

// Xuất danh sách CHƯA KHÁM theo Ấp
app.get("/api/export-chua-kham", requireAdminOrLanhDao, async (req, res) => {
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

        if (ap && ap !== "ALL" && ap !== "Khác / Chưa rõ Ấp") {
            queryText += ` AND (
                UPPER(diachi) LIKE $1 
                OR UPPER(diachi) LIKE $2
            )`;
            
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
// API TIỆN ÍCH - KIỂM TRA DỮ LIỆU TRÙNG LẶP
//===============================
app.get("/api/tienich/du-lieu-trung", requireLogin, async (req, res) => {
    try {
        const rule = req.query.rule || "name_dob";
        let sql = "";

        if (rule === "stt") {
            sql = `
                SELECT * FROM nguoi 
                WHERE stt IN (
                    SELECT stt FROM nguoi 
                    WHERE stt IS NOT NULL AND stt > 0 
                    GROUP BY stt HAVING COUNT(*) > 1
                )
                ORDER BY stt ASC, id ASC;
            `;
        } else if (rule === "name_address") {
            sql = `
                WITH clean_data AS (
                    SELECT id,
                           LOWER(TRIM(COALESCE(NULLIF(hoten_khongdau, ''), hoten))) AS name_key,
                           LOWER(TRIM(COALESCE(NULLIF(diachi_khongdau, ''), diachi))) AS addr_key
                    FROM nguoi
                ),
                duplicates AS (
                    SELECT name_key, addr_key FROM clean_data
                    WHERE name_key IS NOT NULL AND name_key != '' 
                      AND addr_key IS NOT NULL AND addr_key != ''
                    GROUP BY name_key, addr_key HAVING COUNT(*) > 1
                )
                SELECT n.* FROM nguoi n
                JOIN clean_data c ON n.id = c.id
                JOIN duplicates d ON c.name_key = d.name_key AND c.addr_key = d.addr_key
                ORDER BY c.name_key ASC, n.id ASC;
            `;
        } else {
            sql = `
                WITH clean_data AS (
                    SELECT id,
                           LOWER(TRIM(COALESCE(NULLIF(hoten_khongdau, ''), hoten))) AS name_key,
                           LOWER(TRIM(COALESCE(ngaysinh, ''))) AS dob_key
                    FROM nguoi
                ),
                duplicates AS (
                    SELECT name_key, dob_key FROM clean_data
                    WHERE name_key IS NOT NULL AND name_key != '' 
                      AND dob_key IS NOT NULL AND dob_key != ''
                    GROUP BY name_key, dob_key HAVING COUNT(*) > 1
                )
                SELECT n.* FROM nguoi n
                JOIN clean_data c ON n.id = c.id
                JOIN duplicates d ON c.name_key = d.name_key AND c.dob_key = d.dob_key
                ORDER BY c.name_key ASC, n.id ASC;
            `;
        }

        const result = await pool.query(sql);
        const rows = result.rows || result; // Tương thích cả PostgreSQL và MySQL

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error("Lỗi quét trùng:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

//===============================
// API TIỆN ÍCH - THỐNG KÊ THEO NGƯỜI LÀM VÀ NGÀY LÀM
//===============================
app.get("/api/tienich/stats-by-user-date", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COALESCE(checked_by_name, 'Chưa xác định') AS nguoi_lam,
                TO_CHAR(checked_at::timestamp, 'DD/MM/YYYY') AS ngay_lam,
                COUNT(*) AS so_luong
            FROM nguoi
            WHERE dakham = 1 AND checked_at IS NOT NULL
            GROUP BY checked_by_name, TO_CHAR(checked_at::timestamp, 'DD/MM/YYYY')
            ORDER BY ngay_lam DESC, so_luong DESC
        `);

        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Lỗi thống kê người/ngày:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Xuất danh sách ĐÃ KHÁM theo Ấp
app.get("/api/export-da-kham", requireAdminOrLanhDao, async (req, res) => {
    try {
        const ap = req.query.ap ? String(req.query.ap).trim() : "";

        let queryText = `
            SELECT 
                stt AS "STT",
                hoten AS "Họ và tên",
                ngaysinh AS "Ngày sinh",
                gioitinh AS "Giới tính",
                diachi AS "Địa chỉ chi tiết",
                'Đã khám' AS "Trạng thái",
                checked_by_name AS "Người đánh dấu",
                checked_at AS "Thời gian đánh dấu"
            FROM nguoi
            WHERE dakham = 1
        `;
        let queryParams = [];

        if (ap && ap !== "ALL" && ap !== "Khác / Chưa rõ Ấp") {
            queryText += ` AND (
                UPPER(diachi) LIKE $1 
                OR UPPER(diachi) LIKE $2
            )`;
            
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
        XLSX.utils.book_append_sheet(wb, ws, "DaKham");

        const fileName = ap && ap !== "ALL" ? `DaKham_${ap.replace(/\s+/g, '_')}.xlsx` : `DanhSach_DaKham_ToanXa.xlsx`;
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
// 1. API Xóa 1 bản ghi nhật ký (Chỉ Admin)
app.delete("/api/logs/:id", requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM logs WHERE id = $1", [id]);
        res.json({ success: true, message: "Đã xóa nhật ký thành công!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. API Xóa TOÀN BỘ nhật ký (Chỉ Admin)
app.delete("/api/logs", requireAdmin, async (req, res) => {
    try {
        await pool.query("DELETE FROM logs");
        res.json({ success: true, message: "Đã xóa toàn bộ nhật ký!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
//===============================
// ROUTE TRANG WEB & HANDLER LỖI
//===============================
app.get("/thongke", requireAdminOrLanhDao, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "thongke.html"));
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Hứng lỗi 404
app.use((req, res) => {
    res.status(404).json({ ok: false, message: "API không tồn tại" });
});

// Handler bắt lỗi toàn cục
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