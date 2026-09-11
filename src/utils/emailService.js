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
export const sendSystemAlertEmail = async (email, title, message) => {
  const transporter = createTransporter();
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; background-color: #ef4444; color: #ffffff; padding: 8px 18px; border-radius: 10px; font-weight: 900; font-size: 16px; letter-spacing: 1px;">
          SAFE DRIVE SYSTEM ALERT
        </div>
        <h2 style="color: #0f172a; margin-top: 14px; margin-bottom: 6px;">${title}</h2>
      </div>

      <div style="background-color: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 20px;">
        <p style="color: #334155; line-height: 1.6; margin: 0; font-size: 15px;">
          ${message}
        </p>
      </div>

      <div style="font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
        This is an automated system alert from SafeDrive Admin Panel.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n[SYSTEM ALERT EMAIL] To: ${email} | Title: ${title}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: '"SafeDrive Alerts" <noreply@safedrive.in>',
      to: email,
      subject: `SafeDrive Alert: ${title}`,
      html: htmlContent
    });
  } catch (error) {
    console.error('Failed to send system alert email:', error);
  }
};

/**
 * Send Welcome Email to New Partner/Reseller
 */
export const sendPartnerWelcomeEmail = async (email, name, phone, partnerUrl) => {
  const transporter = createTransporter();
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; background-color: #1D56A5; color: #ffffff; padding: 8px 18px; border-radius: 10px; font-weight: 900; font-size: 16px; letter-spacing: 1px;">
          SAFE DRIVE PARTNER
        </div>
        <h2 style="color: #0f172a; margin-top: 14px; margin-bottom: 6px;">Welcome to SafeDrive, ${name}!</h2>
      </div>

      <div style="background-color: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 20px;">
        <p style="color: #334155; line-height: 1.6; margin: 0 0 16px 0; font-size: 15px;">
          Your Reseller account has been successfully created. We are thrilled to have you as a partner!
        </p>
        <p style="color: #334155; line-height: 1.6; margin: 0 0 8px 0; font-size: 15px; font-weight: bold;">
          Your Registration Details:
        </p>
        <ul style="color: #334155; line-height: 1.6; margin: 0 0 16px 0; font-size: 15px; padding-left: 20px;">
          <li><strong>Registered Number:</strong> ${phone}</li>
          <li><strong>Email:</strong> ${email}</li>
        </ul>
        <div style="text-align: center; margin-top: 24px;">
          <a href="${partnerUrl}" style="background-color: #16A34A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Access Partner Panel
          </a>
        </div>
      </div>

      <div style="font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
        If you have any questions, feel free to contact our support team.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n[PARTNER WELCOME EMAIL] To: ${email} | Name: ${name} | URL: ${partnerUrl}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"SafeDrive Partner" <noreply@safedrive.in>',
      to: email,
      subject: `Welcome to SafeDrive Partner Portal`,
      html: htmlContent
    });
  } catch (error) {
    console.error('Failed to send partner welcome email:', error);
  }
};

/**
 * Send Welcome Email to End User (Account Creation)
 */
export const sendUserWelcomeEmail = async (email, name, phone) => {
  const transporter = createTransporter();
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; background-color: #1D56A5; color: #ffffff; padding: 8px 18px; border-radius: 10px; font-weight: 900; font-size: 16px; letter-spacing: 1px;">
          SAFE DRIVE
        </div>
        <h2 style="color: #0f172a; margin-top: 14px; margin-bottom: 6px;">Welcome to SafeDrive!</h2>
      </div>

      <div style="background-color: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 20px;">
        <p style="color: #334155; line-height: 1.6; margin: 0 0 16px 0; font-size: 15px;">
          Hi ${name || 'User'},<br><br>
          Your SafeDrive account has been successfully created. We are glad to have you with us!
        </p>
        <p style="color: #334155; line-height: 1.6; margin: 0 0 8px 0; font-size: 15px; font-weight: bold;">
          Your Registration Details:
        </p>
        <ul style="color: #334155; line-height: 1.6; margin: 0 0 16px 0; font-size: 15px; padding-left: 20px;">
          <li><strong>Registered Number:</strong> ${phone}</li>
          <li><strong>Email:</strong> ${email}</li>
        </ul>
      </div>

      <div style="font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
        Stay protected on the road.
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n[USER WELCOME EMAIL] To: ${email} | Name: ${name}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"SafeDrive" <noreply@safedrive.in>',
      to: email,
      subject: `Welcome to SafeDrive, ${name || 'User'}!`,
      html: htmlContent
    });
  } catch (error) {
    console.error('Failed to send user welcome email:', error);
  }
};

/**
 * Send QR Activation Email
 */
