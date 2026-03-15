// winston-alert.js
// Winston transport for sending alerts (email, Slack, etc.) on critical errors
import Transport from "winston-transport";
import nodemailer from "nodemailer";

const ALERT_EMAIL = process.env.ALERT_EMAIL;
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM;
const ALERT_EMAIL_PASS = process.env.ALERT_EMAIL_PASS;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: ALERT_EMAIL_FROM,
    pass: ALERT_EMAIL_PASS,
  },
});

export class EmailAlertTransport extends Transport {
  log(info, callback) {
    setImmediate(() => this.emit("logged", info));
    if (info.level === "error" || info.level === "critical") {
      const mailOptions = {
        from: ALERT_EMAIL_FROM,
        to: ALERT_EMAIL,
        subject: `[ALERT] ${info.level.toUpperCase()} in Exclusave Backend`,
        text: JSON.stringify(info, null, 2),
      };
      transporter.sendMail(mailOptions, (err, info) => {
        if (err) {
          // eslint-disable-next-line no-console
          console.error("Failed to send alert email:", err);
        }
      });
    }
    callback();
  }
}