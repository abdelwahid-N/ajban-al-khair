#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
تعاونية أجبان الخير - Coopérative Ajban Al Khair
Système de Gestion des Revenus et Dépenses (Mada5il & Masarif)
"""

import os
import sqlite3
import socket
import sys
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, Response
import io
import csv

# Windows console encoding safety
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "ajban_khair.db")

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static")
)

# Predefined categories for dairy cooperative
DEFAULT_INCOME_CATEGORIES = [
    "Mad5oul Yawmi (مدخول يومي)",
    "Mad5oul Istitna2i (مدخول استثنائي)",
    "Mad5oul Na9l Siyahi (مدخول النقل السياحي)"
]

DEFAULT_EXPENSE_CATEGORIES = [
    "Chra L-7lib mn l-Kssaba (شراء الحليب من الكسابة)",
    "L-3llaf w Toghdiya (الأعلاف والتغذية)",
    "Transport w L-Mazot (النقل والمحروقات)",
    "Khddama w Salaires (أجور العمال)",
    "D-Do w L-Ma (الماء والكهرباء)",
    "Dwa w Vétérinaire (الأدوية والبيطرة)",
    "Emballage w Slayel (التغليف ومواد التعليب)",
    "Slla7 w Siyana (الإصلاح والصيانة)",
    "Masrouf Akhor (مصروف آخر)"
]

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK(type IN ('mad5oul', 'masrouf')),
            category TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            payment_method TEXT DEFAULT 'Kache / Espèces',
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('mad5oul', 'masrouf')),
            display_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    try:
        cursor.execute("ALTER TABLE categories ADD COLUMN display_order INTEGER DEFAULT 0")
        cursor.execute("UPDATE categories SET display_order = id")
    except sqlite3.OperationalError:
        pass

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS kounach (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_name TEXT NOT NULL,
            phone TEXT,
            category TEXT DEFAULT 'كساب (Fournisseur de Lait)',
            total_due REAL NOT NULL DEFAULT 0,
            paid_amount REAL NOT NULL DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS kounach_operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kounach_id INTEGER NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('credit', 'payment')),
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(kounach_id) REFERENCES kounach(id) ON DELETE CASCADE
        )
    """)
    conn.commit()

    # Seed categories if empty
    cursor.execute("SELECT COUNT(*) as count FROM categories")
    if cursor.fetchone()["count"] == 0:
        for idx, name in enumerate(DEFAULT_INCOME_CATEGORIES):
            cursor.execute("INSERT OR IGNORE INTO categories (name, type, display_order) VALUES (?, 'mad5oul', ?)", (name, idx))
        for idx, name in enumerate(DEFAULT_EXPENSE_CATEGORIES):
            cursor.execute("INSERT OR IGNORE INTO categories (name, type, display_order) VALUES (?, 'masrouf', ?)", (name, idx))
        conn.commit()

    # Keep transactions and kounach clean starting from 0 DH
    conn.close()

