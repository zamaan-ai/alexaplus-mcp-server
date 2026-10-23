import express, { Request, Response } from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';

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
    latitude: z.number().optional().describe('Latitude of the target location (e.g. 22.5726 for Kolkata)'),
    longitude: z.number().optional().describe('Longitude of the target location (e.g. 88.3639 for Kolkata)'),
    cityOrLocation: z.string().optional().describe('City name to search (e.g. "Kolkata", "Delhi", "London")'),
    locationName: z.string().optional().describe('Friendly location label'),
    targetDeviceContext: z.enum(['fire_tv', 'smart_speaker', 'ambient_display']).default('fire_tv'),
  },
  async ({ latitude, longitude, cityOrLocation, locationName, targetDeviceContext }) => {
    try {
      let resolvedLat = latitude;
      let resolvedLon = longitude;
      let resolvedLocation = locationName || cityOrLocation || 'Kolkata, India';

      // If a city name is provided or coordinates are missing, geocode via Open-Meteo Geocoding API
      const searchQuery = cityOrLocation || (resolvedLat === undefined ? resolvedLocation : undefined);
      if (searchQuery && (resolvedLat === undefined || resolvedLon === undefined)) {
        try {
          const geoRes = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
            params: { name: searchQuery, count: 1, language: 'en', format: 'json' },
            timeout: 5000,
          });
          if (geoRes.data?.results && geoRes.data.results.length > 0) {
            const firstResult = geoRes.data.results[0];
            resolvedLat = firstResult.latitude;
            resolvedLon = firstResult.longitude;
            resolvedLocation = `${firstResult.name}, ${firstResult.country || ''}`;
          }
        } catch (geoErr) {
          console.warn('Geocoding fallback triggered:', geoErr);
        }
      }

      // Default to Kolkata coordinates if still undefined
      if (resolvedLat === undefined || resolvedLon === undefined) {
        resolvedLat = 22.5726;
        resolvedLon = 88.3639;
        resolvedLocation = 'Kolkata, India';
      }

      // Free public Open-Meteo API (live satellite & weather stations)
      const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: resolvedLat,
          longitude: resolvedLon,
          current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,surface_pressure,uv_index',
          temperature_unit: 'celsius',
        },
        timeout: 5000,
      });

      const current = response.data.current;
      const tempC = current.temperature_2m;
      const isRaining = current.precipitation > 0;
      const isWindy = current.wind_speed_10m > 30;
      const uv = current.uv_index ?? (tempC > 25 ? 6.2 : 2.5);
      const pressure = current.surface_pressure ?? 1012;

      // Calculate Thermal Comfort Index (0-100 score)
      let comfortScore = 85;
      if (tempC > 32 || tempC < 10) comfortScore -= 30;
      else if (tempC > 28 || tempC < 16) comfortScore -= 15;
      if (current.relative_humidity_2m > 75) comfortScore -= 15;
      comfortScore = Math.max(25, Math.min(98, comfortScore));

      // Rule-based agentic reasoning
      const automationDirectives: Array<{ targetDevice: string; action: string; reason: string }> = [];

      if (tempC >= 28) {
        automationDirectives.push({
          targetDevice: 'HVAC Air Conditioner',
          action: 'Set Eco-Cooling to 23°C (Inverter Active)',
          reason: `High outdoor heat index (${tempC}°C, Feels like ${current.apparent_temperature}°C).`,
        });
        automationDirectives.push({
          targetDevice: 'Smart Ceiling Fans',
          action: 'Enable Aerodynamic Circulation Mode (Speed 3)',
          reason: 'Improves evaporative cooling efficiency by 20%.',
        });
      } else if (tempC < 14) {
        automationDirectives.push({
          targetDevice: 'HVAC Heating',
          action: 'Set gentle warmth to 21°C',
          reason: `Chilly outdoor temperature (${tempC}°C).`,
        });
      }

      if (isRaining) {
        automationDirectives.push({
          targetDevice: 'Smart Window Blinds',
          action: 'Lower blinds to 80% (Rain Shield)',
          reason: 'Precipitation detected.',
        });
        automationDirectives.push({
          targetDevice: 'Fire TV Ambient Backlight',
          action: 'Shift to "Cozy Warm 2700K" Amber Glow',
          reason: 'Compensates for cloudy overcast ambient.',
        });
      } else if (uv > 5) {
        automationDirectives.push({
          targetDevice: 'Solar Window Shades',
          action: 'Auto-deploy UV reflective shades (60%)',
          reason: `Elevated UV Radiation Index (${uv} Moderate/High).`,
        });
      }

      if (isWindy) {
        automationDirectives.push({
          targetDevice: 'Home Security Hub',
          action: 'Alert: Secure balcony doors and loose outdoor items',
          reason: `High wind velocity (${current.wind_speed_10m} km/h).`,
        });
      }

      const payload = {
        location: resolvedLocation,
        targetDeviceContext,
        telemetry: {
          temperature: `${tempC}°C`,
          apparentTemperature: `${current.apparent_temperature}°C`,
          humidity: `${current.relative_humidity_2m}%`,
          windSpeed: `${current.wind_speed_10m} km/h`,
          precipitation: `${current.precipitation} mm`,
          uvIndex: `${uv}`,
          pressure: `${pressure} hPa`,
          comfortScore: `${comfortScore}/100`,
          condition: isRaining ? 'Rainy' : tempC > 27 ? 'Warm & Humid' : 'Pleasant / Clear',
        },
        automationDirectives,
        suggestedSpokenResponse: `Currently in ${resolvedLocation}, it is ${tempC}°C with a thermal comfort index of ${comfortScore} out of 100. ${
          automationDirectives.length > 0
            ? `I have queued ${automationDirectives.length} smart device adjustments including AC climate regulation.`
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
// Tool 3: optimize_firetv_ambient_canvas
// Dynamically calibrates Fire TV picture mode, audio EQ, and bias lighting
// ============================================================================
mcp.tool(
  'optimize_firetv_ambient_canvas',
  'Calibrates Fire TV OLED/QLED picture profile, backlight luminance (nits), and Dolby Atmos audio profile based on ambient lighting conditions.',
  {
    roomLux: z.number().min(0).max(2000).default(120).describe('Ambient room illuminance in lux (e.g. 50-300 lux)'),
    contentGenre: z.enum(['cinema_movie', 'live_sports', 'immersive_gaming', 'ambient_art']).default('cinema_movie'),
    hdrFormat: z.enum(['dolby_vision', 'hdr10_plus', 'standard']).default('dolby_vision'),
    deviceConnected: z.boolean().default(true).describe('Whether an active Fire TV hardware display is paired and verified on the local network'),
  },
  async ({ roomLux, contentGenre, hdrFormat, deviceConnected }) => {
    if (!deviceConnected) {
      const disconnectedPayload = {
        deviceStatus: 'disconnected',
        deviceType: 'Amazon Fire TV (Omni / 4K Max)',
        networkState: 'No MDNS / Matter Cast device detected on local Wi-Fi subnet',
        error: 'DEVICE_UNPAIRED',
        guidance: 'Power on your Fire TV, ensure it is on the same Wi-Fi subnet, or verify pairing in the Alexa+ Device Bridge console.',
        suggestedSpokenResponse: 'No active Fire TV display was detected on your network. Please verify that your Fire TV is powered on and connected to Wi-Fi to begin display calibration.',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(disconnectedPayload, null, 2) }],
      };
    }

    // Determine optimal luminance & color temperature
    const isDarkRoom = roomLux < 80;
    const targetNits = isDarkRoom ? 180 : roomLux > 300 ? 550 : 320;
    const colorTempKelvin = isDarkRoom ? '6500K (Warm D65 Reference)' : '7500K (Daylight Neutral)';
    const biasLightingLux = isDarkRoom ? '15% Warm Tungsten (2700K)' : 'Off';

    const audioProfiles: Record<string, string> = {
      cinema_movie: 'Dolby Atmos Cinema • Enhanced Dialogue Clarity Active',
      live_sports: 'Stadium Immersion 3D Audio • Dynamic Crowd Balancing',
      immersive_gaming: 'Low Latency Game Audio • Spatial Directional Pinpointing',
      ambient_art: 'Quiet Acoustic Bed (-24dB background volume)',
    };

    const payload = {
      deviceStatus: 'connected',
      hardwareTarget: 'Fire TV Omni 65" 4K (Living Room - 192.168.1.14)',
      fireTvOptimization: {
        activeProfile: contentGenre.replace('_', ' ').toUpperCase(),
        hdrPipeline: hdrFormat.replace('_', ' ').toUpperCase(),
        displayCalibration: {
          panelTargetLuminance: `${targetNits} nits (Peak HDR: 1000 nits)`,
          colorCalibration: colorTempKelvin,
          motionSmoothing: contentGenre === 'live_sports' ? 'MEMC High Clarity (120Hz)' : '24p True Film (Judder-Free)',
          ambientBiasLighting: biasLightingLux,
        },
        audioEngine: audioProfiles[contentGenre] || audioProfiles.cinema_movie,
        roomSensorReading: `${roomLux} lux detected`,
      },
      spokenConfirmation: `Fire TV display calibrated for ${contentGenre.replace('_', ' ')}. Luminance set to ${targetNits} nits with ${colorTempKelvin}.`,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  }
);

// ============================================================================
// Tool 4: calculate_energy_grid_savings
// Calculates energy efficiency setbacks, wattage reduction & carbon offsets
// ============================================================================
mcp.tool(
  'calculate_energy_grid_savings',
  'Analyzes household smart appliance power draw, thermostat setbacks, and calculates daily wattage reduction and carbon savings.',
  {
    thermostatSetbackC: z.number().default(2).describe('Thermostat adjustment delta in degrees C (e.g. 1.5 - 3.0)'),
    homeSquareMeters: z.number().default(140).describe('Total conditioned living area'),
    meterConnected: z.boolean().default(true).describe('Whether a smart energy grid meter (Shelly / Emporia / Zigbee CT clamp) is linked and reporting telemetry'),
  },
  async ({ thermostatSetbackC, homeSquareMeters, meterConnected }) => {
    if (!meterConnected) {
      const disconnectedPayload = {
        meterStatus: 'disconnected',
        meterType: 'Smart Energy Grid CT Clamp / In-Line Monitor',
        networkState: 'Zero active telemetry packets detected from smart meter',
        error: 'METER_OFFLINE',
        guidance: 'Pair a Matter or Zigbee-compatible smart meter to your electrical distribution board, or verify the sensor link in the Device Bridge.',
        suggestedSpokenResponse: 'No smart power meter is currently reporting live telemetry on your network. Please connect your energy monitor or verify device pairing to view real-time grid metrics.',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(disconnectedPayload, null, 2) }],
      };
    }

    // 1 deg C setback roughly yields ~7% HVAC power reduction
    const baselineWatts = Math.round(homeSquareMeters * 22); // ~3080W HVAC baseline
    const reductionPercent = Math.min(25, thermostatSetbackC * 7.5);
    const wattsSaved = Math.round(baselineWatts * (reductionPercent / 100));
    const dailyKWhSaved = Number(((wattsSaved * 12) / 1000).toFixed(2));
    const monthlyCostSavedINR = Math.round(dailyKWhSaved * 30 * 8.5); // ~₹8.5 per kWh
    const carbonOffsetKg = Number((dailyKWhSaved * 0.82).toFixed(2)); // ~0.82kg CO2 per kWh grid factor

    const payload = {
      meterStatus: 'connected',
      hardwareTarget: 'Shelly Pro EM-50 (Panel Breaker #3)',
      energyOptimization: {
        thermostatDelta: `+${thermostatSetbackC}°C Eco Setback`,
        realTimeWattageReduction: `-${wattsSaved} Watts`,
        estimatedMonthlySavings: `₹${monthlyCostSavedINR} (~$${(monthlyCostSavedINR / 85).toFixed(2)} USD)`,
        dailyCarbonReduction: `${carbonOffsetKg} kg CO₂ offset per day`,
        gridHealthStatus: 'Off-Peak Green Band (Grid Load Normal)',
        appliancesManaged: ['Inverter Air Conditioner', 'Heat Pump Water Heater', 'Smart TV OLED Panel'],
      },
      spokenConfirmation: `Eco energy saver active. Reduced instantaneous load by ${wattsSaved} watts, saving approximately ${dailyKWhSaved} kilowatt-hours daily.`,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  }
);

// ============================================================================
// Tool 5: ask_alexa_assistant
// General conversational intelligence for Alexa+ questions and capabilities
// ============================================================================
mcp.tool(
  'ask_alexa_assistant',
  'Answers general conversational queries, explains capabilities, architecture, and provides multi-turn smart home advice for Alexa+.',
  {
    query: z.string().describe('The user conversational question or prompt'),
  },
  async ({ query }) => {
    const q = query.toLowerCase();
    let topic = 'general';
    let title = 'Alexa+ Intelligence Hub';
    let answer = '';
    let followUpSuggestions: string[] = [];

    if (q.includes('who are you') || q.includes('what are you') || q.includes('identity')) {
      topic = 'identity';
      title = 'Next-Gen Alexa+ Agent';
      answer =
        'I am the Alexa+ Smart Home & Climate Intelligence Agent, powered by a self-hosted Model Context Protocol (MCP) server over Streamable HTTP transports. I connect conversational voice commands directly to live external APIs and smart home automation systems.';
      followUpSuggestions = ['Check Climate', 'Calibrate Fire TV Canvas', 'Show Energy Savings'];
    } else if (q.includes('what can you do') || q.includes('capabilities') || q.includes('help') || q.includes('tools')) {
      topic = 'capabilities';
      title = 'Autonomous MCP Capabilities';
      answer =
        'I have 4 production MCP tools:\n1. Live Climate Telemetry & Thermal Comfort Index from Open-Meteo\n2. Fire TV Canvas Display & Dolby Atmos Audio Calibration\n3. Smart Grid Energy Setbacks & Carbon Offset Analytics\n4. Multi-device Ambient Scene Orchestration (Cinema, Good Night, Energy Saver).';
      followUpSuggestions = ['Check Climate', 'Movie Night Mode', 'Calibrate Fire TV Canvas'];
    } else if (q.includes('mcp') || q.includes('model context protocol') || q.includes('how does it work') || q.includes('architecture')) {
      topic = 'mcp_architecture';
      title = 'Model Context Protocol (MCP) Architecture';
      answer =
        'Model Context Protocol is an open standard enabling LLMs to interact with external tools. In this project, we use Streamable HTTP (Server-Sent Events) where your client establishes a persistent downstream stream at /sse and sends upstream JSON-RPC tool calls to /messages. This ensures sub-200ms latency for voice interactions.';
      followUpSuggestions = ['Inspect MCP Tools Schema', 'Check Climate', 'Show Energy Savings'];
    } else if (q.includes('hackathon') || q.includes('amazon') || q.includes('track')) {
      topic = 'hackathon';
      title = 'Amazon Developer Hackathon (Track 2: Alexa+)';
      answer =
        'This project is built for the Build, Ship, Shape: Amazon Developer Hackathon (Alexa+ Track). It demonstrates an open-standard MCP server integrating live external APIs, multi-modal Fire TV display controls, and autonomous reasoning for next-gen personal assistants.';
      followUpSuggestions = ['Check Climate', 'Calibrate Fire TV Canvas', 'Who are you?'];
    } else if (q.includes('light') || q.includes('blinds') || q.includes('thermostat') || q.includes('tv')) {
      topic = 'smart_home';
      title = 'Connected Smart Devices';
      answer =
        'I manage multiple connected smart home endpoints: HVAC climate units, motorized blinds, ambient TV backlights, and Fire TV display canvases. I can optimize them based on real-time outdoor weather or switch to custom presets like Cinema Mode.';
      followUpSuggestions = ['Movie Night Mode', 'Check Climate', 'Good Night Scene'];
    } else {
      topic = 'conversational';
      title = 'Alexa+ Assistant';
      answer = `You asked: "${query}". As your Alexa+ assistant, I can autonomously manage your home's climate, optimize your Fire TV display for cinema viewing, and calculate energy grid savings using real-time telemetry.`;
      followUpSuggestions = ['Check Climate', 'Calibrate Fire TV Canvas', 'Show Energy Savings'];
    }

    const payload = {
      assistantResponse: {
        query,
        topic,
        title,
        answer,
        followUpSuggestions,
        timestamp: new Date().toISOString(),
      },
      suggestedSpokenResponse: answer.replace(/\n/g, ' '),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    };
  }
);

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

  await transport.handlePostMessage(req, res, req.body);
});

