import nodemailer from 'nodemailer';

// Helper to create Gmail transport
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS.replace(/\s+/g, '') // remove spaces from 16-character app password
    }
  });
};

/**
 * Send 6-Digit Email Verification OTP
 */
export const sendOTPEmail = async (email, otp) => {
  const transporter = createTransporter();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; rounded-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; background-color: #1D56A5; color: #ffffff; padding: 8px 18px; border-radius: 10px; font-weight: 900; font-size: 16px; letter-spacing: 1px;">
          SAFE DRIVE
        </div>
        <h2 style="color: #0f172a; margin-top: 14px; margin-bottom: 6px;">Email Verification Code</h2>
        <p style="color: #64748b; font-size: 14px; margin: 0;">Complete your vehicle QR safety kit purchase</p>
      </div>

      <div style="background-color: #ffffff; padding: 24px; border-radius: 12px; text-align: center; border: 1px solid #cbd5e1; margin-bottom: 20px;">
        <span style="font-size: 12px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Your One-Time Password (OTP)</span>
        <div style="font-size: 36px; font-weight: 900; font-family: monospace; color: #1D56A5; letter-spacing: 8px; margin: 14px 0;">
          ${otp}
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">Valid for 10 minutes. Do not share this code with anyone.</p>
      </div>

      <div style="font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
        If you did not request this verification code, please ignore this email.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n======================================================`);
    console.log(`📨 [EMAIL SIMULATOR] To: ${email} | Verification OTP: [ ${otp} ]`);
    console.log(`⚠️ (Add EMAIL_USER and EMAIL_PASS in backend/.env for live Gmail dispatch)`);
    console.log(`======================================================\n`);
    return { success: true, simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Safe Drive Vehicle Safety" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Your Safe Drive Verification Code: ${otp}`,
      html: htmlContent
    });
    console.log(`✅ [EMAIL SENT] OTP successfully delivered to ${email} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send Purchase Confirmation & Invoice Receipt
 */
export const sendPurchaseConfirmationEmail = async (email, user, orderDetails, qrCodes = []) => {
  const transporter = createTransporter();

  const qrCodesListHtml = qrCodes.map(q => `
    <li style="padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-family: monospace; font-weight: bold; color: #1D56A5;">
      🏷️ ${q.copyCode} <span style="font-size: 11px; color: #64748b; font-weight: normal;">(Token: ${q.publicToken})</span>
    </li>
  `).join('');

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; background-color: #1D56A5; color: #ffffff; padding: 8px 18px; border-radius: 10px; font-weight: 900; font-size: 16px; letter-spacing: 1px;">
          SAFE DRIVE
        </div>
        <h2 style="color: #0f172a; margin-top: 14px; margin-bottom: 6px;">🎉 Purchase Confirmed!</h2>
        <p style="color: #259A3A; font-size: 14px; font-weight: bold; margin: 0;">Payment Successful (Order ID: ${orderDetails.orderId})</p>
      </div>

      <div style="background-color: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 18px;">
        <h3 style="font-size: 14px; color: #0f172a; margin-top: 0; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">Order Summary</h3>
        <table style="width: 100%; font-size: 13px; color: #334155; line-height: 1.8;">
          <tr>
            <td><strong>Product:</strong></td>
            <td style="text-align: right;">${orderDetails.productName} (${orderDetails.copiesPerSet} Stickers Set)</td>
          </tr>
          <tr>
            <td><strong>Customer Name:</strong></td>
            <td style="text-align: right;">${user.name}</td>
          </tr>
          <tr>
            <td><strong>Phone:</strong></td>
            <td style="text-align: right;">${user.phone}</td>
          </tr>
          <tr>
            <td><strong>Delivery Address:</strong></td>
            <td style="text-align: right;">${user.address}, ${user.city || ''}, ${user.state || ''}</td>
          </tr>
          <tr style="border-top: 1px solid #e2e8f0; font-size: 15px; color: #1D56A5;">
            <td><strong>Total Amount Paid:</strong></td>
            <td style="text-align: right; font-weight: 900;">₹${orderDetails.amount}</td>
          </tr>
        </table>
      </div>

      <div style="background-color: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
        <h3 style="font-size: 14px; color: #0f172a; margin-top: 0; margin-bottom: 8px;">Allocated QR Stickers</h3>
        <p style="font-size: 12px; color: #64748b; margin-top: 0;">Your allocated QR safety kit is ready:</p>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px;">
          ${qrCodesListHtml}
        </ul>
      </div>

      <div style="background-color: #E9DFEE; padding: 16px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
        <h4 style="margin: 0 0 6px 0; color: #1D56A5; font-size: 14px;">Next Step: Register Your Vehicle</h4>
        <p style="margin: 0; font-size: 12px; color: #475569;">
          Log in to your Safe Drive account using your mobile number <strong>${user.phone}</strong> to bind your number plate and configure emergency contacts.
        </p>
      </div>

      <div style="font-size: 11px; color: #94a3b8; text-align: center;">
        Thank you for choosing Safe Drive. Stay protected on the road.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n======================================================`);
    console.log(`🧾 [EMAIL SIMULATOR] Invoice Sent to: ${email}`);
    console.log(`📦 Order: ${orderDetails.productName} | Amount: ₹${orderDetails.amount}`);
    console.log(`🏷️ QR Codes:`, qrCodes.map(q => q.copyCode).join(', '));
    console.log(`======================================================\n`);
    return { success: true, simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Safe Drive Orders" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Safe Drive Purchase Confirmation - Order #${orderDetails.orderId}`,
      html: htmlContent
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending purchase email:', error);
    return { success: true, simulated: true, error: error.message };
  }
};
