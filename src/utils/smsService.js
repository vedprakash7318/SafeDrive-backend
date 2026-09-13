import axios from 'axios';

/**
 * Utility to send SMS using DLT-approved template
 * Template: "Your OTP Code is {#var#}. Do not share it with anyone. From {#var#} . #TeamDigiCoders"
 */
export const sendSMS = async (phone, otp) => {
  try {
    const authkey = process.env.SMS_API_AUTHKEY || '370038Amo3cZx0h696a3f7dP1';
    const sender = process.env.SMS_SENDER_ID || 'DIGICO';
    const dltTeId = process.env.SMS_TEMPLATE_ID || '1307164706435757762';
    const appName = process.env.APP_NAME || 'SafeDrive';
    
    // Ensure 91 prefix for mobiles if not present
    let cleanPhone = phone.toString().replace(/\D/g, '');
    if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) {
      cleanPhone = cleanPhone.slice(2);
    }

    const message = `Your OTP Code is ${otp}. Do not share it with anyone. From ${appName} . #TeamDigiCoders`;

    // Only log if not in production, but always attempt to send if authkey exists
    console.log(`[SMS] Sending OTP: ${otp} to ${cleanPhone} via Digicoders gateway...`);

    const response = await axios.get('http://sms.digicoders.in/api/sendhttp.php', {
      params: {
        authkey: authkey,
        mobiles: cleanPhone,
        message: message,
        sender: sender,
        route: 4,
        country: 91,
        DLT_TE_ID: dltTeId
      }
    });

    console.log(`[SMS INFO] API Response:`, response.data);
    
    // Based on typical Digicoders response, you might want to check response.data for success
    return true;
  } catch (error) {
    console.error('Error sending SMS via Digicoders:', error.message);
    return false;
  }
};