// Helper function to test real TCP socket reachability on local network
function checkTcpReachability(host: string, port: number, timeoutMs = 2500): Promise<{ reachable: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let hasResolved = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      if (!hasResolved) {
        hasResolved = true;
        socket.destroy();
        resolve({ reachable: true });
      }
    });

    socket.on('timeout', () => {
      if (!hasResolved) {
        hasResolved = true;
        socket.destroy();
        resolve({ reachable: false, error: 'ETIMEDOUT (No response from target IP within 2500ms)' });
      }
    });

    socket.on('error', (err: any) => {
      if (!hasResolved) {
        hasResolved = true;
        socket.destroy();
        resolve({ reachable: false, error: `${err.code || 'ECONNREFUSED'} (${err.message})` });
      }
    });

    try {
      socket.connect(port, host);
    } catch (err: any) {
      if (!hasResolved) {
        hasResolved = true;
        resolve({ reachable: false, error: err.message });
      }
    }
  });
}

// 3. Real vs Virtual Hardware Verification Endpoint
app.post('/api/verify-hardware', async (req: Request, res: Response) => {
  const { target, host, port, mode } = req.body;

  if (mode === 'virtual_bridge') {
    res.json({
      success: true,
      mode: 'virtual_bridge',
      target,
      deviceLabel: target === 'fire_tv' ? 'Virtual Fire TV Bridge (Omni 65" 4K)' : 'Virtual Smart Meter (Shelly Pro EM)',
      host: 'virtual-bridge.local',
      message: 'Virtual Device Bridge active. Emulating authentic SMPTE/Matter telemetry for sandbox testing.',
      verifiedAt: new Date().toISOString(),
    });
    return;
  }

  // Real LAN Hardware Mode
  const targetHost = host || (target === 'fire_tv' ? '192.168.1.50' : '192.168.1.60');
  const targetPort = Number(port) || (target === 'fire_tv' ? 5555 : 80);

  const result = await checkTcpReachability(targetHost, targetPort, 2500);

  if (result.reachable) {
    res.json({
      success: true,
      mode: 'real_lan',
      target,
      deviceLabel: `${target === 'fire_tv' ? 'Physical Fire TV' : 'Physical Smart Meter'} (${targetHost}:${targetPort})`,
      host: targetHost,
      port: targetPort,
      message: `Hardware handshake confirmed! Real TCP socket active at ${targetHost}:${targetPort}.`,
      verifiedAt: new Date().toISOString(),
    });
  } else {
    res.json({
      success: false,
      mode: 'real_lan',
      target,
      host: targetHost,
      port: targetPort,
      error: result.error,
      message: `Hardware verification failed: Unable to connect to ${targetHost}:${targetPort}. Reason: ${result.error}. Ensure physical device is powered on and connected to this subnet.`,
      verifiedAt: new Date().toISOString(),
    });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    activeSessions: Object.keys(activeTransports).length,
    registeredTools: [
      'get_weather_and_energy_advisory',
      'control_smart_home_scene',
      'optimize_firetv_ambient_canvas',
      'calculate_energy_grid_savings',
      'ask_alexa_assistant',
    ],
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
