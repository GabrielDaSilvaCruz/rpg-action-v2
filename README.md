# 🎲 RPG Ação (SpireTable 3D) — Arquitetura Separada

Projeto reorganizado com separação clara de responsabilidades entre **Frontend** e **Backend**, aplicando os princípios **SOLID**, **Clean Code** e **Componetização**, mantendo **100% das funcionalidades do SpireTable 3D**.

---

## 🏗️ Estrutura do Projeto

```text
rpg-action-v2/
├── docker-compose.yml          # Orquestração completa (PostgreSQL, Redis, Backend, Frontend)
├── README.md
│
├── backend/                    # ⚙️ NestJS + Fastify + Prisma (PostgreSQL) + WebSockets
│   ├── Dockerfile
│   ├── prisma/
│   │   └── schema.prisma       # Modelagem relacional no PostgreSQL
│   ├── src/
│   │   ├── core/contracts/     # Interfaces de Domínio e Inversão de Dependência (DIP)
│   │   ├── infra/              # Implementações concretas (Prisma e Local/S3 Storage)
│   │   └── modules/
│   │       ├── auth/           # Autenticação JWT (SRP)
│   │       └── rooms/          # Salas: Use Cases e WebSocket Gateway (tempo real do VTT)
│   └── package.json
│
└── frontend/                   # 🎨 Next.js 15 (App Router) + React 19 + Three.js + Tailwind
    ├── Dockerfile
    ├── src/
    │   ├── app/                # App Router (layout.tsx e page.tsx)
    │   ├── components/         # EntryLobby, TabletopViewport 3D, TabletopHUD, etc.
    │   ├── engine/             # 3D Dice Roller, Procedural Models, Audio Synth
    │   ├── utils/              # Map Presets, History, Youtube Music, Backend URL
    │   └── types/              # Tipagens completas do VTT (vtt.ts)
    └── package.json
```

---

## 🚀 Como Executar com Docker (Recomendado)

Na raiz do projeto, execute um único comando:

```bash
docker compose up --build
```

*(Ou com `docker compose up -d` para rodar em segundo plano)*

### 🌐 Endereços dos Serviços:
- **Frontend SpireTable 3D (Next.js):** [http://localhost:3000](http://localhost:3000)
- **Backend API (NestJS + Fastify):** [http://localhost:3001/api](http://localhost:3001/api)
- **WebSocket Server:** `ws://localhost:3001/ws`
- **PostgreSQL:** `localhost:15432` (`rpg_user` / `rpg_secret` / `rpg_action_db`)
- **Redis:** `localhost:16379`

---

## 💻 Como Executar sem Docker (Terminal Local)

1. **Subir os bancos com Docker:**
   ```bash
   docker compose up postgres redis -d
   ```

2. **Iniciar o Backend:**
   ```bash
   cd backend
   npm install
   npx prisma generate
   npm run start:dev
   ```

3. **Iniciar o Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
