const nodemailer = require("nodemailer");

function createTransporter(gmailUser, gmailAppPassword) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });
}

async function sendSms(transporter, gmailUser, phoneNumber, gateway, message) {
  const smsEmail = `${phoneNumber}@${gateway}`;
  console.log(`[SMS] Sending to ${smsEmail}...`);

  await transporter.sendMail({
    from: gmailUser,
    to: smsEmail,
    subject: "", // SMS gateways ignore subject
    text: message,
  });

  console.log("[SMS] Sent successfully.");
}

async function sendEmailReport(transporter, gmailUser, toEmail, report, pdfPath) {
  console.log(`[Email] Sending full report to ${toEmail}...`);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const mailOptions = {
    from: gmailUser,
    to: toEmail,
    subject: `📊 Daily Stock Report — ${dateStr}`,
    text: report,
  };

  // Attach PDF if available
  if (pdfPath && require("fs").existsSync(pdfPath)) {
    mailOptions.attachments = [
      {
        filename: `Stock_Report_${now.toISOString().split("T")[0]}.pdf`,
        path: pdfPath,
        contentType: "application/pdf",
      },
    ];
  }

  await transporter.sendMail(mailOptions);
  console.log("[Email] Sent successfully (with PDF attachment).");
}

module.exports = { createTransporter, sendSms, sendEmailReport };
