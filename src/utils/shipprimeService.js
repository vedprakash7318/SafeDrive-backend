import axios from 'axios';

const SHIPPRIME_BASE_URL = 'https://api.shipprime.live';

/**
 * Creates a forward shipment AWB on ShipPrime.
 * @param {Object} order - The SafeDrive order document
 * @returns {Promise<Object>} - Contains awb, courier, labelUrl, status
 */
export const createForwardShipment = async (order) => {
  const isPartner = !!order.partnerName;
  const name = isPartner ? order.partnerName : order.customerName;
  const phone = isPartner ? order.partnerPhone : order.customerPhone;
  const email = isPartner ? (order.partnerEmail || 'noreply@safedrive.in') : (order.customerEmail || 'noreply@safedrive.in');

  // ShipPrime test mode block removed as requested by the user

  const token = process.env.SHIPPRIME_API_KEY;
  if (!token) {
    throw new Error('SHIPPRIME_API_KEY is not defined in environment variables.');
  }

  const actualAmount = order.grandTotal || order.amount || 0;

  // Construct payload from order details
  const payload = {
    clientReferenceId: order.orderNumber || order._id.toString(),
    customerName: name,
    customerPhone: phone,
    customerEmail: email,
    deliveryAddress: {
      name: name,
      address1: order.deliveryAddress,
      city: order.city || 'Delhi',
      state: order.state || 'Delhi',
      country: 'India',
      pincode: order.pincode || '110001',
      phone: phone
    },
    pickupAddress: {
      name: 'SafeDrive HQ',
      address1: 'SafeDrive Headquarters',
      city: 'Delhi',
      state: 'Delhi',
      country: 'India',
      pincode: '110001',
      phone: '9876543210'
    },
    paymentMethod: order.paymentMethod === 'COD' ? 'COD' : 'PREPAID',
    amount: actualAmount,
    collectibleAmount: order.paymentMethod === 'COD' ? actualAmount : 0,
    declaredValue: actualAmount > 0 ? actualAmount : 299,
    weightGrams: 200,
    packageDetails: {
      length: 15,
      width: 10,
      height: 2
    },
    items: [
      {
        name: order.productName || 'SafeDrive Physical Kit',
        sku: 'SD-PHY-KIT',
        quantity: order.quantity || 1,
        price: order.unitPrice || actualAmount
      }
    ]
  };

  try {
    const response = await axios.post(`${SHIPPRIME_BASE_URL}/v1/forward`, payload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // In a real scenario, ShipPrime might return 200 but have { status: 'SUCCESS' }
    if (response.data && response.data.status === 'SUCCESS') {
      return {
        success: true,
        awb: response.data.awb,
        courier: response.data.courier,
        labelUrl: response.data.labelUrl
      };
    } else {
      throw new Error(response.data?.message || 'Failed to generate AWB from ShipPrime.');
    }
  } catch (error) {
    console.error('ShipPrime API Error:', error.response?.data || error.message);
    throw new Error(`ShipPrime API Error: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Cancels a forward shipment on ShipPrime.
 */
export const cancelForwardShipment = async (awb) => {
  // ShipPrime test mode block removed
  const token = process.env.SHIPPRIME_API_KEY;
  if (!token) throw new Error('SHIPPRIME_API_KEY is not defined.');

  try {
    const response = await axios.post(`${SHIPPRIME_BASE_URL}/v1/forward/${awb}/cancel`, {}, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.data && response.data.status === 'SUCCESS') {
      return { success: true, message: response.data.message };
    }
    throw new Error(response.data?.message || 'Failed to cancel AWB on ShipPrime.');
  } catch (error) {
    throw new Error(`ShipPrime API Error: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Creates a return (reverse pickup) shipment on ShipPrime.
 */
export const createReturnShipment = async (order) => {
  const isPartner = !!order.partnerName;
  const name = isPartner ? order.partnerName : order.customerName;
  const phone = isPartner ? order.partnerPhone : order.customerPhone;

  // ShipPrime test mode block removed
  
  const token = process.env.SHIPPRIME_API_KEY;
  if (!token) throw new Error('SHIPPRIME_API_KEY is not defined.');

  const payload = {
    clientReferenceId: `RTN-${order.orderNumber || order._id.toString()}-${Date.now()}`,
    orderId: order.orderNumber || order._id.toString(),
    items: [{
      name: order.productName || 'SafeDrive Physical Kit',
      sku: 'SD-PHY-KIT',
      quantity: order.quantity || 1,
      price: order.unitPrice || order.amount
    }],
    pickupAddress: {
      name: name,
      address1: order.deliveryAddress,
      city: order.city || 'Delhi',
      state: order.state || 'Delhi',
      country: 'India',
      pincode: order.pincode || '110001',
      phone: phone.length === 10 ? phone : '9999999999'
    },
    deliveryAddress: {
      name: 'SafeDrive HQ Return',
      address1: 'SafeDrive Headquarters',
      city: 'Delhi',
      state: 'Delhi',
      country: 'India',
      pincode: '110001',
      phone: '9876543210'
    }
  };

  try {
    const response = await axios.post(`${SHIPPRIME_BASE_URL}/v1/returns`, payload, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    if (response.data && response.data.status === 'SUCCESS') {
      return { success: true, awb: response.data.awb, courier: response.data.courier };
    }
    throw new Error(response.data?.message || 'Failed to create Return AWB.');
  } catch (error) {
    throw new Error(`ShipPrime API Error: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Cancels a return shipment on ShipPrime.
 */
export const cancelReturnShipment = async (awb) => {
  // ShipPrime test mode block removed
  const token = process.env.SHIPPRIME_API_KEY;
  if (!token) throw new Error('SHIPPRIME_API_KEY is not defined.');

  try {
    const response = await axios.post(`${SHIPPRIME_BASE_URL}/v1/returns/${awb}/cancel`, {}, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.data && response.data.status === 'SUCCESS') {
      return { success: true, message: response.data.message };
    }
    throw new Error(response.data?.message || 'Failed to cancel Return AWB.');
  } catch (error) {
    throw new Error(`ShipPrime API Error: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Tracks forward shipments on ShipPrime.
 */
export const trackShipments = async (awbList) => {
  if (!awbList || awbList.length === 0) return { success: true, results: [] };
  
  const realAwbs = awbList;

  const token = process.env.SHIPPRIME_API_KEY;
  if (!token) throw new Error('SHIPPRIME_API_KEY is not defined.');

  try {
    const response = await axios.get(`${SHIPPRIME_BASE_URL}/v1/forward/track`, {
      params: { awbs: realAwbs.join(',') },
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.data && response.data.status === 'SUCCESS') {
      return { success: true, results: response.data.results };
    }
    return { success: false, results: [] };
  } catch (error) {
    console.error('ShipPrime Tracking Error:', error.response?.data || error.message);
    return { success: false, results: [] };
  }
};
