import axios from 'axios';

/**
 * Exotel Call Bridging & Number Masking Service
 * Securely bridges a call between Citizen (From) and Owner (To)
 */
export const initiateExotelMaskedCall = async ({
  citizenPhone,
  ownerPhone,
  customField = '',
  timeLimit = 300, // 5 minutes max call duration
  timeOut = 30
}) => {
  const apiKey = process.env.EXOTEL_API_KEY || '1a1b04fb9bd879b774af6f1dc40081666b3c58ef2840a343';
  const apiToken = process.env.EXOTEL_API_TOKEN || 'e465e1f80a25bf5866529a363c95375c907307bf732e4b14';
  const accountSid = process.env.EXOTEL_ACCOUNT_SID || 'safedrive1';
  const callerId = process.env.EXOTEL_CALLER_ID || process.env.EXOPHONE || '08040265530';

  if (!apiKey || !apiToken || !accountSid) {
    return {
      success: false,
      configured: false,
      message: 'Exotel API Key, Token, or Account SID not configured.'
    };
  }

  // Clean 10-digit numbers
  const cleanFrom = (citizenPhone || '').replace(/\D/g, '').slice(-10);
  const cleanTo = (ownerPhone || '').replace(/\D/g, '').slice(-10);

  if (!cleanFrom || cleanFrom.length < 10) {
    return {
      success: false,
      configured: true,
      message: 'Invalid citizen caller phone number.'
    };
  }

  if (!cleanTo || cleanTo.length < 10) {
    return {
      success: false,
      configured: true,
      message: 'Invalid owner target phone number.'
    };
  }

  // Exotel India format: '0' + 10-digit number (e.g. 09876543210)
  const formattedFrom = `0${cleanFrom}`;
  const formattedTo = `0${cleanTo}`;
  const formattedCallerId = callerId ? (callerId.startsWith('0') || callerId.startsWith('+') ? callerId : `0${callerId}`) : formattedFrom;

  const url = `https://api.exotel.com/v1/Accounts/${accountSid}/Calls/connect.json`;

  try {
    const params = new URLSearchParams();
    params.append('From', formattedFrom);
    params.append('To', formattedTo);
    params.append('CallerId', formattedCallerId);
    params.append('CallType', 'trans');
    params.append('TimeLimit', String(timeLimit));
    params.append('TimeOut', String(timeOut));
    if (customField) {
      params.append('CustomField', String(customField));
    }

    const basicAuth = `Basic ${Buffer.from(`${apiKey}:${apiToken}`).toString('base64')}`;

    const response = await axios.post(url, params.toString(), {
      headers: {
        'Authorization': basicAuth,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 10000
    });

    const callData = response.data?.Call || {};
    return {
      success: true,
      configured: true,
      callSid: callData.Sid,
      status: callData.Status,
      startTime: callData.StartTime,
      raw: callData,
      message: 'Masked call initiated successfully. You will receive an incoming call on your phone shortly to connect!'
    };
  } catch (error) {
    console.error('Exotel Call Connect Error:', error.response?.data || error.message);
    const exotelErrMsg = error.response?.data?.RestException?.Message || error.message;
    return {
      success: false,
      configured: true,
      error: exotelErrMsg,
      message: `Exotel Call Service: ${exotelErrMsg}`
    };
  }
};

/**
 * Exotel SMS Sending Service (Optional Transactional SMS)
 */
export const sendExotelSMS = async ({ toPhone, message }) => {
  const apiKey = process.env.EXOTEL_API_KEY || '1a1b04fb9bd879b774af6f1dc40081666b3c58ef2840a343';
  const apiToken = process.env.EXOTEL_API_TOKEN || 'e465e1f80a25bf5866529a363c95375c907307bf732e4b14';
  const accountSid = process.env.EXOTEL_ACCOUNT_SID || 'safedrive1';
  const callerId = process.env.EXOTEL_CALLER_ID || process.env.EXOPHONE || '08040265530';

  if (!apiKey || !apiToken || !accountSid) {
    return { success: false, message: 'Exotel not configured' };
  }

  const cleanTo = (toPhone || '').replace(/\D/g, '').slice(-10);
  const formattedTo = `0${cleanTo}`;
  const formattedFrom = callerId ? (callerId.startsWith('0') || callerId.startsWith('+') ? callerId : `0${callerId}`) : '';

  const url = `https://api.exotel.com/v1/Accounts/${accountSid}/Sms/send.json`;

  try {
    const params = new URLSearchParams();
    params.append('From', formattedFrom);
    params.append('To', formattedTo);
    params.append('Body', message);

    const basicAuth = `Basic ${Buffer.from(`${apiKey}:${apiToken}`).toString('base64')}`;

    const response = await axios.post(url, params.toString(), {
      headers: {
        'Authorization': basicAuth,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 10000
    });

    return {
      success: true,
      smsData: response.data?.SMSMessage
    };
  } catch (error) {
    console.error('Exotel SMS Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.RestException?.Message || error.message
    };
  }
};
