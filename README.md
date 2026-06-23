# 🅿️ Janus Parking

Sistema de **gestão de estacionamento / valet** com tickets eletrônicos, pagamento (presencial, PIX e cartão), totem de autoatendimento, reconhecimento de placas (LPR) e controle de cancelas.

> **Identificador técnico no código-fonte:** `2M Parking` (API **v2.2.0**, banco de dados `MParking`). "Janus Parking" é o nome comercial; os nomes técnicos (pastas, banco, variáveis) permanecem como estão no código.

📘 **Documentação completa:** [valetv2/DOCS/DOC_FINAL_JANUSPARKING.MD](valetv2/DOCS/DOC_FINAL_JANUSPARKING.MD)

---

## ✨ Principais recursos

- **Tickets eletrônicos** com QR Code (entrada, pagamento e saída).
- **Pagamentos**: presencial (dinheiro/cartão/PIX/cortesia), **PIX** e **cartão** online via Mercado Pago.
- **Totem** de autoatendimento (pagamento por quiosque).
- **LPR** (reconhecimento de placas) com entrada/saída automáticas.
- **Cancelas** (barreiras) com acionamento por pagamento, LPR ou manual.
- **Listas** de cortesia (whitelist) e bloqueio (blacklist).
- **Painel administrativo**: dashboard, relatórios, tarifação, usuários/papéis, alertas e dispositivos.
- **Tarifação configurável** (valor/hora, teto diário, tolerância, período de carência).
- **Segurança**: JWT, papéis, rate limiting, auditoria, anti-SSRF e validação de webhook.

---

## 🧱 Stack tecnológico

| Camada | Tecnologia |
|---|---|
| Frontend | **Angular 7** (TypeScript, SCSS), `angularx-qrcode`, `ngx-spinner` |
| Backend | **Node.js 20 + Express 4** (`functions/index.js`) |
| Banco de dados | **Microsoft SQL Server** (banco `MParking`) |
| Pagamentos | **Mercado Pago** (PIX + cartão); modo *sandbox/mock* sem token |
| Infra | **Docker** (Nginx + Node via Supervisor) ou **Windows/IIS + PM2** |

---

## 📁 Estrutura do projeto

```
2M_PARKING-main/
├── README.md
└── valetv2/
    ├── Dockerfile / docker-compose.yml / nginx.conf / supervisord.conf
    ├── web.config / proxy.conf.json / angular.json / package.json
    ├── DOCS/DOC_FINAL_JANUSPARKING.MD     # documentação completa
    ├── functions/                         # BACKEND
    │   ├── index.js                       # toda a API
    │   ├── ecosystem.config.js            # PM2
    │   └── scripts/                        # migrate-all.js, build/deploy/backup/monitor
    ├── src/                               # FRONTEND (Angular)
    │   ├── app/ (components, templates, services, modules, tests)
    │   ├── environments/ / styles/
    └── e2e/                               # testes end-to-end
```

---

## 🚀 Como executar

### Opção A — Docker (recomendado)

```powershell
cd valetv2
Copy-Item .env.docker.example .env.docker   # preencha SA_PASSWORD, JWT_SECRET, SETUP_KEY...
docker-compose --env-file .env.docker up --build
```

Sobe o **SQL Server 2022** + a aplicação (Nginx + backend) na porta **80**.

### Opção B — Local (desenvolvimento)

**Backend:**
```powershell
cd valetv2/functions
Copy-Item .env.example .env                 # configure DB_*, JWT_SECRET, SETUP_KEY
npm install
npm run migrate                             # cria/atualiza o schema do banco
npm run dev                                 # http://localhost:3000
```

**Frontend:**
```powershell
cd valetv2
npm install
npm start                                   # http://localhost:4200 (proxy → :3000)
```

> Após migrar, é necessário **criar o primeiro usuário admin** manualmente — não há seed automático (ver [Pendências](#-pendências--avisos)).

### Opção C — Windows / IIS + PM2 (produção)

Use os scripts em `valetv2/functions/scripts/`: `build.ps1` (compila o front), `deploy.ps1` (migra, publica em `C:\inetpub\2mparking` e reinicia o PM2), `backup-db.ps1` e `monitor.ps1`. Detalhes na [documentação](valetv2/DOCS/DOC_FINAL_JANUSPARKING.MD).

---

## ⚙️ Variáveis de ambiente (backend)

Modelo em `valetv2/functions/.env.example`. Principais:

| Variável | Descrição |
|---|---|
| `PORT` | Porta do backend (padrão `3000`) |
| `DB_SERVER` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | Conexão com o SQL Server |
| `JWT_SECRET` | Segredo de assinatura do JWT *(obrigatório em produção)* |
| `SETUP_KEY` | Chave de setup *(obrigatório em produção)* |
| `CORS_ORIGINS` | Origens permitidas (separadas por vírgula) |
| `MP_ACCESS_TOKEN` | Token do Mercado Pago (sem ele = *sandbox mock*) |
| `MP_WEBHOOK_SECRET` | Segredo para validar o webhook |

---

## ⚠️ Pendências / Avisos

- **Primeiro admin** não é criado automaticamente pelas migrações (e o antigo `setupValet` foi removido): crie o usuário inicial manualmente no banco.
- **Sem envio de SMS/e-mail**: o sistema atual **não** envia o ticket por mensagem — diferentemente do projeto original.
- **Troque os segredos padrão** (`JWT_SECRET`, `SETUP_KEY`, senha do banco) antes de ir para produção.

A lista completa de divergências está na **seção 12** da [documentação](valetv2/DOCS/DOC_FINAL_JANUSPARKING.MD#12-pendências-e-divergências).

---

> Documentação e este README foram gerados a partir da leitura do código-fonte. Em caso de divergência, **o código-fonte prevalece**.
