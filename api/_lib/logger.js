import winston from "winston";
import { EmailAlertTransport } from "./winston-alert.js";

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""}`;
    }),
  ),
  transports: [
    new winston.transports.Console(),
    // Email alert for critical errors
    ...(process.env.ALERT_EMAIL ? [new EmailAlertTransport()] : []),
  ],
});

export default logger;