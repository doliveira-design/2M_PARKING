// ============================================
// 2M Parking — Migração Unificada & Idempotente
// Uso: node scripts/migrate-all.js
// ============================================
const sql = require("mssql");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const dbConfig = {
  server: process.env.DB_SERVER || "localhost",
  port: parseInt(process.env.DB_PORT || "1433"),
  database: process.env.DB_NAME || "MParking",
  user: process.env.DB_USER || "mparking_app",
  password: process.env.DB_PASSWORD || "MParking@2026!",
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
};

// Cada migração: { id, name, up(pool) }
// O id é sequencial e NUNCA muda. Name é descritivo.
const migrations = [
  {
    id: 1,
    name: "base_tables",
    up: async (pool) => {
      // valets
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='valets')
        CREATE TABLE valets (
          id INT IDENTITY(1,1) PRIMARY KEY,
          uname NVARCHAR(50) NOT NULL UNIQUE,
          pwd NVARCHAR(255) NOT NULL,
          role NVARCHAR(20) NOT NULL DEFAULT 'operador',
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      // counters
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='counters')
        CREATE TABLE counters (
          name NVARCHAR(50) PRIMARY KEY,
          current_value INT NOT NULL DEFAULT 0
        )`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM counters WHERE name='tickets')
        INSERT INTO counters(name, current_value) VALUES('tickets', 0)`);
      // parking_units
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='parking_units')
        CREATE TABLE parking_units (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(100) NOT NULL,
          capacity INT NOT NULL DEFAULT 100,
          current_count INT NOT NULL DEFAULT 0,
          active BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM parking_units WHERE id=1)
        INSERT INTO parking_units(name, capacity) VALUES('Unidade Principal', 100)`);
      // tickets
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='tickets')
        CREATE TABLE tickets (
          id INT IDENTITY(1,1) PRIMARY KEY,
          ticket_no NVARCHAR(20) NOT NULL UNIQUE,
          first_name NVARCHAR(100),
          last_name NVARCHAR(100),
          phone_no NVARCHAR(50),
          reg_no NVARCHAR(20) NOT NULL,
          manufacturer NVARCHAR(50),
          model NVARCHAR(50),
          color NVARCHAR(30),
          unit_id INT DEFAULT 1 REFERENCES parking_units(id),
          status NVARCHAR(20) NOT NULL DEFAULT 'active',
          paid BIT NOT NULL DEFAULT 0,
          payment_method NVARCHAR(20),
          amount DECIMAL(10,2),
          paid_at DATETIME2,
          exit_time DATETIME2,
          created_at DATETIME2 DEFAULT GETDATE(),
          updated_at DATETIME2 DEFAULT GETDATE()
        )`);
    },
  },
  {
    id: 2,
    name: "audit_whitelist_blacklist_pricing",
    up: async (pool) => {
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='audit_logs')
        CREATE TABLE audit_logs (
          id INT IDENTITY(1,1) PRIMARY KEY,
          action NVARCHAR(50) NOT NULL,
          user_id INT,
          user_role NVARCHAR(20),
          details NVARCHAR(MAX),
          ip NVARCHAR(45),
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='whitelist')
        CREATE TABLE whitelist (
          id INT IDENTITY(1,1) PRIMARY KEY,
          reg_no NVARCHAR(20) NOT NULL,
          description NVARCHAR(200),
          created_by INT,
          active BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='blacklist')
        CREATE TABLE blacklist (
          id INT IDENTITY(1,1) PRIMARY KEY,
          reg_no NVARCHAR(20) NOT NULL,
          description NVARCHAR(200),
          created_by INT,
          active BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='pricing_config')
        CREATE TABLE pricing_config (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(100),
          price_per_hour DECIMAL(10,2) NOT NULL DEFAULT 5.00,
          max_daily DECIMAL(10,2) NOT NULL DEFAULT 40.00,
          tolerance_minutes INT NOT NULL DEFAULT 15,
          active BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM pricing_config WHERE id=1)
        INSERT INTO pricing_config(name, price_per_hour, max_daily, tolerance_minutes) VALUES('Padrao', 5.00, 40.00, 15)`);
    },
  },
  {
    id: 3,
    name: "payments_table",
    up: async (pool) => {
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='payments')
        CREATE TABLE payments (
          id INT IDENTITY(1,1) PRIMARY KEY,
          session_id INT REFERENCES tickets(id),
          ticket_no NVARCHAR(20) NOT NULL,
          gateway_id NVARCHAR(100),
          method NVARCHAR(20) NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          status NVARCHAR(20) NOT NULL DEFAULT 'completed',
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
    },
  },
  {
    id: 4,
    name: "system_config_table",
    up: async (pool) => {
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='system_config')
        CREATE TABLE system_config (
          config_key NVARCHAR(100) PRIMARY KEY,
          config_value NVARCHAR(MAX),
          updated_at DATETIME2 DEFAULT GETDATE()
        )`);
      const defaults = [
        ["alerts_enabled", "false"],
        ["alerts_events", "payment,entry,exit,occupancy_high"],
        ["alerts_webhook_url", ""],
        ["grace_period_minutes", "15"],
        ["occupancy_alert_threshold", "90"],
      ];
      for (const [k, v] of defaults) {
        await pool.request()
          .input("k", sql.NVarChar, k).input("v", sql.NVarChar, v)
          .query("IF NOT EXISTS (SELECT 1 FROM system_config WHERE config_key=@k) INSERT INTO system_config(config_key, config_value) VALUES(@k, @v)");
      }
    },
  },
  {
    id: 5,
    name: "updated_at_trigger",
    up: async (pool) => {
      // Add updated_at column if missing
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='tickets' AND COLUMN_NAME='updated_at')
        ALTER TABLE tickets ADD updated_at DATETIME2 DEFAULT GETDATE()`);
      // Trigger to auto-update updated_at
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE name='trg_tickets_updated_at')
        EXEC('CREATE TRIGGER trg_tickets_updated_at ON tickets AFTER UPDATE AS
          UPDATE t SET updated_at = GETDATE() FROM tickets t INNER JOIN inserted i ON t.id = i.id')`);
    },
  },
  {
    id: 6,
    name: "totem_tables",
    up: async (pool) => {
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='totem_devices')
        CREATE TABLE totem_devices (
          id INT IDENTITY(1,1) PRIMARY KEY,
          device_name NVARCHAR(100) NOT NULL,
          api_key NVARCHAR(255) NOT NULL,
          api_key_prefix NVARCHAR(8) NOT NULL,
          unit_id INT NOT NULL DEFAULT 1 REFERENCES parking_units(id),
          is_active BIT NOT NULL DEFAULT 1,
          last_heartbeat DATETIME2,
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='totem_transactions')
        CREATE TABLE totem_transactions (
          id INT IDENTITY(1,1) PRIMARY KEY,
          device_id INT NOT NULL REFERENCES totem_devices(id),
          ticket_no NVARCHAR(20),
          session_id INT,
          action NVARCHAR(30) NOT NULL,
          amount DECIMAL(10,2),
          method NVARCHAR(20),
          metadata NVARCHAR(MAX),
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      // Index
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_totem_tx_device_date')
        CREATE INDEX IX_totem_tx_device_date ON totem_transactions(device_id, created_at DESC)`);
      // System config for totem
      const totemConfigs = [
        ["totem_enabled", "true"],
        ["totem_idle_timeout_seconds", "30"],
      ];
      for (const [k, v] of totemConfigs) {
        await pool.request()
          .input("k", sql.NVarChar, k).input("v", sql.NVarChar, v)
          .query("IF NOT EXISTS (SELECT 1 FROM system_config WHERE config_key=@k) INSERT INTO system_config(config_key, config_value) VALUES(@k, @v)");
      }
    },
  },
  {
    id: 7,
    name: "phase4_lpr_barrier_gateway",
    up: async (pool) => {
      // LPR devices (cameras)
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='lpr_devices')
        CREATE TABLE lpr_devices (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(100) NOT NULL,
          location NVARCHAR(100),
          ip_address NVARCHAR(45),
          api_key NVARCHAR(255) NOT NULL,
          api_key_prefix NVARCHAR(8) NOT NULL,
          unit_id INT NOT NULL DEFAULT 1 REFERENCES parking_units(id),
          type NVARCHAR(10) NOT NULL DEFAULT 'entry' CHECK (type IN ('entry','exit')),
          is_active BIT NOT NULL DEFAULT 1,
          last_heartbeat DATETIME2,
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      // LPR events (plate detections)
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='lpr_events')
        CREATE TABLE lpr_events (
          id INT IDENTITY(1,1) PRIMARY KEY,
          device_id INT NOT NULL REFERENCES lpr_devices(id),
          plate_detected NVARCHAR(10) NOT NULL,
          confidence DECIMAL(5,2),
          event_type NVARCHAR(10) NOT NULL DEFAULT 'entry' CHECK (event_type IN ('entry','exit','unknown')),
          matched_ticket_id INT,
          action_taken NVARCHAR(30),
          photo_path NVARCHAR(500),
          metadata NVARCHAR(MAX),
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_lpr_events_plate')
        CREATE INDEX IX_lpr_events_plate ON lpr_events(plate_detected, created_at DESC)`);
      // Barrier devices (gates)
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='barrier_devices')
        CREATE TABLE barrier_devices (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(100) NOT NULL,
          type NVARCHAR(10) NOT NULL DEFAULT 'entry' CHECK (type IN ('entry','exit')),
          control_url NVARCHAR(500),
          unit_id INT NOT NULL DEFAULT 1 REFERENCES parking_units(id),
          status NVARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online','offline','error','stuck')),
          is_active BIT NOT NULL DEFAULT 1,
          last_heartbeat DATETIME2,
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      // Barrier events (open/close/error logs)
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='barrier_events')
        CREATE TABLE barrier_events (
          id INT IDENTITY(1,1) PRIMARY KEY,
          barrier_id INT NOT NULL REFERENCES barrier_devices(id),
          action NVARCHAR(20) NOT NULL CHECK (action IN ('open','close','error','stuck','timeout')),
          triggered_by NVARCHAR(30) NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual','lpr','payment','system','api')),
          ticket_no NVARCHAR(20),
          operator_id INT,
          metadata NVARCHAR(MAX),
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_barrier_events_barrier')
        CREATE INDEX IX_barrier_events_barrier ON barrier_events(barrier_id, created_at DESC)`);
      // PIX transactions (gateway-specific tracking)
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='pix_transactions')
        CREATE TABLE pix_transactions (
          id INT IDENTITY(1,1) PRIMARY KEY,
          ticket_no NVARCHAR(20) NOT NULL,
          payment_id INT,
          gateway_payment_id NVARCHAR(100),
          qr_code NVARCHAR(MAX),
          qr_code_base64 NVARCHAR(MAX),
          amount DECIMAL(10,2) NOT NULL,
          status NVARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','expired','failed','cancelled')),
          expires_at DATETIME2,
          confirmed_at DATETIME2,
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_pix_tx_ticket')
        CREATE INDEX IX_pix_tx_ticket ON pix_transactions(ticket_no, created_at DESC)`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_pix_tx_gateway')
        CREATE INDEX IX_pix_tx_gateway ON pix_transactions(gateway_payment_id)`);
      // Card transactions (TEF tracking)
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='card_transactions')
        CREATE TABLE card_transactions (
          id INT IDENTITY(1,1) PRIMARY KEY,
          ticket_no NVARCHAR(20) NOT NULL,
          payment_id INT,
          gateway_payment_id NVARCHAR(100),
          card_last4 NVARCHAR(4),
          card_brand NVARCHAR(30),
          installments INT NOT NULL DEFAULT 1,
          auth_code NVARCHAR(50),
          amount DECIMAL(10,2) NOT NULL,
          status NVARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','authorized','captured','failed','refunded','cancelled')),
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_card_tx_ticket')
        CREATE INDEX IX_card_tx_ticket ON card_transactions(ticket_no, created_at DESC)`);
      // Payment gateway configuration
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='payment_gateway_config')
        CREATE TABLE payment_gateway_config (
          id INT IDENTITY(1,1) PRIMARY KEY,
          provider NVARCHAR(50) NOT NULL,
          access_token_enc NVARCHAR(500),
          webhook_secret NVARCHAR(255),
          sandbox BIT NOT NULL DEFAULT 1,
          is_active BIT NOT NULL DEFAULT 1,
          created_at DATETIME2 DEFAULT GETDATE()
        )`);
      // System config for Phase 4 features
      const phase4Configs = [
        ["lpr_enabled", "true"],
        ["barrier_enabled", "true"],
        ["payment_gateway_provider", "mercadopago"],
        ["payment_gateway_sandbox", "true"],
        ["pix_expiration_minutes", "30"],
      ];
      for (const [k, v] of phase4Configs) {
        await pool.request()
          .input("k", sql.NVarChar, k).input("v", sql.NVarChar, v)
          .query("IF NOT EXISTS (SELECT 1 FROM system_config WHERE config_key=@k) INSERT INTO system_config(config_key, config_value) VALUES(@k, @v)");
      }
    },
  },
];

async function runMigrations() {
  console.log("=== 2M Parking — Migração Unificada ===\n");
  const pool = await sql.connect(dbConfig);

  // Create migrations tracking table
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='_migrations')
    CREATE TABLE _migrations (
      id INT PRIMARY KEY,
      name NVARCHAR(100) NOT NULL,
      applied_at DATETIME2 DEFAULT GETDATE()
    )`);

  // Get already applied
  const applied = await pool.request().query("SELECT id FROM _migrations");
  const appliedIds = new Set(applied.recordset.map((r) => r.id));

  let ran = 0;
  for (const m of migrations) {
    if (appliedIds.has(m.id)) {
      console.log(`  ⊘ #${m.id} ${m.name} (já aplicada)`);
      continue;
    }
    try {
      await m.up(pool);
      await pool.request()
        .input("id", sql.Int, m.id)
        .input("name", sql.NVarChar, m.name)
        .query("INSERT INTO _migrations(id, name) VALUES(@id, @name)");
      console.log(`  ✓ #${m.id} ${m.name}`);
      ran++;
    } catch (err) {
      console.error(`  ✗ #${m.id} ${m.name}: ${err.message}`);
      await pool.close();
      process.exit(1);
    }
  }

  // Summary
  const tables = await pool.request().query(
    "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'"
  );
  console.log(`\n  Total tabelas: ${tables.recordset[0].cnt}`);
  console.log(`  Migrações aplicadas agora: ${ran}`);
  console.log(`  Total migrações no histórico: ${appliedIds.size + ran}\n`);

  await pool.close();
  console.log("=== Migração concluída ===");
}

runMigrations().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