def seed_kounach_sample(cursor):
    today = datetime.now()
    sample_kounach = [
        ("با بوشعيب الكساب (دوار أولاد علي)", "0661234567", "كساب (حليب)", 12500.0, 8500.0, "توريد الحليب الصباحي والمسائي، حساب كل 15 يوم"),
        ("شركة أعلاف الأطلس (Aliments Bétail)", "0524445566", "أعلاف وتغذية", 18000.0, 12000.0, "فاتورة الأعلاف المركبة والنخالة، تسهيلات في الأداء"),
        ("سي المكي مول المازوط (Station)", "0670889900", "نقل ومحروقات", 4500.0, 4500.0, "مازوط شاحنة جمع الحليب، تم تسوية الحساب بالكامل"),
        ("الدكتور بناني البيطري (Vétérinaire)", "0663112233", "أدوية وبيطرة", 3200.0, 1500.0, "تلقيحات وفحوصات قطيع التعاونية")
    ]
    for p_name, phone, cat, due, paid, notes in sample_kounach:
        cursor.execute("""
            INSERT INTO kounach (person_name, phone, category, total_due, paid_amount, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (p_name, phone, cat, due, paid, notes))
        k_id = cursor.lastrowid
        cursor.execute("""
            INSERT INTO kounach_operations (kounach_id, type, amount, date, notes)
            VALUES (?, 'credit', ?, ?, 'سلعة / خدمة مسجلة فـ الحساب')
        """, (k_id, due, (today - timedelta(days=20)).strftime("%Y-%m-%d")))
        if paid > 0:
            cursor.execute("""
                INSERT INTO kounach_operations (kounach_id, type, amount, date, notes)
                VALUES (?, 'payment', ?, ?, 'دفعة / تسبيق من الحساب')
            """, (k_id, paid, (today - timedelta(days=5)).strftime("%Y-%m-%d")))

def seed_sample_data(cursor):
    today = datetime.now()
    sample_records = [
        # Today
        ("mad5oul", "Mad5oul Yawmi (مدخول يومي)", 5050.0, "مجموع مبيعات الحليب والجبن لليوم", "Kache / Espèces", today.strftime("%Y-%m-%d"), "09:30"),
        ("masrouf", "Chra L-7lib mn l-Kssaba (شراء الحليب من الكسابة)", 2400.0, "Paiement 600L l-7lib 3nd Kssaba d douar", "Kache / Espèces", today.strftime("%Y-%m-%d"), "11:00"),
        ("masrouf", "Transport w L-Mazot (النقل والمحروقات)", 350.0, "Mazout dyal l-fourgonnette d ramassage", "Kache / Espèces", today.strftime("%Y-%m-%d"), "12:20"),
        ("mad5oul", "Mad5oul Na9l Siyahi (مدخول النقل السياحي)", 850.0, "نقل سياحي لزوار التعاونية والمنطقة", "Kache / Espèces", today.strftime("%Y-%m-%d"), "14:00"),
        
        # Yesterday
        ("mad5oul", "Mad5oul Yawmi (مدخول يومي)", 3520.0, "مبيعات التعاونية ليوم أمس", "Kache / Espèces", (today - timedelta(days=1)).strftime("%Y-%m-%d"), "10:00"),
        ("masrouf", "Chra L-7lib mn l-Kssaba (شراء الحليب من الكسابة)", 2200.0, "Collecte l-7lib sba7", "Kache / Espèces", (today - timedelta(days=1)).strftime("%Y-%m-%d"), "08:30"),
        ("masrouf", "Emballage w Slayel (التغليف ومواد التعليب)", 480.0, "Kraton w barquettes jben", "Kache / Espèces", (today - timedelta(days=1)).strftime("%Y-%m-%d"), "15:30"),
        
        # Earlier this week
        ("mad5oul", "Mad5oul Yawmi (مدخول يومي)", 2100.0, "مبيعات الحليب والمنتجات", "Kache / Espèces", (today - timedelta(days=2)).strftime("%Y-%m-%d"), "10:00"),
        ("masrouf", "L-3llaf w Toghdiya (الأعلاف والتغذية)", 1500.0, "5 saks aliments concentré", "Kache / Espèces", (today - timedelta(days=3)).strftime("%Y-%m-%d"), "16:00"),
        ("masrouf", "D-Do w L-Ma (الماء والكهرباء)", 1250.0, "Facture électricité chambre froide", "Virement bancaire", (today - timedelta(days=4)).strftime("%Y-%m-%d"), "11:00"),
        ("mad5oul", "Mad5oul Istitna2i (مدخول استثنائي)", 3800.0, "دفعة استثنائية أو طلبية خاصة", "Chèque", (today - timedelta(days=4)).strftime("%Y-%m-%d"), "14:15"),
        ("masrouf", "Dwa w Vétérinaire (الأدوية والبيطرة)", 420.0, "Vitamines w désinfectant trayat", "Kache / Espèces", (today - timedelta(days=5)).strftime("%Y-%m-%d"), "09:45"),
        ("mad5oul", "Mad5oul Na9l Siyahi (مدخول النقل السياحي)", 940.0, "جولة سياحية ونقل وفد سياحي", "Kache / Espèces", (today - timedelta(days=6)).strftime("%Y-%m-%d"), "17:00"),

        # Earlier this month (October 2026)
        ("mad5oul", "Mad5oul Yawmi (مدخول يومي)", 4800.0, "مبيعات نصف الشهر", "Kache / Espèces", (today - timedelta(days=12)).strftime("%Y-%m-%d"), "10:30"),
        ("masrouf", "Chra L-7lib mn l-Kssaba (شراء الحليب من الكسابة)", 3200.0, "دفعة الكسابة الأسبوعية", "Kache / Espèces", (today - timedelta(days=12)).strftime("%Y-%m-%d"), "11:30"),
        ("masrouf", "Khddama w Salaires (أجور العمال)", 2500.0, "تسبيقات أجور العمال", "Kache / Espèces", (today - timedelta(days=14)).strftime("%Y-%m-%d"), "16:00"),

        # Previous months of 2026 (Annual data)
        ("mad5oul", "Mad5oul Yawmi (مدخول يومي)", 18500.0, "إجمالي مبيعات شهر شتنبر", "Kache / Espèces", "2026-09-25", "10:00"),
        ("masrouf", "Chra L-7lib mn l-Kssaba (شراء الحليب من الكسابة)", 11200.0, "شراء الحليب شهر شتنبر", "Kache / Espèces", "2026-09-25", "11:00"),
        ("masrouf", "L-3llaf w Toghdiya (الأعلاف والتغذية)", 3400.0, "أعلاف مركبة شهر شتنبر", "Kache / Espèces", "2026-09-18", "14:00"),
        ("masrouf", "Transport w L-Mazot (النقل والمحروقات)", 1800.0, "مازوط الشاحنة شتنبر", "Kache / Espèces", "2026-09-22", "12:00"),

        ("mad5oul", "Mad5oul Yawmi (مدخول يومي)", 22400.0, "مبيعات ذروة الصيف غشت", "Kache / Espèces", "2026-08-20", "10:00"),
        ("mad5oul", "Mad5oul Na9l Siyahi (مدخول النقل السياحي)", 4600.0, "رحلات سياحية وفود أجنبية", "Kache / Espèces", "2026-08-15", "16:00"),
        ("masrouf", "Chra L-7lib mn l-Kssaba (شراء الحليب من الكسابة)", 13500.0, "مستحقات الكسابة شهر غشت", "Kache / Espèces", "2026-08-20", "11:30"),
        ("masrouf", "D-Do w L-Ma (الماء والكهرباء)", 2100.0, "تبريد الحليب والمكيفات غشت", "Virement bancaire", "2026-08-10", "09:00"),

        ("mad5oul", "Mad5oul Yawmi (مدخول يومي)", 19800.0, "مبيعات شهر يوليوز", "Kache / Espèces", "2026-07-22", "10:00"),
        ("masrouf", "Chra L-7lib mn l-Kssaba (شراء الحليب من الكسابة)", 12100.0, "حليب الكسابة يوليوز", "Kache / Espèces", "2026-07-22", "11:00"),
        ("masrouf", "Emballage w Slayel (التغليف ومواد التعليب)", 1600.0, "صناديق وقوالب الجبن", "Kache / Espèces", "2026-07-12", "15:00"),

        ("mad5oul", "Mad5oul Yawmi (مدخول يومي)", 17500.0, "مبيعات شهر يونيو", "Kache / Espèces", "2026-06-20", "10:00"),
        ("masrouf", "Chra L-7lib mn l-Kssaba (شراء الحليب من الكسابة)", 10500.0, "حليب الكسابة يونيو", "Kache / Espèces", "2026-06-20", "11:00"),
        ("masrouf", "Dwa w Vétérinaire (الأدوية والبيطرة)", 1850.0, "فحوصات وتلقيحات الأبقار", "Kache / Espèces", "2026-06-08", "10:00"),

        ("mad5oul", "Mad5oul Yawmi (مدخول يومي)", 16800.0, "مبيعات شهر ماي", "Kache / Espèces", "2026-05-18", "10:00"),
        ("masrouf", "Chra L-7lib mn l-Kssaba (شراء الحليب من الكسابة)", 9800.0, "حليب الكسابة ماي", "Kache / Espèces", "2026-05-18", "11:00"),
        ("masrouf", "Slla7 w Siyana (الإصلاح والصيانة)", 2300.0, "صيانة آلات خضاضة ومبرد الحليب", "Kache / Espèces", "2026-05-12", "14:00")
    ]
    cursor.executemany("""
        INSERT INTO transactions (type, category, amount, description, payment_method, date, time)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, sample_records)

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

