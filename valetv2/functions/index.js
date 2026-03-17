const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");

admin.initializeApp();
const db = admin.firestore();

const JWT_SECRET = process.env.JWT_SECRET || "2m-parking-secret-key-2026";
const JWT_EXPIRATION = "24h";

// ============================================
// Helper: Normalizar telefone
// ============================================
function stripPhone(phone) {
  return (phone || "").replace(/\D/g, "");
}

function formatPhone(phone) {
  const digits = stripPhone(phone);
  if (digits.length < 12 || digits.length > 13) {
    return phone;
  }
  const countryCode = digits.substring(0, 2);
  const areaCode = digits.substring(2, 4);
  const remaining = digits.substring(4);
  let firstPart;
  let secondPart;
  if (remaining.length === 9) {
    firstPart = remaining.substring(0, 5);
    secondPart = remaining.substring(5);
  } else {
    firstPart = remaining.substring(0, 4);
    secondPart = remaining.substring(4);
  }
  return `+${countryCode} (${areaCode}) ${firstPart}-${secondPart}`;
}

function phonesMatch(phone1, phone2) {
  return stripPhone(phone1) === stripPhone(phone2);
}

// ============================================
// Helper: Normalizar placa de veículo
// ============================================
function stripPlateChars(plate) {
  return (plate || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function isValidPlate(plate) {
  const clean = stripPlateChars(plate);
  if (clean.length !== 7) return false;
  // Antiga: ABC1234 | Mercosul: ABC1D23
  return /^[A-Z]{3}[0-9]{4}$/.test(clean) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(clean);
}

// ============================================
// Helper: Verificar token JWT
// ============================================
function verifyToken(req) {
  const token = req.headers.authorization;
  if (!token) {
    throw new Error("No token provided");
  }
  return jwt.verify(token, JWT_SECRET);
}

// ============================================
// Helper: CORS
// ============================================
function setCors(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}

// ============================================
// POST /authorize/valet - Login do manobrista
// ============================================
exports.authorizeValet = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({error: "Method not allowed"});
  }

  try {
    const {uname, pwd} = req.body;

    if (!uname || !pwd) {
      return res.status(400).json({error: "Username and password are required"});
    }

    const valetRef = db.collection("valets").where("uname", "==", uname);
    const snapshot = await valetRef.get();

    if (snapshot.empty) {
      return res.status(401).json({auth: false, error: "Invalid credentials"});
    }

    const valetDoc = snapshot.docs[0];
    const valet = valetDoc.data();

    if (valet.pwd !== pwd) {
      return res.status(401).json({auth: false, error: "Invalid credentials"});
    }

    const token = jwt.sign(
        {id: valetDoc.id, uname: valet.uname, role: "valet"},
        JWT_SECRET,
        {expiresIn: JWT_EXPIRATION},
    );

    return res.status(200).json({auth: true, token});
  } catch (error) {
    console.error("authorizeValet error:", error);
    return res.status(500).json({error: "Internal server error"});
  }
});

// ============================================
// POST /authorize/user - Login do cliente
// ============================================
exports.authorizeUser = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({error: "Method not allowed"});
  }

  try {
    const {ticket_no, phone, reg_no} = req.body;

    if (!ticket_no || !phone || !reg_no) {
      return res.status(400).json({error: "Ticket number, phone and registration number are required"});
    }

    const ticketRef = db.collection("tickets").where("ticket_no", "==", ticket_no);
    const snapshot = await ticketRef.get();

    if (snapshot.empty) {
      return res.status(404).json({auth: false, error: "Ticket not found"});
    }

    const ticketDoc = snapshot.docs[0];
    const ticket = ticketDoc.data();

    if (!phonesMatch(ticket.phone_no, phone) || ticket.reg_no !== reg_no.toUpperCase()) {
      return res.status(401).json({auth: false, error: "Invalid credentials"});
    }

    const token = jwt.sign(
        {id: ticketDoc.id, ticket_no: ticket.ticket_no, role: "user"},
        JWT_SECRET,
        {expiresIn: JWT_EXPIRATION},
    );

    return res.status(200).json({auth: true, token});
  } catch (error) {
    console.error("authorizeUser error:", error);
    return res.status(500).json({error: "Internal server error"});
  }
});

