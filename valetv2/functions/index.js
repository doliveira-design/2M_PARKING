require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sql = require("mssql");
const http = require("http");
const https = require("https");
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");

const APP_VERSION = "2.2.0";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ============================================
// Validação de variáveis obrigatórias em produção
// ============================================
if (IS_PRODUCTION) {
  const required = ["DB_PASSWORD", "JWT_SECRET", "SETUP_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[FATAL] Variáveis obrigatórias ausentes em produção: ${missing.join(", ")}`);
    console.error("Crie o arquivo .env com base em .env.example e reinicie.");
    process.exit(1);
  }
}

const app = express();

// ============================================
// Logging Estruturado
// ============================================
const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || "INFO"] || LOG_LEVELS.INFO;

function log(level, message, meta) {
  if (LOG_LEVELS[level] > CURRENT_LOG_LEVEL) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (meta) entry.meta = meta;
  const line = `[${entry.timestamp}] [${level}] ${message}${meta ? " " + JSON.stringify(meta) : ""}`;
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

// Request logging middleware
function requestLogger(req, res, next) {
  const start = Date.now();
  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - start;
    log("INFO", `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, {
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] ? req.headers["user-agent"].substring(0, 80) : undefined,
    });
    originalEnd.apply(res, args);
  };
  next();
}

// ============================================
// Configuração de Segurança
// ============================================
const JWT_SECRET = process.env.JWT_SECRET || "2m-parking-secret-key-2026";
const JWT_EXPIRATION = "24h";
const SETUP_KEY = process.env.SETUP_KEY || "2m-parking-setup-2026";
const BCRYPT_ROUNDS = 10;

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : ["http://localhost:4200"];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Totem-Key"],
}));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true } : false,
}));
if (IS_PRODUCTION) {
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
}
app.use(compression());
app.use(express.json());
app.use(requestLogger);

// Rate limiting — geral (200 req / 15 min por IP, exclui /health)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/health" || req.path.startsWith("/api/v1/totem/"),
  message: { error: "Muitas requisições. Tente novamente em alguns minutos." },
});
app.use(generalLimiter);

// Rate limiting — login (10 tentativas / 15 min por IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas de login. Tente novamente em 15 minutos." },
});

// Rate limiting — totem (30 req / min por API key prefix)
const totemLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers["x-totem-key"] ? req.headers["x-totem-key"].substring(0, 8) : getClientIp(req),
  message: { error: "Limite de requisições do totem excedido." },
});

// Rate limiting — totem pagamento (5 req / min por API key prefix)
const totemPayLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers["x-totem-key"] ? req.headers["x-totem-key"].substring(0, 8) : getClientIp(req),
  message: { error: "Limite de pagamentos excedido. Aguarde." },
});

// ============================================
// Configuração do SQL Server
// ============================================
const dbConfig = {
  server: process.env.DB_SERVER || "localhost",
  port: parseInt(process.env.DB_PORT || "1433"),
  database: process.env.DB_NAME || "MParking",
  user: process.env.DB_USER || "mparking_app",
  password: process.env.DB_PASSWORD || "MParking@2026!",
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_ENCRYPT !== "true",
    enableArithAbort: true,
  },
};

let pool;
let poolReconnecting = false;
let poolReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

async function getPool() {
  if (pool) {
    try {
      // Verify pool is alive
      if (!pool.connected) throw new Error("Pool disconnected");
      return pool;
    } catch (e) {
      log("WARN", "Pool check failed, resetting", { error: e.message });
      pool = null;
    }
  }

  if (poolReconnecting) {
    const err = new Error("Database reconnecting");
    err.code = "DB_RECONNECTING";
    throw err;
  }

  poolReconnecting = true;
  try {
    const backoffMs = Math.min(1000 * Math.pow(2, poolReconnectAttempts), 8000);
    if (poolReconnectAttempts > 0) {
      log("INFO", `Pool reconnect attempt ${poolReconnectAttempts + 1}, backoff ${backoffMs}ms`);
      await new Promise(r => setTimeout(r, backoffMs));
    }
    pool = await sql.connect(dbConfig);
    poolReconnectAttempts = 0;
    poolReconnecting = false;
    log("INFO", "Database pool connected");
    return pool;
  } catch (e) {
    poolReconnectAttempts = Math.min(poolReconnectAttempts + 1, MAX_RECONNECT_ATTEMPTS);
    poolReconnecting = false;
    pool = null;
    log("ERROR", "Database connection failed", { error: e.message, attempt: poolReconnectAttempts });
    sendAlert("system_error", { type: "db_connection_failed", message: e.message, attempt: poolReconnectAttempts });
    const err = new Error("Database unavailable");
    err.code = "DB_UNAVAILABLE";
    throw err;
  }
}

// ============================================
// Cache em Memória com TTL
// ============================================
const cache = {
  _store: new Map(),
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this._store.delete(key); return null; }
    return entry.value;
  },
  set(key, value, ttlMs) {
    this._store.set(key, { value, expiresAt: Date.now() + ttlMs });
  },
  invalidate(key) {
    this._store.delete(key);
  },
  invalidatePrefix(prefix) {
    for (const k of this._store.keys()) {
      if (k.startsWith(prefix)) this._store.delete(k);
    }
  },
};

// ============================================
// Helpers: Telefone
// ============================================
function stripPhone(phone) {
  return (phone || "").replace(/\D/g, "");
}

function formatPhone(phone) {
  const digits = stripPhone(phone);
  if (digits.length < 12 || digits.length > 13) return phone;
  const cc = digits.substring(0, 2);
  const ac = digits.substring(2, 4);
  const rest = digits.substring(4);
  const p1 = rest.length === 9 ? rest.substring(0, 5) : rest.substring(0, 4);
  const p2 = rest.length === 9 ? rest.substring(5) : rest.substring(4);
  return `+${cc} (${ac}) ${p1}-${p2}`;
}

function phonesMatch(a, b) {
  return stripPhone(a) === stripPhone(b);
}

// ============================================
// Helpers: Placa
// ============================================
function stripPlateChars(plate) {
  return (plate || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function isValidPlate(plate) {
  const c = stripPlateChars(plate);
  if (c.length !== 7) return false;
  return /^[A-Z]{3}[0-9]{4}$/.test(c) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(c);
}

// ============================================
// Helper: JWT e Auth
// ============================================
function verifyToken(req) {
  const token = req.headers.authorization;
  if (!token) throw new Error("No token provided");
  return jwt.verify(token, JWT_SECRET);
}

function requireRole(req, ...roles) {
  const decoded = verifyToken(req);
  if (!roles.includes(decoded.role)) {
    const err = new Error("Insufficient permissions");
    err.status = 403;
    throw err;
  }
  return decoded;
}

function getClientIp(req) {
  return req.headers["x-forwarded-for"] || req.connection.remoteAddress || "";
}

// ============================================
// Helper: Audit Log
// ============================================
async function auditLog(action, userId, userRole, details, ip) {
  try {
    const db = await getPool();
    await db.request()
      .input("action", sql.NVarChar, action)
      .input("user_id", sql.Int, userId || null)
      .input("user_role", sql.NVarChar, userRole || null)
      .input("details", sql.NVarChar, details || null)
      .input("ip", sql.NVarChar, ip || null)
      .query("INSERT INTO audit_logs (action, user_id, user_role, details, ip) VALUES (@action, @user_id, @user_role, @details, @ip)");
  } catch (e) {
    log("ERROR", "Audit log error", { error: e.message });
  }
}

// ============================================
// Helper: Enviar Alerta via Webhook
// ============================================
async function sendAlert(eventType, payload) {
  try {
    const db = await getPool();
    const cfgRows = await db.request()
      .query("SELECT config_key, config_value FROM system_config WHERE config_key IN ('alerts_enabled','alerts_webhook_url','alerts_events')");

    const cfg = {};
    for (const row of cfgRows.recordset) {
      cfg[row.config_key] = row.config_value;
    }

    if (cfg.alerts_enabled !== "true") return;
    if (!cfg.alerts_webhook_url) return;

    const allowedEvents = (cfg.alerts_events || "").split(",").map(e => e.trim());
    if (!allowedEvents.includes(eventType)) return;

    const body = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    const url = new URL(cfg.alerts_webhook_url);
    const mod = url.protocol === "https:" ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 5000,
    };

    const req = mod.request(options, (res) => {
      log("DEBUG", `Alert webhook response: ${res.statusCode}`, { event: eventType });
    });
    req.on("error", (err) => {
      log("WARN", "Alert webhook failed", { event: eventType, error: err.message });
    });
    req.on("timeout", () => { req.destroy(); });
    req.write(body);
    req.end();
  } catch (e) {
    log("WARN", "sendAlert error", { event: eventType, error: e.message });
  }
}

// ============================================
// Helper: Calcular preço por tempo
// ============================================
async function calculatePrice(entryTime) {
  let pricing = cache.get("pricing_config");
  if (!pricing) {
    const db = await getPool();
    const cfg = await db.request()
      .query("SELECT TOP 1 * FROM pricing_config WHERE active = 1 ORDER BY id");
    pricing = cfg.recordset.length > 0 ? cfg.recordset[0] : null;
    cache.set("pricing_config", pricing, 5 * 60 * 1000); // 5 min TTL
  }

  let pricePerHour = 10.00;
  let maxDaily = 50.00;
  let toleranceMin = 15;

  if (pricing) {
    pricePerHour = parseFloat(pricing.price_per_hour);
    maxDaily = parseFloat(pricing.max_daily);
    toleranceMin = pricing.tolerance_minutes;
  }

  // Calcula diff no SQL Server para evitar mismatch de timezone (GETDATE vs JS Date.now)
  const db = await getPool();
  const diffResult = await db.request()
    .input("entry_time", sql.DateTime2, entryTime)
    .query("SELECT DATEDIFF(MINUTE, @entry_time, GETDATE()) AS diff_min");
  const diffMin = diffResult.recordset[0].diff_min;

  if (diffMin <= toleranceMin) return 0;

  const hours = Math.ceil((diffMin - toleranceMin) / 60);
  const calculated = hours * pricePerHour;
  return Math.min(calculated, maxDaily);
}

// ============================================
// Helper: Detect DB errors → 503
// ============================================
function isDbError(error) {
  if (error.code === "DB_UNAVAILABLE" || error.code === "DB_RECONNECTING") return true;
  if (error.code === "ECONNCLOSED" || error.code === "ECONNREFUSED" || error.code === "ETIMEOUT") return true;
  if (error instanceof sql.ConnectionError) return true;
  if (error.message && error.message.includes("Pool disconnected")) return true;
  return false;
}

// ============================================
// Helper: Error response
// ============================================
function handleAuthError(error, res) {
  if (error.message === "No token provided") {
    return res.status(401).json({error: "Unauthorized"});
  }
  if (error.status === 403) {
    return res.status(403).json({error: error.message});
  }
  if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
    return res.status(401).json({error: "Invalid or expired token"});
  }
  if (isDbError(error)) {
    res.set("Retry-After", "10");
    return res.status(503).json({error: "Serviço temporariamente indisponível. Tente novamente."});
  }
  return null;
}

// ============================================
// Payment Gateway: Mercado Pago Abstraction
// ============================================
let mpClient = null;
let mpPayment = null;

function getMercadoPago() {
  if (mpClient) return { client: mpClient, payment: mpPayment };
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    log("WARN", "MP_ACCESS_TOKEN not configured — gateway payments will use SANDBOX MOCK");
    return null;
  }
  const { MercadoPagoConfig, Payment } = require("mercadopago");
  mpClient = new MercadoPagoConfig({ accessToken });
  mpPayment = new Payment(mpClient);
  log("INFO", "Mercado Pago gateway initialized");
  return { client: mpClient, payment: mpPayment };
}

// Gerar cobrança PIX via Mercado Pago (ou mock no sandbox)
async function createPixCharge(ticketNo, amount, expirationMinutes) {
  const mp = getMercadoPago();
  const expiresAt = new Date(Date.now() + expirationMinutes * 60000);

  if (!mp) {
    // SANDBOX MOCK: simula QR code para desenvolvimento
    const mockId = `MOCK_PIX_${Date.now()}`;
    return {
      gateway_payment_id: mockId,
      qr_code: `00020126580014br.gov.bcb.pix0136mock-${ticketNo}-${Date.now()}5204000053039865802BR5913MOCK2MPARKING6009SAO_PAULO62070503***6304MOCK`,
      qr_code_base64: Buffer.from(`MOCK_QR_${ticketNo}_${amount}`).toString("base64"),
      amount,
      status: "pending",
      expires_at: expiresAt,
    };
  }

  const body = {
    transaction_amount: parseFloat(amount.toFixed(2)),
    description: `2M Parking - Ticket ${ticketNo}`,
    payment_method_id: "pix",
    payer: { email: `ticket_${ticketNo}@2mparking.local` },
    date_of_expiration: expiresAt.toISOString(),
  };
  const result = await mpPayment.create({ body });
  return {
    gateway_payment_id: String(result.id),
    qr_code: result.point_of_interaction?.transaction_data?.qr_code || "",
    qr_code_base64: result.point_of_interaction?.transaction_data?.qr_code_base64 || "",
    amount,
    status: result.status === "approved" ? "approved" : "pending",
    expires_at: expiresAt,
  };
}

// Consultar status de pagamento PIX
async function checkPixStatus(gatewayPaymentId) {
  if (gatewayPaymentId.startsWith("MOCK_PIX_")) {
    return { status: "pending", gateway_payment_id: gatewayPaymentId };
  }
  const mp = getMercadoPago();
  if (!mp) return { status: "pending", gateway_payment_id: gatewayPaymentId };
  const result = await mpPayment.get({ id: gatewayPaymentId });
  return {
    status: result.status === "approved" ? "approved" : result.status === "cancelled" ? "cancelled" : result.status === "rejected" ? "failed" : "pending",
    gateway_payment_id: gatewayPaymentId,
  };
}

// Autorizar pagamento com cartão via Mercado Pago (ou mock)
async function authorizeCard(ticketNo, amount, cardToken, installments, payerEmail) {
  const mp = getMercadoPago();

  if (!mp) {
    // SANDBOX MOCK
    const mockId = `MOCK_CARD_${Date.now()}`;
    return {
      gateway_payment_id: mockId,
      card_last4: "0000",
      card_brand: "mock_visa",
      auth_code: `AUTH_${Date.now().toString(36).toUpperCase()}`,
      amount,
      status: "authorized",
      installments: installments || 1,
    };
  }

  const body = {
    transaction_amount: parseFloat(amount.toFixed(2)),
    description: `2M Parking - Ticket ${ticketNo}`,
    payment_method_id: "credit_card",
    token: cardToken,
    installments: installments || 1,
    payer: { email: payerEmail || `ticket_${ticketNo}@2mparking.local` },
    capture: true,
  };
  const result = await mpPayment.create({ body });
  return {
    gateway_payment_id: String(result.id),
    card_last4: result.card?.last_four_digits || "",
    card_brand: result.payment_method_id || "",
    auth_code: result.authorization_code || "",
    amount,
    status: result.status === "approved" ? "authorized" : "failed",
    installments: result.installments || 1,
  };
}

// Estorno/cancelamento de pagamento
async function refundPayment(gatewayPaymentId, amount) {
  if (gatewayPaymentId.startsWith("MOCK_")) {
    return { status: "refunded", gateway_payment_id: gatewayPaymentId };
  }
  const mp = getMercadoPago();
  if (!mp) return { status: "refunded", gateway_payment_id: gatewayPaymentId };
  const { Refund } = require("mercadopago");
  const refundClient = new Refund(mpClient);
  const body = amount ? { amount: parseFloat(amount.toFixed(2)) } : {};
  await refundClient.create({ payment_id: gatewayPaymentId, body });
  return { status: "refunded", gateway_payment_id: gatewayPaymentId };
}

// ============================================
// Helper: Autenticação LPR via X-LPR-Key
// ============================================
async function authenticateLpr(req, res, next) {
  try {
    let lprEnabled = cache.get("lpr_enabled");
    if (lprEnabled === null) {
      const db = await getPool();
      const cfgRes = await db.request()
        .query("SELECT config_value FROM system_config WHERE config_key = 'lpr_enabled'");
      lprEnabled = cfgRes.recordset.length > 0 ? cfgRes.recordset[0].config_value : "true";
      cache.set("lpr_enabled", lprEnabled, 5 * 60 * 1000);
    }
    if (lprEnabled !== "true") {
      return res.status(503).json({ error: "LPR desabilitado pelo administrador." });
    }
    const apiKey = req.headers["x-lpr-key"];
    if (!apiKey || apiKey.length < 10) {
      return res.status(401).json({ error: "X-LPR-Key ausente ou inválida." });
    }
    const prefix = apiKey.substring(0, 8);
    const db = await getPool();
    const result = await db.request()
      .input("prefix", sql.NVarChar, prefix)
      .query("SELECT * FROM lpr_devices WHERE api_key_prefix = @prefix AND is_active = 1");
    if (result.recordset.length === 0) {
      return res.status(401).json({ error: "Câmera LPR não encontrada ou desativada." });
    }
    const device = result.recordset[0];
    const isValid = await bcrypt.compare(apiKey, device.api_key);
    if (!isValid) {
      return res.status(401).json({ error: "X-LPR-Key inválida." });
    }
    // Atualizar heartbeat
    await db.request().input("id", sql.Int, device.id)
      .query("UPDATE lpr_devices SET last_heartbeat = GETDATE() WHERE id = @id");
    req.lprDevice = device;
    next();
  } catch (error) {
    log("ERROR", "LPR auth error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ============================================
// Helper: Rate limiter para LPR (por device)
// ============================================
const lprRateMap = new Map();
const LPR_RATE_WINDOW = 60 * 1000; // 1 minuto
const LPR_RATE_MAX = 30; // máximo 30 requisições por minuto por câmera

// Limpeza periódica de entries expiradas do rate limiter
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of lprRateMap) {
    if (now - entry.windowStart > LPR_RATE_WINDOW * 2) { lprRateMap.delete(key); }
  }
}, 5 * 60 * 1000);

// 4.1 — Limpeza periódica de tickets antigos (exited/cancelled/expired)
async function cleanupOldTickets() {
  try {
    const db = await getPool();
    let retentionDays = cache.get("ticket_retention_days");
    if (retentionDays === null) {
      const rRes = await db.request()
        .query("SELECT config_value FROM system_config WHERE config_key = 'ticket_retention_days'");
      retentionDays = rRes.recordset.length > 0 ? parseInt(rRes.recordset[0].config_value) : 90;
      cache.set("ticket_retention_days", retentionDays, 24 * 60 * 60 * 1000);
    }
    const result = await db.request()
      .input("days", sql.Int, retentionDays)
      .query("DELETE FROM tickets WHERE status IN ('exited','cancelled','expired') AND created_at < DATEADD(DAY, -@days, GETDATE())");
    if (result.rowsAffected[0] > 0) {
      log("INFO", `Ticket cleanup: ${result.rowsAffected[0]} registros removidos (> ${retentionDays} dias)`);
    }
  } catch (e) {
    log("WARN", "Ticket cleanup error", { error: e.message });
  }
}
setInterval(cleanupOldTickets, 24 * 60 * 60 * 1000);

// 4.2 — Monitoramento periódico de dispositivos offline
const offlineAlertedDevices = new Set();
async function checkDevicesOffline() {
  try {
    const db = await getPool();
    const deviceTables = [
      { type: "totem", table: "totem_devices", nameCol: "device_name" },
      { type: "lpr", table: "lpr_devices", nameCol: "name" },
      { type: "barrier", table: "barrier_devices", nameCol: "name" },
    ];
    const nowOnlineKeys = new Set();
    for (const t of deviceTables) {
      const result = await db.request().query(
        `SELECT id, ${t.nameCol} AS device_name, DATEDIFF(MINUTE, last_heartbeat, GETDATE()) AS minutes_offline
         FROM ${t.table} WHERE is_active = 1 AND last_heartbeat IS NOT NULL`
      );
      for (const d of result.recordset) {
        const key = `${t.type}:${d.id}`;
        if (d.minutes_offline > 5) {
          if (!offlineAlertedDevices.has(key)) {
            offlineAlertedDevices.add(key);
            sendAlert("device_offline", { device_type: t.type, device_name: d.device_name, device_id: d.id, minutes_offline: d.minutes_offline });
            log("WARN", `Device offline: ${t.type} "${d.device_name}" (${d.minutes_offline}min)`);
          }
        } else {
          nowOnlineKeys.add(key);
        }
      }
    }
    for (const key of offlineAlertedDevices) {
      if (nowOnlineKeys.has(key)) { offlineAlertedDevices.delete(key); }
    }
  } catch (e) {
    log("WARN", "Device offline check error", { error: e.message });
  }
}
setInterval(checkDevicesOffline, 5 * 60 * 1000);

function lprRateLimiter(req, res, next) {
  const deviceId = req.lprDevice ? req.lprDevice.id : "unknown";
  const now = Date.now();
  let entry = lprRateMap.get(deviceId);
  if (!entry || now - entry.windowStart > LPR_RATE_WINDOW) {
    entry = { windowStart: now, count: 1 };
    lprRateMap.set(deviceId, entry);
    return next();
  }
  entry.count++;
  if (entry.count > LPR_RATE_MAX) {
    return res.status(429).json({ error: `Rate limit excedido. Máximo ${LPR_RATE_MAX} req/min por câmera.` });
  }
  return next();
}

// Helper: Obter grace period (minutos) com cache
async function getGraceMinutes() {
  let val = cache.get("grace_period_minutes");
  if (val === null) {
    const db = await getPool();
    const gRes = await db.request()
      .query("SELECT config_value FROM system_config WHERE config_key = 'grace_period_minutes'");
    val = gRes.recordset.length > 0 ? parseInt(gRes.recordset[0].config_value) : 15;
    cache.set("grace_period_minutes", val, 5 * 60 * 1000);
  }
  return val;
}

// Helper: Enviar comando para cancela
async function sendBarrierCommand(barrierId, action) {
  const db = await getPool();
  const result = await db.request().input("id", sql.Int, barrierId)
    .query("SELECT * FROM barrier_devices WHERE id = @id AND is_active = 1");
  if (result.recordset.length === 0) {
    const err = new Error("Barreira não encontrada ou desativada.");
    err.statusCode = 404;
    throw err;
  }
  const barrier = result.recordset[0];

  // Se tem control_url, envia comando HTTP/MQTT para hardware real
  if (barrier.control_url) {
    // Validar URL contra SSRF — permitir apenas IPs privados
    const url = new URL(`${barrier.control_url}/${action}`);
    const hostname = url.hostname;
    const isPrivate = /^(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|127\.\d+\.\d+\.\d+|localhost)$/i.test(hostname);
    if (!isPrivate) {
      log("WARN", `Barrier ${barrierId} SSRF blocked: ${hostname}`);
      return { success: false, barrier_id: barrierId, action, hardware: true, error: "URL de controle não é endereço de rede privada" };
    }
    try {
      const controller = barrier.control_url.startsWith("https") ? https : http;
      await new Promise((resolve, reject) => {
        const req = controller.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: "POST", timeout: 5000 }, (res) => {
          let d = "";
          res.on("data", c => d += c);
          res.on("end", () => resolve(d));
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
        req.end();
      });
      await db.request().input("id", sql.Int, barrierId).input("st", sql.NVarChar, "online")
        .query("UPDATE barrier_devices SET status = @st, last_heartbeat = GETDATE() WHERE id = @id");
      return { success: true, barrier_id: barrierId, action, hardware: true };
    } catch (hwErr) {
      log("WARN", `Barrier ${barrierId} hardware error: ${hwErr.message}`);
      await db.request().input("id", sql.Int, barrierId).input("st", sql.NVarChar, "error")
        .query("UPDATE barrier_devices SET status = @st WHERE id = @id");
      return { success: false, barrier_id: barrierId, action, hardware: true, error: hwErr.message };
    }
  }
  // Sem control_url = modo simulação
  await db.request().input("id", sql.Int, barrierId).input("st", sql.NVarChar, "online")
    .query("UPDATE barrier_devices SET status = @st, last_heartbeat = GETDATE() WHERE id = @id");
  return { success: true, barrier_id: barrierId, action, hardware: false, simulated: true };
}

// ============================================
// Helper: Processar Pagamento (reutilizável)
// ============================================
// actor = { id, role, uname, type: "valet"|"totem", deviceId?: number, ip }
async function processPayment(ticketNo, paymentMethod, actor) {
  const validMethods = ["dinheiro", "cartao", "pix", "cortesia"];
  const method = paymentMethod || "dinheiro";
  if (!validMethods.includes(method)) {
    const err = new Error("Invalid payment_method. Valid: " + validMethods.join(", "));
    err.statusCode = 400;
    throw err;
  }

  const MAX_RETRIES = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const db = await getPool();
    const transaction = new sql.Transaction(db);
    try {
      await transaction.begin();

      const ticketResult = await transaction.request()
        .input("ticket_no", sql.NVarChar, ticketNo)
        .query("SELECT * FROM tickets WHERE ticket_no = @ticket_no");

      if (ticketResult.recordset.length === 0) {
        await transaction.rollback();
        const err = new Error("Ticket not found");
        err.statusCode = 404;
        throw err;
      }

      const ticket = ticketResult.recordset[0];

      if (ticket.paid) {
        await transaction.rollback();
        const err = new Error("Ticket already paid");
        err.statusCode = 400;
        throw err;
      }
      if (ticket.status !== "active") {
        await transaction.rollback();
        const err = new Error("Ticket not found or invalid status for payment");
        err.statusCode = 400;
        throw err;
      }

      const finalAmount = await calculatePrice(ticket.created_at);

      // Transição: active → payment_pending → paid
      const pendResult = await transaction.request()
        .input("ticket_no_pend", sql.NVarChar, ticketNo)
        .query("UPDATE tickets SET status = 'payment_pending' WHERE ticket_no = @ticket_no_pend AND paid = 0 AND status = 'active'");

      if (pendResult.rowsAffected[0] === 0) {
        await transaction.rollback();
        const err = new Error("Ticket not found or invalid status for payment");
        err.statusCode = 400;
        throw err;
      }

      // Confirmar pagamento: payment_pending → paid
      const result = await transaction.request()
        .input("ticket_no", sql.NVarChar, ticketNo)
        .input("amount", sql.Decimal(10, 2), finalAmount)
        .input("payment_method", sql.NVarChar(20), method)
        .query("UPDATE tickets SET paid = 1, status = 'paid', paid_at = GETDATE(), amount = @amount, payment_method = @payment_method WHERE ticket_no = @ticket_no AND status = 'payment_pending'");

      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        const err = new Error("Payment processing failed");
        err.statusCode = 400;
        throw err;
      }

      // Registrar na tabela payments
      await transaction.request()
        .input("p_sid", sql.Int, ticket.id)
        .input("p_tno", sql.NVarChar, ticketNo)
        .input("p_method", sql.NVarChar(20), method)
        .input("p_amount", sql.Decimal(10, 2), finalAmount)
        .query("INSERT INTO payments (session_id, ticket_no, gateway_id, method, amount, status) VALUES (@p_sid, @p_tno, NULL, @p_method, @p_amount, 'completed')");

      await transaction.commit();

      const retryNote = attempt > 0 ? ` (retry ${attempt})` : "";
      const actorLabel = actor.type === "totem" ? `Totem #${actor.deviceId}` : `${actor.uname || actor.role}`;
      await auditLog("PAYMENT", actor.id, actor.role,
        `Ticket: ${ticketNo}, Valor: R$${finalAmount.toFixed(2)}, Método: ${method}, Via: ${actorLabel}${retryNote}`, actor.ip);

      return { paid: true, amount: finalAmount, payment_method: method, ticket_id: ticket.id };

    } catch (retryErr) {
      try { await transaction.rollback(); } catch (_) { /* already rolled back */ }
      if (retryErr.statusCode) throw retryErr; // Business errors — don't retry
      lastError = retryErr;
      const isRetryable = retryErr.number === 1205 || retryErr.code === "ETIMEOUT" || retryErr.code === "EREQUEST";
      if (isRetryable && attempt < MAX_RETRIES) {
        log("WARN", `Payment retry ${attempt + 1}/${MAX_RETRIES}`, { ticket: ticketNo, error: retryErr.message });
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw retryErr;
    }
  }
  throw lastError;
}

// ============================================
// Helper: Autenticação de Totem via X-Totem-Key
// ============================================
async function authenticateTotem(req, res, next) {
  try {
    // Check if totem feature is enabled
    let totemEnabled = cache.get("totem_enabled");
    if (totemEnabled === null) {
      const db = await getPool();
      const cfgRes = await db.request()
        .query("SELECT config_value FROM system_config WHERE config_key = 'totem_enabled'");
      totemEnabled = cfgRes.recordset.length > 0 ? cfgRes.recordset[0].config_value : "true";
      cache.set("totem_enabled", totemEnabled, 5 * 60 * 1000);
    }
    if (totemEnabled !== "true") {
      return res.status(503).json({ error: "Totem desabilitado pelo administrador." });
    }

    const apiKey = req.headers["x-totem-key"];
    if (!apiKey || apiKey.length < 16) {
      return res.status(401).json({ error: "API key do totem ausente ou inválida." });
    }

    const prefix = apiKey.substring(0, 8);
    const db = await getPool();
    const result = await db.request()
      .input("prefix", sql.NVarChar, prefix)
      .query("SELECT id, device_name, api_key, unit_id, is_active FROM totem_devices WHERE api_key_prefix = @prefix AND is_active = 1");

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: "Totem não autorizado." });
    }

    // Compare full key with bcrypt
    let matched = null;
    for (const device of result.recordset) {
      const valid = await bcrypt.compare(apiKey, device.api_key);
      if (valid) { matched = device; break; }
    }

    if (!matched) {
      return res.status(401).json({ error: "Totem não autorizado." });
    }

    // Update heartbeat (non-blocking)
    db.request()
      .input("did", sql.Int, matched.id)
      .query("UPDATE totem_devices SET last_heartbeat = GETDATE() WHERE id = @did")
      .catch(() => {});

    // Attach device info to request
    req.totemDevice = { id: matched.id, name: matched.device_name, unit_id: matched.unit_id };
    next();
  } catch (error) {
    if (isDbError(error)) {
      res.set("Retry-After", "10");
      return res.status(503).json({ error: "Serviço temporariamente indisponível." });
    }
    log("ERROR", "authenticateTotem error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ============================================
// Helper: Log transação totem
// ============================================
async function logTotemTransaction(deviceId, ticketNo, sessionId, action, amount, method, metadata) {
  try {
    const db = await getPool();
    await db.request()
      .input("device_id", sql.Int, deviceId)
      .input("ticket_no", sql.NVarChar, ticketNo)
      .input("session_id", sql.Int, sessionId)
      .input("action", sql.NVarChar, action)
      .input("amount", sql.Decimal(10, 2), amount)
      .input("method", sql.NVarChar, method)
      .input("metadata", sql.NVarChar, metadata ? JSON.stringify(metadata) : null)
      .query("INSERT INTO totem_transactions (device_id, ticket_no, session_id, action, amount, method, metadata) VALUES (@device_id, @ticket_no, @session_id, @action, @amount, @method, @metadata)");
  } catch (e) {
    log("ERROR", "logTotemTransaction error", { error: e.message });
  }
}

// ############################################
// ROTAS LEGADAS (compatibilidade com frontend)
// ############################################

// POST /authorizeValet
app.post("/authorizeValet", loginLimiter, async (req, res) => {
  try {
    const {uname, pwd} = req.body;
    if (!uname || !pwd) {
      return res.status(400).json({error: "Username and password are required"});
    }

    const db = await getPool();
    const result = await db.request()
      .input("uname", sql.NVarChar, uname)
      .query("SELECT * FROM valets WHERE uname = @uname");

    if (result.recordset.length === 0) {
      await auditLog("LOGIN_VALET_FAIL", null, null, `Tentativa com user: ${uname}`, getClientIp(req));
      return res.status(401).json({auth: false, error: "Invalid credentials"});
    }

    const valet = result.recordset[0];

    // Autenticação bcrypt apenas
    const valid = await bcrypt.compare(pwd, valet.pwd);

    if (!valid) {
      await auditLog("LOGIN_VALET_FAIL", valet.id, valet.role, "Senha incorreta", getClientIp(req));
      return res.status(401).json({auth: false, error: "Invalid credentials"});
    }

    const token = jwt.sign(
      {id: valet.id, uname: valet.uname, role: valet.role},
      JWT_SECRET,
      {expiresIn: JWT_EXPIRATION}
    );

    await auditLog("LOGIN_VALET", valet.id, valet.role, `Login: ${uname}`, getClientIp(req));
    return res.status(200).json({auth: true, token});
  } catch (error) {
    log("ERROR", "authorizeValet error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// POST /authorizeUser
app.post("/authorizeUser", loginLimiter, async (req, res) => {
  try {
    const {ticket_no, phone, reg_no} = req.body;
    if (!ticket_no || !phone || !reg_no) {
      return res.status(400).json({error: "Ticket number, phone and registration number are required"});
    }

    const db = await getPool();
    const result = await db.request()
      .input("ticket_no", sql.NVarChar, ticket_no)
      .query("SELECT * FROM tickets WHERE ticket_no = @ticket_no");

    if (result.recordset.length === 0) {
      return res.status(404).json({auth: false, error: "Ticket not found"});
    }

    const ticket = result.recordset[0];
    if (!phonesMatch(ticket.phone_no, phone) || ticket.reg_no !== reg_no.toUpperCase()) {
      await auditLog("LOGIN_USER_FAIL", null, null, `Ticket: ${ticket_no}`, getClientIp(req));
      return res.status(401).json({auth: false, error: "Invalid credentials"});
    }

    const token = jwt.sign(
      {id: ticket.id, ticket_no: ticket.ticket_no, role: "user"},
      JWT_SECRET,
      {expiresIn: JWT_EXPIRATION}
    );

    await auditLog("LOGIN_USER", ticket.id, "user", `Ticket: ${ticket_no}`, getClientIp(req));
    return res.status(200).json({auth: true, token});
  } catch (error) {
    log("ERROR", "authorizeUser error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// GET /valetVerify
app.get("/valetVerify", async (req, res) => {
  try {
    const decoded = verifyToken(req);
    if (!["admin", "operador", "fiscal"].includes(decoded.role)) {
      return res.status(401).json({valid: false, error: "Invalid token role"});
    }
    return res.status(200).json({valid: true, role: decoded.role});
  } catch (error) {
    return res.status(401).json({valid: false, error: "Invalid or expired token"});
  }
});

// GET /userVerify
app.get("/userVerify", async (req, res) => {
  try {
    const decoded = verifyToken(req);
    if (decoded.role !== "user") {
      return res.status(401).json({valid: false, error: "Invalid token role"});
    }
    return res.status(200).json({valid: true});
  } catch (error) {
    return res.status(401).json({valid: false, error: "Invalid or expired token"});
  }
});

// POST /createTicket
app.post("/createTicket", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin", "operador");
    const {first_name, last_name, phone_no, reg_no, manufacturer, model, color} = req.body;

    if (!first_name || !last_name || !phone_no || !reg_no) {
      return res.status(400).json({error: "Required fields missing"});
    }

    const phoneDigits = stripPhone(phone_no);
    if (phoneDigits.length < 12 || phoneDigits.length > 13) {
      return res.status(400).json({error: "Telefone inválido. Use o formato: +55 (XX) XXXXX-XXXX"});
    }
    const normalizedPhone = formatPhone(phone_no);

    if (!isValidPlate(reg_no)) {
      return res.status(400).json({error: "Placa inválida. Use ABC-1234 (antiga) ou ABC1D23 (Mercosul)"});
    }

    const cleanPlate = stripPlateChars(reg_no);
    const db = await getPool();

    // Resolver unit_id: aceitar do body ou usar a primeira unidade ativa
    let resolvedUnitId = parseInt(req.body.unit_id) || 0;
    if (!resolvedUnitId) {
      const unitRes = await db.request().query("SELECT TOP 1 id FROM parking_units WHERE active = 1 ORDER BY id");
      resolvedUnitId = unitRes.recordset.length > 0 ? unitRes.recordset[0].id : 1;
    }

    // Verificar blacklist (com cache)
    const blCacheKey = `bl:${cleanPlate}`;
    let isBlacklisted = cache.get(blCacheKey);
    if (isBlacklisted === null) {
      const bl = await db.request()
        .input("reg_no", sql.NVarChar, cleanPlate)
        .query("SELECT id FROM blacklist WHERE reg_no = @reg_no AND active = 1");
      isBlacklisted = bl.recordset.length > 0;
      cache.set(blCacheKey, isBlacklisted, 2 * 60 * 1000); // 2 min TTL
    }
    if (isBlacklisted) {
      await auditLog("TICKET_BLOCKED_BLACKLIST", decoded.id, decoded.role, `Placa: ${cleanPlate}`, getClientIp(req));
      sendAlert("blacklist_entry", { plate: cleanPlate, operator: decoded.uname, ip: getClientIp(req) });
      return res.status(403).json({error: "Veículo na blacklist. Entrada não permitida."});
    }

    // Verificar whitelist (com cache)
    const wlCacheKey = `wl:${cleanPlate}`;
    let isWhitelisted = cache.get(wlCacheKey);
    if (isWhitelisted === null) {
      const wl = await db.request()
        .input("reg_no", sql.NVarChar, cleanPlate)
        .query("SELECT id FROM whitelist WHERE reg_no = @reg_no AND active = 1");
      isWhitelisted = wl.recordset.length > 0;
      cache.set(wlCacheKey, isWhitelisted, 2 * 60 * 1000); // 2 min TTL
    }

    const transaction = new sql.Transaction(db);
    await transaction.begin();

    try {
      const counterResult = await transaction.request()
        .query("UPDATE counters SET current_value = current_value + 1 OUTPUT INSERTED.current_value WHERE name = 'tickets'");

      const ticketNumber = counterResult.recordset[0].current_value;
      const ticketNo = `TKT-${String(ticketNumber).padStart(6, "0")}`;

      const initialPaid = isWhitelisted ? 1 : 0;
      const initialStatus = isWhitelisted ? "paid" : "active";

      await transaction.request()
        .input("ticket_no", sql.NVarChar, ticketNo)
        .input("first_name", sql.NVarChar, first_name)
        .input("last_name", sql.NVarChar, last_name)
        .input("phone_no", sql.NVarChar, normalizedPhone)
        .input("reg_no", sql.NVarChar, cleanPlate)
        .input("manufacturer", sql.NVarChar, manufacturer || "")
        .input("model", sql.NVarChar, model || "")
        .input("color", sql.NVarChar, color || "")
        .input("amount", sql.Decimal(10, 2), 0)
        .input("paid", sql.Bit, initialPaid)
        .input("status", sql.NVarChar, initialStatus)
        .input("unit_id", sql.Int, resolvedUnitId)
        .query(`INSERT INTO tickets (ticket_no, first_name, last_name, phone_no, reg_no, manufacturer, model, color, amount, paid, status, unit_id)
                VALUES (@ticket_no, @first_name, @last_name, @phone_no, @reg_no, @manufacturer, @model, @color, @amount, @paid, @status, @unit_id)`);

      // Incrementar ocupação
      await transaction.request()
        .input("unit_id", sql.Int, resolvedUnitId)
        .query("UPDATE parking_units SET current_count = current_count + 1 WHERE id = @unit_id AND current_count < capacity");

      await transaction.commit();

      // Verificar ocupação para alerta high_occupancy
      try {
        const occCheck = await db.request()
          .input("unit_id", sql.Int, resolvedUnitId)
          .query("SELECT capacity, current_count FROM parking_units WHERE id = @unit_id AND active = 1");
        if (occCheck.recordset.length > 0) {
          const u = occCheck.recordset[0];
          const pct = u.capacity > 0 ? Math.round((u.current_count / u.capacity) * 100) : 0;
          const thresholdRow = cache.get("occupancy_threshold");
          let threshold = thresholdRow;
          if (threshold === null) {
            const tRes = await db.request()
              .query("SELECT config_value FROM system_config WHERE config_key = 'occupancy_alert_threshold'");
            threshold = tRes.recordset.length > 0 ? parseInt(tRes.recordset[0].config_value) : 90;
            cache.set("occupancy_threshold", threshold, 5 * 60 * 1000);
          }
          if (pct >= threshold) {
            sendAlert("high_occupancy", { percentual: pct, ocupadas: u.current_count, total: u.capacity });
          }
        }
      } catch (_occErr) { /* non-critical */ }

      // Se whitelist, registrar pagamento cortesia na tabela payments
      if (isWhitelisted) {
        const db2 = await getPool();
        const ticketId = await db2.request()
          .input("tno", sql.NVarChar, ticketNo)
          .query("SELECT id FROM tickets WHERE ticket_no = @tno");
        if (ticketId.recordset.length > 0) {
          await db2.request()
            .input("sid", sql.Int, ticketId.recordset[0].id)
            .input("tno2", sql.NVarChar, ticketNo)
            .input("amt", sql.Decimal(10, 2), 0)
            .query("INSERT INTO payments (session_id, ticket_no, gateway_id, method, amount, status) VALUES (@sid, @tno2, NULL, 'cortesia', @amt, 'completed')");
        }
      }

      const entryAmount = isWhitelisted ? 0 : await calculatePrice(new Date());

      await auditLog("TICKET_CREATE", decoded.id, decoded.role,
        `Ticket: ${ticketNo}, Placa: ${cleanPlate}${isWhitelisted ? " (whitelist)" : ""}`, getClientIp(req));

      return res.status(201).json({
        message: "Ticket created successfully",
        ticket_no: ticketNo,
        whitelisted: isWhitelisted,
        ticket_data: {
          ticket_no: ticketNo, first_name, last_name,
          phone_no: normalizedPhone, reg_no: cleanPlate,
          manufacturer: manufacturer || "", model: model || "", color: color || "",
          amount: entryAmount,
        },
      });
    } catch (innerError) {
      await transaction.rollback();
      throw innerError;
    }
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "createTicket error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// GET /user?ticket={no}
app.get("/user", async (req, res) => {
  try {
    verifyToken(req);
    const ticketNo = req.query.ticket;
    if (!ticketNo) return res.status(400).json({error: "Ticket number is required"});

    const db = await getPool();
    const result = await db.request()
      .input("ticket_no", sql.NVarChar, ticketNo)
      .query("SELECT * FROM tickets WHERE ticket_no = @ticket_no");

    if (result.recordset.length === 0) {
      return res.status(404).json({error: "Ticket not found"});
    }

    const ticket = result.recordset[0];

    // Calcular preço dinâmico se não pago
    let amount = parseFloat(ticket.amount);
    if (!ticket.paid) {
      amount = await calculatePrice(ticket.created_at);
    }

    return res.status(200).json({
      first_name: ticket.first_name,
      last_name: ticket.last_name,
      car: {
        reg_no: ticket.reg_no, color: ticket.color,
        manufacturer: ticket.manufacturer, model: ticket.model,
      },
      ticket: {
        paid: ticket.paid, amount: amount,
        no: ticket.ticket_no, status: ticket.status,
        created_at: ticket.created_at,
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "user GET error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// PATCH /user?ticket={no} — pagamento (via processPayment)
app.patch("/user", async (req, res) => {
  try {
    const decoded = verifyToken(req);
    const ticketNo = req.query.ticket;
    if (!ticketNo) return res.status(400).json({error: "Ticket number is required"});

    const paymentMethod = req.body && req.body.payment_method ? req.body.payment_method : null;

    const result = await processPayment(ticketNo, paymentMethod, {
      id: decoded.id, role: decoded.role, uname: decoded.uname,
      type: "valet", ip: getClientIp(req),
    });

    return res.status(200).json({message: "Payment status updated successfully", paid: result.paid, amount: result.amount, payment_method: result.payment_method});
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({error: error.message});
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "user PATCH error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// [REMOVED] GET /qrcode — redundante com GET /user (removido na auditoria 2026-04-13)

// GET /plateCheck?reg_no={placa}
app.get("/plateCheck", async (req, res) => {
  try {
    requireRole(req, "admin", "operador", "fiscal");
    const regNo = stripPlateChars(req.query.reg_no || "");
    if (!regNo) return res.status(400).json({error: "Placa é obrigatória"});

    const db = await getPool();
    const result = await db.request()
      .input("reg_no", sql.NVarChar, regNo)
      .query(`SELECT TOP 1 * FROM tickets
              WHERE reg_no = @reg_no AND status IN ('active', 'payment_pending', 'paid')
              ORDER BY created_at DESC`);

    if (result.recordset.length === 0) {
      return res.status(404).json({error: "Nenhum ticket ativo encontrado para essa placa"});
    }

    const ticket = result.recordset[0];
    let amount = parseFloat(ticket.amount);
    if (!ticket.paid) amount = await calculatePrice(ticket.created_at);

    return res.status(200).json({
      ticket_no: ticket.ticket_no,
      first_name: ticket.first_name, last_name: ticket.last_name,
      reg_no: ticket.reg_no,
      manufacturer: ticket.manufacturer, model: ticket.model, color: ticket.color,
      amount: amount,
      paid: ticket.paid, status: ticket.status, created_at: ticket.created_at,
    });
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "plateCheck error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// [REMOVED] POST /setupValet — redundante com POST /valets (removido na auditoria 2026-04-13)

// ############################################
// NOVAS ROTAS: Saída (Exit)
// ############################################

// POST /exit
app.post("/exit", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin", "operador");
    const ticket_no = (req.body.ticket_no || "").trim();
    if (!ticket_no) return res.status(400).json({error: "Ticket number is required"});

    const db = await getPool();
    const ticketResult = await db.request()
      .input("ticket_no", sql.NVarChar, ticket_no)
      .query("SELECT * FROM tickets WHERE ticket_no = @ticket_no");

    if (ticketResult.recordset.length === 0) {
      return res.status(404).json({error: "Ticket not found"});
    }

    const ticket = ticketResult.recordset[0];

    if (ticket.status === "exited") {
      return res.status(400).json({error: "Veículo já saiu"});
    }
    if (!ticket.paid) {
      return res.status(400).json({error: "Pagamento pendente. Veículo não pode sair."});
    }

    // Grace period: verificar se ultrapassou tolerância pós-pagamento
    if (ticket.paid_at) {
      const graceMinutes = await getGraceMinutes();
      if (graceMinutes > 0) {
        // Calcula diff no SQL para evitar mismatch de timezone
        const elapsedResult = await db.request()
          .input("paid_at_chk", sql.DateTime2, ticket.paid_at)
          .query("SELECT DATEDIFF(MINUTE, @paid_at_chk, GETDATE()) AS elapsed_min");
        const elapsedMin = elapsedResult.recordset[0].elapsed_min;
        if (elapsedMin > graceMinutes) {
          const extraAmount = await calculatePrice(ticket.paid_at);
          const graceResult = await db.request()
            .input("tno_grace", sql.NVarChar, ticket_no)
            .input("extra_amt", sql.Decimal(10, 2), extraAmount)
            .query("UPDATE tickets SET paid = 0, status = 'active', amount = @extra_amt WHERE ticket_no = @tno_grace AND status = 'paid'");
          if (graceResult.rowsAffected[0] === 0) {
            return res.status(409).json({error: "Ticket já sendo processado por outra requisição"});
          }
          return res.status(402).json({
            error: "Período de tolerância expirado",
            grace_period_minutes: graceMinutes,
            elapsed_minutes: elapsedMin,
            extra_amount: extraAmount,
            message: `Tolerância de ${graceMinutes}min expirou. Novo valor: R$${extraAmount.toFixed(2)}`,
          });
        }
      }
    }

    // Transação atômica: marcar saída + decrementar ocupação
    const exitTx = new sql.Transaction(db);
    await exitTx.begin();
    try {
      await exitTx.request()
        .input("ticket_no", sql.NVarChar, ticket_no)
        .query("UPDATE tickets SET status = 'exited', exit_time = GETDATE() WHERE ticket_no = @ticket_no AND status = 'paid'");

      await exitTx.request()
        .input("unit_id", sql.Int, ticket.unit_id || 1)
        .query("UPDATE parking_units SET current_count = current_count - 1 WHERE id = @unit_id AND current_count > 0");

      await exitTx.commit();
    } catch (txErr) {
      try { await exitTx.rollback(); } catch (_) {}
      throw txErr;
    }

    await auditLog("EXIT", decoded.id, decoded.role, `Ticket: ${ticket_no}, Placa: ${ticket.reg_no}`, getClientIp(req));
    return res.status(200).json({message: "Saída registrada com sucesso", ticket_no: ticket_no});
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "exit error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// ############################################
// NOVAS ROTAS: Whitelist / Blacklist
// ############################################

// GET /whitelist
app.get("/whitelist", async (req, res) => {
  try {
    requireRole(req, "admin");
    const db = await getPool();
    const result = await db.request().query("SELECT * FROM whitelist WHERE active = 1 ORDER BY created_at DESC");
    return res.status(200).json(result.recordset);
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({error: "Internal server error"});
  }
});

// POST /whitelist
app.post("/whitelist", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const {reg_no, description} = req.body;
    if (!reg_no) return res.status(400).json({error: "Placa é obrigatória"});
    if (!isValidPlate(reg_no)) return res.status(400).json({error: "Placa inválida"});

    const clean = stripPlateChars(reg_no);
    const db = await getPool();

    const existing = await db.request()
      .input("reg_no", sql.NVarChar, clean)
      .query("SELECT id FROM whitelist WHERE reg_no = @reg_no AND active = 1");
    if (existing.recordset.length > 0) {
      return res.status(409).json({error: "Placa já está na whitelist"});
    }

    await db.request()
      .input("reg_no", sql.NVarChar, clean)
      .input("description", sql.NVarChar, description || "")
      .input("created_by", sql.Int, decoded.id)
      .query("INSERT INTO whitelist (reg_no, description, created_by) VALUES (@reg_no, @description, @created_by)");

    cache.invalidatePrefix("wl:");
    await auditLog("WHITELIST_ADD", decoded.id, decoded.role, `Placa: ${clean}`, getClientIp(req));
    return res.status(201).json({message: "Placa adicionada à whitelist"});
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "whitelist POST error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// DELETE /whitelist/:id
app.delete("/whitelist/:id", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const db = await getPool();
    const result = await db.request()
      .input("id", sql.Int, parseInt(req.params.id))
      .query("UPDATE whitelist SET active = 0 WHERE id = @id");
    if (result.rowsAffected[0] === 0) return res.status(404).json({error: "Registro não encontrado"});

    cache.invalidatePrefix("wl:");
    await auditLog("WHITELIST_REMOVE", decoded.id, decoded.role, `ID: ${req.params.id}`, getClientIp(req));
    return res.status(200).json({message: "Removido da whitelist"});
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({error: "Internal server error"});
  }
});

// GET /blacklist
app.get("/blacklist", async (req, res) => {
  try {
    requireRole(req, "admin");
    const db = await getPool();
    const result = await db.request().query("SELECT * FROM blacklist WHERE active = 1 ORDER BY created_at DESC");
    return res.status(200).json(result.recordset);
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({error: "Internal server error"});
  }
});

// POST /blacklist
app.post("/blacklist", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const {reg_no, description} = req.body;
    if (!reg_no) return res.status(400).json({error: "Placa é obrigatória"});
    if (!isValidPlate(reg_no)) return res.status(400).json({error: "Placa inválida"});

    const clean = stripPlateChars(reg_no);
    const db = await getPool();

    const existing = await db.request()
      .input("reg_no", sql.NVarChar, clean)
      .query("SELECT id FROM blacklist WHERE reg_no = @reg_no AND active = 1");
    if (existing.recordset.length > 0) {
      return res.status(409).json({error: "Placa já está na blacklist"});
    }

    await db.request()
      .input("reg_no", sql.NVarChar, clean)
      .input("description", sql.NVarChar, description || "")
      .input("created_by", sql.Int, decoded.id)
      .query("INSERT INTO blacklist (reg_no, description, created_by) VALUES (@reg_no, @description, @created_by)");

    cache.invalidatePrefix("bl:");
    await auditLog("BLACKLIST_ADD", decoded.id, decoded.role, `Placa: ${clean}`, getClientIp(req));
    return res.status(201).json({message: "Placa adicionada à blacklist"});
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "blacklist POST error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// DELETE /blacklist/:id
app.delete("/blacklist/:id", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const db = await getPool();
    const result = await db.request()
      .input("id", sql.Int, parseInt(req.params.id))
      .query("UPDATE blacklist SET active = 0 WHERE id = @id");
    if (result.rowsAffected[0] === 0) return res.status(404).json({error: "Registro não encontrado"});

    cache.invalidatePrefix("bl:");
    await auditLog("BLACKLIST_REMOVE", decoded.id, decoded.role, `ID: ${req.params.id}`, getClientIp(req));
    return res.status(200).json({message: "Removido da blacklist"});
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({error: "Internal server error"});
  }
});

// ############################################
// NOVAS ROTAS: Gestão de Usuários (RBAC)
// ############################################

// GET /valets
app.get("/valets", async (req, res) => {
  try {
    requireRole(req, "admin");
    const db = await getPool();
    const result = await db.request().query("SELECT id, uname, role, created_at FROM valets ORDER BY created_at DESC");
    return res.status(200).json(result.recordset);
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({error: "Internal server error"});
  }
});

// POST /valets
app.post("/valets", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const {uname, pwd, role} = req.body;
    if (!uname || !pwd) return res.status(400).json({error: "Username and password are required"});

    const valetRole = ["admin", "operador", "fiscal"].includes(role) ? role : "operador";
    const db = await getPool();

    const existing = await db.request()
      .input("uname", sql.NVarChar, uname)
      .query("SELECT id FROM valets WHERE uname = @uname");
    if (existing.recordset.length > 0) return res.status(409).json({error: "Usuário já existe"});

    const hashedPwd = await bcrypt.hash(pwd, BCRYPT_ROUNDS);

    await db.request()
      .input("uname", sql.NVarChar, uname)
      .input("pwd", sql.NVarChar, hashedPwd)
      .input("role", sql.NVarChar, valetRole)
      .query("INSERT INTO valets (uname, pwd, role) VALUES (@uname, @pwd, @role)");

    await auditLog("VALET_CREATE", decoded.id, decoded.role, `Criado: ${uname} (${valetRole})`, getClientIp(req));
    return res.status(201).json({message: `Usuário '${uname}' criado com sucesso`});
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "valets POST error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// DELETE /valets/:id
app.delete("/valets/:id", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const targetId = parseInt(req.params.id);
    if (targetId === decoded.id) return res.status(400).json({error: "Não é possível remover a si mesmo"});

    const db = await getPool();
    const result = await db.request()
      .input("id", sql.Int, targetId)
      .query("DELETE FROM valets WHERE id = @id");
    if (result.rowsAffected[0] === 0) return res.status(404).json({error: "Usuário não encontrado"});

    await auditLog("VALET_DELETE", decoded.id, decoded.role, `Removido ID: ${targetId}`, getClientIp(req));
    return res.status(200).json({message: "Usuário removido"});
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({error: "Internal server error"});
  }
});

// ############################################
// NOVAS ROTAS: Ocupação
// ############################################

// GET /occupancy
app.get("/occupancy", async (req, res) => {
  try {
    requireRole(req, "admin", "operador", "fiscal");
    const db = await getPool();
    const result = await db.request().query("SELECT id, name, capacity, current_count, active FROM parking_units WHERE active = 1");
    const units = result.recordset.map(u => ({
      ...u,
      available: u.capacity - u.current_count,
      occupancy_percent: u.capacity > 0 ? Math.round((u.current_count / u.capacity) * 100) : 0,
    }));

    // Calcular totais
    const total_vagas = units.reduce((s, u) => s + u.capacity, 0);
    const ocupadas = units.reduce((s, u) => s + u.current_count, 0);
    return res.status(200).json({
      total_vagas,
      ocupadas,
      livres: total_vagas - ocupadas,
      percentual: total_vagas > 0 ? Math.round((ocupadas / total_vagas) * 100) : 0,
      units,
    });
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({error: "Internal server error"});
  }
});

// ############################################
// NOVAS ROTAS: Relatórios
// ############################################

// GET /reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
app.get("/reports/summary", async (req, res) => {
  try {
    requireRole(req, "admin");
    const db = await getPool();
    const from = req.query.from || "2000-01-01";
    const to = req.query.to || "2099-12-31";

    const result = await db.request()
      .input("from", sql.NVarChar, from)
      .input("to", sql.NVarChar, to)
      .query(`
        SELECT
          COUNT(*) AS total_tickets,
          SUM(CASE WHEN paid = 1 THEN 1 ELSE 0 END) AS total_paid,
          SUM(CASE WHEN paid = 0 AND status IN ('active', 'payment_pending') THEN 1 ELSE 0 END) AS total_pending,
          SUM(CASE WHEN status = 'exited' THEN 1 ELSE 0 END) AS total_exited,
          ISNULL(SUM(CASE WHEN paid = 1 THEN amount ELSE 0 END), 0) AS total_revenue
        FROM tickets
        WHERE created_at >= @from AND created_at <= DATEADD(day, 1, CAST(@to AS DATE))
      `);

    return res.status(200).json(result.recordset[0]);
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "reports error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// GET /reports/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
app.get("/reports/daily", async (req, res) => {
  try {
    requireRole(req, "admin");
    const db = await getPool();
    const from = req.query.from || "2000-01-01";
    const to = req.query.to || "2099-12-31";

    const result = await db.request()
      .input("from", sql.NVarChar, from)
      .input("to", sql.NVarChar, to)
      .query(`
        SELECT
          CAST(created_at AS DATE) AS date,
          COUNT(*) AS tickets,
          SUM(CASE WHEN paid = 1 THEN 1 ELSE 0 END) AS paid,
          ISNULL(SUM(CASE WHEN paid = 1 THEN amount ELSE 0 END), 0) AS revenue
        FROM tickets
        WHERE created_at >= @from AND created_at <= DATEADD(day, 1, CAST(@to AS DATE))
        GROUP BY CAST(created_at AS DATE)
        ORDER BY date DESC
      `);

    return res.status(200).json(result.recordset);
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "reports daily error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// GET /reports/audit?limit=50
app.get("/reports/audit", async (req, res) => {
  try {
    requireRole(req, "admin");
    const db = await getPool();
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);

    const result = await db.request()
      .input("limit", sql.Int, limit)
      .query("SELECT TOP (@limit) * FROM audit_logs ORDER BY created_at DESC");

    return res.status(200).json(result.recordset);
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({error: "Internal server error"});
  }
});

// ############################################
// NOVAS ROTAS: Configuração de Tarifação
// ############################################

// GET /pricing
app.get("/pricing", async (req, res) => {
  try {
    requireRole(req, "admin");
    const db = await getPool();
    const result = await db.request().query("SELECT * FROM pricing_config ORDER BY id");
    return res.status(200).json(result.recordset);
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({error: "Internal server error"});
  }
});

// PATCH /pricing/:id
app.patch("/pricing/:id", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const {price_per_hour, max_daily, tolerance_minutes} = req.body;
    const db = await getPool();

    const request = db.request().input("id", sql.Int, parseInt(req.params.id));
    const sets = [];

    if (price_per_hour !== undefined) {
      request.input("price_per_hour", sql.Decimal(10, 2), price_per_hour);
      sets.push("price_per_hour = @price_per_hour");
    }
    if (max_daily !== undefined) {
      request.input("max_daily", sql.Decimal(10, 2), max_daily);
      sets.push("max_daily = @max_daily");
    }
    if (tolerance_minutes !== undefined) {
      request.input("tolerance_minutes", sql.Int, tolerance_minutes);
      sets.push("tolerance_minutes = @tolerance_minutes");
    }

    if (sets.length === 0) return res.status(400).json({error: "Nenhum campo para atualizar"});

    const result = await request.query(`UPDATE pricing_config SET ${sets.join(", ")} WHERE id = @id`);

    if (result.rowsAffected[0] === 0) return res.status(404).json({error: "Configuração não encontrada"});

    cache.invalidate("pricing_config");
    await auditLog("PRICING_UPDATE", decoded.id, decoded.role,
      JSON.stringify({price_per_hour, max_daily, tolerance_minutes}), getClientIp(req));
    return res.status(200).json({message: "Tarifação atualizada"});
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "pricing PATCH error", { error: error.message });
    return res.status(500).json({error: "Internal server error"});
  }
});

// ############################################
// Alerts Config (admin only)
// ############################################
app.get("/alerts/config", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const db = await getPool();
    const result = await db.request()
      .query("SELECT config_key, config_value, updated_at FROM system_config WHERE config_key LIKE 'alerts_%'");

    const config = {};
    for (const row of result.recordset) {
      config[row.config_key] = row.config_value;
    }
    return res.status(200).json(config);
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "alerts config GET error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/alerts/config", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const { alerts_enabled, alerts_webhook_url, alerts_events } = req.body;
    const db = await getPool();

    if (alerts_webhook_url !== undefined) {
      if (alerts_webhook_url && !/^https?:\/\/.+/.test(alerts_webhook_url)) {
        return res.status(400).json({ error: "URL de webhook inválida" });
      }
      await db.request()
        .input("val", sql.NVarChar, alerts_webhook_url)
        .query("UPDATE system_config SET config_value = @val, updated_at = GETDATE() WHERE config_key = 'alerts_webhook_url'");
    }
    if (alerts_enabled !== undefined) {
      const val = alerts_enabled === true || alerts_enabled === "true" ? "true" : "false";
      await db.request()
        .input("val", sql.NVarChar, val)
        .query("UPDATE system_config SET config_value = @val, updated_at = GETDATE() WHERE config_key = 'alerts_enabled'");
    }
    if (alerts_events !== undefined) {
      const val = Array.isArray(alerts_events) ? alerts_events.join(",") : String(alerts_events);
      await db.request()
        .input("val", sql.NVarChar, val)
        .query("UPDATE system_config SET config_value = @val, updated_at = GETDATE() WHERE config_key = 'alerts_events'");
    }

    await auditLog("ALERTS_CONFIG_UPDATE", decoded.id, decoded.role,
      JSON.stringify({ alerts_enabled, alerts_webhook_url, alerts_events }), getClientIp(req));
    return res.status(200).json({ message: "Configuração de alertas atualizada" });
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "alerts config PATCH error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ############################################
// TOTEM / PAYSTATION — Endpoints de autoatendimento
// ############################################

// POST /api/v1/totem/lookup — busca ticket por nº ou placa
app.post("/api/v1/totem/lookup", totemLimiter, authenticateTotem, async (req, res) => {
  try {
    const { ticket_no, plate } = req.body;
    if (!ticket_no && !plate) {
      return res.status(400).json({ error: "Informe ticket_no ou plate." });
    }

    const db = await getPool();
    let result;
    if (ticket_no) {
      result = await db.request()
        .input("ticket_no", sql.NVarChar, ticket_no)
        .query("SELECT id, ticket_no, reg_no, first_name, last_name, created_at, status, paid, paid_at, amount FROM tickets WHERE ticket_no = @ticket_no AND status IN ('active','payment_pending','paid')");
    } else {
      const cleanPlate = stripPlateChars(plate);
      if (!cleanPlate) return res.status(400).json({ error: "Placa inválida." });
      result = await db.request()
        .input("reg_no", sql.NVarChar, cleanPlate)
        .query("SELECT TOP 1 id, ticket_no, reg_no, first_name, last_name, created_at, status, paid, paid_at, amount FROM tickets WHERE reg_no = @reg_no AND status IN ('active','payment_pending','paid') ORDER BY created_at DESC");
    }

    if (result.recordset.length === 0) {
      await logTotemTransaction(req.totemDevice.id, ticket_no || plate, null, "lookup", null, null, { found: false });
      return res.status(404).json({ error: "Ticket não encontrado." });
    }

    const ticket = result.recordset[0];
    await logTotemTransaction(req.totemDevice.id, ticket.ticket_no, ticket.id, "lookup", null, null, { found: true });

    return res.status(200).json({
      ticket_no: ticket.ticket_no,
      reg_no: ticket.reg_no,
      first_name: ticket.first_name,
      last_name: ticket.last_name,
      entry_time: ticket.created_at,
      status: ticket.status,
      paid: !!ticket.paid,
      paid_at: ticket.paid_at,
    });
  } catch (error) {
    if (isDbError(error)) { res.set("Retry-After", "10"); return res.status(503).json({ error: "Serviço temporariamente indisponível." }); }
    log("ERROR", "totem lookup error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/totem/calculate — calcula valor em tempo real
app.post("/api/v1/totem/calculate", totemLimiter, authenticateTotem, async (req, res) => {
  try {
    const ticket_no = (req.body.ticket_no || "").trim();
    if (!ticket_no) return res.status(400).json({ error: "ticket_no é obrigatório." });

    const db = await getPool();
    const result = await db.request()
      .input("ticket_no", sql.NVarChar, ticket_no)
      .query("SELECT id, ticket_no, created_at, status, paid FROM tickets WHERE ticket_no = @ticket_no");

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Ticket não encontrado." });
    }

    const ticket = result.recordset[0];
    if (ticket.paid) {
      return res.status(200).json({ ticket_no: ticket.ticket_no, amount: 0, already_paid: true, message: "Ticket já está pago." });
    }
    if (ticket.status !== "active") {
      return res.status(400).json({ error: "Ticket em estado inválido para cálculo." });
    }

    const amount = await calculatePrice(ticket.created_at);

    // Get pricing config for breakdown
    let pricing = cache.get("pricing_config");
    if (!pricing) {
      const cfg = await db.request().query("SELECT TOP 1 * FROM pricing_config WHERE active = 1 ORDER BY id");
      pricing = cfg.recordset.length > 0 ? cfg.recordset[0] : null;
      cache.set("pricing_config", pricing, 5 * 60 * 1000);
    }

    const diffResult = await db.request()
      .input("entry_time", sql.DateTime2, ticket.created_at)
      .query("SELECT DATEDIFF(MINUTE, @entry_time, GETDATE()) AS diff_min");
    const diffMin = diffResult.recordset[0].diff_min;

    await logTotemTransaction(req.totemDevice.id, ticket_no, ticket.id, "calculate", amount, null, { minutes: diffMin });

    return res.status(200).json({
      ticket_no: ticket.ticket_no,
      amount,
      already_paid: false,
      breakdown: {
        entry_time: ticket.created_at,
        minutes_parked: diffMin,
        hours_charged: amount > 0 ? Math.ceil(diffMin / 60) : 0,
        price_per_hour: pricing ? parseFloat(pricing.price_per_hour) : 10,
        max_daily: pricing ? parseFloat(pricing.max_daily) : 50,
        tolerance_minutes: pricing ? pricing.tolerance_minutes : 15,
      },
    });
  } catch (error) {
    if (isDbError(error)) { res.set("Retry-After", "10"); return res.status(503).json({ error: "Serviço temporariamente indisponível." }); }
    log("ERROR", "totem calculate error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/totem/pay — efetua pagamento
app.post("/api/v1/totem/pay", totemPayLimiter, authenticateTotem, async (req, res) => {
  try {
    const ticket_no = (req.body.ticket_no || "").trim();
    const { method } = req.body;
    if (!ticket_no) return res.status(400).json({ error: "ticket_no é obrigatório." });

    const validMethods = ["dinheiro", "cartao", "pix"];
    const payMethod = method || "dinheiro";
    if (!validMethods.includes(payMethod)) {
      return res.status(400).json({ error: "Método inválido. Válidos: " + validMethods.join(", ") });
    }

    await logTotemTransaction(req.totemDevice.id, ticket_no, null, "payment_start", null, payMethod, null);

    try {
      const result = await processPayment(ticket_no, payMethod, {
        id: null, role: "totem", uname: req.totemDevice.name,
        type: "totem", deviceId: req.totemDevice.id, ip: getClientIp(req),
      });

      await logTotemTransaction(req.totemDevice.id, ticket_no, result.ticket_id, "payment_success", result.amount, payMethod, null);

      return res.status(200).json({
        message: "Pagamento realizado com sucesso.",
        ticket_no,
        paid: true,
        amount: result.amount,
        payment_method: result.payment_method,
      });
    } catch (payErr) {
      await logTotemTransaction(req.totemDevice.id, ticket_no, null, "payment_fail", null, payMethod, { error: payErr.message });
      if (payErr.statusCode) return res.status(payErr.statusCode).json({ error: payErr.message });
      throw payErr;
    }
  } catch (error) {
    if (isDbError(error)) { res.set("Retry-After", "10"); return res.status(503).json({ error: "Serviço temporariamente indisponível." }); }
    log("ERROR", "totem pay error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/totem/receipt/:ticketNo — dados do recibo
app.get("/api/v1/totem/receipt/:ticketNo", totemLimiter, authenticateTotem, async (req, res) => {
  try {
    const ticketNo = req.params.ticketNo;
    const db = await getPool();
    const result = await db.request()
      .input("ticket_no", sql.NVarChar, ticketNo)
      .query("SELECT * FROM tickets WHERE ticket_no = @ticket_no");

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Ticket não encontrado." });
    }

    const ticket = result.recordset[0];
    if (!ticket.paid) {
      return res.status(400).json({ error: "Ticket ainda não foi pago." });
    }

    // Get payment record
    const payResult = await db.request()
      .input("tno", sql.NVarChar, ticketNo)
      .query("SELECT TOP 1 method, amount, status, created_at AS payment_time FROM payments WHERE ticket_no = @tno ORDER BY created_at DESC");

    const payment = payResult.recordset.length > 0 ? payResult.recordset[0] : null;

    // Calculate time parked
    const diffResult = await db.request()
      .input("entry_time", sql.DateTime2, ticket.created_at)
      .input("paid_at", sql.DateTime2, ticket.paid_at)
      .query("SELECT DATEDIFF(MINUTE, @entry_time, @paid_at) AS total_minutes");
    const totalMinutes = diffResult.recordset[0].total_minutes;

    // Grace period
    const graceMinutes = await getGraceMinutes();

    // Remaining grace
    const graceElapsed = await db.request()
      .input("paid_at2", sql.DateTime2, ticket.paid_at)
      .query("SELECT DATEDIFF(MINUTE, @paid_at2, GETDATE()) AS elapsed");
    const graceRemaining = Math.max(0, graceMinutes - graceElapsed.recordset[0].elapsed);

    await logTotemTransaction(req.totemDevice.id, ticketNo, ticket.id, "receipt", null, null, null);

    return res.status(200).json({
      ticket_no: ticket.ticket_no,
      reg_no: ticket.reg_no,
      first_name: ticket.first_name,
      last_name: ticket.last_name,
      entry_time: ticket.created_at,
      paid_at: ticket.paid_at,
      total_minutes: totalMinutes,
      amount: payment ? parseFloat(payment.amount) : parseFloat(ticket.amount),
      payment_method: payment ? payment.method : ticket.payment_method,
      grace_period_minutes: graceMinutes,
      grace_remaining_minutes: graceRemaining,
      message: graceRemaining > 0 ? `Você tem ${graceRemaining} minuto(s) para sair.` : "Período de tolerância expirado.",
    });
  } catch (error) {
    if (isDbError(error)) { res.set("Retry-After", "10"); return res.status(503).json({ error: "Serviço temporariamente indisponível." }); }
    log("ERROR", "totem receipt error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/totem/heartbeat — sinaliza que totem está vivo
app.post("/api/v1/totem/heartbeat", totemLimiter, authenticateTotem, async (req, res) => {
  try {
    const db = await getPool();

    // Get pricing + grace for config sync
    let pricing = cache.get("pricing_config");
    if (!pricing) {
      const cfg = await db.request().query("SELECT TOP 1 * FROM pricing_config WHERE active = 1 ORDER BY id");
      pricing = cfg.recordset.length > 0 ? cfg.recordset[0] : null;
      cache.set("pricing_config", pricing, 5 * 60 * 1000);
    }

    const graceMinutes = await getGraceMinutes();

    return res.status(200).json({
      status: "ok",
      device_id: req.totemDevice.id,
      device_name: req.totemDevice.name,
      config: {
        grace_period_minutes: graceMinutes,
        pricing: pricing ? {
          price_per_hour: parseFloat(pricing.price_per_hour),
          max_daily: parseFloat(pricing.max_daily),
          tolerance_minutes: pricing.tolerance_minutes,
        } : { price_per_hour: 10, max_daily: 50, tolerance_minutes: 15 },
      },
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    if (isDbError(error)) { res.set("Retry-After", "10"); return res.status(503).json({ error: "Serviço temporariamente indisponível." }); }
    log("ERROR", "totem heartbeat error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/totem/status — lista todos os totems (admin)
app.get("/api/v1/totem/status", async (req, res) => {
  try {
    requireRole(req, "admin");
    const db = await getPool();
    const result = await db.request().query(`
      SELECT d.id, d.device_name, d.unit_id, d.is_active, d.last_heartbeat, d.created_at,
        DATEDIFF(MINUTE, d.last_heartbeat, GETDATE()) AS minutes_since_heartbeat,
        (SELECT TOP 1 action FROM totem_transactions WHERE device_id = d.id ORDER BY created_at DESC) AS last_action,
        (SELECT TOP 1 created_at FROM totem_transactions WHERE device_id = d.id ORDER BY created_at DESC) AS last_action_at
      FROM totem_devices d
      ORDER BY d.created_at DESC
    `);

    const devices = result.recordset.map(d => ({
      ...d,
      is_active: !!d.is_active,
      online: d.last_heartbeat && d.minutes_since_heartbeat <= 5,
    }));

    return res.status(200).json(devices);
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "totem status error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ############################################
// TOTEM — Admin: Gestão de Dispositivos
// ############################################

// GET /totem/devices
app.get("/totem/devices", async (req, res) => {
  try {
    requireRole(req, "admin");
    const db = await getPool();
    const result = await db.request().query(`
      SELECT id, device_name, api_key_prefix, unit_id, is_active, last_heartbeat, created_at
      FROM totem_devices ORDER BY created_at DESC
    `);
    return res.status(200).json(result.recordset.map(d => ({ ...d, is_active: !!d.is_active })));
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /totem/devices — registra novo dispositivo (retorna API key uma única vez)
app.post("/totem/devices", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const { device_name, unit_id } = req.body;
    if (!device_name) return res.status(400).json({ error: "device_name é obrigatório." });

    const targetUnit = unit_id || 1;

    // Generate random API key (48 chars hex)
    const rawKey = crypto.randomBytes(24).toString("hex");
    const prefix = rawKey.substring(0, 8);
    const hashedKey = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);

    const db = await getPool();
    const result = await db.request()
      .input("device_name", sql.NVarChar, device_name)
      .input("api_key", sql.NVarChar, hashedKey)
      .input("api_key_prefix", sql.NVarChar, prefix)
      .input("unit_id", sql.Int, targetUnit)
      .query("INSERT INTO totem_devices (device_name, api_key, api_key_prefix, unit_id) OUTPUT INSERTED.id VALUES (@device_name, @api_key, @api_key_prefix, @unit_id)");

    const deviceId = result.recordset[0].id;
    await auditLog("TOTEM_DEVICE_CREATE", decoded.id, decoded.role, `Device: ${device_name} (ID: ${deviceId})`, getClientIp(req));

    return res.status(201).json({
      message: "Dispositivo criado com sucesso.",
      device_id: deviceId,
      device_name,
      api_key: rawKey,
      api_key_prefix: prefix,
      warning: "Guarde a API key. Ela não será exibida novamente.",
    });
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "totem devices POST error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /totem/devices/:id — ativar/desativar
app.patch("/totem/devices/:id", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const { is_active, device_name } = req.body;
    const deviceId = parseInt(req.params.id);

    const db = await getPool();
    const sets = [];
    const request = db.request().input("id", sql.Int, deviceId);

    if (is_active !== undefined) {
      request.input("is_active", sql.Bit, is_active ? 1 : 0);
      sets.push("is_active = @is_active");
    }
    if (device_name !== undefined) {
      request.input("device_name", sql.NVarChar, device_name);
      sets.push("device_name = @device_name");
    }

    if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar." });

    const result = await request.query(`UPDATE totem_devices SET ${sets.join(", ")} WHERE id = @id`);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Dispositivo não encontrado." });

    await auditLog("TOTEM_DEVICE_UPDATE", decoded.id, decoded.role, `Device ID: ${deviceId}, Changes: ${sets.join(", ")}`, getClientIp(req));
    return res.status(200).json({ message: "Dispositivo atualizado." });
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "totem devices PATCH error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /totem/devices/:id
app.delete("/totem/devices/:id", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const deviceId = parseInt(req.params.id);

    const db = await getPool();
    // Soft-delete: disable instead of hard-delete (FK constraints)
    const result = await db.request()
      .input("id", sql.Int, deviceId)
      .query("UPDATE totem_devices SET is_active = 0 WHERE id = @id");
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Dispositivo não encontrado." });

    await auditLog("TOTEM_DEVICE_DELETE", decoded.id, decoded.role, `Device ID: ${deviceId}`, getClientIp(req));
    return res.status(200).json({ message: "Dispositivo desativado." });
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /totem/transactions — lista transações (admin)
app.get("/totem/transactions", async (req, res) => {
  try {
    requireRole(req, "admin");
    const db = await getPool();
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const request = db.request().input("limit", sql.Int, limit);

    let where = "1=1";
    if (req.query.device_id) {
      request.input("device_id", sql.Int, parseInt(req.query.device_id));
      where += " AND t.device_id = @device_id";
    }
    if (req.query.action) {
      request.input("action", sql.NVarChar, req.query.action);
      where += " AND t.action = @action";
    }
    if (req.query.from) {
      request.input("from_date", sql.NVarChar, req.query.from);
      where += " AND t.created_at >= @from_date";
    }
    if (req.query.to) {
      request.input("to_date", sql.NVarChar, req.query.to);
      where += " AND t.created_at <= DATEADD(day, 1, CAST(@to_date AS DATE))";
    }

    const result = await request.query(`
      SELECT TOP (@limit) t.*, d.device_name
      FROM totem_transactions t
      LEFT JOIN totem_devices d ON d.id = t.device_id
      WHERE ${where}
      ORDER BY t.created_at DESC
    `);

    return res.status(200).json(result.recordset);
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "totem transactions error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ############################################
// Phase 4: PIX Real (Mercado Pago)
// ############################################

// POST /api/v1/pix/generate — Gerar QR Code PIX para pagamento
app.post("/api/v1/pix/generate", async (req, res) => {
  try {
    const ticket_no = (req.body.ticket_no || "").trim();
    if (!ticket_no) return res.status(400).json({ error: "ticket_no é obrigatório." });

    const db = await getPool();
    const ticketResult = await db.request()
      .input("ticket_no", sql.NVarChar, ticket_no)
      .query("SELECT * FROM tickets WHERE ticket_no = @ticket_no");
    if (ticketResult.recordset.length === 0) return res.status(404).json({ error: "Ticket não encontrado." });

    const ticket = ticketResult.recordset[0];
    if (ticket.paid) return res.status(400).json({ error: "Ticket já pago." });
    if (ticket.status !== "active") return res.status(400).json({ error: "Ticket com status inválido para pagamento." });

    const amount = await calculatePrice(ticket.created_at);

    // Buscar expiração PIX do system_config
    let pixExpMin = cache.get("pix_expiration_minutes");
    if (pixExpMin === null) {
      const cfgRes = await db.request()
        .query("SELECT config_value FROM system_config WHERE config_key = 'pix_expiration_minutes'");
      pixExpMin = cfgRes.recordset.length > 0 ? parseInt(cfgRes.recordset[0].config_value) : 30;
      cache.set("pix_expiration_minutes", pixExpMin, 5 * 60 * 1000);
    }

    // Cancelar PIX pendente anterior para este ticket
    await db.request().input("tno", sql.NVarChar, ticket_no)
      .query("UPDATE pix_transactions SET status = 'cancelled' WHERE ticket_no = @tno AND status = 'pending'");

    const charge = await createPixCharge(ticket_no, amount, pixExpMin);

    // Salvar na tabela pix_transactions
    await db.request()
      .input("ticket_no", sql.NVarChar, ticket_no)
      .input("gateway_payment_id", sql.NVarChar, charge.gateway_payment_id)
      .input("qr_code", sql.NVarChar(sql.MAX), charge.qr_code)
      .input("qr_code_base64", sql.NVarChar(sql.MAX), charge.qr_code_base64)
      .input("amount", sql.Decimal(10, 2), amount)
      .input("expires_at", sql.DateTime2, charge.expires_at)
      .query(`INSERT INTO pix_transactions (ticket_no, gateway_payment_id, qr_code, qr_code_base64, amount, status, expires_at)
              VALUES (@ticket_no, @gateway_payment_id, @qr_code, @qr_code_base64, @amount, 'pending', @expires_at)`);

    log("INFO", `PIX generated for ${ticket_no}`, { amount, gateway_id: charge.gateway_payment_id });

    return res.status(201).json({
      ticket_no,
      amount,
      qr_code: charge.qr_code,
      qr_code_base64: charge.qr_code_base64,
      gateway_payment_id: charge.gateway_payment_id,
      expires_at: charge.expires_at.toISOString(),
      expires_in_minutes: pixExpMin,
    });
  } catch (error) {
    if (isDbError(error)) { res.set("Retry-After", "10"); return res.status(503).json({ error: "Serviço temporariamente indisponível." }); }
    log("ERROR", "PIX generate error", { error: error.message });
    return res.status(500).json({ error: "Erro ao gerar PIX." });
  }
});

// GET /api/v1/pix/status/:gatewayId — Consultar status de um PIX
app.get("/api/v1/pix/status/:gatewayId", async (req, res) => {
  try {
    const gatewayId = req.params.gatewayId;
    const db = await getPool();

    const localResult = await db.request()
      .input("gid", sql.NVarChar, gatewayId)
      .query("SELECT * FROM pix_transactions WHERE gateway_payment_id = @gid");
    if (localResult.recordset.length === 0) return res.status(404).json({ error: "Transação PIX não encontrada." });

    const pixTx = localResult.recordset[0];

    // Se já aprovado ou cancelado, retorna direto
    if (pixTx.status === "approved" || pixTx.status === "failed" || pixTx.status === "cancelled") {
      return res.status(200).json({
        ticket_no: pixTx.ticket_no,
        status: pixTx.status,
        amount: pixTx.amount,
        confirmed_at: pixTx.confirmed_at,
      });
    }

    // Verificar se expirou
    if (pixTx.expires_at && new Date(pixTx.expires_at) < new Date()) {
      await db.request().input("gid", sql.NVarChar, gatewayId)
        .query("UPDATE pix_transactions SET status = 'expired' WHERE gateway_payment_id = @gid AND status = 'pending'");
      return res.status(200).json({ ticket_no: pixTx.ticket_no, status: "expired", amount: pixTx.amount });
    }

    // Consultar gateway real
    const gwStatus = await checkPixStatus(gatewayId);

    if (gwStatus.status === "approved") {
      // Confirmar pagamento no sistema
      await db.request().input("gid", sql.NVarChar, gatewayId)
        .query("UPDATE pix_transactions SET status = 'approved', confirmed_at = GETDATE() WHERE gateway_payment_id = @gid");

      // Processar pagamento no ticket
      try {
        await processPayment(pixTx.ticket_no, "pix", {
          id: null, role: "system", uname: "pix_gateway", type: "gateway", ip: "webhook",
        });
        // Atualizar gateway_id no payments
        await db.request()
          .input("tno", sql.NVarChar, pixTx.ticket_no)
          .input("gid", sql.NVarChar, gatewayId)
          .query("UPDATE payments SET gateway_id = @gid WHERE ticket_no = @tno AND gateway_id IS NULL");

        log("INFO", `PIX confirmed for ${pixTx.ticket_no}`, { gateway_id: gatewayId });
      } catch (payErr) {
        log("WARN", `PIX confirmed but processPayment failed: ${payErr.message}`, { ticket: pixTx.ticket_no });
      }
      return res.status(200).json({ ticket_no: pixTx.ticket_no, status: "approved", amount: pixTx.amount, confirmed_at: new Date().toISOString() });
    }

    return res.status(200).json({ ticket_no: pixTx.ticket_no, status: gwStatus.status, amount: pixTx.amount });
  } catch (error) {
    log("ERROR", "PIX status error", { error: error.message });
    return res.status(500).json({ error: "Erro ao consultar PIX." });
  }
});

// POST /webhook/mercadopago — Webhook de confirmação do Mercado Pago
app.post("/webhook/mercadopago", async (req, res) => {
  try {
    // Verificar assinatura do webhook (se configurado)
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;
    if (webhookSecret && req.headers["x-signature"]) {
      const xSignature = req.headers["x-signature"];
      const xRequestId = req.headers["x-request-id"] || "";
      const dataId = req.query["data.id"] || req.body?.data?.id || "";
      const parts = {};
      xSignature.split(",").forEach(p => { const [k, v] = p.trim().split("="); if (k && v) parts[k] = v; });
      const ts = parts.ts || "";
      const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
      const hmac = crypto.createHmac("sha256", webhookSecret).update(manifest).digest("hex");
      if (hmac !== parts.v1) {
        log("WARN", "Webhook signature mismatch");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    const { type, data } = req.body;

    // Mercado Pago envia type="payment" com data.id
    if (type === "payment" && data?.id) {
      const gatewayId = String(data.id);
      const db = await getPool();

      // Atomicamente marcar PIX como processando (evita duplicação de webhook)
      const pixClaim = await db.request()
        .input("gid", sql.NVarChar, gatewayId)
        .query("UPDATE pix_transactions SET status = 'processing' OUTPUT INSERTED.* WHERE gateway_payment_id = @gid AND status = 'pending'");

      if (pixClaim.recordset.length > 0) {
        const pixTx = pixClaim.recordset[0];
        const gwStatus = await checkPixStatus(gatewayId);

        if (gwStatus.status === "approved") {
          await db.request().input("gid", sql.NVarChar, gatewayId)
            .query("UPDATE pix_transactions SET status = 'approved', confirmed_at = GETDATE() WHERE gateway_payment_id = @gid");

          try {
            await processPayment(pixTx.ticket_no, "pix", {
              id: null, role: "system", uname: "pix_webhook", type: "gateway", ip: "webhook",
            });
            await db.request()
              .input("tno", sql.NVarChar, pixTx.ticket_no)
              .input("gid", sql.NVarChar, gatewayId)
              .query("UPDATE payments SET gateway_id = @gid WHERE ticket_no = @tno AND gateway_id IS NULL");
            log("INFO", `Webhook: PIX confirmed for ${pixTx.ticket_no}`);
          } catch (payErr) {
            log("WARN", `Webhook: PIX confirmed but processPayment failed: ${payErr.message}`, { ticket: pixTx.ticket_no });
          }
        } else {
          // Reverter para pending se gateway não aprovou
          await db.request().input("gid", sql.NVarChar, gatewayId)
            .query("UPDATE pix_transactions SET status = 'pending' WHERE gateway_payment_id = @gid AND status = 'processing'");
        }
      }

      // Atomicamente marcar Card como processando
      const cardClaim = await db.request()
        .input("gid", sql.NVarChar, gatewayId)
        .query("UPDATE card_transactions SET status = 'processing' OUTPUT INSERTED.* WHERE gateway_payment_id = @gid AND status = 'pending'");

      if (cardClaim.recordset.length > 0) {
        const cardTx = cardClaim.recordset[0];
        const mp = getMercadoPago();
        if (mp) {
          const paymentInfo = await mpPayment.get({ id: gatewayId });
          if (paymentInfo.status === "approved") {
            await db.request().input("gid", sql.NVarChar, gatewayId)
              .query("UPDATE card_transactions SET status = 'captured', auth_code = COALESCE(auth_code, 'WH_APPROVED') WHERE gateway_payment_id = @gid");
            try {
              await processPayment(cardTx.ticket_no, "cartao", {
                id: null, role: "system", uname: "card_webhook", type: "gateway", ip: "webhook",
              });
              await db.request()
                .input("tno", sql.NVarChar, cardTx.ticket_no)
                .input("gid", sql.NVarChar, gatewayId)
                .query("UPDATE payments SET gateway_id = @gid WHERE ticket_no = @tno AND gateway_id IS NULL");
              log("INFO", `Webhook: Card confirmed for ${cardTx.ticket_no}`);
            } catch (payErr) {
              log("WARN", `Webhook: Card confirmed but processPayment failed: ${payErr.message}`);
            }
          } else {
            await db.request().input("gid", sql.NVarChar, gatewayId)
              .query("UPDATE card_transactions SET status = 'pending' WHERE gateway_payment_id = @gid AND status = 'processing'");
          }
        } else {
          await db.request().input("gid", sql.NVarChar, gatewayId)
            .query("UPDATE card_transactions SET status = 'pending' WHERE gateway_payment_id = @gid AND status = 'processing'");
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    log("ERROR", "Webhook error", { error: error.message });
    return res.status(200).json({ received: true }); // Sempre 200 para evitar reenvio
  }
});

// ############################################
// Phase 4: Card/TEF (Mercado Pago)
// ############################################

// POST /api/v1/card/authorize — Autorizar pagamento com cartão
app.post("/api/v1/card/authorize", async (req, res) => {
  try {
    const ticket_no = (req.body.ticket_no || "").trim();
    const { card_token, installments, payer_email } = req.body;
    if (!ticket_no) return res.status(400).json({ error: "ticket_no é obrigatório." });
    if (!card_token) return res.status(400).json({ error: "card_token é obrigatório. Use o SDK frontend do Mercado Pago para tokenizar." });

    const db = await getPool();
    const ticketResult = await db.request()
      .input("ticket_no", sql.NVarChar, ticket_no)
      .query("SELECT * FROM tickets WHERE ticket_no = @ticket_no");
    if (ticketResult.recordset.length === 0) return res.status(404).json({ error: "Ticket não encontrado." });

    const ticket = ticketResult.recordset[0];
    if (ticket.paid) return res.status(400).json({ error: "Ticket já pago." });
    if (ticket.status !== "active") return res.status(400).json({ error: "Ticket com status inválido." });

    const amount = await calculatePrice(ticket.created_at);
    const inst = Math.min(Math.max(parseInt(installments) || 1, 1), 12);

    const cardResult = await authorizeCard(ticket_no, amount, card_token, inst, payer_email);

    // Salvar na tabela card_transactions
    await db.request()
      .input("ticket_no", sql.NVarChar, ticket_no)
      .input("gateway_payment_id", sql.NVarChar, cardResult.gateway_payment_id)
      .input("card_last4", sql.NVarChar(4), cardResult.card_last4)
      .input("card_brand", sql.NVarChar(30), cardResult.card_brand)
      .input("installments", sql.Int, cardResult.installments)
      .input("auth_code", sql.NVarChar(50), cardResult.auth_code)
      .input("amount", sql.Decimal(10, 2), amount)
      .input("status", sql.NVarChar(20), cardResult.status)
      .query(`INSERT INTO card_transactions (ticket_no, gateway_payment_id, card_last4, card_brand, installments, auth_code, amount, status)
              VALUES (@ticket_no, @gateway_payment_id, @card_last4, @card_brand, @installments, @auth_code, @amount, @status)`);

    if (cardResult.status === "authorized") {
      // Processar pagamento imediatamente
      const payResult = await processPayment(ticket_no, "cartao", {
        id: null, role: "system", uname: "card_gateway", type: "gateway", ip: getClientIp(req),
      });
      await db.request()
        .input("tno", sql.NVarChar, ticket_no)
        .input("gid", sql.NVarChar, cardResult.gateway_payment_id)
        .query("UPDATE payments SET gateway_id = @gid WHERE ticket_no = @tno AND gateway_id IS NULL");

      log("INFO", `Card payment approved for ${ticket_no}`, { last4: cardResult.card_last4, amount });

      return res.status(200).json({
        message: "Pagamento com cartão aprovado.",
        ticket_no,
        paid: true,
        amount: payResult.amount,
        card_last4: cardResult.card_last4,
        card_brand: cardResult.card_brand,
        auth_code: cardResult.auth_code,
        installments: cardResult.installments,
        gateway_payment_id: cardResult.gateway_payment_id,
      });
    }

    // Se não foi autorizado
    log("WARN", `Card payment failed for ${ticket_no}`, { status: cardResult.status });
    return res.status(402).json({
      error: "Pagamento com cartão recusado.",
      status: cardResult.status,
      gateway_payment_id: cardResult.gateway_payment_id,
    });
  } catch (error) {
    if (isDbError(error)) { res.set("Retry-After", "10"); return res.status(503).json({ error: "Serviço temporariamente indisponível." }); }
    log("ERROR", "Card authorize error", { error: error.message });
    return res.status(500).json({ error: "Erro ao processar cartão." });
  }
});

// POST /api/v1/card/refund — Estorno de pagamento cartão
app.post("/api/v1/card/refund", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const { gateway_payment_id, amount } = req.body;
    if (!gateway_payment_id) return res.status(400).json({ error: "gateway_payment_id é obrigatório." });

    const db = await getPool();
    const cardTx = await db.request()
      .input("gid", sql.NVarChar, gateway_payment_id)
      .query("SELECT * FROM card_transactions WHERE gateway_payment_id = @gid");
    if (cardTx.recordset.length === 0) return res.status(404).json({ error: "Transação não encontrada." });

    const tx = cardTx.recordset[0];
    if (tx.status === "refunded") return res.status(400).json({ error: "Já estornado." });

    const refundResult = await refundPayment(gateway_payment_id, amount || tx.amount);

    await db.request()
      .input("gid", sql.NVarChar, gateway_payment_id)
      .query("UPDATE card_transactions SET status = 'refunded' WHERE gateway_payment_id = @gid");

    await auditLog("REFUND", decoded.id, decoded.role, `Card refund: ${gateway_payment_id}, Ticket: ${tx.ticket_no}`, getClientIp(req));
    log("INFO", `Card refund for ${tx.ticket_no}`, { gateway_id: gateway_payment_id });

    return res.status(200).json({ message: "Estorno realizado.", ...refundResult, ticket_no: tx.ticket_no });
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "Card refund error", { error: error.message });
    return res.status(500).json({ error: "Erro ao estornar." });
  }
});

// ############################################
// Phase 4: LPR (License Plate Recognition)
// ############################################

// POST /api/v1/lpr/entry — Câmera detectou placa na ENTRADA
app.post("/api/v1/lpr/entry", authenticateLpr, lprRateLimiter, async (req, res) => {
  try {
    const { plate, confidence, photo_path } = req.body;
    if (!plate) return res.status(400).json({ error: "plate é obrigatório." });

    const cleanPlate = plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const db = await getPool();

    // Checar blacklist
    const blackResult = await db.request().input("plate", sql.NVarChar, cleanPlate)
      .query("SELECT TOP 1 id FROM blacklist WHERE reg_no = @plate AND active = 1");
    const isBlacklisted = blackResult.recordset.length > 0;

    // Checar whitelist
    const whiteResult = await db.request().input("plate", sql.NVarChar, cleanPlate)
      .query("SELECT TOP 1 id FROM whitelist WHERE reg_no = @plate AND active = 1");
    const isWhitelisted = whiteResult.recordset.length > 0;

    // Checar ticket ativo
    const activeTicket = await db.request().input("plate", sql.NVarChar, cleanPlate)
      .query("SELECT TOP 1 ticket_no FROM tickets WHERE reg_no = @plate AND status IN ('active','paid','payment_pending')");
    const hasActiveTicket = activeTicket.recordset.length > 0;

    let actionTaken = "registered";
    let matchedTicketId = null;

    if (isBlacklisted) {
      actionTaken = "denied_blacklist";
    } else if (isWhitelisted) {
      actionTaken = "auto_entry_whitelist";
      // Abrir cancela de entrada automaticamente (se barrier_enabled)
      let barrierEnabled = cache.get("barrier_enabled");
      if (barrierEnabled === null) {
        const bRes = await db.request()
          .query("SELECT config_value FROM system_config WHERE config_key = 'barrier_enabled'");
        barrierEnabled = bRes.recordset.length > 0 ? bRes.recordset[0].config_value : "true";
        cache.set("barrier_enabled", barrierEnabled, 5 * 60 * 1000);
      }
      if (barrierEnabled === "true") {
        const entryBarrier = await db.request().input("uid", sql.Int, req.lprDevice.unit_id)
          .query("SELECT TOP 1 id FROM barrier_devices WHERE type = 'entry' AND unit_id = @uid AND is_active = 1");
        if (entryBarrier.recordset.length > 0) {
          const bResult = await sendBarrierCommand(entryBarrier.recordset[0].id, "open");
          await db.request()
            .input("bid", sql.Int, entryBarrier.recordset[0].id)
            .input("action", sql.NVarChar, "open")
            .input("triggered_by", sql.NVarChar, "lpr")
            .input("meta", sql.NVarChar(sql.MAX), JSON.stringify({ plate: cleanPlate, whitelist: true, hw_result: bResult }))
            .query("INSERT INTO barrier_events (barrier_id, action, triggered_by, metadata) VALUES (@bid, @action, @triggered_by, @meta)");
        }
      }
    } else if (hasActiveTicket) {
      actionTaken = "already_active";
      matchedTicketId = activeTicket.recordset[0].ticket_no;
    } else {
      actionTaken = "detected_no_ticket";
    }

    // Registrar evento LPR
    await db.request()
      .input("device_id", sql.Int, req.lprDevice.id)
      .input("plate", sql.NVarChar, cleanPlate)
      .input("confidence", sql.Decimal(5, 2), confidence || null)
      .input("event_type", sql.NVarChar, "entry")
      .input("action_taken", sql.NVarChar, actionTaken)
      .input("photo_path", sql.NVarChar(500), photo_path || null)
      .input("meta", sql.NVarChar(sql.MAX), JSON.stringify({ whitelisted: isWhitelisted, blacklisted: isBlacklisted, has_ticket: hasActiveTicket }))
      .query(`INSERT INTO lpr_events (device_id, plate_detected, confidence, event_type, action_taken, photo_path, metadata)
              VALUES (@device_id, @plate, @confidence, @event_type, @action_taken, @photo_path, @meta)`);

    log("INFO", `LPR entry: ${cleanPlate}, action: ${actionTaken}`);

    return res.status(200).json({
      plate: cleanPlate,
      action: actionTaken,
      whitelisted: isWhitelisted,
      blacklisted: isBlacklisted,
      has_active_ticket: hasActiveTicket,
      matched_ticket: matchedTicketId,
    });
  } catch (error) {
    log("ERROR", "LPR entry error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/lpr/exit — Câmera detectou placa na SAÍDA
app.post("/api/v1/lpr/exit", authenticateLpr, lprRateLimiter, async (req, res) => {
  try {
    const { plate, confidence, photo_path } = req.body;
    if (!plate) return res.status(400).json({ error: "plate é obrigatório." });

    const cleanPlate = plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const db = await getPool();

    // Buscar ticket pago para esta placa
    const paidTicket = await db.request().input("plate", sql.NVarChar, cleanPlate)
      .query("SELECT TOP 1 * FROM tickets WHERE reg_no = @plate AND status = 'paid' ORDER BY created_at DESC");

    let actionTaken = "detected_no_paid_ticket";
    let ticketNo = null;
    let barrierOpened = false;

    if (paidTicket.recordset.length > 0) {
      const ticket = paidTicket.recordset[0];
      ticketNo = ticket.ticket_no;
      actionTaken = "auto_exit_paid";

      // Abrir cancela de saída
      let barrierEnabled = cache.get("barrier_enabled");
      if (barrierEnabled === null) {
        const bRes = await db.request()
          .query("SELECT config_value FROM system_config WHERE config_key = 'barrier_enabled'");
        barrierEnabled = bRes.recordset.length > 0 ? bRes.recordset[0].config_value : "true";
        cache.set("barrier_enabled", barrierEnabled, 5 * 60 * 1000);
      }
      if (barrierEnabled === "true") {
        const exitBarrier = await db.request().input("uid", sql.Int, req.lprDevice.unit_id)
          .query("SELECT TOP 1 id FROM barrier_devices WHERE type = 'exit' AND unit_id = @uid AND is_active = 1");
        if (exitBarrier.recordset.length > 0) {
          const bResult = await sendBarrierCommand(exitBarrier.recordset[0].id, "open");
          barrierOpened = bResult.success;
          await db.request()
            .input("bid", sql.Int, exitBarrier.recordset[0].id)
            .input("action", sql.NVarChar, "open")
            .input("triggered_by", sql.NVarChar, "lpr")
            .input("tno", sql.NVarChar, ticketNo)
            .input("meta", sql.NVarChar(sql.MAX), JSON.stringify({ plate: cleanPlate, hw_result: bResult }))
            .query("INSERT INTO barrier_events (barrier_id, action, triggered_by, ticket_no, metadata) VALUES (@bid, @action, @triggered_by, @tno, @meta)");
        }
      }

      // Marcar como "exited" — transação atômica
      const lprExitTx = new sql.Transaction(db);
      await lprExitTx.begin();
      try {
        await lprExitTx.request().input("tno", sql.NVarChar, ticketNo)
          .query("UPDATE tickets SET status = 'exited', exit_time = GETDATE() WHERE ticket_no = @tno AND status = 'paid'");
        await lprExitTx.request()
          .input("unit_id", sql.Int, ticket.unit_id || 1)
          .query("UPDATE parking_units SET current_count = current_count - 1 WHERE id = @unit_id AND current_count > 0");
        await lprExitTx.commit();
      } catch (txErr) {
        try { await lprExitTx.rollback(); } catch (_) {}
        throw txErr;
      }

      await auditLog("LPR_EXIT", null, "lpr", `Auto-exit: ${ticketNo}, Placa: ${cleanPlate}`, req.lprDevice.ip_address || "lpr_camera");
    }

    // Checar whitelist (pode sair sem ticket)
    const whiteResult = await db.request().input("plate", sql.NVarChar, cleanPlate)
      .query("SELECT TOP 1 id FROM whitelist WHERE reg_no = @plate AND active = 1");
    if (whiteResult.recordset.length > 0 && !ticketNo) {
      actionTaken = "auto_exit_whitelist";
    }

    // Registrar evento
    await db.request()
      .input("device_id", sql.Int, req.lprDevice.id)
      .input("plate", sql.NVarChar, cleanPlate)
      .input("confidence", sql.Decimal(5, 2), confidence || null)
      .input("event_type", sql.NVarChar, "exit")
      .input("action_taken", sql.NVarChar, actionTaken)
      .input("photo_path", sql.NVarChar(500), photo_path || null)
      .input("meta", sql.NVarChar(sql.MAX), JSON.stringify({ ticket_no: ticketNo, barrier_opened: barrierOpened }))
      .query(`INSERT INTO lpr_events (device_id, plate_detected, confidence, event_type, action_taken, photo_path, metadata)
              VALUES (@device_id, @plate, @confidence, @event_type, @action_taken, @photo_path, @meta)`);

    log("INFO", `LPR exit: ${cleanPlate}, action: ${actionTaken}`);

    return res.status(200).json({
      plate: cleanPlate,
      action: actionTaken,
      ticket_no: ticketNo,
      barrier_opened: barrierOpened,
    });
  } catch (error) {
    log("ERROR", "LPR exit error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/v1/lpr/events — Log de detecções LPR (admin)
app.get("/api/v1/lpr/events", async (req, res) => {
  try {
    requireRole(req, "admin");
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const db = await getPool();
    const request = db.request().input("limit", sql.Int, limit);
    let where = "1=1";
    if (req.query.plate) {
      request.input("plate", sql.NVarChar, req.query.plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase());
      where += " AND e.plate_detected = @plate";
    }
    if (req.query.device_id) {
      request.input("device_id", sql.Int, parseInt(req.query.device_id));
      where += " AND e.device_id = @device_id";
    }
    if (req.query.event_type) {
      request.input("event_type", sql.NVarChar, req.query.event_type);
      where += " AND e.event_type = @event_type";
    }
    const result = await request.query(`
      SELECT TOP (@limit) e.*, d.name AS device_name, d.location
      FROM lpr_events e LEFT JOIN lpr_devices d ON d.id = e.device_id
      WHERE ${where} ORDER BY e.created_at DESC`);
    return res.status(200).json(result.recordset);
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /lpr/devices — Listar câmeras LPR (admin)
app.get("/lpr/devices", async (req, res) => {
  try {
    requireRole(req, "admin");
    const db = await getPool();
    const result = await db.request().query(`
      SELECT id, name, location, ip_address, api_key_prefix, unit_id, type, is_active, last_heartbeat, created_at
      FROM lpr_devices ORDER BY created_at DESC`);
    return res.status(200).json(result.recordset.map(d => ({ ...d, is_active: !!d.is_active })));
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /lpr/devices — Registrar câmera LPR (admin)
app.post("/lpr/devices", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const { name, location, ip_address, unit_id, type } = req.body;
    if (!name) return res.status(400).json({ error: "name é obrigatório." });

    const targetUnit = unit_id || 1;
    const deviceType = (type === "exit") ? "exit" : "entry";

    const rawKey = crypto.randomBytes(24).toString("hex");
    const prefix = rawKey.substring(0, 8);
    const hashedKey = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);

    const db = await getPool();
    const result = await db.request()
      .input("name", sql.NVarChar, name)
      .input("location", sql.NVarChar, location || null)
      .input("ip_address", sql.NVarChar, ip_address || null)
      .input("api_key", sql.NVarChar, hashedKey)
      .input("api_key_prefix", sql.NVarChar, prefix)
      .input("unit_id", sql.Int, targetUnit)
      .input("type", sql.NVarChar, deviceType)
      .query(`INSERT INTO lpr_devices (name, location, ip_address, api_key, api_key_prefix, unit_id, type)
              OUTPUT INSERTED.id VALUES (@name, @location, @ip_address, @api_key, @api_key_prefix, @unit_id, @type)`);

    const deviceId = result.recordset[0].id;
    await auditLog("LPR_DEVICE_CREATE", decoded.id, decoded.role, `LPR: ${name} (ID: ${deviceId}, type: ${deviceType})`, getClientIp(req));

    return res.status(201).json({
      message: "Câmera LPR registrada.",
      device_id: deviceId,
      name,
      type: deviceType,
      api_key: rawKey,
      api_key_prefix: prefix,
      warning: "Guarde a API key. Ela não será exibida novamente.",
    });
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "LPR device create error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /lpr/devices/:id — Atualizar câmera LPR (admin)
app.patch("/lpr/devices/:id", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const deviceId = parseInt(req.params.id);
    const { is_active, name, location, ip_address } = req.body;

    const db = await getPool();
    const sets = [];
    const request = db.request().input("id", sql.Int, deviceId);
    if (is_active !== undefined) { request.input("is_active", sql.Bit, is_active ? 1 : 0); sets.push("is_active = @is_active"); }
    if (name !== undefined) { request.input("name", sql.NVarChar, name); sets.push("name = @name"); }
    if (location !== undefined) { request.input("location", sql.NVarChar, location); sets.push("location = @location"); }
    if (ip_address !== undefined) { request.input("ip_address", sql.NVarChar, ip_address); sets.push("ip_address = @ip_address"); }
    if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar." });

    const result = await request.query(`UPDATE lpr_devices SET ${sets.join(", ")} WHERE id = @id`);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Câmera não encontrada." });

    await auditLog("LPR_DEVICE_UPDATE", decoded.id, decoded.role, `LPR ID: ${deviceId}`, getClientIp(req));
    return res.status(200).json({ message: "Câmera atualizada." });
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ############################################
// Phase 4: Cancela (Barrier Control)
// ############################################

// POST /api/v1/barrier/:id/open — Abrir cancela
app.post("/api/v1/barrier/:id/open", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin", "operador");
    const barrierId = parseInt(req.params.id);

    const result = await sendBarrierCommand(barrierId, "open");

    const db = await getPool();
    await db.request()
      .input("bid", sql.Int, barrierId)
      .input("action", sql.NVarChar, "open")
      .input("triggered_by", sql.NVarChar, "manual")
      .input("operator_id", sql.Int, decoded.id)
      .input("tno", sql.NVarChar, req.body.ticket_no || null)
      .input("meta", sql.NVarChar(sql.MAX), JSON.stringify(result))
      .query("INSERT INTO barrier_events (barrier_id, action, triggered_by, operator_id, ticket_no, metadata) VALUES (@bid, @action, @triggered_by, @operator_id, @tno, @meta)");

    await auditLog("BARRIER_OPEN", decoded.id, decoded.role, `Barrier ${barrierId} opened manually`, getClientIp(req));
    return res.status(200).json({ message: "Cancela aberta.", ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "Barrier open error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/v1/barrier/:id/close — Fechar cancela
app.post("/api/v1/barrier/:id/close", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin", "operador");
    const barrierId = parseInt(req.params.id);

    const result = await sendBarrierCommand(barrierId, "close");

    const db = await getPool();
    await db.request()
      .input("bid", sql.Int, barrierId)
      .input("action", sql.NVarChar, "close")
      .input("triggered_by", sql.NVarChar, "manual")
      .input("operator_id", sql.Int, decoded.id)
      .input("meta", sql.NVarChar(sql.MAX), JSON.stringify(result))
      .query("INSERT INTO barrier_events (barrier_id, action, triggered_by, operator_id, metadata) VALUES (@bid, @action, @triggered_by, @operator_id, @meta)");

    await auditLog("BARRIER_CLOSE", decoded.id, decoded.role, `Barrier ${barrierId} closed manually`, getClientIp(req));
    return res.status(200).json({ message: "Cancela fechada.", ...result });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /barrier/devices — Listar barreiras (admin)
app.get("/barrier/devices", async (req, res) => {
  try {
    requireRole(req, "admin");
    const db = await getPool();
    const result = await db.request().query(`
      SELECT id, name, type, control_url, unit_id, status, is_active, last_heartbeat, created_at
      FROM barrier_devices ORDER BY created_at DESC`);
    return res.status(200).json(result.recordset.map(d => ({ ...d, is_active: !!d.is_active })));
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /barrier/devices — Registrar barreira (admin)
app.post("/barrier/devices", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const { name, type, control_url, unit_id } = req.body;
    if (!name) return res.status(400).json({ error: "name é obrigatório." });

    const barrierType = (type === "exit") ? "exit" : "entry";
    const targetUnit = unit_id || 1;

    const db = await getPool();
    const result = await db.request()
      .input("name", sql.NVarChar, name)
      .input("type", sql.NVarChar, barrierType)
      .input("control_url", sql.NVarChar(500), control_url || null)
      .input("unit_id", sql.Int, targetUnit)
      .query(`INSERT INTO barrier_devices (name, type, control_url, unit_id)
              OUTPUT INSERTED.id VALUES (@name, @type, @control_url, @unit_id)`);

    const deviceId = result.recordset[0].id;
    await auditLog("BARRIER_CREATE", decoded.id, decoded.role, `Barrier: ${name} (ID: ${deviceId}, type: ${barrierType})`, getClientIp(req));

    return res.status(201).json({ message: "Barreira registrada.", device_id: deviceId, name, type: barrierType });
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    log("ERROR", "Barrier create error", { error: error.message });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /barrier/devices/:id — Atualizar barreira (admin)
app.patch("/barrier/devices/:id", async (req, res) => {
  try {
    const decoded = requireRole(req, "admin");
    const deviceId = parseInt(req.params.id);
    const { is_active, name, control_url } = req.body;

    const db = await getPool();
    const sets = [];
    const request = db.request().input("id", sql.Int, deviceId);
    if (is_active !== undefined) { request.input("is_active", sql.Bit, is_active ? 1 : 0); sets.push("is_active = @is_active"); }
    if (name !== undefined) { request.input("name", sql.NVarChar, name); sets.push("name = @name"); }
    if (control_url !== undefined) { request.input("control_url", sql.NVarChar(500), control_url); sets.push("control_url = @control_url"); }
    if (sets.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar." });

    const result = await request.query(`UPDATE barrier_devices SET ${sets.join(", ")} WHERE id = @id`);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Barreira não encontrada." });

    await auditLog("BARRIER_UPDATE", decoded.id, decoded.role, `Barrier ID: ${deviceId}`, getClientIp(req));
    return res.status(200).json({ message: "Barreira atualizada." });
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /barrier/events — Log de eventos de barreiras (admin)
app.get("/barrier/events", async (req, res) => {
  try {
    requireRole(req, "admin");
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const db = await getPool();
    const request = db.request().input("limit", sql.Int, limit);
    let where = "1=1";
    if (req.query.barrier_id) {
      request.input("barrier_id", sql.Int, parseInt(req.query.barrier_id));
      where += " AND e.barrier_id = @barrier_id";
    }
    const result = await request.query(`
      SELECT TOP (@limit) e.*, d.name AS barrier_name, d.type AS barrier_type
      FROM barrier_events e LEFT JOIN barrier_devices d ON d.id = e.barrier_id
      WHERE ${where} ORDER BY e.created_at DESC`);
    return res.status(200).json(result.recordset);
  } catch (error) {
    const authErr = handleAuthError(error, res);
    if (authErr) return authErr;
    return res.status(500).json({ error: "Internal server error" });
  }
});

// [REMOVED] Sync endpoints (PDV Desktop) — sem cliente PDV Desktop (removido na auditoria 2026-04-13)

// ############################################
// API Versionada /api/v1/*
// ############################################
const apiV1 = express.Router();

// Rotas com mapeamento especial (transformam req antes do proxy)
apiV1.post("/entry", (req, res) => { req.url = "/createTicket"; app.handle(req, res); });
apiV1.get("/session/:plate", (req, res) => { req.query.reg_no = req.params.plate; req.url = "/plateCheck"; app.handle(req, res); });
apiV1.post("/payment", (req, res) => { req.query.ticket = req.body.ticket_no; req.method = "PATCH"; req.url = "/user"; app.handle(req, res); });

// Rotas proxy diretas (mesmo path ou path fixo)
const directProxies = [
  ["post", "/exit", "/exit"],
  ["get", "/reports", "/reports/summary"],
  ["post", "/whitelist", "/whitelist"],
  ["post", "/blacklist", "/blacklist"],
  ["get", "/alerts/config", "/alerts/config"],
  ["patch", "/alerts/config", "/alerts/config"],
  ["get", "/occupancy", "/occupancy"],
  ["get", "/totem/devices", "/totem/devices"],
  ["post", "/totem/devices", "/totem/devices"],
  ["get", "/totem/transactions", "/totem/transactions"],
  ["get", "/lpr/devices", "/lpr/devices"],
  ["post", "/lpr/devices", "/lpr/devices"],
  ["get", "/lpr/events", "/api/v1/lpr/events"],
  ["get", "/barrier/devices", "/barrier/devices"],
  ["post", "/barrier/devices", "/barrier/devices"],
  ["get", "/barrier/events", "/barrier/events"],
  ["post", "/card/refund", "/api/v1/card/refund"],
];
for (const [method, apiPath, legacyPath] of directProxies) {
  apiV1[method](apiPath, (req, res) => { req.url = legacyPath; app.handle(req, res); });
}

// Rotas proxy com :id param
const paramProxies = [
  ["patch", "/totem/devices/:id", "/totem/devices/"],
  ["delete", "/totem/devices/:id", "/totem/devices/"],
  ["patch", "/lpr/devices/:id", "/lpr/devices/"],
  ["patch", "/barrier/devices/:id", "/barrier/devices/"],
];
for (const [method, apiPath, legacyPrefix] of paramProxies) {
  apiV1[method](apiPath, (req, res) => { req.url = legacyPrefix + req.params.id; app.handle(req, res); });
}

app.use("/api/v1", apiV1);

// ############################################
// Health Check
// ############################################
app.get("/health", async (req, res) => {
  const health = {
    status: "ok",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    environment: process.env.NODE_ENV || "development",
    node: process.version,
    hostname: os.hostname(),
    db: "unknown",
    db_latency_ms: null,
    cache_size: cache._store.size,
    memory_mb: Math.round(process.memoryUsage().rss / 1048576),
  };
  try {
    const t0 = Date.now();
    const db = await getPool();
    await db.request().query("SELECT 1");
    health.db_latency_ms = Date.now() - t0;
    health.db = "connected";
  } catch (e) {
    health.status = "degraded";
    health.db = "disconnected";
  }
  const statusCode = health.status === "ok" ? 200 : 503;
  return res.status(statusCode).json(health);
});

// Readiness probe (para load balancer / IIS)
app.get("/ready", async (req, res) => {
  try {
    const db = await getPool();
    await db.request().query("SELECT 1");
    return res.status(200).json({ ready: true });
  } catch (e) {
    return res.status(503).json({ ready: false });
  }
});

// ############################################
// Iniciar servidor (HTTP ou HTTPS dual-mode)
// ############################################
const PORT = process.env.PORT || 3000;
let server;

if (process.env.HTTPS_ENABLED === "true") {
  const keyPath = process.env.HTTPS_KEY;
  const certPath = process.env.HTTPS_CERT;
  if (!keyPath || !certPath || !fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    log("FATAL", "HTTPS_ENABLED=true but HTTPS_KEY/HTTPS_CERT not found. Aborting startup.");
    process.exit(1);
  } else {
    const sslOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    server = https.createServer(sslOptions, app);
    log("INFO", "HTTPS mode enabled");
  }
} else {
  server = http.createServer(app);
}

server.listen(PORT, () => {
  const protocol = server instanceof https.Server ? "https" : "http";
  log("INFO", `2M Parking API v${APP_VERSION} running on port ${PORT} (${protocol})`);
  log("INFO", `Environment: ${process.env.NODE_ENV || "development"}`);
  log("INFO", `Legacy endpoints: ${protocol}://localhost:${PORT}/`);
  log("INFO", `Versioned API:    ${protocol}://localhost:${PORT}/api/v1/`);
  log("INFO", `Health check:     ${protocol}://localhost:${PORT}/health`);
});

// ############################################
// Graceful Shutdown
// ############################################
function gracefulShutdown(signal) {
  log("WARN", `${signal} received. Starting graceful shutdown...`);
  server.close(() => {
    log("INFO", "HTTP server closed.");
    if (pool) {
      pool.close().then(() => {
        log("INFO", "Database pool closed.");
        process.exit(0);
      }).catch((err) => {
        log("ERROR", "Error closing database pool", { error: err.message });
        process.exit(1);
      });
    } else {
      process.exit(0);
    }
  });
  // Force shutdown after 10 seconds
  setTimeout(() => {
    log("ERROR", "Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  log("ERROR", "Uncaught Exception", { error: err.message, stack: err.stack });
  sendAlert("system_error", { type: "uncaughtException", message: err.message });
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  log("ERROR", "Unhandled Rejection", { reason: String(reason) });
});