export const sendQRActivationEmail = async (email, userName, vehicleNumber, publicToken) => {
  const transporter = createTransporter();
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; background-color: #1D56A5; color: #ffffff; padding: 8px 18px; border-radius: 10px; font-weight: 900; font-size: 16px; letter-spacing: 1px;">
          SAFE DRIVE
        </div>
        <h2 style="color: #0f172a; margin-top: 14px; margin-bottom: 6px;">Safety QR Activated!</h2>
      </div>

      <div style="background-color: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 20px;">
        <p style="color: #334155; line-height: 1.6; margin: 0 0 16px 0; font-size: 15px;">
          Hi ${userName || 'User'},<br><br>
          Your SafeDrive QR tag has been successfully activated and is now live.
        </p>
        <p style="color: #334155; line-height: 1.6; margin: 0 0 8px 0; font-size: 15px; font-weight: bold;">
          Activation Details:
        </p>
        <ul style="color: #334155; line-height: 1.6; margin: 0 0 16px 0; font-size: 15px; padding-left: 20px;">
          ${vehicleNumber ? `<li><strong>Vehicle Number:</strong> ${vehicleNumber}</li>` : ''}
          <li><strong>QR Token:</strong> ${publicToken}</li>
        </ul>
        <p style="color: #334155; line-height: 1.6; margin: 0; font-size: 15px;">
          You can test your QR code and manage your emergency contacts anytime from your dashboard.
        </p>
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n[QR ACTIVATION EMAIL] To: ${email} | Vehicle: ${vehicleNumber}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"SafeDrive Alerts" <noreply@safedrive.in>',
      to: email,
      subject: `SafeDrive QR Activated Successfully!`,
      html: htmlContent
    });
  } catch (error) {
    console.error('Failed to send QR activation email:', error);
  }
};

/**
 * Send Partner Order Confirmation Email
 */
export const sendPartnerOrderEmail = async (email, partnerName, orderDetails) => {
  const transporter = createTransporter();
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; background-color: #1D56A5; color: #ffffff; padding: 8px 18px; border-radius: 10px; font-weight: 900; font-size: 16px; letter-spacing: 1px;">
          SAFE DRIVE PARTNER
        </div>
        <h2 style="color: #0f172a; margin-top: 14px; margin-bottom: 6px;">Order Confirmed!</h2>
      </div>

      <div style="background-color: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 20px;">
        <p style="color: #334155; line-height: 1.6; margin: 0 0 16px 0; font-size: 15px;">
          Hi ${partnerName},<br><br>
          Your bulk order has been successfully placed.
        </p>
        <p style="color: #334155; line-height: 1.6; margin: 0 0 8px 0; font-size: 15px; font-weight: bold;">
          Order Details (ID: ${orderDetails.orderNumber}):
        </p>
        <ul style="color: #334155; line-height: 1.6; margin: 0 0 16px 0; font-size: 15px; padding-left: 20px;">
          <li><strong>Product Name:</strong> ${orderDetails.productName}</li>
          <li><strong>Total Packages:</strong> ${orderDetails.quantity}</li>
          <li><strong>Amount Paid:</strong> ₹${orderDetails.totalAmount}</li>
          <li><strong>Payment Mode:</strong> ${orderDetails.paymentMethod === 'COD' ? 'Cash on Delivery (COD)' : 'Prepaid (ONLINE)'}</li>
        </ul>
        <p style="color: #334155; line-height: 1.6; margin: 0; font-size: 15px;">
          You can track your order status from the Partner Dashboard.
        </p>
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n[PARTNER ORDER EMAIL] To: ${email} | Order: ${orderDetails.orderId}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"SafeDrive Partner Orders" <noreply@safedrive.in>',
      to: email,
      subject: `SafeDrive Partner Order Confirmed - ${orderDetails.orderNumber}`,
      html: htmlContent
    });
  } catch (error) {
    console.error('Failed to send partner order email:', error);
  }
};

/**
 * Send Order Dispatch Email (User & Partner)
 */
export const sendOrderDispatchEmail = async (email, userName, orderId, trackingInfo) => {
  const transporter = createTransporter();
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="display: inline-block; background-color: #1D56A5; color: #ffffff; padding: 8px 18px; border-radius: 10px; font-weight: 900; font-size: 16px; letter-spacing: 1px;">
          SAFE DRIVE
        </div>
        <h2 style="color: #0f172a; margin-top: 14px; margin-bottom: 6px;">Your Order is Dispatched! 🚚</h2>
      </div>

      <div style="background-color: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 20px;">
        <p style="color: #334155; line-height: 1.6; margin: 0 0 16px 0; font-size: 15px;">
          Hi ${userName},<br><br>
          Good news! Your order <strong>#${orderId}</strong> has been dispatched.
        </p>
        ${trackingInfo ? `
        <p style="color: #334155; line-height: 1.6; margin: 0 0 8px 0; font-size: 15px; font-weight: bold;">
          Tracking Information:
        </p>
        <p style="color: #334155; line-height: 1.6; margin: 0 0 16px 0; font-size: 15px; background: #f1f5f9; padding: 10px; border-radius: 8px;">
          ${trackingInfo}
        </p>
        ` : ''}
        <p style="color: #334155; line-height: 1.6; margin: 0; font-size: 15px;">
          Thank you for choosing SafeDrive!
        </p>
      </div>
    </div>
  `;

  if (!transporter) {
    console.log(`\n[ORDER DISPATCH EMAIL] To: ${email} | Order: ${orderId}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"SafeDrive Orders" <noreply@safedrive.in>',
      to: email,
      subject: `Your SafeDrive Order #${orderId} is Dispatched!`,
      html: htmlContent
    });
  } catch (error) {
    console.error('Failed to send order dispatch email:', error);
  }
};