// ============================================
// GET /valet/verify - Verificar token do manobrista
// ============================================
exports.valetVerify = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({error: "Method not allowed"});
  }

  try {
    const decoded = verifyToken(req);
    if (decoded.role !== "valet") {
      return res.status(401).json({valid: false, error: "Invalid token role"});
    }
    return res.status(200).json({valid: true});
  } catch (error) {
    return res.status(401).json({valid: false, error: "Invalid or expired token"});
  }
});

// ============================================
// GET /user/verify - Verificar token do cliente
// ============================================
exports.userVerify = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({error: "Method not allowed"});
  }

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

// ============================================
// POST /ticket - Criar ticket de estacionamento
// ============================================
exports.createTicket = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({error: "Method not allowed"});
  }

  try {
    verifyToken(req);

    const {first_name, last_name, phone_no, reg_no, manufacturer, model, color} = req.body;

    if (!first_name || !last_name || !phone_no || !reg_no) {
      return res.status(400).json({error: "Required fields missing"});
    }

    // Validar e normalizar telefone
    const phoneDigits = stripPhone(phone_no);
    if (phoneDigits.length < 12 || phoneDigits.length > 13) {
      return res.status(400).json({error: "Telefone inválido. Use o formato: +55 (XX) XXXXX-XXXX"});
    }
    const normalizedPhone = formatPhone(phone_no);

    // Validar placa
    if (!isValidPlate(reg_no)) {
      return res.status(400).json({error: "Placa inválida. Use ABC-1234 (antiga) ou ABC1D23 (Mercosul)"});
    }

    // Gerar número de ticket único
    const counterRef = db.collection("counters").doc("tickets");
    const counterDoc = await counterRef.get();

    let ticketNumber = 1;
    if (counterDoc.exists) {
      ticketNumber = counterDoc.data().current + 1;
    }
    await counterRef.set({current: ticketNumber});

    const ticketNo = `TKT-${String(ticketNumber).padStart(6, "0")}`;

    const ticketData = {
      ticket_no: ticketNo,
      first_name,
      last_name,
      phone_no: normalizedPhone,
      reg_no: stripPlateChars(reg_no),
      manufacturer: manufacturer || "",
      model: model || "",
      color: color || "",
      amount: 25.00,
      paid: false,
      status: "active",
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("tickets").add(ticketData);

    return res.status(201).json({
      message: "Ticket created successfully",
      ticket_no: ticketNo,
      ticket_data: {
        ticket_no: ticketNo,
        first_name,
        last_name,
        phone_no: normalizedPhone,
        reg_no: stripPlateChars(reg_no),
        manufacturer: manufacturer || "",
        model: model || "",
        color: color || "",
        amount: 25.00,
      },
    });
  } catch (error) {
    if (error.message === "No token provided") {
      return res.status(401).json({error: "Unauthorized"});
    }
    console.error("createTicket error:", error);
    return res.status(500).json({error: "Internal server error"});
  }
});

// ============================================
// GET /user?ticket={no} - Obter dados do usuário/ticket
// PATCH /user?ticket={no} - Atualizar status de pagamento
// ============================================
exports.user = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  try {
    verifyToken(req);
    const ticketNo = req.query.ticket;

    if (!ticketNo) {
      return res.status(400).json({error: "Ticket number is required"});
    }

    const ticketRef = db.collection("tickets").where("ticket_no", "==", ticketNo);
    const snapshot = await ticketRef.get();

    if (snapshot.empty) {
      return res.status(404).json({error: "Ticket not found"});
    }

    const ticketDoc = snapshot.docs[0];
    const ticket = ticketDoc.data();

    if (req.method === "GET") {
      const userData = {
        first_name: ticket.first_name,
        last_name: ticket.last_name,
        car: {
          reg_no: ticket.reg_no,
          color: ticket.color,
          manufacturer: ticket.manufacturer,
          model: ticket.model,
        },
        ticket: {
          paid: ticket.paid,
          amount: ticket.amount,
          no: ticket.ticket_no,
        },
      };

      return res.status(200).json(userData);
    } else if (req.method === "PATCH") {
      await ticketDoc.ref.update({
        paid: true,
        status: "paid",
        paid_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        message: "Payment status updated successfully",
        paid: true,
      });
    } else {
      return res.status(405).json({error: "Method not allowed"});
    }
  } catch (error) {
    if (error.message === "No token provided") {
      return res.status(401).json({error: "Unauthorized"});
    }
    console.error("user endpoint error:", error);
    return res.status(500).json({error: "Internal server error"});
  }
});

