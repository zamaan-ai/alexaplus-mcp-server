# Alexa+ SmartHome & Climate Intelligence MCP Server
**Amazon Developer Hackathon (Build, Ship, Shape 2026) — Alexa+ Track Submission**

This project is a self-hosted **Model Context Protocol (MCP)** server built with **Streamable HTTP (Server-Sent Events / SSE)** transports. It empowers generative voice assistants (such as Alexa+) to dynamically fetch real-time environmental telemetry from external APIs and autonomously trigger smart home climate and ambient device adaptations.

---

## 🌟 Key Features & Hackathon Highlights

- **Open MCP Standard Compliance**: Fully implements JSON-RPC over Streamable HTTP (SSE) following the official `@modelcontextprotocol/sdk`.
- **External API Integration**: Real-time outdoor weather & meteorology metrics fetched from Open-Meteo.
- **Autonomous Reasoning & Directives**: Rather than raw text dumps, the server synthesizes specific, structured smart home directives (`HVAC Thermostat`, `Smart Blinds`, `TV Ambient Lighting`).
- **Multi-Modal Visual Dashboard**: Includes an interactive web-based simulator (`/`) allowing judges to simulate voice queries and visually observe the event stream in real time.

---

## 🏗️ Architecture

```
User Voice Input / Alexa+ Agent Core
               │
               ▼
   [HTTP POST /messages?sessionId=...] (JSON-RPC Request)
               │
               ▼
┌────────────────────────────────────────────────────────┐
│               Alexa+ MCP Server (Node/TS)              │
│  - Session Handshake: GET /sse                         │
│  - Tool Registry: Zod schema validation                │
│  - External Service: Open-Meteo API                    │
│  - Rule Engine: Ambient & Smart Home Directives        │
└────────────────────────────────────────────────────────┘
               │
               ▼
   [HTTP GET /sse] (Downstream Streamable SSE Event)
               │
               ▼
   Alexa+ Agent Reasoning & Device Execution
```

---

## 🚀 Step-by-Step Setup & Running

### 1. Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### 2. Installation
```bash
# Navigate to the project directory
cd alexaplus-mcp-server

# Install dependencies
npm install
```

### 3. Run the Server
```bash
# Start in development mode with automatic reload
npm run dev

# Or build and start in production
npm run build
npm start
```

The server will launch at `http://localhost:8990`.

---

## 🧪 Testing the Implementation

### Option A: Via the Web Visual Simulator (Recommended for Judges)
Open your browser and navigate to:
```
http://localhost:8990
```
- Click **"🎙️ Alexa, check weather & prep my home"** to execute the `get_weather_and_energy_advisory` tool.
- Observe the real-time SSE stream events and formatted JSON-RPC response.

### Option B: Via Command Line (`curl`)
1. Open an SSE connection:
```bash
curl -N http://localhost:8990/sse
```
2. Note the session ID returned in the `endpoint` event:
```
event: endpoint
data: /messages?sessionId=<SESSION_ID>
```
3. Invoke the tool:
```bash
curl -X POST "http://localhost:8990/messages?sessionId=<SESSION_ID>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_weather_and_energy_advisory",
      "arguments": {
        "latitude": 47.6062,
        "longitude": -122.3321,
        "locationName": "Seattle Living Room"
      }
    }
  }'
```

---

## 🌐 Exposing for Remote Alexa+ Testing (Public URL)

To connect remote cloud agents or simulators during the hackathon:
```bash
# Using ngrok to generate a public HTTPS tunnel
npx ngrok http 8000
```
Use the resulting URL (e.g. `https://xyz.ngrok-free.app/sse`) in your agent's MCP configuration.

---

## 📝 Product Feedback (Devpost Requirement)
- **Streamable HTTP for Voice Agents**: Using SSE transports with MCP significantly lowers conversational latency compared to polling or websockets, making it a natural fit for next-gen voice assistants like Alexa+.
- **Zod Schema Documentation**: Standardized schemas make it easy for LLMs to generate well-formed arguments on the first try without hallucinations.
