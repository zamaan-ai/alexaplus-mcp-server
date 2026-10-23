import express, { Request, Response } from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve the Visual Simulator UI
app.use(express.static(path.join(__dirname, '../public')));

// In-memory active transport store
const activeTransports: Record<string, SSEServerTransport> = {};

// Initialize MCP Server instance
const mcp = new McpServer({
  name: 'alexaplus-smarthome-context-engine',
  version: '1.0.0',
});

// ============================================================================
// Tool 1: get_weather_and_energy_advisory
// Real-time environmental telemetry + predictive home automation directives
// ============================================================================
mcp.tool(
  'get_weather_and_energy_advisory',
  'Fetches real-time weather metrics and generates contextual smart home climate and energy recommendations for Alexa+.',
  {
    latitude: z.number().describe('Latitude of the target location (e.g. 37.7749)'),
    longitude: z.number().describe('Longitude of the target location (e.g. -122.4194)'),
    locationName: z.string().optional().describe('Friendly location name (e.g. "Seattle Home")'),
    targetDeviceContext: z.enum(['fire_tv', 'smart_speaker', 'ambient_display']).default('fire_tv'),
  },
  async ({ latitude, longitude, locationName, targetDeviceContext }) => {
    try {
      // Free public Open-Meteo API (no API key needed)
      const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude,
          longitude,
          current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
          temperature_unit: 'celsius',
        },
        timeout: 5000,
      });

      const current = response.data.current;
      const tempC = current.temperature_2m;
      const isRaining = current.precipitation > 0;
      const isWindy = current.wind_speed_10m > 30;

      // Rule-based agentic reasoning
      const automationDirectives: Array<{ targetDevice: string; action: string; reason: string }> = [];

      if (tempC > 26) {
        automationDirectives.push({
          targetDevice: 'HVAC Thermostat',
          action: 'Set cooling to 22°C and enable Eco Fan',
          reason: `Ambient outdoor temperature is high (${tempC}°C).`,
        });
      } else if (tempC < 14) {
        automationDirectives.push({
          targetDevice: 'HVAC Thermostat',
          action: 'Set heating to 21°C',
          reason: `Chilly outdoor temperature (${tempC}°C).`,
        });
      }

      if (isRaining) {
        automationDirectives.push({
          targetDevice: 'Living Room Smart Blinds',
          action: 'Lower blinds to 80%',
          reason: 'Precipitation detected.',
        });
        automationDirectives.push({
          targetDevice: 'Ambient TV Backlight',
          action: 'Activate "Cozy Cinema" warm lighting preset',
          reason: 'Rainy overcast conditions.',
        });
      }

      if (isWindy) {
        automationDirectives.push({
          targetDevice: 'Security Hub',
          action: 'Alert user: Check patio doors and loose outdoor furniture',
          reason: `High wind speed detected (${current.wind_speed_10m} km/h).`,
        });
      }

      const payload = {
        location: locationName || `${latitude}, ${longitude}`,
        targetDeviceContext,
        telemetry: {
          temperature: `${tempC}°C`,
          apparentTemperature: `${current.apparent_temperature}°C`,
          humidity: `${current.relative_humidity_2m}%`,
          windSpeed: `${current.wind_speed_10m} km/h`,
          precipitation: `${current.precipitation} mm`,
          condition: isRaining ? 'Rainy' : tempC > 24 ? 'Warm & Sunny' : 'Mild/Overcast',
        },
        automationDirectives,
        suggestedSpokenResponse: `Currently in ${locationName || 'your area'}, it is ${tempC}°C and ${
          isRaining ? 'raining' : 'clear'
        }. ${
          automationDirectives.length > 0
            ? `I have queued ${automationDirectives.length} smart home adjustments for your comfort.`
            : 'All indoor parameters look optimal.'
        }`,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to fetch environmental telemetry: ${error?.message || error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ============================================================================
// Tool 2: control_smart_home_scene
// Simulates executing IoT scenes across connected TV & home devices
// ============================================================================
mcp.tool(
  'control_smart_home_scene',
  'Activates an automation preset scene across smart home devices and TV ambient backlights.',
  {
    sceneName: z.enum(['cozy_cinema', 'energy_saver', 'good_night', 'workout_focus']),
    room: z.string().default('Living Room'),
  },
  async ({ sceneName, room }) => {
    const sceneConfigs: Record<string, { lights: string; thermostat: string; tvDisplay: string }> = {
      cozy_cinema: {
        lights: 'Warm amber dimmed to 20%',
        thermostat: 'Comfort mode (21.5°C)',
        tvDisplay: 'Picture mode: Cinema / Theater Audio Profile',
      },
      energy_saver: {
        lights: 'Off in unoccupied zones, 40% in active room',
        thermostat: 'Eco mode (20°C)',
        tvDisplay: 'Ambient OLED power saving active',
      },
      good_night: {
        lights: 'All lights off, nightpath 5% amber',
        thermostat: 'Night mode (19°C)',
        tvDisplay: 'Sleep timer: 30 minutes',
      },
      workout_focus: {
        lights: 'Cool daylight white 80%',
        thermostat: 'Cooling mode (19.5°C)',
        tvDisplay: 'High-energy audio profile',
      },
    };

    const config = sceneConfigs[sceneName] || sceneConfigs.cozy_cinema;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: 'success',
              activatedScene: sceneName,
              room,
              appliedParameters: config,
              timestamp: new Date().toISOString(),
              spokenConfirmation: `Activated ${sceneName.replace('_', ' ')} in the ${room}.`,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ============================================================================
// Streamable HTTP (SSE) Transport Endpoints
// ============================================================================

// 1. Downstream Event Stream
app.get('/sse', async (req: Request, res: Response) => {
  console.log(`[SSE] Inbound connection established from: ${req.ip}`);

  const transport = new SSEServerTransport('/messages', res);
  const sessionId = transport.sessionId;
  activeTransports[sessionId] = transport;

  req.on('close', () => {
    console.log(`[SSE] Session closed: ${sessionId}`);
    delete activeTransports[sessionId];
  });

  await mcp.connect(transport);
});

// 2. Upstream JSON-RPC Message Dispatcher
app.post('/messages', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = activeTransports[sessionId];

  if (!transport) {
    res.status(404).json({ error: 'Session not found or expired. Re-establish SSE connection at /sse.' });
    return;
  }

  await transport.handlePostMessage(req, res);
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    activeSessions: Object.keys(activeTransports).length,
    registeredTools: ['get_weather_and_energy_advisory', 'control_smart_home_scene'],
    protocol: 'Model Context Protocol (MCP) Streamable HTTP / SSE',
  });
});

const PORT = process.env.PORT || 8990;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(Number(PORT), HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Alexa+ MCP Server running at http://${HOST}:${PORT}`);
  console.log(`📡 SSE Stream:     http://${HOST}:${PORT}/sse`);
  console.log(`💬 Message Router: http://${HOST}:${PORT}/messages?sessionId=...`);
  console.log(`🖥️  Visual Demo:    http://${HOST}:${PORT}/`);
  console.log(`=======================================================`);
});
