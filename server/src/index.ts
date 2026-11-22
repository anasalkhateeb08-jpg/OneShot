/**
 * Server entry point.
 * Phase 0: validates configuration only. The Colyseus server, rooms, and the
 * health-check endpoint are built in phase 3. There is no run script yet on purpose.
 */
import { SIM } from "@oneshot/shared";
import { loadConfig } from "./config";

const config = loadConfig(process.env);

console.log(
  `[oneshot/server] phase 0 skeleton | port ${config.port} | origin ${config.allowedOrigin} | ` +
    `env ${config.nodeEnv} | tick ${SIM.serverTickHz} Hz`,
);
