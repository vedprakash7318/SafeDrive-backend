import QRCode from '../models/QRCode.js';
import User from '../models/User.js';
import Vehicle from '../models/Vehicle.js';
import Subscription from '../models/Subscription.js';
import QuotaWallet from '../models/QuotaWallet.js';
import QuotaTransaction from '../models/QuotaTransaction.js';
import EmergencyAlert from '../models/EmergencyAlert.js';
import ScanLog from '../models/ScanLog.js';
import SystemSetting from '../models/SystemSetting.js';
import ScanReason from '../models/ScanReason.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Newsletter from '../models/Newsletter.js';
import ContactInquiry from '../models/ContactInquiry.js';
import AuditLog from '../models/AuditLog.js';
import Notification from '../models/Notification.js';
import { sendFCMNotificationToUser } from '../utils/fcmSender.js';
import { initiateExotelMaskedCall } from '../utils/exotel.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const getPublicScanReasons = async (req, res) => {
  try {
    let { category, isVehicle, token } = req.query;

    if (token && isVehicle === undefined && !category) {
      const qr = await QRCode.findOne({ publicToken: token }).select('isVehicle category');
      if (qr) {
        isVehicle = qr.isVehicle !== false ? 'true' : 'false';
        category = qr.isVehicle !== false ? 'VEHICLE' : 'NON_VEHICLE';
      }
    }

    const isNonVehicle = category === 'NON_VEHICLE' || isVehicle === 'false';
    const isVehicleCategory = category === 'VEHICLE' || isVehicle === 'true';

    let filter = { isActive: true, isDeleted: { $ne: true } };

    if (isNonVehicle) {
      filter.$or = [
        { applicableTo: { $in: ['ALL', 'NON_VEHICLE'] } },
        { category: { $in: ['ALL', 'NON_VEHICLE'] } }
      ];
    } else if (isVehicleCategory) {
      filter.$or = [
        { applicableTo: { $in: ['ALL', 'VEHICLE'] } },
        { category: { $in: ['ALL', 'VEHICLE'] } },
        { applicableTo: { $exists: false } },
        { category: { $exists: false } }
      ];
    }

    let reasons = await ScanReason.find(filter).sort({ order: 1, createdAt: 1 });

    // Fallback default reasons if non-vehicle specific reasons are not yet created in DB
    if (isNonVehicle && (!reasons || reasons.length === 0 || !reasons.some(r => r.applicableTo === 'NON_VEHICLE'))) {
      const defaultNonVeh = [
        { _id: 'nv_1', title: 'Found / Missing Item Alert', icon: '🔍', iconKey: 'missing', color: 'indigo', isOtherType: false },
        { _id: 'nv_2', title: 'Other Reason / Custom Note', icon: '💬', iconKey: 'other', color: 'rose', isOtherType: true }
      ];
      // If we have some universal reasons, combine them
      const universal = (reasons || []).filter(r => r.applicableTo === 'ALL');
      reasons = universal.length > 0 ? [...universal, ...defaultNonVeh.filter(d => !universal.some(u => u.title.toLowerCase() === d.title.toLowerCase()))] : defaultNonVeh;
    }

    res.json({ success: true, reasons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getQRInfoByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const qr = await QRCode.findOne({ publicToken: token })
      .populate('userId', 'name phone status email')
      .populate('vehicleId');

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop';

    if (!qr) {
      return res.json({
        success: false,
        status: 'INVALID',
        message: 'Invalid or unknown QR code scanned'
      });
    }

    // Log Scan Event (with 10-second deduplication for same QR + IP to avoid React StrictMode/double mount duplicate entries)
    const eventType = qr.status === 'ACTIVE' ? 'SCAN_VIEW' : (['GENERATED', 'IN STOCK', 'SOLD'].includes(qr.status) ? 'REGISTRATION_VIEW' : 'SCAN_VIEW');
    const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
    
    ScanLog.findOne({
      qrId: qr._id,
      ipAddress,
      eventType,
      createdAt: { $gte: tenSecondsAgo }
    }).then((recentLog) => {
      if (!recentLog) {
        ScanLog.create({
          qrId: qr._id,
          copyCode: qr.copyCode,
          productId: qr.productId,
          publicToken: token,
          userId: qr.userId?._id,
          vehicleId: qr.vehicleId?._id,
          vehicleNumber: qr.vehicleId?.vehicleNumber,
          eventType,
          ipAddress,
          userAgent,
          device
        }).catch(() => {});
      }
    }).catch(() => {});

    if (qr.status === 'SUSPENDED') {
      return res.json({
        success: false,
        status: 'SUSPENDED',
        message: 'This QR code is currently suspended by administration'
      });
    }

    // Unregistered / Physical QR -> Directly open Registration Form
    if (['GENERATED', 'IN STOCK', 'SOLD'].includes(qr.status)) {
      return res.json({
        success: true,
        status: 'UNREGISTERED',
        productId: qr.productId,
        copyCode: qr.copyCode,
        isVehicle: qr.isVehicle !== false,
        category: qr.category || (qr.isVehicle === false ? 'NON_VEHICLE' : 'VEHICLE'),
        qrFor: qr.qrFor || qr.qrType || 'Car',
        message: 'This QR is ready for registration'
      });
    }

    if (qr.status === 'ACTIVE') {
      // Check for automatic expiration
      if (qr.expiryDate && new Date(qr.expiryDate) < new Date()) {
        qr.status = 'EXPIRED';
        await qr.save();
        return res.json({
          success: false,
          status: 'EXPIRED',
          copyCode: qr.copyCode,
          expiryDate: qr.expiryDate,
          message: 'This QR code has expired'
        });
      }

      // Check user wallet quota
      const wallet = await QuotaWallet.findOne({ qrId: qr._id });
      const canCall = wallet ? wallet.callBalance > 0 : false;
      const canMessage = wallet ? wallet.messageBalance > 0 : false;

      // Extract plate / item info
      const isVehicleTag = qr.isVehicle !== false;
      const rawPlate = qr.vehicleId?.vehicleNumber || '';
      const cleanPlate = rawPlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const maskedPlate = isVehicleTag
        ? (cleanPlate.length >= 4 
            ? `${cleanPlate.slice(0, cleanPlate.length - 4)}${'*'.repeat(4)}`
            : '****')
        : '••••';

      return res.json({
        success: true,
        status: 'ACTIVE',
        copyCode: qr.copyCode,
        isVehicle: isVehicleTag,
        category: qr.category || (isVehicleTag ? 'VEHICLE' : 'NON_VEHICLE'),
        qrFor: qr.qrFor || (isVehicleTag ? 'Car' : 'Item'),
        requiresVerification: true,
        maskedPlate,
        vehicleBrand: qr.vehicleId?.vehicleBrand,
        vehicleName: qr.vehicleId?.vehicleName,
        itemName: qr.vehicleId?.itemName || qr.vehicleId?.vehicleName,
        itemType: qr.vehicleId?.itemType || qr.vehicleId?.vehicleBrand,
        canCall,
        canMessage,
        expiryDate: qr.expiryDate
      });
    }

    if (qr.status === 'EXPIRED') {
      return res.json({
        success: false,
        status: 'EXPIRED',
        copyCode: qr.copyCode,
        expiryDate: qr.expiryDate,
        message: 'This QR code has expired'
      });
    }

    res.json({ success: false, status: qr.status, message: `QR status: ${qr.status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const verifyPlateLast4Digits = async (req, res) => {
  try {
    const { token } = req.params;
    const { last4Digits, securityCode } = req.body;

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop';

    const inputDigits = String(last4Digits || securityCode || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    if (!inputDigits || inputDigits.length !== 4) {
      return res.status(400).json({ success: false, message: 'Please provide the 4-digit code / tag PIN' });
    }

    const qr = await QRCode.findOne({ publicToken: token })
      .populate('userId', 'name phone')
      .populate('vehicleId');

    if (!qr || qr.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'QR is not active' });
    }

    const isVehicleTag = qr.isVehicle !== false;
    let isMatch = false;

    if (!isVehicleTag) {
      // Non-Vehicle Tag: Match against 4-digit securityCode printed on the physical tag
      isMatch = Boolean(qr.securityCode && inputDigits === String(qr.securityCode).toUpperCase());
    } else {
      // Vehicle Tag: Match against last 4 characters of vehicle number plate
      const fullPlate = (qr.vehicleId?.vehicleNumber || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const actualLast4 = fullPlate.slice(-4);
      isMatch = (inputDigits === actualLast4);
    }

    if (!isMatch) {
      // Log Failed Verification Attempt
      ScanLog.create({
        qrId: qr._id,
        copyCode: qr.copyCode,
        productId: qr.productId,
        publicToken: token,
        userId: qr.userId?._id,
        vehicleId: qr.vehicleId?._id,
        vehicleNumber: qr.vehicleId?.vehicleNumber,
        eventType: 'PLATE_FAILED',
        notes: `Entered: ${inputDigits}`,
        ipAddress,
        userAgent,
        device
      }).catch(() => {});

      return res.status(400).json({
        success: false,
        message: !isVehicleTag
          ? 'Incorrect 4-digit Security Tag PIN. Please check the physical tag.'
          : 'Incorrect last 4 digits of number plate. Please check the physical vehicle plate.'
      });
    }

    // Log Successful Verification
    ScanLog.create({
      qrId: qr._id,
      copyCode: qr.copyCode,
      productId: qr.productId,
      publicToken: token,
      userId: qr.userId?._id,
      vehicleId: qr.vehicleId?._id,
      vehicleNumber: qr.vehicleId?.vehicleNumber,
      eventType: 'PLATE_VERIFIED',
      ipAddress,
      userAgent,
      device
    }).catch(() => {});

    const wallet = await QuotaWallet.findOne({ qrId: qr._id });
    const canCall = wallet ? wallet.callBalance > 0 : false;
    const canMessage = wallet ? wallet.messageBalance > 0 : false;

    res.json({
      success: true,
      verified: true,
      vehicle: {
        vehicleName: qr.vehicleId?.vehicleName,
        vehicleBrand: qr.vehicleId?.vehicleBrand,
        vehicleModel: qr.vehicleId?.vehicleModel,
        vehicleNumber: qr.vehicleId?.vehicleNumber,
        itemName: qr.vehicleId?.itemName || qr.vehicleId?.vehicleName,
        itemType: qr.vehicleId?.itemType || qr.vehicleId?.vehicleBrand,
        isVehicle: isVehicleTag
      },
      canCall,
      canMessage
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// Helper to find eligible physical order matching the purchase mobile number and product category
const findEligiblePhysicalOrder = async (cleanPhone, expectedQrFor) => {
  const normExpected = (expectedQrFor || 'Car').trim().toLowerCase();
  const phonePattern = cleanPhone.length >= 8 ? cleanPhone.slice(-8) : cleanPhone;

  // 1. Find all physical orders placed by this phone number (exact or suffix match)
  const allOrdersForPhone = await Order.find({
    productType: 'PHYSICAL',
    $or: [
      { customerPhone: cleanPhone },
      { customerPhone: { $regex: phonePattern } },
      { activationPhone: cleanPhone },
      { activationPhone: { $regex: phonePattern } },
      { activationPhones: cleanPhone },
      { activationPhones: { $regex: phonePattern } }
    ]
  }).sort({ createdAt: -1 });

  if (!allOrdersForPhone || allOrdersForPhone.length === 0) {
    return {
      order: null,
      status: 'NOT_FOUND',
      message: `❌ Eligible Order Not Found: Is mobile number par [${expectedQrFor}] QR Kit ka koi pending order nahi mila. Kripya apna registered purchase mobile number check karein ya website se order karein.`
    };
  }

  // 2. Filter for matching category (case-insensitive)
  const matchingCatOrders = allOrdersForPhone.filter(
    (o) => (o.qrFor || 'Car').trim().toLowerCase() === normExpected
  );

  if (matchingCatOrders.length === 0) {
    return {
      order: null,
      status: 'MISMATCH_CATEGORY',
      message: `❌ Category Mismatch: Is mobile number par [${expectedQrFor}] QR Kit ka koi pending order nahi mila. Kripya apna registered purchase mobile number check karein.`
    };
  }

  // 3. Find first order with unclaimed kit quantity
  for (const ord of matchingCatOrders) {
    const totalQty = Math.max(1, ord.quantity || 1);
    const claimed = ord.claimedCount || 0;
    if (claimed < totalQty) {
      return { order: ord, status: 'MATCH' };
    }
  }

  // 4. If all matching orders are fully claimed
  return {
    order: null,
    status: 'ALREADY_CLAIMED',
    message: `❌ Order Already Claimed: Is mobile number par [${expectedQrFor}] QR Kit ka order pehle hi activate kiya ja chuka hai.`
  };
};

export const registerQR = async (req, res) => {
  try {
    const { token } = req.params;
    const {
      name,
      phone,
      whatsappNumber,
      gender,
      address,
      city,
      state,
      pincode,
      landmark,
      password,
      vehicleName,
      vehicleBrand,
      vehicleNumber,
      emergencyContacts
    } = req.body;

    const qr = await QRCode.findOne({ publicToken: token });
    if (!qr) {
      return res.status(404).json({ success: false, message: 'Invalid QR Code' });
    }

    if (qr.status === 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'This QR is already registered and active.'
      });
    }

    const isNonVehicle = qr.isVehicle === false;

    // Field Validation based on Vehicle vs Non-Vehicle
    if (isNonVehicle) {
      const cleanItemName = (req.body.itemName || vehicleName || '').trim();
      if (!name || !phone || !cleanItemName) {
        return res.status(400).json({
          success: false,
          message: 'Full Name, Phone number, and Item / Tag Title are required'
        });
      }
      // If QR has a securityCode PIN, user must provide the exact 4-digit PIN
      if (qr.securityCode) {
        const inputPin = String(req.body.securityCode || '').trim();
        if (inputPin !== String(qr.securityCode).trim()) {
          return res.status(400).json({
            success: false,
            message: 'Invalid 4-digit Security Tag PIN. Please enter the 4-digit code printed on your physical tag / kit.'
          });
        }
      }
    } else {
      if (!name || !phone || !vehicleNumber || !vehicleName || !vehicleBrand) {
        return res.status(400).json({
          success: false,
          message: 'Name, Phone, Vehicle Name, Brand and Vehicle Number are required'
        });
      }
    }

    // Validate 2 emergency contacts
    if (!emergencyContacts || !Array.isArray(emergencyContacts) || emergencyContacts.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Exactly 2 emergency contacts are required for registration'
      });
    }

    const isDigitalQR = qr.qrType === 'DIGITAL' || qr.batchId === 'STORE-DIGITAL';
    const expectedQrFor = qr.qrFor || qr.qrType || 'Car';
    const cleanPhone = (phone || '').trim().replace(/\D/g, '').slice(-10);

    let matchingOrder = null;
    let orderOwnerUser = null;

    if (isDigitalQR) {
      // Find and update the specific Digital Order for this QR kit
      matchingOrder = await Order.findOne({
        $or: [
          { allocatedQRIds: qr._id },
          { claimedProductId: qr.productId }
        ],
        productType: 'DIGITAL'
      }).sort({ createdAt: 1 });

      if (matchingOrder) {
        orderOwnerUser = await User.findById(matchingOrder.userId);
      }
    } else {
      // Strictly verify that an unclaimed physical order exists for this activation mobile and category
      const findRes = await findEligiblePhysicalOrder(cleanPhone, expectedQrFor);
      if (findRes.status !== 'MATCH' || !findRes.order) {
        return res.status(400).json({
          success: false,
          message: findRes.message || `❌ QR Not Found: Is mobile number par koi eligible pending order nahi mila.`
        });
      }

      matchingOrder = findRes.order;
      orderOwnerUser = await User.findById(matchingOrder.userId);
    }

    // 1. Identify Buyer Account (the user who purchased the kit)
    const buyerUser = orderOwnerUser;

    // 2. Find or Create the QR End-User / Vehicle Owner Account (the recipient activating the QR)
    const cleanGender = (gender || 'MALE').toString().toUpperCase();
    let activationUser = await User.findOne({ phone: cleanPhone });
    if (!activationUser) {
      const defaultPassword = password || '123456';
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      activationUser = await User.create({
        name,
        phone: cleanPhone,
        whatsappNumber: whatsappNumber || cleanPhone,
        gender: cleanGender,
        address: address || 'N/A',
        city: city || '',
        state: state || '',
        pincode: pincode || '',
        landmark: landmark || '',
        password: hashedPassword,
        role: 'USER',
        userType: 'QR_USER',
        registeredVia: 'QR_SCAN_ACTIVATION'
      });
    } else {
      if (name) activationUser.name = name;
      activationUser.gender = cleanGender;
      if (whatsappNumber) activationUser.whatsappNumber = whatsappNumber;
      if (address && address !== 'N/A') activationUser.address = address;
      if (city) activationUser.city = city;
      if (state) activationUser.state = state;
      if (pincode) activationUser.pincode = pincode;
      if (landmark) activationUser.landmark = landmark;
      await activationUser.save();
    }

    // 3. Create / Update Vehicle or Item Record under the QR User's Account (activationUser._id)
    let vehicle;
    if (isNonVehicle) {
      const cleanItemName = (req.body.itemName || vehicleName || `${qr.qrFor || 'Luggage'} Tag`).trim();
      const cleanItemType = (req.body.itemType || req.body.itemCategory || vehicleBrand || qr.qrFor || 'Item').trim();
      const itemIdentifier = `${qr.productId}${qr.securityCode ? `-${qr.securityCode}` : ''}`;

      vehicle = await Vehicle.findOne({ vehicleNumber: itemIdentifier });
      if (!vehicle) {
        vehicle = await Vehicle.create({
          userId: activationUser._id,
          isVehicle: false,
          itemName: cleanItemName,
          itemType: cleanItemType,
          vehicleName: cleanItemName,
          vehicleBrand: cleanItemType,
          vehicleModel: cleanItemType,
          vehicleNumber: itemIdentifier,
          emergencyContacts: [
            { name: emergencyContacts[0].name, number: emergencyContacts[0].number },
            { name: emergencyContacts[1].name, number: emergencyContacts[1].number }
          ]
        });
      } else {
        vehicle.isVehicle = false;
        vehicle.itemName = cleanItemName;
        vehicle.itemType = cleanItemType;
        vehicle.vehicleName = cleanItemName;
        vehicle.vehicleBrand = cleanItemType;
        vehicle.vehicleModel = cleanItemType;
        vehicle.emergencyContacts = [
          { name: emergencyContacts[0].name, number: emergencyContacts[0].number },
          { name: emergencyContacts[1].name, number: emergencyContacts[1].number }
        ];
        vehicle.userId = activationUser._id;
        await vehicle.save();
      }
    } else {
      const cleanVehicleName = (vehicleName || req.body.vehicleModel || 'Standard Vehicle').trim();
      const cleanVehicleBrand = (vehicleBrand || 'Vehicle').trim();
      vehicle = await Vehicle.findOne({ vehicleNumber: vehicleNumber.toUpperCase().trim() });
      if (!vehicle) {
        vehicle = await Vehicle.create({
          userId: activationUser._id,
          isVehicle: true,
          vehicleName: cleanVehicleName,
          vehicleBrand: cleanVehicleBrand,
          vehicleModel: cleanVehicleName,
          vehicleNumber: vehicleNumber.toUpperCase().trim(),
          emergencyContacts: [
            { name: emergencyContacts[0].name, number: emergencyContacts[0].number },
            { name: emergencyContacts[1].name, number: emergencyContacts[1].number }
          ]
        });
      } else {
        vehicle.isVehicle = true;
        vehicle.vehicleName = cleanVehicleName;
        vehicle.vehicleBrand = cleanVehicleBrand;
        vehicle.vehicleModel = cleanVehicleName;
        vehicle.emergencyContacts = [
          { name: emergencyContacts[0].name, number: emergencyContacts[0].number },
          { name: emergencyContacts[1].name, number: emergencyContacts[1].number }
        ];
        vehicle.userId = activationUser._id;
      }
    }

    // Determine quota & validity from this specific QR code batch configuration
    const initialCalls = qr.initialCalls || 10;
    const initialMessages = qr.initialMessages || 20;
    const validityDays = qr.validityDays || 365;
    const renewalAmount = qr.renewalAmount || 199;

    const now = new Date();
    const expiry = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

    // 4. Find ALL sibling copies sharing this productId (e.g. SD005C1, SD005C2...)
    const siblingQRs = await QRCode.find({ productId: qr.productId });

    // 5. Activate ALL sibling copies with activationUser as active owner & buyerUser as purchaser
    await QRCode.updateMany(
      { productId: qr.productId },
      {
        userId: activationUser._id,
        buyerId: buyerUser ? buyerUser._id : activationUser._id,
        orderId: matchingOrder ? matchingOrder._id : null,
        vehicleId: vehicle._id,
        status: 'ACTIVE',
        activatedByName: name,
        activatedByPhone: cleanPhone,
        activationPhone: cleanPhone,
        activationDate: now,
        expiryDate: expiry
      }
    );

    // 6. Create Subscription and Initial Quota Wallet for each sibling copy under QR User Account
    for (const item of siblingQRs) {
      await Subscription.create({
        userId: activationUser._id,
        qrId: item._id,
        startDate: now,
        expiryDate: expiry,
        status: 'ACTIVE',
        renewalAmount: renewalAmount
      });

      await QuotaWallet.findOneAndUpdate(
        { qrId: item._id },
        {
          userId: activationUser._id,
          qrId: item._id,
          callBalance: initialCalls,
          messageBalance: initialMessages,
          totalCallsPurchased: initialCalls,
          totalMessagesPurchased: initialMessages
        },
        { upsert: true, new: true }
      );
    }

    // 7. Create Ledger Transactions for QR User Account
    await QuotaTransaction.create({
      userId: activationUser._id,
      qrId: qr._id,
      productId: qr.productId,
      type: 'CREDIT',
      category: 'CALL',
      quantity: initialCalls,
      balanceAfter: initialCalls,
      source: 'INITIAL_FREE',
      amountPaid: 0,
      performedBy: 'System (Kit Activation)',
      reason: 'Initial Starter Calling Quota (Included with Kit)'
    });

    await QuotaTransaction.create({
      userId: activationUser._id,
      qrId: qr._id,
      productId: qr.productId,
      type: 'CREDIT',
      category: 'MESSAGE',
      quantity: initialMessages,
      balanceAfter: initialMessages,
      source: 'INITIAL_FREE',
      amountPaid: 0,
      performedBy: 'System (Kit Activation)',
      reason: 'Initial Starter SMS Quota (Included with Kit)'
    });

    // 5. Claim unit slot in matching order
    if (matchingOrder) {
      matchingOrder.claimedActivationPhones = matchingOrder.claimedActivationPhones || [];
      matchingOrder.claimedActivationPhones.push(cleanPhone);
      matchingOrder.claimedCount = (matchingOrder.claimedCount || 0) + 1;
      
      if (matchingOrder.claimedCount >= (matchingOrder.quantity || 1)) {
        matchingOrder.isClaimed = true;
        matchingOrder.claimedAt = now;
      }
      matchingOrder.claimedProductId = qr.productId;
      matchingOrder.allocatedQRIds = [...(matchingOrder.allocatedQRIds || []), ...siblingQRs.map(q => q._id)];
      await matchingOrder.save();
    }

    // Record Audit Log for registration
    AuditLog.create({
      action: 'PUBLIC_QR_REGISTRATION',
      targetId: qr.productId,
      newValue: {
        buyerId: buyerUser ? buyerUser._id : null,
        buyerName: buyerUser ? buyerUser.name : null,
        activatedUserId: activationUser._id,
        activatedByName: name,
        activatedByPhone: cleanPhone,
        vehiclePlate: vehicle.vehicleNumber,
        vehicleName: vehicle.vehicleName,
        totalCopies: siblingQRs.length
      },
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
    }).catch(() => {});

    // Generate token for auto-login as the activated QR user
    const jwtToken = jwt.sign({ id: activationUser._id }, process.env.JWT_SECRET || 'supersecretjwtkey_replace_in_prod', {
      expiresIn: '30d'
    });

    res.status(201).json({
      success: true,
      message: `🎉 All ${siblingQRs.length} QR stickers (${qr.productId}) activated successfully!`,
      token: jwtToken,
      user: {
        id: activationUser._id,
        name: activationUser.name,
        phone: activationUser.phone,
        role: activationUser.role,
        userType: activationUser.userType
      },
      vehicle: {
        id: vehicle._id,
        vehicleName: vehicle.vehicleName,
        vehicleBrand: vehicle.vehicleBrand,
        vehicleNumber: vehicle.vehicleNumber
      },
      qr: {
        id: qr._id,
        productId: qr.productId,
        copyCode: qr.copyCode,
        totalCopiesActivated: siblingQRs.length,
        status: 'ACTIVE',
        activatedByName: name,
        activatedByPhone: cleanPhone,
        expiryDate: expiry
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const initiateCall = async (req, res) => {
  try {
    const { token } = req.params;
    const { callerPhone, scannerPhone, reason } = req.body;
    const cleanScanner = (callerPhone || scannerPhone || '').trim().replace(/\D/g, '').slice(-10);

    const qr = await QRCode.findOne({ publicToken: token }).populate('userId').populate('vehicleId');

    if (!qr || qr.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'QR is not active' });
    }

    // Atomic server-side quota deduction
    const wallet = await QuotaWallet.findOneAndUpdate(
      { qrId: qr._id, callBalance: { $gt: 0 } },
      { $inc: { callBalance: -1, totalCallsUsed: 1 } },
      { new: true }
    );

    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: 'Owner has exhausted available Call Quota. Please try messaging or Emergency Alert.'
      });
    }

    // Synchronize deducted balance across all sibling QR copies sharing same productId
    const siblingQRs = await QRCode.find({ productId: qr.productId });
    const siblingIds = siblingQRs.map(s => s._id);
    await QuotaWallet.updateMany(
      { qrId: { $in: siblingIds } },
      { callBalance: wallet.callBalance, totalCallsUsed: wallet.totalCallsUsed }
    );

    // Log Quota Ledger
    await QuotaTransaction.create({
      userId: qr.userId?._id,
      qrId: qr._id,
      type: 'DEBIT',
      category: 'CALL',
      quantity: 1,
      balanceAfter: wallet.callBalance,
      reason: 'Public Scan Voice Call initiated'
    });

    // Log Scan Event
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop';
    ScanLog.create({
      qrId: qr._id,
      copyCode: qr.copyCode,
      productId: qr.productId,
      publicToken: token,
      userId: qr.userId?._id,
      vehicleId: qr.vehicleId?._id,
      vehicleNumber: qr.vehicleId?.vehicleNumber,
      eventType: 'CALL_INITIATED',
      callerPhone: cleanScanner,
      scannerPhone: cleanScanner,
      reason: reason || 'Voice Call Inquiry',
      notes: `Call from ${cleanScanner ? '+91 ' + cleanScanner : 'Scanner'}: ${reason || 'Vehicle Inquiry'}`,
      ipAddress,
      userAgent,
      device
    }).catch(() => {});

    // Create In-App & Push Notification
    const cleanCallMsg = reason || 'Incoming Call Request';
    if (qr.userId?._id) {
      Notification.create({
        userId: qr.userId._id,
        title: `📞 Call Alert: ${qr.vehicleId?.vehicleNumber || 'Vehicle'}`,
        message: cleanCallMsg,
        type: 'CALL_ALERT',
        qrId: qr._id,
        vehicleNumber: qr.vehicleId?.vehicleNumber,
        scannerPhone: cleanScanner,
        metadata: { reason: cleanCallMsg, token }
      }).catch(() => {});

      sendFCMNotificationToUser(qr.userId._id, {
        title: `📞 Call Alert: ${qr.vehicleId?.vehicleNumber || 'Vehicle'}`,
        body: cleanCallMsg,
        data: { reason: cleanCallMsg, token, type: 'CALL_ALERT' }
      }).catch(() => {});
    }

    const targetOwnerPhone = qr.userId?.phone || qr.activationPhone || '';

    // Initiate Exotel Masked Call Bridge
    let exotelResponse = null;
    if (cleanScanner && targetOwnerPhone) {
      exotelResponse = await initiateExotelMaskedCall({
        citizenPhone: cleanScanner,
        ownerPhone: targetOwnerPhone,
        customField: `token:${token},vehicle:${qr.vehicleId?.vehicleNumber || qr.productId}`
      });
    }

    res.json({
      success: true,
      masked: exotelResponse ? exotelResponse.success : false,
      callSid: exotelResponse?.callSid,
      provider: exotelResponse?.configured ? 'EXOTEL' : 'DIRECT',
      message: exotelResponse?.success
        ? '📞 Masked Call Initiated! Exotel is connecting your phone. Please answer the incoming call to speak with the owner securely.'
        : exotelResponse?.message || 'Call initiated successfully.',
      targetPhone: targetOwnerPhone,
      remainingCalls: wallet.callBalance
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const initiateMessage = async (req, res) => {
  try {
    const { token } = req.params;
    const { messageText, callerPhone, scannerPhone, reason } = req.body;
    const cleanScanner = (callerPhone || scannerPhone || '').trim().replace(/\D/g, '').slice(-10);

    const qr = await QRCode.findOne({ publicToken: token }).populate('userId').populate('vehicleId');

    if (!qr || qr.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'QR is not active' });
    }

    // Atomic server-side quota deduction
    const wallet = await QuotaWallet.findOneAndUpdate(
      { qrId: qr._id, messageBalance: { $gt: 0 } },
      { $inc: { messageBalance: -1, totalMessagesUsed: 1 } },
      { new: true }
    );

    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: 'Owner has exhausted available Message Quota.'
      });
    }

    // Synchronize deducted message balance across all sibling QR copies
    const siblingQRs = await QRCode.find({ productId: qr.productId });
    const siblingIds = siblingQRs.map(s => s._id);
    await QuotaWallet.updateMany(
      { qrId: { $in: siblingIds } },
      { messageBalance: wallet.messageBalance, totalMessagesUsed: wallet.totalMessagesUsed }
    );

    // Log Quota Ledger
    await QuotaTransaction.create({
      userId: qr.userId?._id,
      qrId: qr._id,
      type: 'DEBIT',
      category: 'MESSAGE',
      quantity: 1,
      balanceAfter: wallet.messageBalance,
      reason: 'Public Scan SMS/WhatsApp Notification sent'
    });

    // Log Scan Event
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop';
    const cleanMsgText = (messageText || reason || 'WhatsApp Alert').trim();

    ScanLog.create({
      qrId: qr._id,
      copyCode: qr.copyCode,
      productId: qr.productId,
      publicToken: token,
      userId: qr.userId?._id,
      vehicleId: qr.vehicleId?._id,
      vehicleNumber: qr.vehicleId?.vehicleNumber,
      eventType: 'WHATSAPP_INITIATED',
      callerPhone: cleanScanner,
      scannerPhone: cleanScanner,
      reason: cleanMsgText,
      message: cleanMsgText,
      notes: cleanMsgText,
      ipAddress,
      userAgent,
      device
    }).catch(() => {});

    // Create In-App & Push Notification
    if (qr.userId?._id) {
      Notification.create({
        userId: qr.userId._id,
        title: `💬 Message Alert: ${qr.vehicleId?.vehicleNumber || 'Vehicle'}`,
        message: cleanMsgText,
        type: 'MESSAGE_ALERT',
        qrId: qr._id,
        vehicleNumber: qr.vehicleId?.vehicleNumber,
        scannerPhone: cleanScanner,
        metadata: { reason: cleanMsgText, messageText: cleanMsgText, token }
      }).catch(() => {});

      sendFCMNotificationToUser(qr.userId._id, {
        title: `💬 Message Alert: ${qr.vehicleId?.vehicleNumber || 'Vehicle'}`,
        body: cleanMsgText,
        data: { reason: cleanMsgText, messageText: cleanMsgText, token, type: 'MESSAGE_ALERT' }
      }).catch(() => {});
    }

    const targetPhone = qr.userId.whatsappNumber || qr.userId.phone;
    const defaultMsg = encodeURIComponent(cleanMsgText);
    const whatsappUrl = `https://wa.me/91${targetPhone.replace(/\D/g, '').slice(-10)}?text=${defaultMsg}`;

    res.json({
      success: true,
      message: 'Message quota deducted. Notification initiated.',
      whatsappUrl,
      remainingMessages: wallet.messageBalance
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const sendPushNotification = async (req, res) => {
  try {
    const { token } = req.params;
    const { messageText, callerPhone, scannerPhone, reason } = req.body;
    const cleanScanner = (callerPhone || scannerPhone || '').trim().replace(/\D/g, '').slice(-10);

    const qr = await QRCode.findOne({ publicToken: token })
      .populate('userId')
      .populate('vehicleId');

    if (!qr || qr.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'QR is not active' });
    }

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop';

    // 1. Create Scan Log
    await ScanLog.create({
      qrId: qr._id,
      copyCode: qr.copyCode,
      productId: qr.productId,
      publicToken: token,
      userId: qr.userId?._id,
      vehicleId: qr.vehicleId?._id,
      vehicleNumber: qr.vehicleId?.vehicleNumber,
      eventType: 'PUSH_NOTIFICATION',
      callerPhone: cleanScanner,
      scannerPhone: cleanScanner,
      reason: reason || 'In-App Push Alert',
      message: messageText,
      notes: `Push Alert by ${cleanScanner ? '+91 ' + cleanScanner : 'Public Scanner'}: ${messageText || reason}`,
      ipAddress,
      userAgent,
      device
    });

    // 2. Create In-App & Push Notification
    const cleanAlertMessage = messageText || reason || 'Vehicle Alert';
    if (qr.userId?._id) {
      await Notification.create({
        userId: qr.userId._id,
        title: `🔔 Push Alert: ${qr.vehicleId?.vehicleNumber || 'Vehicle'}`,
        message: cleanAlertMessage,
        type: 'MESSAGE_ALERT',
        qrId: qr._id,
        vehicleNumber: qr.vehicleId?.vehicleNumber,
        scannerPhone: cleanScanner,
        metadata: { reason, messageText: cleanAlertMessage, token }
      });

      sendFCMNotificationToUser(qr.userId._id, {
        title: `🔔 Push Alert: ${qr.vehicleId?.vehicleNumber || 'Vehicle'}`,
        body: cleanAlertMessage,
        data: { reason, messageText: cleanAlertMessage, token, type: 'PUSH_NOTIFICATION' }
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: '🎉 Push notification and in-app alert sent successfully to the vehicle owner!'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const triggerEmergency = async (req, res) => {
  try {
    const { token } = req.params;
    const { latitude, longitude, mapsLink, callerPhone, scannerPhone, reason } = req.body;
    const cleanScanner = (callerPhone || scannerPhone || '').trim().replace(/\D/g, '').slice(-10);

    const qr = await QRCode.findOne({ publicToken: token })
      .populate('userId')
      .populate('vehicleId');

    if (!qr) {
      return res.status(404).json({ success: false, message: 'Invalid QR' });
    }

    const contacts = qr.vehicleId?.emergencyContacts || [];
    const generatedMapsLink = mapsLink || (latitude && longitude ? `https://maps.google.com/?q=${latitude},${longitude}` : null);

    const alert = await EmergencyAlert.create({
      qrId: qr._id,
      vehicleId: qr.vehicleId?._id,
      userId: qr.userId?._id,
      publicToken: token,
      vehicleNumber: qr.vehicleId?.vehicleNumber || 'N/A',
      ownerName: qr.userId?.name || 'N/A',
      callerPhone: cleanScanner,
      scannerPhone: cleanScanner,
      ip: req.ip || 'Unknown',
      device: req.headers['user-agent'] || 'Mobile Device',
      location: {
        latitude: latitude || null,
        longitude: longitude || null,
        mapsLink: generatedMapsLink
      },
      notifiedContacts: contacts
    });

    // Log Scan Event
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop';
    ScanLog.create({
      qrId: qr._id,
      copyCode: qr.copyCode,
      productId: qr.productId,
      publicToken: token,
      userId: qr.userId?._id,
      vehicleId: qr.vehicleId?._id,
      vehicleNumber: qr.vehicleId?.vehicleNumber,
      eventType: 'SCAN_VIEW',
      callerPhone: cleanScanner,
      scannerPhone: cleanScanner,
      reason: reason || 'Emergency SOS Triggered',
      notes: `🚨 Emergency SOS Triggered by ${cleanScanner ? '+91 ' + cleanScanner : 'Public Scanner'}`,
      ipAddress,
      userAgent,
      device
    }).catch(() => {});

    // Create In-App & Push Notification
    if (qr.userId?._id) {
      Notification.create({
        userId: qr.userId._id,
        title: `🚨 SOS EMERGENCY ALERT: ${qr.vehicleId?.vehicleNumber || 'Vehicle'}`,
        message: cleanScanner
          ? `Emergency SOS triggered by (+91 ${cleanScanner}). GPS Location dispatched to emergency contacts.`
          : `Emergency SOS triggered. GPS Location dispatched to emergency contacts.`,
        type: 'EMERGENCY_ALERT',
        qrId: qr._id,
        vehicleNumber: qr.vehicleId?.vehicleNumber,
        scannerPhone: cleanScanner,
        metadata: { latitude, longitude, mapsLink: generatedMapsLink, token }
      }).catch(() => {});

      sendFCMNotificationToUser(qr.userId._id, {
        title: `🚨 SOS EMERGENCY ALERT: ${qr.vehicleId?.vehicleNumber || 'Vehicle'}`,
        body: cleanScanner
          ? `Emergency SOS triggered by (+91 ${cleanScanner}). GPS Location dispatched to emergency contacts.`
          : `Emergency SOS triggered. GPS Location dispatched to emergency contacts.`,
        data: { latitude: String(latitude || ''), longitude: String(longitude || ''), mapsLink: generatedMapsLink || '', token, type: 'EMERGENCY_ALERT' }
      }).catch(() => {});
    }

    const locationText = generatedMapsLink ? `%0A📍 Live Incident Location: ${encodeURIComponent(generatedMapsLink)}` : '';
    const alertMessage = `🚨 *SAFE DRIVE EMERGENCY ALERT* 🚨%0A%0AVehicle Plate: *${qr.vehicleId?.vehicleNumber}*%0AOwner: *${qr.userId?.name}*%0AStatus: Emergency Alert Triggered via Vehicle QR Scan!${locationText}%0A%0APlease respond or contact immediately.`;

    const formattedContacts = contacts.map(c => {
      const cleanPhone = c.number.replace(/\D/g, '').slice(-10);
      return {
        name: c.name,
        number: c.number,
        whatsappLink: `https://wa.me/91${cleanPhone}?text=${alertMessage}`
      };
    });

    res.json({
      success: true,
      message: '🚨 Emergency alert logged! Live GPS location dispatched.',
      alertId: alert._id,
      mapsLink: generatedMapsLink,
      emergencyContacts: formattedContacts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * FIRST-TIME PHYSICAL QR STICKER CLAIM & VERIFICATION
 */
export const claimPhysicalQR = async (req, res) => {
  try {
    const { token } = req.params;
    const { emailOrPhone } = req.body;

    if (!emailOrPhone) {
      return res.status(400).json({ success: false, message: 'Please enter your order email or phone number.' });
    }

    const cleanInput = emailOrPhone.trim().toLowerCase();
    const cleanPhone = emailOrPhone.trim().replace(/\D/g, '').slice(-10);

    const qr = await QRCode.findOne({ publicToken: token });
    if (!qr) {
      return res.status(404).json({ success: false, message: 'Invalid or unknown QR code scanned.' });
    }

    if (qr.status === 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'This QR code is already registered and active.' });
    }

    const qrCategory = qr.qrFor || qr.qrType || 'Car';

    // Strictly find eligible physical order matching this exact QR category and activation phone
    const findRes = await findEligiblePhysicalOrder(cleanPhone, qrCategory);
    if (findRes.status !== 'MATCH' || !findRes.order) {
      return res.status(400).json({
        success: false,
        message: findRes.message || `❌ No eligible physical order found for [${qrCategory}] with activation mobile number +91 ${cleanPhone}.`
      });
    }

    const order = findRes.order;
    const user = await User.findById(order.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found for this order.' });
    }

    // Find all sibling QR stickers sharing the same productId (e.g. SD007C1 and SD007C2)
    const targetProductId = qr.productId;
    const siblingQRs = await QRCode.find({ productId: targetProductId });

    await QRCode.updateMany(
      { productId: targetProductId },
      {
        status: 'SOLD',
        userId: user._id,
        initialCalls: order.metadata?.initialCalls || 10,
        initialMessages: order.metadata?.initialMessages || 20,
        validityDays: order.metadata?.validityDays || 365,
        renewalAmount: order.metadata?.renewalAmount || 199
      }
    );

    // Mark unit slot in order as claimed
    order.claimedActivationPhones = order.claimedActivationPhones || [];
    order.claimedActivationPhones.push(cleanPhone);
    order.claimedCount = (order.claimedCount || 0) + 1;
    if (order.claimedCount >= (order.quantity || 1)) {
      order.isClaimed = true;
      order.claimedAt = new Date();
    }
    order.claimedProductId = targetProductId;
    order.allocatedQRIds = [...(order.allocatedQRIds || []), ...siblingQRs.map(q => q._id)];
    await order.save();

    res.json({
      success: true,
      verified: true,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        address: user.address
      },
      qr: {
        productId: qr.productId,
        copyCode: qr.copyCode,
        qrFor: qr.qrFor || 'Car'
      },
      message: '🎉 Order verified! This QR kit is now linked to your account. Please complete your vehicle details to activate.'
    });
  } catch (error) {
    console.error('Claim QR error:', error);
    res.status(500).json({ success: false, message: error.message || 'Error claiming physical QR kit.' });
  }
};

/**
 * Send OTP for First-Time QR Activation
 * Works for any 10-digit mobile number with fixed test OTP (123456)
 * Strictly verifies physical order category if QR token is provided
 */
export const sendActivationOTP = async (req, res) => {
  try {
    const { phone, token, qrFor } = req.body;
    const cleanPhone = (phone || '').trim().replace(/\D/g, '').slice(-10);

    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }

    // If QR token is passed, validate whether this phone is eligible for this QR sticker
    if (token) {
      const qr = await QRCode.findOne({ publicToken: token });
      if (qr && ['GENERATED', 'IN STOCK', 'SOLD'].includes(qr.status)) {
        const expectedCategory = qr.qrFor || qrFor || 'Car';
        const isDigitalQR = qr.qrType === 'DIGITAL' || qr.batchId === 'STORE-DIGITAL';

        if (!isDigitalQR) {
          const findRes = await findEligiblePhysicalOrder(cleanPhone, expectedCategory);
          if (findRes.status !== 'MATCH') {
            return res.status(400).json({
              success: false,
              message: findRes.message || `❌ No pending physical order found for [${expectedCategory}] on activation mobile number +91 ${cleanPhone}.`
            });
          }
        }
      }
    }

    // Check if user exists in database
    const existingUser = await User.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `+91${cleanPhone}` },
        { phone: `91${cleanPhone}` }
      ]
    });

    if (existingUser && existingUser.status === 'SUSPENDED') {
      return res.status(403).json({
        success: false,
        message: 'Account is suspended. Please contact administrator.'
      });
    }

    res.json({
      success: true,
      message: `OTP sent to mobile +91 ${cleanPhone}`,
      phone: cleanPhone,
      otp: '123456',
      userExists: !!existingUser,
      user: existingUser ? {
        name: existingUser.name,
        phone: existingUser.phone,
        email: existingUser.email,
        whatsappNumber: existingUser.whatsappNumber,
        address: existingUser.address
      } : null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Verify OTP for First-Time QR Activation
 */
export const verifyActivationOTP = async (req, res) => {
  try {
    const { phone, otp, token, qrFor } = req.body;
    const cleanPhone = (phone || '').trim().replace(/\D/g, '').slice(-10);
    const cleanOtp = (otp || '').trim();

    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Invalid mobile number' });
    }

    if (cleanOtp !== '123456') {
      return res.status(400).json({ success: false, message: 'Invalid OTP code. Please enter 123456' });
    }

    // If QR token is passed, validate whether this phone is eligible for this QR sticker
    if (token) {
      const qr = await QRCode.findOne({ publicToken: token });
      if (qr && ['GENERATED', 'IN STOCK', 'SOLD'].includes(qr.status)) {
        const expectedCategory = qr.qrFor || qrFor || 'Car';
        const isDigitalQR = qr.qrType === 'DIGITAL' || qr.batchId === 'STORE-DIGITAL';

        if (!isDigitalQR) {
          const findRes = await findEligiblePhysicalOrder(cleanPhone, expectedCategory);
          if (findRes.status !== 'MATCH') {
            return res.status(400).json({
              success: false,
              message: findRes.message || `❌ No pending physical order found for [${expectedCategory}] on activation mobile number +91 ${cleanPhone}.`
            });
          }
        }
      }
    }

    const existingUser = await User.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `+91${cleanPhone}` },
        { phone: `91${cleanPhone}` }
      ]
    });

    res.json({
      success: true,
      verified: true,
      phone: cleanPhone,
      userExists: !!existingUser,
      user: existingUser ? {
        name: existingUser.name,
        phone: existingUser.phone,
        email: existingUser.email,
        whatsappNumber: existingUser.whatsappNumber,
        address: existingUser.address
      } : null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getLandingPageData = async (req, res) => {
  try {
    const [
      activeProducts,
      scanReasons,
      totalTagsSold,
      totalActiveQRs,
      totalVehicles,
      totalUsers,
      systemSettings
    ] = await Promise.all([
      Product.find({ isDeleted: { $ne: true } }).sort({ sortOrder: 1, createdAt: -1 }),
      ScanReason.find({ isActive: { $ne: false } }).sort({ priority: 1, order: 1 }),
      QRCode.countDocuments({ status: { $in: ['ACTIVE', 'SOLD'] } }),
      QRCode.countDocuments({ status: 'ACTIVE' }),
      Vehicle.countDocuments(),
      User.countDocuments({ role: 'USER' }),
      SystemSetting.find()
    ]);

    const settingsMap = {};
    systemSettings.forEach(s => {
      settingsMap[s.key] = s.value;
    });

    res.json({
      success: true,
      products: activeProducts,
      scanReasons,
      stats: {
        totalTagsSold: totalTagsSold > 50 ? `${totalTagsSold.toLocaleString()}+` : '50,000+',
        totalActiveDrivers: (totalActiveQRs || totalVehicles || totalUsers) > 20 ? `${(totalActiveQRs || totalVehicles || totalUsers).toLocaleString()}+` : '20,000+',
        positiveRating: '99.5%',
        support: '24/7'
      },
      company: {
        supportEmail: settingsMap.supportEmail || 'support@safedrivetag.in',
        supportPhone: settingsMap.supportPhone || '+91 98765 43210',
        address: settingsMap.officeAddress || 'Lucknow, Uttar Pradesh, India',
        companyName: 'SafeDrive-Tag'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const subscribeNewsletter = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await Newsletter.findOne({ email: cleanEmail });
    if (!existing) {
      const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';
      await Newsletter.create({
        email: cleanEmail,
        ipAddress,
        userAgent
      });
    }

    res.json({
      success: true,
      message: 'Thank you for subscribing to SafeDrive-Tag updates!'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const submitContactInquiry = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Please enter your name' });
    }

    const cleanPhone = (phone || '').trim().replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number' });
    }

    if (!message || message.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Please enter your message or query' });
    }

    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';

    const inquiry = await ContactInquiry.create({
      name: name.trim(),
      phone: cleanPhone,
      email: email ? email.trim().toLowerCase() : '',
      subject: (subject || 'Contact Page Inquiry').trim(),
      message: message.trim(),
      status: 'UNREAD',
      isRead: false,
      ipAddress,
      userAgent
    });

    res.json({
      success: true,
      message: 'Your inquiry has been submitted successfully! Our support team will get in touch with you shortly.',
      inquiryId: inquiry._id
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