@app.route("/")
def index():
    local_ip = get_local_ip()
    port = int(os.getenv("PORT", "5050"))
    return render_template("index.html", local_ip=local_ip, port=port)

@app.route("/api/system-info", methods=["GET"])
def system_info():
    port = int(os.getenv("PORT", "5050"))
    local_ip = get_local_ip()
    return jsonify({
        "status": "online",
        "app_name": "تعاونية أجبان الخير - Ajban Al Khair",
        "local_ip": local_ip,
        "port": port,
        "mobile_url": f"http://{local_ip}:{port}",
        "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })

@app.route("/api/categories", methods=["GET"])
def get_categories():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, type, display_order FROM categories ORDER BY display_order ASC, id ASC")
    rows = cursor.fetchall()
    conn.close()

    income_items = [{"id": r["id"], "name": r["name"], "display_order": r["display_order"]} for r in rows if r["type"] == "mad5oul"]
    expense_items = [{"id": r["id"], "name": r["name"], "display_order": r["display_order"]} for r in rows if r["type"] == "masrouf"]

    return jsonify({
        "income": [item["name"] for item in income_items],
        "expense": [item["name"] for item in expense_items],
        "income_list": income_items,
        "expense_list": expense_items
    })

@app.route("/api/categories", methods=["POST"])
def add_category():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    cat_type = data.get("type", "masrouf").strip()

    if not name:
        return jsonify({"error": "يرجى كتابة اسم الصنف"}), 400

    if cat_type not in ("mad5oul", "masrouf"):
        return jsonify({"error": "Type must be 'mad5oul' or 'masrouf'"}), 400

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM categories WHERE type = ?", (cat_type,))
        next_order = cursor.fetchone()["next_order"]
        cursor.execute("INSERT INTO categories (name, type, display_order) VALUES (?, ?, ?)", (name, cat_type, next_order))
        new_id = cursor.lastrowid
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "هذا الصنف موجود مسبقاً!"}), 400

    conn.close()
    return jsonify({
        "status": "success",
        "id": new_id,
        "name": name,
        "type": cat_type,
        "display_order": next_order,
        "message": "تمت إضافة الصنف بنجاح!"
    }), 201

@app.route("/api/categories/reorder", methods=["POST"])
def reorder_categories():
    data = request.get_json() or {}
    order_ids = data.get("order", [])

    if not order_ids or not isinstance(order_ids, list):
        return jsonify({"error": "بيانات الترتيب غير صحيحة"}), 400

    conn = get_db()
    cursor = conn.cursor()
    for idx, cat_id in enumerate(order_ids):
        cursor.execute("UPDATE categories SET display_order = ? WHERE id = ?", (idx, cat_id))
    conn.commit()
    conn.close()

    return jsonify({
        "status": "success",
        "message": "تم حفظ ترتيب الأصناف بنجاح!"
    })

