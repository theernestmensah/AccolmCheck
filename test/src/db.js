// Storage for scan history. SQLite by default (no setup); MySQL when DB_DRIVER=mysql.
// Every query uses placeholders (?) so user input is never pasted into SQL text.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function newPublicId() { return crypto.randomBytes(9).toString('base64url').slice(0, 12); }

function rowToSummary(r) {
  return { id: r.public_id, url: r.url, finalUrl: r.final_url, host: r.host, title: r.page_title, score: r.score, band: r.band,
    pass: r.pass_count, warn: r.warn_count, fail: r.fail_count, demo: !!r.is_demo, createdAt: r.created_at };
}

async function createDb(opts = {}) {
  const driver = (opts.driver || process.env.DB_DRIVER || 'sqlite').toLowerCase();
  if (driver === 'mysql') return createMysql(opts);
  return createSqlite(opts);
}

function createSqlite(opts) {
  const Database = require('better-sqlite3');
  // Vercel's code folder is read-only; only the temporary folder can be written there.
  const fallback = process.env.VERCEL ? path.join(os.tmpdir(), 'accolm-check.db') : path.join(__dirname, '..', 'data', 'accolm-check.db');
  const file = opts.file || process.env.SQLITE_FILE || fallback;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sqlite.sql'), 'utf8'));
  const insScan = db.prepare(`INSERT INTO scans (public_id,url,final_url,host,page_title,score,band,pass_count,warn_count,fail_count,is_demo,result_json)
                              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insFinding = db.prepare('INSERT INTO findings (scan_id,check_id,principle,status,weight) VALUES (?,?,?,?,?)');
  const saveTx = db.transaction((r, demo) => {
    const pid = newPublicId();
    const info = insScan.run(pid, r.url, r.finalUrl, new URL(r.finalUrl).hostname, r.title, r.score, r.band.key,
      r.counts.pass, r.counts.warn, r.counts.fail, demo ? 1 : 0, JSON.stringify(r));
    for (const f of r.findings) insFinding.run(info.lastInsertRowid, f.id, f.principle, f.status, f.weight);
    return pid;
  });
  const getOne = db.prepare('SELECT * FROM scans WHERE public_id = ?');
  const list = db.prepare('SELECT * FROM scans ORDER BY id DESC LIMIT ?');
  return {
    driver: 'sqlite',
    async saveScan(r, demo = false) { return saveTx(r, demo); },
    async getScan(pid) { const row = getOne.get(pid); return row ? { ...rowToSummary(row), result: JSON.parse(row.result_json) } : null; },
    async listScans(limit = 50) { return list.all(limit).map(rowToSummary); },
    async close() { db.close(); },
  };
}

async function createMysql(opts) {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'accolmcheck', connectionLimit: 5,
  });
  return {
    driver: 'mysql',
    async saveScan(r, demo = false) {
      const pid = newPublicId();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [res] = await conn.execute(
          `INSERT INTO scans (public_id,url,final_url,host,page_title,score,band,pass_count,warn_count,fail_count,is_demo,result_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [pid, r.url, r.finalUrl, new URL(r.finalUrl).hostname, r.title, r.score, r.band.key, r.counts.pass, r.counts.warn, r.counts.fail, demo ? 1 : 0, JSON.stringify(r)]);
        for (const f of r.findings) {
          await conn.execute('INSERT INTO findings (scan_id,check_id,principle,status,weight) VALUES (?,?,?,?,?)', [res.insertId, f.id, f.principle, f.status, f.weight]);
        }
        await conn.commit();
        return pid;
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    },
    async getScan(pid) {
      const [rows] = await pool.execute('SELECT * FROM scans WHERE public_id = ?', [pid]);
      return rows[0] ? { ...rowToSummary(rows[0]), result: JSON.parse(rows[0].result_json) } : null;
    },
    async listScans(limit = 50) {
      const [rows] = await pool.query('SELECT * FROM scans ORDER BY id DESC LIMIT ?', [Number(limit)]);
      return rows.map(rowToSummary);
    },
    async close() { await pool.end(); },
  };
}

module.exports = { createDb };