// ============================================
// GET /qrcode?ticket={no} - Obter dados do QR Code
// ============================================
exports.qrcode = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({error: "Method not allowed"});
  }

  try {
    verifyToken(req);
    const ticketNo = req.query.ticket;

    if (!ticketNo) {
      return res.status(400).json({error: "Ticket number is required"});
    }

    const ticketRef = db.collection("tickets").where("ticket_no", "==", ticketNo);
    const snapshot = await ticketRef.get();

    if (snapshot.empty) {
      return res.status(404).json({error: "Ticket not found"});
    }

    const ticket = snapshot.docs[0].data();

    return res.status(200).json({
      ticket_no: ticket.ticket_no,
      reg_no: ticket.reg_no,
      amount: ticket.amount,
      status: ticket.paid ? "Pago" : "Pendente",
    });
  } catch (error) {
    if (error.message === "No token provided") {
      return res.status(401).json({error: "Unauthorized"});
    }
    console.error("qrcode error:", error);
    return res.status(500).json({error: "Internal server error"});
  }
});

// ============================================
// Função utilitária: Criar manobrista inicial
// POST /setup/valet - Criar o primeiro manobrista
// ============================================
exports.setupValet = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({error: "Method not allowed"});
  }

  try {
    const {uname, pwd, setup_key} = req.body;

    // Chave de segurança para evitar criação não autorizada
    if (setup_key !== "2m-parking-setup-2026") {
      return res.status(403).json({error: "Invalid setup key"});
    }

    if (!uname || !pwd) {
      return res.status(400).json({error: "Username and password are required"});
    }

    // Verificar se já existe
    const existing = await db.collection("valets").where("uname", "==", uname).get();
    if (!existing.empty) {
      return res.status(409).json({error: "Valet already exists"});
    }

    // pwd já vem como MD5 hash do frontend
    await db.collection("valets").add({
      uname,
      pwd,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({message: `Valet '${uname}' created successfully`});
  } catch (error) {
    console.error("setupValet error:", error);
    return res.status(500).json({error: "Internal server error"});
  }
});

// ============================================
// GET /plate?reg_no={placa} - Buscar ticket por placa
// ============================================
exports.plateCheck = functions.https.onRequest(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({error: "Method not allowed"});
  }

  try {
    verifyToken(req);
    const regNo = stripPlateChars(req.query.reg_no || "");

    if (!regNo) {
      return res.status(400).json({error: "Placa é obrigatória"});
    }

    const snapshot = await db.collection("tickets")
        .where("reg_no", "==", regNo)
        .where("status", "in", ["active", "paid"])
        .orderBy("created_at", "desc")
        .limit(1)
        .get();

    if (snapshot.empty) {
      return res.status(404).json({error: "Nenhum ticket ativo encontrado para essa placa"});
    }

    const ticketDoc = snapshot.docs[0];
    const ticket = ticketDoc.data();

    return res.status(200).json({
      ticket_no: ticket.ticket_no,
      first_name: ticket.first_name,
      last_name: ticket.last_name,
      reg_no: ticket.reg_no,
      manufacturer: ticket.manufacturer,
      model: ticket.model,
      color: ticket.color,
      amount: ticket.amount,
      paid: ticket.paid,
      status: ticket.status,
      created_at: ticket.created_at,
    });
  } catch (error) {
    if (error.message === "No token provided") {
      return res.status(401).json({error: "Unauthorized"});
    }
    console.error("plateCheck error:", error);
    return res.status(500).json({error: "Internal server error"});
  }
});