@app.route("/api/categories/<int:cat_id>", methods=["DELETE"])
def delete_category(cat_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if affected == 0:
        return jsonify({"error": "الصنف غير موجود"}), 404

    return jsonify({"status": "success", "message": "تم حذف الصنف بنجاح!"})

# ==========================================================================
# Kounach (Dettes / Carnet de Crédit) Endpoints
# ==========================================================================

@app.route("/api/kounach", methods=["GET"])
def get_kounach():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            id, person_name, phone, category, total_due, paid_amount, notes,
            created_at, updated_at
        FROM kounach
        ORDER BY (total_due - paid_amount) DESC, updated_at DESC
    """)
    rows = cursor.fetchall()

    accounts = []
    total_due = 0.0
    total_paid = 0.0
    total_remaining = 0.0
    active_count = 0
    settled_count = 0

    for r in rows:
        due = float(r["total_due"])
        paid = float(r["paid_amount"])
        rem = max(0.0, due - paid)
        total_due += due
        total_paid += paid
        total_remaining += rem

        if rem > 0:
            active_count += 1
        else:
            settled_count += 1

        pct = round((paid / due * 100) if due > 0 else 100.0, 1)

        accounts.append({
            "id": r["id"],
            "person_name": r["person_name"],
            "phone": r["phone"] or "",
            "category": r["category"] or "كساب (حليب)",
            "total_due": due,
            "paid_amount": paid,
            "remaining": rem,
            "progress_pct": min(pct, 100.0),
            "is_settled": rem <= 0,
            "notes": r["notes"] or "",
            "created_at": r["created_at"],
            "updated_at": r["updated_at"]
        })

    conn.close()

    return jsonify({
        "summary": {
            "total_due": total_due,
            "total_paid": total_paid,
            "total_remaining": total_remaining,
            "active_count": active_count,
            "settled_count": settled_count,
            "total_count": len(accounts)
        },
        "accounts": accounts
    })

@app.route("/api/kounach", methods=["POST"])
def add_kounach_account():
    data = request.get_json() or {}
    person_name = data.get("person_name", "").strip()
    phone = data.get("phone", "").strip()
    category = data.get("category", "كساب (حليب)").strip()
    notes = data.get("notes", "").strip()

    if not person_name:
        return jsonify({"error": "يرجى كتابة اسم الشخص أو المورد"}), 400

    try:
        initial_due = float(data.get("initial_due", 0))
        if initial_due < 0:
            initial_due = 0.0
    except (ValueError, TypeError):
        initial_due = 0.0

    try:
        initial_paid = float(data.get("initial_paid", 0))
        if initial_paid < 0:
            initial_paid = 0.0
    except (ValueError, TypeError):
        initial_paid = 0.0

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO kounach (person_name, phone, category, total_due, paid_amount, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (person_name, phone, category, initial_due, initial_paid, notes))
    new_id = cursor.lastrowid

    today_str = datetime.now().strftime("%Y-%m-%d")
    if initial_due > 0:
        cursor.execute("""
            INSERT INTO kounach_operations (kounach_id, type, amount, date, notes)
            VALUES (?, 'credit', ?, ?, 'الرصيد الافتتاحي لي كيتسالنا')
        """, (new_id, initial_due, today_str))

    if initial_paid > 0:
        cursor.execute("""
            INSERT INTO kounach_operations (kounach_id, type, amount, date, notes)
            VALUES (?, 'payment', ?, ?, 'تسبيق / دفعة افتتاحية')
        """, (new_id, initial_paid, today_str))

    conn.commit()
    conn.close()

    return jsonify({
        "status": "success",
        "id": new_id,
        "message": f"تمت إضافة {person_name} إلى الكناش بنجاح! 📒"
    }), 201

@app.route("/api/kounach/<int:k_id>", methods=["GET"])
def get_kounach_detail(k_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM kounach WHERE id = ?", (k_id,))
    account = cursor.fetchone()
    if not account:
        conn.close()
        return jsonify({"error": "الحساب غير موجود"}), 404

    cursor.execute("""
        SELECT id, type, amount, date, notes, created_at
        FROM kounach_operations
        WHERE kounach_id = ?
        ORDER BY date DESC, id DESC
    """, (k_id,))
    ops = cursor.fetchall()
    conn.close()

    due = float(account["total_due"])
    paid = float(account["paid_amount"])
    rem = max(0.0, due - paid)

    return jsonify({
        "account": {
            "id": account["id"],
            "person_name": account["person_name"],
            "phone": account["phone"] or "",
            "category": account["category"] or "كساب (حليب)",
            "total_due": due,
            "paid_amount": paid,
            "remaining": rem,
            "is_settled": rem <= 0,
            "notes": account["notes"] or "",
            "created_at": account["created_at"],
            "updated_at": account["updated_at"]
        },
        "operations": [
            {
                "id": op["id"],
                "type": op["type"],
                "amount": float(op["amount"]),
                "date": op["date"],
                "notes": op["notes"] or "",
                "created_at": op["created_at"]
            }
            for op in ops
        ]
    })

@app.route("/api/kounach/<int:k_id>/operations", methods=["POST"])
def add_kounach_operation(k_id):
    data = request.get_json() or {}
    op_type = data.get("type", "payment").strip()
    notes = data.get("notes", "").strip()
    date_val = data.get("date") or datetime.now().strftime("%Y-%m-%d")
    record_in_transactions = bool(data.get("record_in_transactions", False))

    if op_type not in ("credit", "payment"):
        return jsonify({"error": "نوع العملية يجب أن يكون 'credit' أو 'payment'"}), 400

    try:
        amount = float(data.get("amount", 0))
        if amount <= 0:
            return jsonify({"error": "المبلغ يجب أن يكون أكبر من الصفر"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "المبلغ غير صالح"}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM kounach WHERE id = ?", (k_id,))
    account = cursor.fetchone()
    if not account:
        conn.close()
        return jsonify({"error": "الحساب غير موجود"}), 404

    cursor.execute("""
        INSERT INTO kounach_operations (kounach_id, type, amount, date, notes)
        VALUES (?, ?, ?, ?, ?)
    """, (k_id, op_type, amount, date_val, notes))

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if op_type == "credit":
        cursor.execute("""
            UPDATE kounach
            SET total_due = total_due + ?, updated_at = ?
            WHERE id = ?
        """, (amount, now_str, k_id))
    else:
        cursor.execute("""
            UPDATE kounach
            SET paid_amount = paid_amount + ?, updated_at = ?
            WHERE id = ?
        """, (amount, now_str, k_id))

        if record_in_transactions:
            tx_desc = f"دفعة من الكناش لـ {account['person_name']}" + (f": {notes}" if notes else "")
            cat = account["category"] or "Chra L-7lib mn l-Kssaba (شراء الحليب من الكسابة)"
            cursor.execute("""
                INSERT INTO transactions (type, category, amount, description, payment_method, date, time)
                VALUES ('masrouf', ?, ?, ?, 'Kache / Espèces', ?, ?)
            """, (cat, amount, tx_desc, date_val, datetime.now().strftime("%H:%M")))

    conn.commit()
    conn.close()

    msg = "تم تسجيل الدفعة بنجاح! 💸" if op_type == "payment" else "تمت إضافة الكريدي بنجاح! ➕"
    return jsonify({"status": "success", "message": msg}), 201

@app.route("/api/kounach/<int:k_id>", methods=["PUT"])
def update_kounach_account(k_id):
    data = request.get_json() or {}
    person_name = data.get("person_name", "").strip()
    phone = data.get("phone", "").strip()
    category = data.get("category", "كساب (حليب)").strip()
    notes = data.get("notes", "").strip()

    if not person_name:
        return jsonify({"error": "اسم الشخص مطلوب"}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE kounach
        SET person_name = ?, phone = ?, category = ?, notes = ?, updated_at = ?
        WHERE id = ?
    """, (person_name, phone, category, notes, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), k_id))
    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if affected == 0:
        return jsonify({"error": "الحساب غير موجود"}), 404

    return jsonify({"status": "success", "message": "تم تعديل معلومات الحساب بنجاح!"})

