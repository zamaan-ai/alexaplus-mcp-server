# Amazon Developer Hackathon (Build, Ship, Shape 2026)
## Official Developer Friction Log (Alexa+ & MCP Streamable HTTP Track)

> **Submission Bonus Notice**: This document follows the exact schema requested by the Amazon judging committee to qualify for the **10% Judging Bonus**.

---

### Friction Log Entry 1: Stream Body Consumption in Express with MCP SSEServerTransport
* **Task Attempted**: Exposing an MCP server over Streamable HTTP using Express.js with `SSEServerTransport` and `handlePostMessage` for the `/messages` JSON-RPC route.
* **Steps Taken**:
  1. Configured standard Express middleware: `app.use(express.json())`.
  2. Routed incoming JSON-RPC POST requests to `transport.handlePostMessage(req, res)`.
  3. Sent `tools/call` JSON-RPC message from client.
* **Expected Result**: The MCP transport accepts and parses the JSON-RPC message body and emits the execution result across the active SSE stream.
* **Actual Result**: Server returned `HTTP 400 - InternalServerError: stream is not readable`. The MCP SDK attempted to re-read the already-consumed Node incoming request stream (`getRawBody(req)`), failing silently.
* **Severity Rating**: **High (Developer Onboarding Blocker)**.
* **Workaround Used**: Inspected `@modelcontextprotocol/sdk` internals and discovered the undocumented 3rd parameter: `transport.handlePostMessage(req, res, req.body)` allows passing Express's pre-parsed body directly.
* **Actionable Suggestion for Amazon / MCP Team**:
  - Update MCP SDK documentation and quickstarts to explicitly state: *"When using Express or bodyParser, pass `req.body` as the 3rd parameter to `handlePostMessage`."*
  - Add auto-detection inside `handlePostMessage`: if `req.body` is already defined as an object, default to using it instead of throwing a stream read error.

---

### Friction Log Entry 2: Host Interface Binding on macOS / Local Sandboxes
* **Task Attempted**: Starting the MCP HTTP server on default `localhost:8000` via `app.listen(PORT)`.
* **Steps Taken**:
  1. Executed `app.listen(8000)`.
* **Expected Result**: Server binds to local network interface.
* **Actual Result**: Threw `listen EADDRINUSE :::8000` because Express binds to IPv6 `::` by default on macOS, causing address collisions with browser services.
* **Severity Rating**: **Medium**.
* **Workaround Used**: Bound server explicitly to IPv4 loopback: `app.listen(PORT, '127.0.0.1')` and defaulted to unassigned port `8990`.
* **Actionable Suggestion for Amazon / MCP Team**:
  - Provide an official `.env.example` in starter kits with `HOST=127.0.0.1` and `PORT=8990` to avoid common macOS system service conflicts.

---

### Friction Log Entry 3: Browser Client Audio Integration for Multi-Modal Testing
* **Task Attempted**: Testing two-way speech interaction with the self-hosted MCP server in privacy-first browsers (such as Brave Browser).
* **Steps Taken**:
  1. Instantiated `new webkitSpeechRecognition()`.
  2. Clicked microphone button to speak prompt.
* **Expected Result**: Web Speech API captures audio and streams transcript.
* **Actual Result**: `webkitSpeechRecognition` immediately failed with a silent `network` error because Chromium/Brave blocks unauthenticated Google speech backend web sockets by default.
* **Severity Rating**: **Medium (User Experience Frustration)**.
* **Workaround Used**: Added explicit `navigator.mediaDevices.getUserMedia` hardware permission check and created an on-screen visual notification banner instructing users how to enable speech services or use instant text fallback.
* **Actionable Suggestion for Amazon / MCP Team**:
  - Provide an official Amazon Polly / Web Audio recording helper in the hackathon starter template so developers aren't reliant on browser-specific speech APIs for hackathon testing.

---

### Friction Log Entry 4: Hardware Absence & Matter Device Emulation in Developer Sandbox
* **Task Attempted**: Testing hardware-dependent MCP tools (`optimize_firetv_ambient_canvas` and `calculate_energy_grid_savings`) in local development and hackathon judging environments without physical Fire TV hardware or Zigbee electrical sub-metering clamps in the room.
* **Steps Taken**:
  1. Attempted to execute display calibration and electrical load analysis without physical devices paired on the local subnet.
  2. Observed that typical skills either fail with unhandled exceptions or hallucinate fake hardware connections, confusing end users and judges.
* **Expected Result**: An official Amazon Devices mock bridge or Matter simulator allowing skills to test both "device absent / discovery" and "device verified / streaming" states.
* **Actual Result**: Because gated Alexa+ developer tools (Category SDK, MCP Toolkit, and Web Simulator) were restricted to preview partners, public developers had no standardized hardware state machine for testing.
* **Severity Rating**: **High (Simulated vs Real-World Gap)**.
* **Workaround Used**: Architected an explicit Hardware Presence Protocol in our MCP server (`deviceConnected`, `meterConnected`). When disconnected, tools output realistic, professional diagnostic feedback (`DEVICE_UNPAIRED: No MDNS/Matter Cast detected`, `METER_OFFLINE`). Built an interactive Device Bridge Handshake in the UI that verifies local broadcast handshakes and seamlessly transitions into live calibrated telemetry.
* **Actionable Suggestion for Amazon / MCP Team**:
  - Provide an open-source `@amazon-devices/virtual-bridge` library that can simulate Matter Cast, Fire TV Ambient Canvas D65 signals, and smart home sensor packets for self-hosted MCP development.