@app.route("/api/kounach/<int:k_id>", methods=["DELETE"])
def delete_kounach_account(k_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM kounach_operations WHERE kounach_id = ?", (k_id,))
    cursor.execute("DELETE FROM kounach WHERE id = ?", (k_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if affected == 0:
        return jsonify({"error": "الحساب غير موجود"}), 404

    return jsonify({"status": "success", "message": "تم حذف الحساب من الكناش بنجاح!"})

@app.route("/api/kounach/operations/<int:op_id>", methods=["DELETE"])
def delete_kounach_operation(op_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM kounach_operations WHERE id = ?", (op_id,))
    op = cursor.fetchone()
    if not op:
        conn.close()
        return jsonify({"error": "العملية غير موجودة"}), 404

    k_id = op["kounach_id"]
    op_type = op["type"]
    amt = float(op["amount"])

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if op_type == "credit":
        cursor.execute("UPDATE kounach SET total_due = MAX(0, total_due - ?), updated_at = ? WHERE id = ?", (amt, now_str, k_id))
    else:
        cursor.execute("UPDATE kounach SET paid_amount = MAX(0, paid_amount - ?), updated_at = ? WHERE id = ?", (amt, now_str, k_id))

    cursor.execute("DELETE FROM kounach_operations WHERE id = ?", (op_id,))
    conn.commit()
    conn.close()

    return jsonify({"status": "success", "message": "تم حذف العملية بنجاح!"})

def compute_date_bounds(period, custom_start=None, custom_end=None):
    today = datetime.now().date()
    if period == "today":
        start_date = today.strftime("%Y-%m-%d")
        end_date = today.strftime("%Y-%m-%d")
    elif period == "yesterday":
        y = today - timedelta(days=1)
        start_date = y.strftime("%Y-%m-%d")
        end_date = y.strftime("%Y-%m-%d")
    elif period == "week":
        # Monday to Sunday of current week
        start_date = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")
        end_date = (today + timedelta(days=(6 - today.weekday()))).strftime("%Y-%m-%d")
    elif period == "month":
        start_date = today.replace(day=1).strftime("%Y-%m-%d")
        # last day of month
        next_month = (today.replace(day=28) + timedelta(days=4))
        end_date = (next_month - timedelta(days=next_month.day)).strftime("%Y-%m-%d")
    elif period == "year":
        start_date = today.replace(month=1, day=1).strftime("%Y-%m-%d")
        end_date = today.replace(month=12, day=31).strftime("%Y-%m-%d")
    elif period == "custom" and custom_start and custom_end:
        start_date = custom_start
        end_date = custom_end
    else: # all time
        start_date = "2000-01-01"
        end_date = "2099-12-31"
    return start_date, end_date

@app.route("/api/summary", methods=["GET"])
def get_summary():
    period = request.args.get("period", "today")
    custom_start = request.args.get("start_date")
    custom_end = request.args.get("end_date")

    start_date, end_date = compute_date_bounds(period, custom_start, custom_end)

    conn = get_db()
    cursor = conn.cursor()

    # Period Totals
    cursor.execute("""
        SELECT 
            COALESCE(SUM(CASE WHEN type = 'mad5oul' THEN amount ELSE 0 END), 0) as total_income,
            COALESCE(SUM(CASE WHEN type = 'masrouf' THEN amount ELSE 0 END), 0) as total_expense,
            COUNT(*) as total_count
        FROM transactions
        WHERE date BETWEEN ? AND ?
    """, (start_date, end_date))
    period_stats = cursor.fetchone()

    total_income = float(period_stats["total_income"])
    total_expense = float(period_stats["total_expense"])
    net_balance = total_income - total_expense
    count = int(period_stats["total_count"])

    # Fixed Quick Counters (Today, This Week, This Month, This Year)
    today_str = datetime.now().strftime("%Y-%m-%d")
    cursor.execute("""
        SELECT 
            COALESCE(SUM(CASE WHEN type = 'mad5oul' THEN amount ELSE 0 END), 0) as inc,
            COALESCE(SUM(CASE WHEN type = 'masrouf' THEN amount ELSE 0 END), 0) as exp
        FROM transactions WHERE date = ?
    """, (today_str,))
    td = cursor.fetchone()
    today_stats = {"income": float(td["inc"]), "expense": float(td["exp"]), "balance": float(td["inc"]) - float(td["exp"])}

    w_start, w_end = compute_date_bounds("week")
    cursor.execute("""
        SELECT 
            COALESCE(SUM(CASE WHEN type = 'mad5oul' THEN amount ELSE 0 END), 0) as inc,
            COALESCE(SUM(CASE WHEN type = 'masrouf' THEN amount ELSE 0 END), 0) as exp
        FROM transactions WHERE date BETWEEN ? AND ?
    """, (w_start, w_end))
    wd = cursor.fetchone()
    week_stats = {"income": float(wd["inc"]), "expense": float(wd["exp"]), "balance": float(wd["inc"]) - float(wd["exp"])}

    m_start, m_end = compute_date_bounds("month")
    cursor.execute("""
        SELECT 
            COALESCE(SUM(CASE WHEN type = 'mad5oul' THEN amount ELSE 0 END), 0) as inc,
            COALESCE(SUM(CASE WHEN type = 'masrouf' THEN amount ELSE 0 END), 0) as exp
        FROM transactions WHERE date BETWEEN ? AND ?
    """, (m_start, m_end))
    md = cursor.fetchone()
    month_stats = {"income": float(md["inc"]), "expense": float(md["exp"]), "balance": float(md["inc"]) - float(md["exp"])}

    y_start, y_end = compute_date_bounds("year")
    cursor.execute("""
        SELECT 
            COALESCE(SUM(CASE WHEN type = 'mad5oul' THEN amount ELSE 0 END), 0) as inc,
            COALESCE(SUM(CASE WHEN type = 'masrouf' THEN amount ELSE 0 END), 0) as exp
        FROM transactions WHERE date BETWEEN ? AND ?
    """, (y_start, y_end))
    yd = cursor.fetchone()
    year_stats = {"income": float(yd["inc"]), "expense": float(yd["exp"]), "balance": float(yd["inc"]) - float(yd["exp"])}

    # Expense totals by category for Week, Month, Year (Totaux des Dépenses par Catégorie)
    cursor.execute("""
        SELECT category, SUM(amount) as total, COUNT(*) as cnt
        FROM transactions
        WHERE type = 'masrouf' AND date BETWEEN ? AND ?
        GROUP BY category
    """, (w_start, w_end))
    week_cat_rows = cursor.fetchall()
    week_cat_map = {r["category"]: float(r["total"]) for r in week_cat_rows}

    cursor.execute("""
        SELECT category, SUM(amount) as total, COUNT(*) as cnt
        FROM transactions
        WHERE type = 'masrouf' AND date BETWEEN ? AND ?
        GROUP BY category
    """, (m_start, m_end))
    month_cat_rows = cursor.fetchall()
    month_cat_map = {r["category"]: float(r["total"]) for r in month_cat_rows}

    cursor.execute("""
        SELECT category, SUM(amount) as total, COUNT(*) as cnt
        FROM transactions
        WHERE type = 'masrouf' AND date BETWEEN ? AND ?
        GROUP BY category
    """, (y_start, y_end))
    year_cat_rows = cursor.fetchall()
    year_cat_map = {r["category"]: float(r["total"]) for r in year_cat_rows}

    total_week_expense = sum(week_cat_map.values())
    total_month_expense = sum(month_cat_map.values())
    total_year_expense = sum(year_cat_map.values())

    # Get ordered expense categories from categories table
    cursor.execute("SELECT id, name FROM categories WHERE type = 'masrouf' ORDER BY display_order ASC, id ASC")
    configured_cats = [r["name"] for r in cursor.fetchall()]

    all_cat_names = list(configured_cats)
    for c in list(week_cat_map.keys()) + list(month_cat_map.keys()) + list(year_cat_map.keys()):
        if c not in all_cat_names:
            all_cat_names.append(c)

    # Fetch all Kounach accounts to compute per-category creditors stats
    cursor.execute("SELECT id, person_name, phone, category, total_due, paid_amount FROM kounach")
    all_kounach_records = cursor.fetchall()

    def match_k_to_cat(k_cat, target_cats):
        if not k_cat:
            return target_cats[0] if target_cats else "مصروف آخر"
        # 1. Exact match
        for c in target_cats:
            if k_cat.strip().lower() == c.strip().lower():
                return c
        k_l = k_cat.lower()
        if 'حليب' in k_l or 'كساب' in k_l:
            for c in target_cats:
                if 'حليب' in c or 'kssaba' in c.lower():
                    return c
        if 'أعلاف' in k_l or '3llaf' in k_l or 'تغذية' in k_l:
            for c in target_cats:
                if 'أعلاف' in c or '3llaf' in c.lower():
                    return c
        if 'نقل' in k_l or 'محروقات' in k_l or 'مازوط' in k_l or 'transport' in k_l or 'mazot' in k_l:
            for c in target_cats:
                if 'نقل' in c or 'transport' in c.lower() or 'mazot' in c.lower():
                    return c
        if 'أدوية' in k_l or 'بيطرة' in k_l or 'dwa' in k_l or 'vétérinaire' in k_l:
            for c in target_cats:
                if 'أدوية' in c or 'بيطرة' in c or 'dwa' in c.lower():
                    return c
        if 'صيانة' in k_l or 'إصلاح' in k_l or 'slla7' in k_l:
            for c in target_cats:
                if 'صيانة' in c or 'slla7' in c.lower():
                    return c
        if 'تغليف' in k_l or 'تعليب' in k_l or 'emballage' in k_l:
            for c in target_cats:
                if 'تغليف' in c or 'emballage' in c.lower():
                    return c
        return k_cat

    kounach_by_cat = {c: {"creditors_count": 0, "total_creditors": 0, "remaining_debt": 0.0, "creditors_names": []} for c in all_cat_names}

    for kr in all_kounach_records:
        k_name = kr["person_name"]
        k_cat = kr["category"] or ""
        due = float(kr["total_due"])
        paid = float(kr["paid_amount"])
        rem = max(0.0, due - paid)

        matched_cat = match_k_to_cat(k_cat, all_cat_names)
        if matched_cat not in kounach_by_cat:
            all_cat_names.append(matched_cat)
            kounach_by_cat[matched_cat] = {"creditors_count": 0, "total_creditors": 0, "remaining_debt": 0.0, "creditors_names": []}

        kounach_by_cat[matched_cat]["total_creditors"] += 1
        if rem > 0:
            kounach_by_cat[matched_cat]["creditors_count"] += 1
            kounach_by_cat[matched_cat]["remaining_debt"] += rem
            kounach_by_cat[matched_cat]["creditors_names"].append(f"{k_name} ({rem:,.2f} DH)")

    category_expense_summary = []
    for cat_name in all_cat_names:
        w_amt = week_cat_map.get(cat_name, 0.0)
        m_amt = month_cat_map.get(cat_name, 0.0)
        y_amt = year_cat_map.get(cat_name, 0.0)
        k_info = kounach_by_cat.get(cat_name, {"creditors_count": 0, "total_creditors": 0, "remaining_debt": 0.0, "creditors_names": []})

        category_expense_summary.append({
            "category": cat_name,
            "week_total": w_amt,
            "month_total": m_amt,
            "year_total": y_amt,
            "week_pct": round((w_amt / total_week_expense * 100) if total_week_expense > 0 else 0, 1),
            "month_pct": round((m_amt / total_month_expense * 100) if total_month_expense > 0 else 0, 1),
            "year_pct": round((y_amt / total_year_expense * 100) if total_year_expense > 0 else 0, 1),
            "creditors_count": k_info["creditors_count"],
            "total_creditors": k_info["total_creditors"],
            "remaining_debt": round(k_info["remaining_debt"], 2),
            "creditors_names": k_info["creditors_names"]
        })

    # Breakdown by Category for current selected period (Income)
    cursor.execute("""
        SELECT category, SUM(amount) as total, COUNT(*) as cnt
        FROM transactions
        WHERE type = 'mad5oul' AND date BETWEEN ? AND ?
        GROUP BY category
        ORDER BY total DESC
    """, (start_date, end_date))
    income_categories = [{"category": r["category"], "total": float(r["total"]), "count": r["cnt"]} for r in cursor.fetchall()]

    # Breakdown by Category for current selected period (Expense)
    cursor.execute("""
        SELECT category, SUM(amount) as total, COUNT(*) as cnt
        FROM transactions
        WHERE type = 'masrouf' AND date BETWEEN ? AND ?
        GROUP BY category
        ORDER BY total DESC
    """, (start_date, end_date))
    expense_categories = [{"category": r["category"], "total": float(r["total"]), "count": r["cnt"]} for r in cursor.fetchall()]

    # Trend calculations: Monthly for "year", Daily for other periods
    trend_type = "daily"
    if period == "year":
        trend_type = "monthly"
        current_year = datetime.now().year
        month_names = [
            ("01", "يناير (Jan)"),
            ("02", "فبراير (Fév)"),
            ("03", "مارس (Mar)"),
            ("04", "أبريل (Avr)"),
            ("05", "ماي (Mai)"),
            ("06", "يونيو (Juin)"),
            ("07", "يوليوز (Juil)"),
            ("08", "غشت (Août)"),
            ("09", "شتنبر (Sep)"),
            ("10", "أكتوبر (Oct)"),
            ("11", "نونبر (Nov)"),
            ("12", "دجنبر (Déc)")
        ]
        cursor.execute("""
            SELECT 
                strftime('%m', date) as m_num,
                COALESCE(SUM(CASE WHEN type = 'mad5oul' THEN amount ELSE 0 END), 0) as m_inc,
                COALESCE(SUM(CASE WHEN type = 'masrouf' THEN amount ELSE 0 END), 0) as m_exp
            FROM transactions
            WHERE date BETWEEN ? AND ?
            GROUP BY strftime('%m', date)
        """, (start_date, end_date))
        db_months = {r["m_num"]: (float(r["m_inc"]), float(r["m_exp"])) for r in cursor.fetchall()}

        trends = []
        for m_num, m_label in month_names:
            inc, exp = db_months.get(m_num, (0.0, 0.0))
            trends.append({
                "date": m_label,
                "month_key": f"{current_year}-{m_num}",
                "income": inc,
                "expense": exp,
                "balance": inc - exp
            })
    else:
        cursor.execute("""
            SELECT 
                date,
                COALESCE(SUM(CASE WHEN type = 'mad5oul' THEN amount ELSE 0 END), 0) as day_income,
                COALESCE(SUM(CASE WHEN type = 'masrouf' THEN amount ELSE 0 END), 0) as day_expense
            FROM transactions
            WHERE date BETWEEN ? AND ?
            GROUP BY date
            ORDER BY date ASC
        """, (start_date, end_date))
        trend_rows = cursor.fetchall()
        trends = [
            {
                "date": r["date"],
                "income": float(r["day_income"]),
                "expense": float(r["day_expense"]),
                "balance": float(r["day_income"]) - float(r["day_expense"])
            }
            for r in trend_rows
        ]

    # Kounach Quick Totals
    cursor.execute("""
        SELECT 
            COALESCE(SUM(total_due), 0) as tot_due, 
            COALESCE(SUM(paid_amount), 0) as tot_paid, 
            COUNT(*) as cnt,
            COALESCE(SUM(CASE WHEN (total_due - paid_amount) > 0 THEN (total_due - paid_amount) ELSE 0 END), 0) as tot_rem,
            COALESCE(SUM(CASE WHEN (total_due - paid_amount) > 0 THEN 1 ELSE 0 END), 0) as active_cnt
        FROM kounach
    """)
    k_stats = cursor.fetchone()
    k_due = float(k_stats["tot_due"])
    k_paid = float(k_stats["tot_paid"])
    k_rem = float(k_stats["tot_rem"])
    kounach_summary = {
        "total_due": k_due,
        "total_paid": k_paid,
        "remaining": k_rem,
        "count": int(k_stats["cnt"]),
        "active_creditors_count": int(k_stats["active_cnt"])
    }

    conn.close()

    return jsonify({
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "total_income": total_income,
        "total_expense": total_expense,
        "net_balance": net_balance,
        "transaction_count": count,
        "today": today_stats,
        "week": week_stats,
        "month": month_stats,
        "year": year_stats,
        "trend_type": trend_type,
        "income_categories": income_categories,
        "expense_categories": expense_categories,
        "category_expense_summary": category_expense_summary,
        "total_week_expense": total_week_expense,
        "total_month_expense": total_month_expense,
        "total_year_expense": total_year_expense,
        "kounach_summary": kounach_summary,
        "trends": trends
    })

@app.route("/api/transactions", methods=["GET"])
def get_transactions():
    period = request.args.get("period", "all")
    tx_type = request.args.get("type", "all")
    category = request.args.get("category", "all")
    search = request.args.get("search", "").strip()
    custom_start = request.args.get("start_date")
    custom_end = request.args.get("end_date")

    start_date, end_date = compute_date_bounds(period, custom_start, custom_end)

    query = "SELECT * FROM transactions WHERE date BETWEEN ? AND ?"
    params = [start_date, end_date]

    if tx_type in ("mad5oul", "masrouf"):
        query += " AND type = ?"
        params.append(tx_type)

    if category != "all" and category:
        query += " AND category = ?"
        params.append(category)

    if search:
        query += " AND (description LIKE ? OR category LIKE ? OR payment_method LIKE ?)"
        wildcard = f"%{search}%"
        params.extend([wildcard, wildcard, wildcard])

    query += " ORDER BY date DESC, time DESC, id DESC"

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    items = [
        {
            "id": r["id"],
            "type": r["type"],
            "category": r["category"],
            "amount": float(r["amount"]),
            "description": r["description"] or "",
            "payment_method": r["payment_method"] or "Kache / Espèces",
            "date": r["date"],
            "time": r["time"],
            "created_at": r["created_at"]
        }
        for r in rows
    ]

    return jsonify(items)

@app.route("/api/transactions", methods=["POST"])
def add_transaction():
    data = request.get_json() or {}
    tx_type = data.get("type")
    category = data.get("category", "").strip()
    amount = data.get("amount")
    description = data.get("description", "").strip()
    payment_method = data.get("payment_method", "Kache / Espèces").strip()
    date_val = data.get("date") or datetime.now().strftime("%Y-%m-%d")
    time_val = data.get("time") or datetime.now().strftime("%H:%M")

    if tx_type not in ("mad5oul", "masrouf"):
        return jsonify({"error": "Type must be 'mad5oul' or 'masrouf'"}), 400

    if not category:
        return jsonify({"error": "Category is required"}), 400

    try:
        amount_val = float(amount)
        if amount_val <= 0:
            return jsonify({"error": "Amount must be strictly positive"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid amount"}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO transactions (type, category, amount, description, payment_method, date, time)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (tx_type, category, amount_val, description, payment_method, date_val, time_val))
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({
        "status": "success",
        "message": "3amaliya tzadét b naja7!",
        "transaction_id": new_id
    }), 201

@app.route("/api/transactions/<int:tx_id>", methods=["PUT"])
def update_transaction(tx_id):
    data = request.get_json() or {}
    tx_type = data.get("type")
    category = data.get("category", "").strip()
    amount = data.get("amount")
    description = data.get("description", "").strip()
    payment_method = data.get("payment_method", "Kache / Espèces").strip()
    date_val = data.get("date")
    time_val = data.get("time")

    if tx_type not in ("mad5oul", "masrouf"):
        return jsonify({"error": "Type must be 'mad5oul' or 'masrouf'"}), 400

    try:
        amount_val = float(amount)
        if amount_val <= 0:
            return jsonify({"error": "Amount must be strictly positive"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid amount"}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE transactions
        SET type = ?, category = ?, amount = ?, description = ?, payment_method = ?, date = ?, time = ?
        WHERE id = ?
    """, (tx_type, category, amount_val, description, payment_method, date_val, time_val, tx_id))
    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if affected == 0:
        return jsonify({"error": "Transaction not found"}), 404

    return jsonify({"status": "success", "message": "Modifié avec succès!"})

@app.route("/api/transactions/<int:tx_id>", methods=["DELETE"])
def delete_transaction(tx_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()

    if affected == 0:
        return jsonify({"error": "Transaction not found"}), 404

    return jsonify({"status": "success", "message": "3amaliya tmes7at b naja7!"})

@app.route("/api/export/csv", methods=["GET"])
def export_csv():
    period = request.args.get("period", "all")
    custom_start = request.args.get("start_date")
    custom_end = request.args.get("end_date")

    start_date, end_date = compute_date_bounds(period, custom_start, custom_end)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, type, category, amount, description, payment_method, date, time
        FROM transactions
        WHERE date BETWEEN ? AND ?
        ORDER BY date DESC, time DESC
    """, (start_date, end_date))
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    # Write UTF-8 BOM so Excel opens Arabic and French accents accurately
    output.write('\ufeff')
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Naw3 (Type)", "Catégorie (النوع)", "Montant (DH / درهم)",
        "Description (الوصف)", "Paiement (طريقة الدفع)", "Date (التاريخ)", "Heure (الوقت)"
    ])

    for r in rows:
        type_label = "Mad5oul (Revenu / مدخول)" if r["type"] == "mad5oul" else "Masrouf (Dépense / مصروف)"
        writer.writerow([
            r["id"],
            type_label,
            r["category"],
            f"{r['amount']:.2f}",
            r["description"] or "",
            r["payment_method"] or "",
            r["date"],
            r["time"]
        ])

    csv_data = output.getvalue()
    filename = f"ajban_al_khair_rapport_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.route("/api/system-info", methods=["GET"])
def get_system_info():
    port = int(os.getenv("PORT", "5050"))
    local_ip = get_local_ip()
    return jsonify({
        "status": "success",
        "port": port,
        "local_ip": local_ip,
        "mobile_url": f"http://{local_ip}:{port}"
    })

@app.route("/api/sync-status", methods=["GET"])
def get_sync_status():
    import hashlib
    # Compute app version hash from static and template files
    files_to_track = [
        os.path.join(BASE_DIR, "templates", "index.html"),
        os.path.join(BASE_DIR, "static", "css", "style.css"),
        os.path.join(BASE_DIR, "static", "js", "app.js"),
        os.path.join(BASE_DIR, "static", "manifest.json"),
        os.path.join(BASE_DIR, "static", "sw.js")
    ]
    v_raw = []
    for fp in files_to_track:
        if os.path.exists(fp):
            v_raw.append(f"{os.path.basename(fp)}:{int(os.path.getmtime(fp))}")
    app_version = hashlib.md5(";".join(v_raw).encode("utf-8")).hexdigest()[:12]

    # Compute data fingerprint from database tables
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*), COALESCE(SUM(amount), 0), COALESCE(MAX(id), 0) FROM transactions")
    tx_c, tx_s, tx_m = cursor.fetchone()

    cursor.execute("SELECT COUNT(*), COALESCE(SUM(total_due), 0), COALESCE(SUM(paid_amount), 0), COALESCE(MAX(id), 0) FROM kounach")
    k_c, k_due, k_paid, k_m = cursor.fetchone()

    cursor.execute("SELECT COUNT(*), COALESCE(SUM(amount), 0), COALESCE(MAX(id), 0) FROM kounach_operations")
    op_c, op_s, op_m = cursor.fetchone()

    cursor.execute("SELECT COUNT(*), COALESCE(MAX(id), 0), COALESCE(MAX(display_order), 0) FROM categories")
    cat_c, cat_m, cat_o = cursor.fetchone()
    conn.close()

    raw_data_str = f"tx:{tx_c}-{tx_s:.2f}-{tx_m};k:{k_c}-{k_due:.2f}-{k_paid:.2f}-{k_m};op:{op_c}-{op_s:.2f}-{op_m};cat:{cat_c}-{cat_m}-{cat_o}"
    data_fingerprint = hashlib.md5(raw_data_str.encode("utf-8")).hexdigest()[:12]

    return jsonify({
        "status": "success",
        "app_version": app_version,
        "data_fingerprint": data_fingerprint,
        "server_time": datetime.now().isoformat()
    })

if __name__ == "__main__":
    init_db()
    port = int(os.getenv("PORT", "5050"))
    local_ip = get_local_ip()
    print("\n" + "="*60)
    print(" 🥛 تعاونية أجبان الخير - Coopérative Ajban Al Khair 🧀")
    print("="*60)
    print(f" 💻 L-PC (Browser):    http://localhost:{port}")
    print(f" 📱 L-Tilifon (Wi-Fi): http://{local_ip}:{port}")
    print("="*60 + "\n")
    app.run(host="0.0.0.0", port=port, debug=False)
