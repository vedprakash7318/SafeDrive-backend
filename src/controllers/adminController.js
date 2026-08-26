import mongoose from 'mongoose';
import crypto from 'crypto';
import QRCode from '../models/QRCode.js';
import User from '../models/User.js';
import Vehicle from '../models/Vehicle.js';
import Subscription from '../models/Subscription.js';
import QuotaWallet from '../models/QuotaWallet.js';
import QuotaTransaction from '../models/QuotaTransaction.js';
import EmergencyAlert from '../models/EmergencyAlert.js';
import QuotaPackage from '../models/QuotaPackage.js';
import Payment from '../models/Payment.js';
import AuditLog from '../models/AuditLog.js';
import QRTag from '../models/QRTag.js';
import QRType from '../models/QRType.js';
import QRFormat from '../models/QRFormat.js';
import ScanReason from '../models/ScanReason.js';
import SystemSetting from '../models/SystemSetting.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import ScanLog from '../models/ScanLog.js';
import ContactInquiry from '../models/ContactInquiry.js';
import { uploadToCloudinary } from '../utils/cloudinary.js';

// ==========================================
// 1. STATS & ANALYTICS
// ==========================================
export const getStats = async (req, res) => {
  try {
    // Count distinct Kit Sets (by productId) so multiple copies (SD001C1, SD001C2) are counted as 1 kit set!
    const distinctTotalKits = await QRCode.distinct('productId', { isDeleted: { $ne: true } });
    const totalQRs = distinctTotalKits.length;

    const distinctActiveKits = await QRCode.distinct('productId', { status: 'ACTIVE', isDeleted: { $ne: true } });
    const activeQRs = distinctActiveKits.length;

    const distinctInStockKits = await QRCode.distinct('productId', { status: { $in: ['GENERATED', 'IN STOCK'] }, isDeleted: { $ne: true } });
    const inStockQRs = distinctInStockKits.length;

    const distinctExpiredKits = await QRCode.distinct('productId', { status: 'EXPIRED', isDeleted: { $ne: true } });
    const expiredQRs = distinctExpiredKits.length;

    const distinctSuspendedKits = await QRCode.distinct('productId', { status: 'SUSPENDED', isDeleted: { $ne: true } });
    const suspendedQRs = distinctSuspendedKits.length;

    const totalUsers = await User.countDocuments({ role: 'USER' });
    const activeUsers = await User.countDocuments({ role: 'USER', status: 'ACTIVE' });
    const totalVehicles = await Vehicle.countDocuments();

    const emergencyAlertsCount = await EmergencyAlert.countDocuments();

    // Aggregations for calls & messages
    const wallets = await QuotaWallet.aggregate([
      {
        $group: {
          _id: null,
          totalCallsUsed: { $sum: '$totalCallsUsed' },
          totalMessagesUsed: { $sum: '$totalMessagesUsed' }
        }
      }
    ]);

    const totalCallsUsed = wallets.length > 0 ? wallets[0].totalCallsUsed : 0;
    const totalMessagesUsed = wallets.length > 0 ? wallets[0].totalMessagesUsed : 0;

    // Payments summary
    const payments = await Payment.aggregate([
      { $match: { status: 'SUCCESSFUL' } },
      { $group: { _id: null, totalRevenue: { $sum: '$amount' } } }
    ]);
    const totalRevenue = payments.length > 0 ? payments[0].totalRevenue : 0;

    const recentQRs = await QRCode.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(5).populate('userId vehicleId');
    const recentAlerts = await EmergencyAlert.find().sort({ createdAt: -1 }).limit(5);

    res.json({
      success: true,
      stats: {
        totalQRs,
        activeQRs,
        inStockQRs,
        expiredQRs,
        suspendedQRs,
        totalUsers,
        activeUsers,
        totalVehicles,
        totalCallsUsed,
        totalMessagesUsed,
        emergencyAlertsCount,
        totalRevenue
      },
      recentQRs,
      recentAlerts
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 2. QR TYPES MANAGEMENT (ONLY 1 TEXT FIELD `name` + SOFT DELETE & RESTORE)
// ==========================================
export const getQRTypes = async (req, res) => {
  try {
    const showDeleted = req.query.showDeleted === 'true';
    const filter = showDeleted ? { isDeleted: true } : { isDeleted: { $ne: true } };
    const types = await QRType.find(filter).sort({ createdAt: 1 });
    res.json({ success: true, types });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createQRType = async (req, res) => {
  try {
    const { name, copiesPerSet = 2, category = 'VEHICLE', isVehicle } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'QR Type name is required' });
    }

    const cleanName = name.trim();
    const finalCategory = (category || (isVehicle === false ? 'NON_VEHICLE' : 'VEHICLE')).toUpperCase();
    const finalIsVehicle = isVehicle !== undefined ? Boolean(isVehicle) : finalCategory !== 'NON_VEHICLE';

    const qrType = await QRType.create({
      name: cleanName,
      category: finalCategory,
      isVehicle: finalIsVehicle,
      copiesPerSet: Math.max(1, Math.min(20, parseInt(copiesPerSet, 10) || 2))
    });

    res.json({ success: true, message: 'QR Type created successfully', qrType });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateQRType = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, copiesPerSet, category, isVehicle } = req.body;

    const qrType = await QRType.findById(id);
    if (!qrType || qrType.isDeleted) {
      return res.status(404).json({ success: false, message: 'QR Type not found' });
    }

    if (name) qrType.name = name.trim();
    if (category !== undefined) {
      qrType.category = category.toUpperCase();
      qrType.isVehicle = category.toUpperCase() !== 'NON_VEHICLE';
    }
    if (isVehicle !== undefined) {
      qrType.isVehicle = Boolean(isVehicle);
      qrType.category = Boolean(isVehicle) ? 'VEHICLE' : 'NON_VEHICLE';
    }
    if (copiesPerSet !== undefined) {
      qrType.copiesPerSet = Math.max(1, Math.min(20, parseInt(copiesPerSet, 10) || 2));
    }
    await qrType.save();

    res.json({ success: true, message: 'QR Type updated successfully', qrType });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteQRType = async (req, res) => {
  try {
    const { id } = req.params;
    const qrType = await QRType.findById(id);
    if (!qrType) {
      return res.status(404).json({ success: false, message: 'QR Type not found' });
    }
    qrType.isDeleted = true;
    qrType.deletedAt = new Date();
    await qrType.save();

    res.json({ success: true, message: 'QR Type soft-deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const restoreQRType = async (req, res) => {
  try {
    const { id } = req.params;
    const qrType = await QRType.findById(id);
    if (!qrType) {
      return res.status(404).json({ success: false, message: 'QR Type not found' });
    }
    qrType.isDeleted = false;
    qrType.deletedAt = null;
    await qrType.save();

    res.json({ success: true, message: 'QR Type restored successfully', qrType });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 3. QR TAGS MANAGEMENT (CRUD with SOFT DELETE & RESTORE)
// ==========================================
export const getTags = async (req, res) => {
  try {
    const showDeleted = req.query.showDeleted === 'true';
    const filter = showDeleted ? { isDeleted: true } : { isDeleted: { $ne: true } };
    const tags = await QRTag.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, tags });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createTag = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tag name is required' });
    }

    const cleanName = name.trim().toUpperCase().replace(/\s+/g, '-');
    const existing = await QRTag.findOne({ name: cleanName, isDeleted: { $ne: true } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Tag with this name already exists' });
    }

    const tag = await QRTag.create({
      name: cleanName,
      description: description || ''
    });

    res.json({ success: true, message: 'Tag created successfully', tag });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const tag = await QRTag.findById(id);
    if (!tag || tag.isDeleted) {
      return res.status(404).json({ success: false, message: 'Tag not found' });
    }

    if (name) {
      const cleanName = name.trim().toUpperCase().replace(/\s+/g, '-');
      if (cleanName !== tag.name) {
        const existing = await QRTag.findOne({ name: cleanName, _id: { $ne: id }, isDeleted: { $ne: true } });
        if (existing) {
          return res.status(400).json({ success: false, message: 'Another tag with this name already exists' });
        }
        tag.name = cleanName;
      }
    }

    if (description !== undefined) {
      tag.description = description;
    }

    await tag.save();
    res.json({ success: true, message: 'Tag updated successfully', tag });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteTag = async (req, res) => {
  try {
    const { id } = req.params;
    const tag = await QRTag.findById(id);
    if (!tag) {
      return res.status(404).json({ success: false, message: 'Tag not found' });
    }
    tag.isDeleted = true;
    tag.deletedAt = new Date();
    await tag.save();

    res.json({ success: true, message: 'Tag soft-deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const restoreTag = async (req, res) => {
  try {
    const { id } = req.params;
    const tag = await QRTag.findById(id);
    if (!tag) {
      return res.status(404).json({ success: false, message: 'Tag not found' });
    }
    tag.isDeleted = false;
    tag.deletedAt = null;
    await tag.save();

    res.json({ success: true, message: 'Tag restored successfully', tag });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 4. AUTO-INCREMENT SEQUENCE CALCULATION
// ==========================================
export const calculateNextStartNumber = async () => {
  const existingQRs = await QRCode.find(
    { $or: [{ productId: /^SD\d+/i }, { copyCode: /^SD\d+/i }] },
    { productId: 1, copyCode: 1 }
  );

  let maxNum = 0;
  for (const qr of existingQRs) {
    if (qr.productId) {
      const match = qr.productId.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    if (qr.copyCode) {
      const match = qr.copyCode.match(/^SD(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }

  let nextStart = maxNum + 1;

  // Double check uniqueness in DB to ensure no duplicate copyCode collision
  while (await QRCode.exists({ copyCode: new RegExp(`^SD0*${nextStart}C\\d+`, 'i') })) {
    nextStart++;
  }

  return nextStart;
};

export const getNextSequenceNumber = async (req, res) => {
  try {
    const nextNumber = await calculateNextStartNumber();
    const formattedCode = `SD${String(nextNumber).padStart(3, '0')}`;
    res.json({
      success: true,
      nextNumber,
      formattedCode,
      prefix: 'SD'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 5. BATCH QR CODE GENERATION (QR For: Vehicle/Item + QR Type: Physical/Digital + Group/Tag + Quantity)
// ==========================================
export const generateQRBatch = async (req, res) => {
  try {
    const {
      quantity = 10,
      tag = 'DEFAULT-GROUP',
      qrFor = 'Car',
      qrTypeName, // Backward compatibility alias
      qrType = 'PHYSICAL', // PHYSICAL vs DIGITAL
      qrTypeId,
      qrFormatId
    } = req.body;

    const chosenQrFor = qrFor || qrTypeName || 'Car';
    
    // Resolve QRFormat document if provided
    let chosenQRFormatDoc = null;
    if (qrFormatId) {
      chosenQRFormatDoc = await QRFormat.findById(qrFormatId);
    } else if (qrType) {
      chosenQRFormatDoc = await QRFormat.findOne({ name: qrType, isDeleted: { $ne: true } });
    }
    const chosenQrType = chosenQRFormatDoc ? (chosenQRFormatDoc.type || 'PHYSICAL') : ((qrType || 'PHYSICAL').toUpperCase() === 'DIGITAL' ? 'DIGITAL' : 'PHYSICAL');

    const count = parseInt(quantity, 10);
    if (isNaN(count) || count <= 0 || count > 500) {
      return res.status(400).json({ success: false, message: 'Quantity must be between 1 and 500 sets' });
    }

    const cleanTag = tag.trim().toUpperCase().replace(/\s+/g, '-');

    // Robust start number calculation
    const startNum = await calculateNextStartNumber();

    // Determine copiesPerSet from selected QR For (Vehicle/Item Type)
    let copiesPerSet = 2;
    let chosenQRTypeDoc = null;
    if (qrTypeId) {
      chosenQRTypeDoc = await QRType.findById(qrTypeId);
    } else if (chosenQrFor) {
      chosenQRTypeDoc = await QRType.findOne({ name: chosenQrFor, isDeleted: { $ne: true } });
    }

    if (chosenQRTypeDoc && chosenQRTypeDoc.copiesPerSet) {
      copiesPerSet = chosenQRTypeDoc.copiesPerSet;
    }

    // Determine if this batch is for Vehicles or Non-Vehicles (Luggage, Bag, Pet, etc.)
    let isVehicle = true;
    if (chosenQRTypeDoc && chosenQRTypeDoc.isVehicle !== undefined) {
      isVehicle = chosenQRTypeDoc.isVehicle;
    } else if (req.body.isVehicle !== undefined) {
      isVehicle = Boolean(req.body.isVehicle);
    } else if (req.body.category === 'NON_VEHICLE') {
      isVehicle = false;
    } else {
      const nonVehicles = ['luggage', 'bag', 'pet', 'key', 'keys', 'laptop', 'door', 'house', 'wallet', 'other', 'item'];
      if (nonVehicles.some(nv => chosenQrFor.toLowerCase().includes(nv))) {
        isVehicle = false;
      }
    }

    const generatedQRs = [];

    for (let i = 0; i < count; i++) {
      const num = startNum + i;
      const numFormatted = String(num).padStart(3, '0');
      const productId = `SD${numFormatted}`;
      // Generate unique 4-digit PIN for non-vehicles (Luggage, Bag, etc.)
      const securityCode = !isVehicle ? String(Math.floor(1000 + Math.random() * 9000)) : null;

      // Generate C1..C(copiesPerSet)
      for (let c = 1; c <= copiesPerSet; c++) {
        const token = crypto.randomBytes(16).toString('hex');
        const copy = new QRCode({
          productId,
          batchId: cleanTag,
          qrFor: chosenQrFor,
          qrType: chosenQrType,
          isVehicle,
          category: isVehicle ? 'VEHICLE' : 'NON_VEHICLE',
          securityCode,
          qrTypeId: chosenQRTypeDoc?._id || qrTypeId || null,
          qrFormatId: chosenQRFormatDoc?._id || qrFormatId || null,
          copyCode: `${productId}C${c}`,
          publicToken: token,
          status: 'IN STOCK'
        });
        generatedQRs.push(copy);
      }
    }

    await QRCode.insertMany(generatedQRs);

    // Update or create Tag
    await QRTag.findOneAndUpdate(
      { name: cleanTag },
      { $inc: { totalSets: count }, isDeleted: false },
      { upsert: true, new: true }
    );

    if (chosenQRTypeDoc) {
      await QRType.findByIdAndUpdate(chosenQRTypeDoc._id, { $inc: { totalSets: count } });
    } else if (qrTypeId) {
      await QRType.findByIdAndUpdate(qrTypeId, { $inc: { totalSets: count } });
    }

    await AuditLog.create({
      adminId: req.user._id,
      action: 'GENERATE_QR_BATCH',
      newValue: {
        groupName: cleanTag,
        qrFor: chosenQrFor,
        qrType: chosenQrType,
        copiesPerSet,
        quantity: count,
        totalCopies: count * copiesPerSet,
        startNumber: startNum,
        endNumber: startNum + count - 1
      }
    });

    res.json({
      success: true,
      message: `🎉 Successfully generated ${count} QR sets (${count * copiesPerSet} stickers [C1-C${copiesPerSet}]: SD${String(startNum).padStart(3, '0')} to SD${String(startNum + count - 1).padStart(3, '0')}) for [${chosenQrFor} • ${chosenQrType}] in Group [${cleanTag}]!`,
      generatedCount: generatedQRs.length
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 5.1 GET ALL QR GROUPS (Aggregated by Group / Batch Name)
 */
export const getQRGroups = async (req, res) => {
  try {
    const groups = await QRCode.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      {
        $group: {
          _id: '$batchId',
          qrFor: { $first: '$qrFor' },
          qrType: { $first: '$qrType' },
          qrTypeId: { $first: '$qrTypeId' },
          isPrinted: { $first: '$isPrinted' },
          firstProduct: { $min: '$productId' },
          lastProduct: { $max: '$productId' },
          uniqueProducts: { $addToSet: '$productId' },
          totalStickers: { $sum: 1 },
          generatedCount: { $sum: { $cond: [{ $eq: ['$status', 'GENERATED'] }, 1, 0] } },
          inStockCount: { $sum: { $cond: [{ $eq: ['$status', 'IN STOCK'] }, 1, 0] } },
          soldCount: { $sum: { $cond: [{ $in: ['$status', ['SOLD', 'ACTIVE']] }, 1, 0] } },
          activeCount: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
          suspendedCount: { $sum: { $cond: [{ $eq: ['$status', 'SUSPENDED'] }, 1, 0] } },
          createdAt: { $min: '$createdAt' }
        }
      },
      {
        $project: {
          groupName: '$_id',
          qrFor: 1,
          qrType: 1,
          qrTypeId: 1,
          isPrinted: 1,
          totalSets: { $size: '$uniqueProducts' },
          totalStickers: 1,
          firstProduct: 1,
          lastProduct: 1,
          generatedCount: 1,
          inStockCount: 1,
          soldCount: 1,
          activeCount: 1,
          suspendedCount: 1,
          createdAt: 1
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    res.json({ success: true, groups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getQRsByGroup = async (req, res) => {
  try {
    const { groupName } = req.params;
    const qrs = await QRCode.find({ batchId: groupName, isDeleted: { $ne: true } })
      .populate('userId', 'name phone email')
      .populate('vehicleId', 'vehicleBrand vehicleName vehicleNumber emergencyContacts')
      .sort({ productId: 1, copyCode: 1 });

    const kitMap = {};
    for (const q of qrs) {
      if (!kitMap[q.productId]) {
        kitMap[q.productId] = {
          productId: q.productId,
          batchId: q.batchId,
          qrFor: q.qrFor || 'Car',
          qrType: q.qrType || 'PHYSICAL',
          isVehicle: q.isVehicle !== false,
          category: q.category || (q.isVehicle === false ? 'NON_VEHICLE' : 'VEHICLE'),
          securityCode: q.securityCode || null,
          status: q.status,
          copies: [],
          user: q.userId ? { _id: q.userId._id, name: q.userId.name, phone: q.userId.phone, email: q.userId.email } : null,
          vehicle: q.vehicleId ? { _id: q.vehicleId._id, vehicleName: q.vehicleId.vehicleName, vehicleBrand: q.vehicleId.vehicleBrand, vehicleNumber: q.vehicleId.vehicleNumber } : null,
          activationDate: q.activationDate,
          expiryDate: q.expiryDate,
          createdAt: q.createdAt,
          primaryQRId: q._id
        };
      }
      kitMap[q.productId].copies.push({
        _id: q._id,
        copyCode: q.copyCode,
        publicToken: q.publicToken,
        isVehicle: q.isVehicle !== false,
        securityCode: q.securityCode || null,
        status: q.status
      });

      if (q.status === 'ACTIVE') kitMap[q.productId].status = 'ACTIVE';
      else if (q.status === 'SOLD' && kitMap[q.productId].status !== 'ACTIVE') kitMap[q.productId].status = 'SOLD';
      else if (q.status === 'EXPIRED' && kitMap[q.productId].status !== 'ACTIVE') kitMap[q.productId].status = 'EXPIRED';
      else if (q.status === 'SUSPENDED') kitMap[q.productId].status = 'SUSPENDED';
    }

    const uniqueKits = Object.values(kitMap);
    const totalKits = uniqueKits.length;
    const isDigitalBatch = groupName === 'STORE-DIGITAL';
    const inStockKits = isDigitalBatch ? 0 : uniqueKits.filter(k => k.status === 'IN STOCK' && !k.user).length;
    const activeKits = uniqueKits.filter(k => k.status === 'ACTIVE').length;
    const soldKits = uniqueKits.filter(k => k.status === 'SOLD' || (k.user && k.status !== 'ACTIVE')).length;
    const generatedKits = uniqueKits.filter(k => k.status === 'GENERATED').length;

    res.json({
      success: true,
      groupName,
      stats: {
        totalKits,
        totalStickers: qrs.length,
        inStockKits,
        activeKits,
        soldKits,
        generatedKits
      },
      kits: uniqueKits,
      qrs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 6. QR INVENTORY & STATUS
// ==========================================
export const getQRs = async (req, res) => {
  try {
    const { status, batchId, qrType, search, page = 1, limit = 100 } = req.query;
    const query = { isDeleted: { $ne: true } };

    if (status && status !== 'ALL') {
      query.status = status;
    }
    if (batchId && batchId !== 'ALL') {
      query.batchId = batchId;
    }
    if (qrType && qrType !== 'ALL') {
      query.qrType = qrType;
    }
    if (search) {
      query.$or = [
        { copyCode: { $regex: search, $options: 'i' } },
        { productId: { $regex: search, $options: 'i' } },
        { publicToken: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await QRCode.countDocuments(query);
    const qrs = await QRCode.find(query)
      .populate('userId', 'name phone')
      .populate('vehicleId', 'vehicleName vehicleBrand vehicleNumber')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10));

    res.json({
      success: true,
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / limit),
      qrs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getQRById = async (req, res) => {
  try {
    const { id } = req.params;
    const qr = await QRCode.findById(id)
      .populate('userId', 'name phone email role createdAt')
      .populate('vehicleId')
      .populate('qrTypeId');

    if (!qr) {
      return res.status(404).json({ success: false, message: 'QR Code not found' });
    }

    const wallet = await QuotaWallet.findOne({ qrId: qr._id });
    const siblingQRs = await QRCode.find({ productId: qr.productId });
    const siblingIds = siblingQRs.map(s => s._id);

    const rawQuotaLedger = await QuotaTransaction.find({
      $or: [{ qrId: qr._id }, { qrId: { $in: siblingIds } }]
    }).sort({ createdAt: -1 });

    const seenKitLogs = new Set();
    const quotaLedger = [];
    for (const q of rawQuotaLedger) {
      const prodId = q.productId || qr.productId || 'Kit';
      const timeWindow = new Date(q.createdAt).toISOString().slice(0, 16);
      const key = `${prodId}_${timeWindow}_${q.category}_${q.quantity}_${q.type}`;
      if (!seenKitLogs.has(key)) {
        seenKitLogs.add(key);
        quotaLedger.push({
          ...q.toObject(),
          kitProductId: prodId
        });
      }
    }

    const payments = await Payment.find({
      $or: [
        { 'metadata.qrCodes': qr.copyCode },
        { 'metadata.productId': qr.productId }
      ]
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      qr,
      wallet,
      siblingQRs,
      quotaLedger,
      payments
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateQRStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const qr = await QRCode.findById(id);
    if (!qr || qr.isDeleted) {
      return res.status(404).json({ success: false, message: 'QR Code not found' });
    }

    const oldStatus = qr.status;
    qr.status = status;
    await qr.save();

    await AuditLog.create({
      adminId: req.user._id,
      action: 'UPDATE_QR_STATUS',
      targetId: qr.copyCode,
      oldValue: oldStatus,
      newValue: status
    });

    res.json({ success: true, message: `QR status updated to ${status}`, qr });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const adminRenewQR = async (req, res) => {
  try {
    const { id } = req.params;
    const { validityDays = 365, bonusCalls = 10, bonusMessages = 20, reason = 'Admin Manual Renewal', paymentAmount = 0 } = req.body;

    const qr = await QRCode.findById(id);
    if (!qr || qr.isDeleted) {
      return res.status(404).json({ success: false, message: 'QR Code not found' });
    }

    const now = new Date();
    const currentExpiry = qr.expiryDate && new Date(qr.expiryDate) > now ? new Date(qr.expiryDate) : now;
    const newExpiry = new Date(currentExpiry.getTime() + validityDays * 24 * 60 * 60 * 1000);

    // Update ALL sibling copies of this kit
    const siblingQRs = await QRCode.find({ productId: qr.productId, isDeleted: { $ne: true } });

    await QRCode.updateMany(
      { productId: qr.productId },
      { expiryDate: newExpiry, status: 'ACTIVE' }
    );

    // Update Quota Wallets
    for (const item of siblingQRs) {
      let wallet = await QuotaWallet.findOne({ qrId: item._id });
      if (!wallet) {
        wallet = new QuotaWallet({
          userId: qr.userId,
          vehicleId: qr.vehicleId,
          qrId: item._id,
          callBalance: 0,
          messageBalance: 0
        });
      }
      wallet.callBalance += Number(bonusCalls);
      wallet.messageBalance += Number(bonusMessages);
      wallet.totalCallsPurchased += Number(bonusCalls);
      wallet.totalMessagesPurchased += Number(bonusMessages);
      await wallet.save();

      // Log Quota Transaction
      if (bonusCalls > 0) {
        await QuotaTransaction.create({
          userId: qr.userId,
          qrId: item._id,
          type: 'CREDIT',
          category: 'CALL',
          quantity: Number(bonusCalls),
          balanceAfter: wallet.callBalance,
          reason: `Subscription Renewal: ${reason}`
        });
      }
      if (bonusMessages > 0) {
        await QuotaTransaction.create({
          userId: qr.userId,
          qrId: item._id,
          type: 'CREDIT',
          category: 'MESSAGE',
          quantity: Number(bonusMessages),
          balanceAfter: wallet.messageBalance,
          reason: `Subscription Renewal: ${reason}`
        });
      }
    }

    // Record Subscription record
    await Subscription.create({
      userId: qr.userId,
      qrId: qr._id,
      startDate: currentExpiry,
      expiryDate: newExpiry,
      status: 'ACTIVE',
      renewalAmount: Number(paymentAmount) || qr.renewalAmount || 199
    });

    // Record Payment record if renewal amount entered
    if (Number(paymentAmount) > 0) {
      await Payment.create({
        userId: qr.userId,
        orderId: `REN-${Date.now()}`,
        paymentId: `pay_admin_ren_${Date.now()}`,
        amount: Number(paymentAmount),
        currency: 'INR',
        purpose: 'SUBSCRIPTION_RENEWAL',
        status: 'SUCCESSFUL',
        metadata: {
          productId: qr.productId,
          validityDays,
          reason
        }
      });
    }

    res.json({
      success: true,
      message: `QR Kit (${qr.productId}) renewed successfully for ${validityDays} days. Added ${bonusCalls} calls and ${bonusMessages} messages.`,
      newExpiryDate: newExpiry
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getUsers = async (req, res) => {
  try {
    // Collect all user IDs who have placed orders, bought QRs, or made payments
    const orderUserIds = await Order.distinct('userId');
    const paymentUserIds = await Payment.distinct('userId');
    const qrBuyerUserIds = await QRCode.distinct('buyerId');
    const buyerUserIds = Array.from(new Set([...orderUserIds, ...paymentUserIds, ...qrBuyerUserIds].filter(Boolean)));

    // Fetch only Customers & Buyers (exclude pure QR scan activation recipients)
    const users = await User.find({
      $and: [
        { registeredVia: { $ne: 'QR_SCAN_ACTIVATION' } },
        {
          $or: [
            { role: 'USER' },
            { _id: { $in: buyerUserIds } }
          ]
        }
      ]
    }).select('-password').sort({ createdAt: -1 });

    const userDetails = await Promise.all(
      users.map(async (u) => {
        const vehicles = await Vehicle.find({ userId: u._id });
        const qrs = await QRCode.find({
          $or: [{ userId: u._id }, { buyerId: u._id }],
          isDeleted: { $ne: true }
        }).populate('vehicleId');
        const wallet = await QuotaWallet.findOne({ userId: u._id });
        const payments = await Payment.find({
          $or: [{ userId: u._id }, { customerPhone: u.phone }, { customerEmail: u.email }],
          status: 'SUCCESSFUL'
        }).sort({ createdAt: -1 });
        const userOrders = await Order.find({
          $or: [{ userId: u._id }, { customerPhone: u.phone }, { customerEmail: u.email }]
        });

        const totalSpent = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        
        // Count by unique Kit sets + unclaimed physical orders (multiplying by remaining unclaimed quantity)
        const distinctKitsBought = new Set(qrs.map(q => q.productId || q.copyCode));
        for (const ord of userOrders) {
          if (ord.productType === 'PHYSICAL' && !ord.isClaimed) {
            const totalQty = Math.max(1, ord.quantity || 1);
            const claimed = ord.claimedCount || 0;
            const remainingQty = Math.max(0, totalQty - claimed);
            for (let k = 1; k <= remainingQty; k++) {
              distinctKitsBought.add(`ORD_${ord.orderNumber || ord._id}_UNCLAIMED_${k}`);
            }
          }
        }

        const activeKitsSet = new Set(qrs.filter((q) => q.status === 'ACTIVE').map(q => q.productId || q.copyCode));
        const digitalKitsSet = new Set(qrs.filter((q) => q.qrType === 'DIGITAL').map(q => q.productId || q.copyCode));
        const pendingCount = Math.max(0, distinctKitsBought.size - activeKitsSet.size);

        return {
          ...u.toObject(),
          vehicles,
          qrs,
          wallet,
          orders: userOrders,
          payments,
          totalSpent,
          totalQRsBought: distinctKitsBought.size,
          activeQRsCount: activeKitsSet.size,
          digitalQRsCount: digitalKitsSet.size,
          soldQRsCount: pendingCount
        };
      })
    );

    res.json({ success: true, users: userDetails });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // 1. All Vehicles owned by this user
    const vehicles = await Vehicle.find({ userId: user._id }).sort({ createdAt: -1 });

    // 2. All Orders placed by this user
    const orders = await Order.find({
      $or: [{ userId: user._id }, { customerPhone: user.phone }, { customerEmail: user.email }]
    }).sort({ createdAt: -1 });

    // 3. All Payments made by this user
    const payments = await Payment.find({
      $or: [{ userId: user._id }, { customerPhone: user.phone }, { customerEmail: user.email }]
    }).sort({ createdAt: -1 });

    // 3. Quota Ledger Activity for this user
    const rawQuotaLogs = await QuotaTransaction.find({
      $or: [{ userId: user._id }, { customerPhone: user.phone }]
    })
      .populate('qrId')
      .sort({ createdAt: -1 });

    // Deduplicate ledger logs across copy sets sharing same productId
    const quotaLedger = [];
    const seenKitLogs = new Set();
    for (const q of rawQuotaLogs) {
      const prodId = q.productId || q.qrId?.productId || (q.qrId?.copyCode ? q.qrId.copyCode.slice(0, 5) : q._id);
      const timeWindow = new Date(q.createdAt).toISOString().slice(0, 16);
      const key = `${prodId}_${timeWindow}_${q.category}_${q.quantity}_${q.type}`;
      if (!seenKitLogs.has(key)) {
        seenKitLogs.add(key);
        quotaLedger.push({
          ...q.toObject(),
          kitProductId: prodId
        });
      }
    }

    // 4. All QRs linked to this buyer (either directly assigned or bought by this user)
    const allUserQRs = await QRCode.find({
      $or: [{ userId: user._id }, { buyerId: user._id }],
      isDeleted: { $ne: true }
    })
      .populate('vehicleId')
      .populate('qrTypeId')
      .sort({ createdAt: -1 });

    // Group into Unique Kit Sets
    const kitMap = {};
    for (const q of allUserQRs) {
      if (!kitMap[q.productId]) {
        kitMap[q.productId] = {
          productId: q.productId,
          batchId: q.batchId,
          qrFor: q.qrFor || 'Car',
          qrType: q.qrType || 'PHYSICAL',
          status: q.status,
          copies: [],
          vehicle: q.vehicleId ? {
            _id: q.vehicleId._id,
            vehicleName: q.vehicleId.vehicleName,
            vehicleBrand: q.vehicleId.vehicleBrand,
            vehicleNumber: q.vehicleId.vehicleNumber,
            emergencyContacts: q.vehicleId.emergencyContacts || []
          } : null,
          activatedByName: q.activatedByName || null,
          activatedByPhone: q.activatedByPhone || q.activationPhone || null,
          activationDate: q.activationDate,
          expiryDate: q.expiryDate,
          createdAt: q.createdAt,
          primaryQRId: q._id,
          primaryPublicToken: q.publicToken,
          wallet: null,
          addons: [],
          payments: [],
          order: null
        };
      }
      kitMap[q.productId].copies.push({
        _id: q._id,
        copyCode: q.copyCode,
        publicToken: q.publicToken,
        status: q.status
      });

      if (q.status === 'ACTIVE') kitMap[q.productId].status = 'ACTIVE';
      else if (q.status === 'SOLD' && kitMap[q.productId].status !== 'ACTIVE') kitMap[q.productId].status = 'SOLD';
      else if (q.status === 'EXPIRED' && kitMap[q.productId].status !== 'ACTIVE') kitMap[q.productId].status = 'EXPIRED';
    }

    // Attach QuotaWallet, Addons, and Associated Order to each unique kit
    for (const prodId of Object.keys(kitMap)) {
      const kit = kitMap[prodId];
      const wallet = await QuotaWallet.findOne({ qrId: kit.primaryQRId });
      kit.wallet = wallet ? {
        callBalance: wallet.callBalance,
        messageBalance: wallet.messageBalance,
        totalCallsUsed: wallet.totalCallsUsed,
        totalMessagesUsed: wallet.totalMessagesUsed,
        totalCallsPurchased: wallet.totalCallsPurchased,
        totalMessagesPurchased: wallet.totalMessagesPurchased
      } : null;

      // Add-on Packs
      kit.addons = await QuotaTransaction.find({
        userId: user._id,
        productId: kit.productId,
        type: 'CREDIT',
        source: 'ADDON_PURCHASE'
      }).sort({ createdAt: -1 });

      // Matched Order
      const matchedOrder = orders.find(
        o => o.claimedProductId === kit.productId ||
             (o.allocatedQRIds && o.allocatedQRIds.some(id => kit.copies.some(c => c._id.toString() === id.toString())))
      );
      if (matchedOrder) {
        const ordQty = Math.max(1, matchedOrder.quantity || 1);
        const uPrice = matchedOrder.unitPrice || Math.round((matchedOrder.amount || 299) / ordQty);
        kit.unitPrice = uPrice;
        kit.order = {
          _id: matchedOrder._id,
          orderNumber: matchedOrder.orderNumber,
          productName: matchedOrder.productName,
          amount: matchedOrder.amount,
          unitPrice: uPrice,
          totalQuantity: ordQty,
          paymentStatus: matchedOrder.paymentStatus,
          deliveryStatus: matchedOrder.deliveryStatus,
          courierPartner: matchedOrder.courierPartner,
          trackingNumber: matchedOrder.trackingNumber,
          createdAt: matchedOrder.createdAt
        };
      }

      // Associated Payments
      const copyCodes = kit.copies.map(c => c.copyCode);
      kit.payments = payments.filter(p => {
        const metaQrCodes = p.metadata?.qrCodes || [];
        const matchesCode = metaQrCodes.some(code => copyCodes.includes(code));
        const matchesProdId = p.metadata?.productId === kit.productId;
        const matchesOrderId = kit.order && (p.orderId === kit.order.orderNumber || p.orderId === matchedOrder?.razorpayOrderId);
        return matchesCode || matchesProdId || matchesOrderId;
      });
      kit.totalPaymentsCount = kit.payments.length;

      // Price paid for this single active kit unit
      const singleKitPrice = kit.order?.unitPrice || (kit.payments.length > 0 ? kit.payments[0].amount : 299);
      kit.unitPrice = singleKitPrice;
      kit.totalPaidAmount = singleKitPrice;
    }

    // 5. Check for Unclaimed Physical Orders and add remaining slots as Pending Delivery Order items
    let totalPendingKitsQuantity = 0;
    for (const order of orders) {
      if (order.productType === 'PHYSICAL' && !order.isClaimed) {
        const totalQty = Math.max(1, order.quantity || 1);
        const claimed = order.claimedCount || 0;
        const remainingQty = Math.max(0, totalQty - claimed);
        if (remainingQty > 0) {
          totalPendingKitsQuantity += remainingQty;
          const pendingKey = `ORDER_${order.orderNumber || order._id}_REMAINING`;
          if (!kitMap[pendingKey]) {
            kitMap[pendingKey] = {
              productId: `Order: ${order.orderNumber}`,
              batchId: 'STORE-PHYSICAL-ORDER',
              qrFor: order.productName || order.qrFor || 'Car',
              qrType: 'PHYSICAL',
              status: 'PENDING_DELIVERY_SCAN',
              deliveryStatus: order.deliveryStatus || 'PROCESSING',
              copies: [],
              quantity: remainingQty,
              totalOrderQuantity: totalQty,
              claimedQuantity: claimed,
              vehicle: null,
              activationDate: null,
              expiryDate: null,
              createdAt: order.createdAt,
              primaryQRId: null,
              primaryPublicToken: null,
              wallet: {
                callBalance: 10 * remainingQty,
                messageBalance: 20 * remainingQty,
                totalCallsUsed: 0,
                totalMessagesUsed: 0
              },
              addons: [],
              totalPaidAmount: Math.round((order.amount || 299) * (remainingQty / totalQty)),
              unitPrice: order.unitPrice || Math.round((order.amount || 299) / totalQty),
              order: {
                _id: order._id,
                orderNumber: order.orderNumber,
                productName: order.productName || 'Car Kit',
                amount: order.amount,
                quantity: remainingQty,
                totalQuantity: totalQty,
                claimedCount: claimed,
                unitPrice: order.unitPrice || Math.round((order.amount || 299) / totalQty),
                paymentStatus: order.paymentStatus,
                deliveryStatus: order.deliveryStatus,
                courierPartner: order.courierPartner,
                trackingNumber: order.trackingNumber,
                deliveryAddress: order.deliveryAddress,
                city: order.city,
                state: order.state,
                pincode: order.pincode,
                createdAt: order.createdAt
              },
              payments: payments.filter(p => p.orderId === order.orderNumber || p.orderId === order.razorpayOrderId),
              isPendingOrder: true
            };
          }
        }
      }
    }

    const uniqueKits = Object.values(kitMap);
    const totalSpent = payments.filter(p => p.status === 'SUCCESSFUL').reduce((sum, p) => sum + (p.amount || 0), 0);

    const existingQRKitsCount = new Set(allUserQRs.map(q => q.productId || q.copyCode)).size;
    const digitalKitsCount = new Set(allUserQRs.filter(q => q.qrType === 'DIGITAL').map(q => q.productId || q.copyCode)).size;
    const totalKitsCount = existingQRKitsCount + totalPendingKitsQuantity;
    const activeKitsCount = uniqueKits.filter(k => k.status === 'ACTIVE').length;
    const pendingScanCount = totalPendingKitsQuantity;

    res.json({
      success: true,
      user,
      stats: {
        totalKits: totalKitsCount,
        activeKits: activeKitsCount,
        digitalKits: digitalKitsCount,
        pendingKits: pendingScanCount,
        physicalPendingKits: totalPendingKitsQuantity,
        expiredKits: uniqueKits.filter(k => k.status === 'EXPIRED').length,
        totalVehicles: vehicles.length,
        totalOrders: orders.length,
        totalPayments: payments.length,
        totalSpent
      },
      kits: uniqueKits,
      vehicles,
      orders,
      payments,
      quotaLedger
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const adminAddAddonQuota = async (req, res) => {
  try {
    const { qrId, calls = 0, messages = 0, validityDays = 0, source = 'ADMIN_GRANT', amountPaid = 0, paymentId, notes, reason } = req.body;

    const qr = await QRCode.findById(qrId);
    if (!qr) {
      return res.status(404).json({ success: false, message: 'QR Code not found' });
    }

    const siblingQRs = await QRCode.find({ productId: qr.productId });
    const siblingIds = siblingQRs.map(s => s._id);

    let wallet = await QuotaWallet.findOne({ qrId: qr._id });
    if (!wallet) {
      wallet = await QuotaWallet.create({
        userId: qr.userId,
        qrId: qr._id,
        callBalance: 0,
        messageBalance: 0
      });
    }

    const numCalls = Number(calls) || 0;
    const numMessages = Number(messages) || 0;
    const numDays = Number(validityDays) || 0;

    wallet.callBalance += numCalls;
    wallet.messageBalance += numMessages;
    wallet.totalCallsPurchased += numCalls;
    wallet.totalMessagesPurchased += numMessages;
    await wallet.save();

    await QuotaWallet.updateMany(
      { qrId: { $in: siblingIds } },
      {
        callBalance: wallet.callBalance,
        messageBalance: wallet.messageBalance,
        totalCallsPurchased: wallet.totalCallsPurchased,
        totalMessagesPurchased: wallet.totalMessagesPurchased
      }
    );

    // Extend validity if days specified
    if (numDays > 0) {
      const currentExpiry = qr.expiryDate && new Date(qr.expiryDate) > new Date() ? new Date(qr.expiryDate) : new Date();
      const newExpiry = new Date(currentExpiry.getTime() + numDays * 24 * 60 * 60 * 1000);
      await QRCode.updateMany(
        { productId: qr.productId },
        { expiryDate: newExpiry, status: 'ACTIVE' }
      );
    }

    // Log call transaction
    if (numCalls > 0) {
      await QuotaTransaction.create({
        userId: qr.userId,
        qrId: qr._id,
        type: 'CREDIT',
        category: 'CALL',
        quantity: numCalls,
        balanceAfter: wallet.callBalance,
        source: source || 'ADMIN_GRANT',
        amountPaid: Number(amountPaid) || 0,
        paymentId: paymentId || (Number(amountPaid) > 0 ? `CASH_ADMIN_${Date.now()}` : undefined),
        performedBy: 'Super Admin',
        reason: reason || (source === 'PURCHASE_ADDON' ? `Purchased +${numCalls} Extra Calls` : `Admin Grant: +${numCalls} Calls`),
        notes
      });
    }

    // Log message transaction
    if (numMessages > 0) {
      await QuotaTransaction.create({
        userId: qr.userId,
        qrId: qr._id,
        type: 'CREDIT',
        category: 'MESSAGE',
        quantity: numMessages,
        balanceAfter: wallet.messageBalance,
        source: source || 'ADMIN_GRANT',
        amountPaid: numCalls === 0 ? (Number(amountPaid) || 0) : 0,
        paymentId: paymentId || (Number(amountPaid) > 0 ? `CASH_ADMIN_${Date.now()}` : undefined),
        performedBy: 'Super Admin',
        reason: reason || (source === 'PURCHASE_ADDON' ? `Purchased +${numMessages} Extra Messages` : `Admin Grant: +${numMessages} Messages`),
        notes
      });
    }

    res.json({
      success: true,
      message: `🎉 Successfully credited +${numCalls} Calls and +${numMessages} Messages!`,
      wallet
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.status = status;
    await user.save();
    res.json({ success: true, message: `User status set to ${status}`, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getVehicles = async (req, res) => {
  try {
    const rawVehicles = await Vehicle.find().populate('userId', 'name phone email address status').sort({ createdAt: -1 });
    const vehicles = await Promise.all(
      rawVehicles.map(async (v) => {
        const qrs = await QRCode.find({ vehicleId: v._id, isDeleted: { $ne: true } });
        return {
          ...v.toObject(),
          qrs: qrs.map(q => ({
            _id: q._id,
            productId: q.productId,
            copyCode: q.copyCode,
            publicToken: q.publicToken,
            qrType: q.qrType,
            qrFor: q.qrFor,
            status: q.status,
            expiryDate: q.expiryDate
          }))
        };
      })
    );
    res.json({ success: true, vehicles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getEmergencyAlerts = async (req, res) => {
  try {
    const alerts = await EmergencyAlert.find()
      .populate('userId', 'name phone')
      .populate('vehicleId', 'vehicleName vehicleBrand vehicleNumber')
      .sort({ createdAt: -1 });
    res.json({ success: true, alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 8. EXTRA TOP-UP PACKAGES (CRUD with SOFT DELETE & RESTORE)
// ==========================================
export const getPackages = async (req, res) => {
  try {
    const showDeleted = req.query.showDeleted === 'true';
    const filter = showDeleted ? { isDeleted: true } : { isDeleted: { $ne: true } };
    const packages = await QuotaPackage.find(filter).sort({ price: 1 });
    res.json({ success: true, packages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createPackage = async (req, res) => {
  try {
    const { name, category, quantity, price, durationDays = 365 } = req.body;
    const pkg = await QuotaPackage.create({
      name,
      category,
      quantity: Number(quantity),
      price: Number(price),
      durationDays: Number(durationDays)
    });
    res.json({ success: true, message: 'Package created successfully', package: pkg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, quantity, status } = req.body;

    const pkg = await QuotaPackage.findById(id);
    if (!pkg || pkg.isDeleted) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    if (name) pkg.name = name;
    if (price !== undefined) pkg.price = Number(price);
    if (quantity !== undefined) pkg.quantity = Number(quantity);
    if (status !== undefined) pkg.status = status;

    await pkg.save();
    res.json({ success: true, message: 'Package updated successfully', package: pkg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deletePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const pkg = await QuotaPackage.findById(id);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }
    pkg.isDeleted = true;
    pkg.deletedAt = new Date();
    await pkg.save();

    res.json({ success: true, message: 'Package soft-deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const restorePackage = async (req, res) => {
  try {
    const { id } = req.params;
    const pkg = await QuotaPackage.findById(id);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }
    pkg.isDeleted = false;
    pkg.deletedAt = null;
    await pkg.save();

    res.json({ success: true, message: 'Package restored successfully', package: pkg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 9. DYNAMIC SCAN REASONS (CRUD with SOFT DELETE & RESTORE)
// ==========================================
export const getScanReasons = async (req, res) => {
  try {
    const showDeleted = req.query.showDeleted === 'true';
    const { category, applicableTo } = req.query;
    const filter = showDeleted ? { isDeleted: true } : { isDeleted: { $ne: true } };
    
    if (category && category !== 'ALL') {
      filter.$or = [{ applicableTo: category }, { category: category }, { applicableTo: 'ALL' }];
    } else if (applicableTo && applicableTo !== 'ALL') {
      filter.$or = [{ applicableTo: applicableTo }, { category: applicableTo }, { applicableTo: 'ALL' }];
    }

    const reasons = await ScanReason.find(filter).sort({ order: 1, createdAt: 1 });
    res.json({ success: true, reasons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createScanReason = async (req, res) => {
  try {
    const {
      title,
      description,
      iconKey = 'alert',
      color = 'indigo',
      isOtherType = false,
      applicableTo = 'ALL',
      category
    } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Reason title is required' });
    }

    const targetCategory = applicableTo || category || 'ALL';
    const count = await ScanReason.countDocuments({ isDeleted: { $ne: true } });
    const reason = await ScanReason.create({
      title: title.trim(),
      description: description || '',
      iconKey,
      color,
      applicableTo: targetCategory,
      category: targetCategory,
      isOtherType: Boolean(isOtherType),
      order: count + 1,
      isActive: true
    });

    res.json({ success: true, message: 'Scan Reason created successfully', reason });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateScanReason = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, iconKey, color, isOtherType, isActive, order, applicableTo, category } = req.body;

    const reason = await ScanReason.findById(id);
    if (!reason || reason.isDeleted) {
      return res.status(404).json({ success: false, message: 'Reason not found' });
    }

    if (title !== undefined) reason.title = title.trim();
    if (description !== undefined) reason.description = description;
    if (iconKey !== undefined) reason.iconKey = iconKey;
    if (color !== undefined) reason.color = color;
    if (applicableTo !== undefined) {
      reason.applicableTo = applicableTo;
      reason.category = applicableTo;
    } else if (category !== undefined) {
      reason.applicableTo = category;
      reason.category = category;
    }
    if (isOtherType !== undefined) reason.isOtherType = isOtherType;
    if (isActive !== undefined) reason.isActive = isActive;
    if (order !== undefined) reason.order = Number(order);

    await reason.save();
    res.json({ success: true, message: 'Scan Reason updated successfully', reason });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteScanReason = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = await ScanReason.findById(id);
    if (!reason) {
      return res.status(404).json({ success: false, message: 'Reason not found' });
    }
    reason.isDeleted = true;
    reason.deletedAt = new Date();
    await reason.save();

    res.json({ success: true, message: 'Scan Reason soft-deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const restoreScanReason = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = await ScanReason.findById(id);
    if (!reason) {
      return res.status(404).json({ success: false, message: 'Reason not found' });
    }
    reason.isDeleted = false;
    reason.deletedAt = null;
    await reason.save();

    res.json({ success: true, message: 'Scan Reason restored successfully', reason });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 10. SYSTEM SETTINGS
// ==========================================
export const getSettings = async (req, res) => {
  try {
    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = await SystemSetting.create({
        initialCallQuota: 10,
        initialMessageQuota: 20,
        defaultValidityDays: 365,
        defaultRenewalPrice: 199,
        renewalBonusCalls: 10,
        renewalBonusMessages: 20
      });
    }
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const {
      initialCallQuota,
      initialMessageQuota,
      defaultValidityDays,
      defaultRenewalPrice,
      renewalBonusCalls,
      renewalBonusMessages,
      pushNotificationCooldownSeconds,
      pushNotificationRateLimitHours,
      pushNotificationRateLimitCount
    } = req.body;

    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = new SystemSetting();
    }

    const oldValues = { ...settings.toObject() };

    if (initialCallQuota !== undefined) settings.initialCallQuota = Number(initialCallQuota);
    if (initialMessageQuota !== undefined) settings.initialMessageQuota = Number(initialMessageQuota);
    if (defaultValidityDays !== undefined) settings.defaultValidityDays = Number(defaultValidityDays);
    if (defaultRenewalPrice !== undefined) settings.defaultRenewalPrice = Number(defaultRenewalPrice);
    if (renewalBonusCalls !== undefined) settings.renewalBonusCalls = Number(renewalBonusCalls);
    if (renewalBonusMessages !== undefined) settings.renewalBonusMessages = Number(renewalBonusMessages);
    if (pushNotificationCooldownSeconds !== undefined) settings.pushNotificationCooldownSeconds = Number(pushNotificationCooldownSeconds);
    if (pushNotificationRateLimitHours !== undefined) settings.pushNotificationRateLimitHours = Number(pushNotificationRateLimitHours);
    if (pushNotificationRateLimitCount !== undefined) settings.pushNotificationRateLimitCount = Number(pushNotificationRateLimitCount);

    await settings.save();

    await AuditLog.create({
      adminId: req.user._id,
      action: 'UPDATE_SYSTEM_SETTINGS',
      oldValue: oldValues,
      newValue: settings
    });

    res.json({
      success: true,
      message: 'System settings updated successfully! Note: Existing active users and sold QRs keep their current balances.',
      settings
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 11. PRODUCTS & STORE PRICING CRUD
// ==========================================
export const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }
    const result = await uploadToCloudinary(req.file.buffer, 'safedrive/products');
    res.json({
      success: true,
      imageUrl: result.secure_url,
      imagePublicId: result.public_id
    });
  } catch (error) {
    console.error('Image Upload Controller Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Image upload failed' });
  }
};

export const getAdminProducts = async (req, res) => {
  try {
    const products = await Product.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createAdminProduct = async (req, res) => {
  try {
    const {
      name,
      title,
      description = '',
      imageUrl = '',
      imagePublicId = '',
      price,
      originalPrice = 0,
      discount = 0,
      qrType = 'PHYSICAL',
      qrFor = 'Car',
      qrTypeId = null,
      initialCalls = 10,
      initialMessages = 20,
      validityDays = 365,
      renewalAmount = 199,
      features
    } = req.body;

    const prodTitle = (title || name || '').trim();
    if (!prodTitle || price === undefined || price === null || price === '') {
      return res.status(400).json({ success: false, message: 'Product Title and Price are required.' });
    }

    const cleanPrice = Number(price);
    const cleanOriginalPrice = originalPrice ? Number(originalPrice) : 0;
    const cleanDiscount = discount ? Number(discount) : (cleanOriginalPrice > cleanPrice ? cleanOriginalPrice - cleanPrice : 0);
    const discountPercent = cleanOriginalPrice > cleanPrice ? Math.round(((cleanOriginalPrice - cleanPrice) / cleanOriginalPrice) * 100) : 0;

    const product = await Product.create({
      name: prodTitle,
      title: prodTitle,
      description: description.trim(),
      imageUrl: imageUrl || '',
      imagePublicId: imagePublicId || '',
      price: cleanPrice,
      originalPrice: cleanOriginalPrice,
      discount: cleanDiscount,
      discountPercent,
      qrType: (qrType || 'PHYSICAL').toUpperCase() === 'DIGITAL' ? 'DIGITAL' : 'PHYSICAL',
      qrFor: (qrFor || 'Car').trim(),
      qrTypeId: qrTypeId || null,
      initialCalls: Number(initialCalls) || 0,
      initialMessages: Number(initialMessages) || 0,
      validityDays: Number(validityDays) || 365,
      renewalAmount: Number(renewalAmount) || 199,
      features: Array.isArray(features) && features.length ? features : [
        'Instant Masked Calling to Owner',
        'WhatsApp Emergency Direct Connect',
        'Anti-Harassment Plate Verification',
        'Cloud Protection Validity'
      ]
    });

    res.json({ success: true, message: 'Product created successfully', product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAdminProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.name || updates.title) {
      const prodTitle = (updates.title || updates.name).trim();
      updates.name = prodTitle;
      updates.title = prodTitle;
    }
    if (updates.price !== undefined) updates.price = Number(updates.price);
    if (updates.originalPrice !== undefined) updates.originalPrice = Number(updates.originalPrice);
    if (updates.initialCalls !== undefined) updates.initialCalls = Number(updates.initialCalls);
    if (updates.initialMessages !== undefined) updates.initialMessages = Number(updates.initialMessages);
    if (updates.validityDays !== undefined) updates.validityDays = Number(updates.validityDays);
    if (updates.renewalAmount !== undefined) updates.renewalAmount = Number(updates.renewalAmount);
    if (updates.qrType) updates.qrType = updates.qrType.toUpperCase() === 'DIGITAL' ? 'DIGITAL' : 'PHYSICAL';
    if (updates.qrFor) updates.qrFor = updates.qrFor.trim();

    if (updates.originalPrice && updates.price && updates.originalPrice > updates.price) {
      updates.discount = updates.originalPrice - updates.price;
      updates.discountPercent = Math.round(((updates.originalPrice - updates.price) / updates.originalPrice) * 100);
    }

    const product = await Product.findByIdAndUpdate(id, updates, { new: true });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // When renewalAmount is updated by Admin, dynamically sync across all matching QR codes
    if (updates.renewalAmount !== undefined && product.qrFor) {
      await QRCode.updateMany(
        { qrFor: product.qrFor },
        { renewalAmount: Number(updates.renewalAmount) }
      ).catch(() => {});
    }

    res.json({ success: true, message: 'Product updated successfully', product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdminProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Fetch orders where this product was purchased
    const orders = await Order.find({
      $or: [{ productId: product._id }, { productType: product.name }]
    }).populate('userId', 'name phone email').sort({ createdAt: -1 }).limit(100);

    res.json({
      success: true,
      product,
      stats: {
        soldKits: product.soldCount || orders.length,
        totalRevenue: product.totalRevenue || orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0)
      },
      orders
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteAdminProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    product.isDeleted = true;
    product.deletedAt = new Date();
    await product.save();
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 12. QR FORMATS (QR TYPE: PHYSICAL VS DIGITAL) CRUD
// ==========================================
export const getQRFormats = async (req, res) => {
  try {
    const showDeleted = req.query.showDeleted === 'true';
    const filter = showDeleted ? { isDeleted: true } : { isDeleted: { $ne: true } };
    const formats = await QRFormat.find(filter).sort({ createdAt: 1 });
    res.json({ success: true, formats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createQRFormat = async (req, res) => {
  try {
    const { name, type = 'PHYSICAL', description = '' } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'QR Type name is required' });
    }
    const format = await QRFormat.create({
      name: name.trim(),
      type: (type || 'PHYSICAL').toUpperCase() === 'DIGITAL' ? 'DIGITAL' : 'PHYSICAL',
      description: description.trim()
    });
    res.json({ success: true, message: 'QR Type created successfully', format });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateQRFormat = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, description, isActive } = req.body;
    const format = await QRFormat.findById(id);
    if (!format || format.isDeleted) {
      return res.status(404).json({ success: false, message: 'QR Type not found' });
    }
    if (name) format.name = name.trim();
    if (type) format.type = type.toUpperCase() === 'DIGITAL' ? 'DIGITAL' : 'PHYSICAL';
    if (description !== undefined) format.description = description.trim();
    if (isActive !== undefined) format.isActive = isActive;
    await format.save();
    res.json({ success: true, message: 'QR Type updated successfully', format });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteQRFormat = async (req, res) => {
  try {
    const { id } = req.params;
    const format = await QRFormat.findById(id);
    if (!format) {
      return res.status(404).json({ success: false, message: 'QR Type not found' });
    }
    format.isDeleted = true;
    format.deletedAt = new Date();
    await format.save();
    res.json({ success: true, message: 'QR Type soft-deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const restoreQRFormat = async (req, res) => {
  try {
    const { id } = req.params;
    const format = await QRFormat.findById(id);
    if (!format) {
      return res.status(404).json({ success: false, message: 'QR Type not found' });
    }
    format.isDeleted = false;
    format.deletedAt = null;
    await format.save();
    res.json({ success: true, message: 'QR Type restored successfully', format });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 14. ADMIN CUSTOMER ORDERS MANAGEMENT
// ==========================================
export const getAdminOrders = async (req, res) => {
  try {
    const { status, type, search, page = 1, limit = 50 } = req.query;
    const query = {};

    if (status && status !== 'ALL') {
      query.deliveryStatus = status;
    }
    if (type && type !== 'ALL') {
      query.productType = type;
    }
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { orderNumber: searchRegex },
        { customerName: searchRegex },
        { customerEmail: searchRegex },
        { customerPhone: searchRegex },
        { claimedProductId: searchRegex },
        { deliveryAddress: searchRegex }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalOrders = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate('userId', 'name phone email')
      .populate('allocatedQRIds', 'productId copyCode publicToken status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      orders,
      pagination: {
        total: totalOrders,
        page: parseInt(page),
        pages: Math.ceil(totalOrders / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAdminOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { deliveryStatus, courierPartner, trackingNumber, adminNotes } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (deliveryStatus) {
      order.deliveryStatus = deliveryStatus;
      if (deliveryStatus === 'DISPATCHED' || deliveryStatus === 'SHIPPED') {
        order.dispatchDate = order.dispatchDate || new Date();
      } else if (deliveryStatus === 'DELIVERED') {
        order.deliveryDate = order.deliveryDate || new Date();
      }
    }
    if (courierPartner !== undefined) order.courierPartner = courierPartner.trim();
    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber.trim();
    if (adminNotes !== undefined) order.adminNotes = adminNotes.trim();

    await order.save();
    res.json({ success: true, message: `Order marked as ${order.deliveryStatus}`, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdminOrderStats = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const physicalOrders = await Order.countDocuments({ productType: 'PHYSICAL' });
    const digitalOrders = await Order.countDocuments({ productType: 'DIGITAL' });
    const pendingDispatch = await Order.countDocuments({ productType: 'PHYSICAL', deliveryStatus: 'PROCESSING' });
    const dispatched = await Order.countDocuments({ deliveryStatus: { $in: ['DISPATCHED', 'SHIPPED'] } });
    const delivered = await Order.countDocuments({ deliveryStatus: 'DELIVERED' });
    const claimedQRs = await Order.countDocuments({ isClaimed: true });

    // Revenue Aggregation
    const revenueAgg = await Order.aggregate([
      { $match: { paymentStatus: 'PAID' } },
      { $group: { _id: null, totalRevenue: { $sum: '$amount' } } }
    ]);
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].totalRevenue : 0;

    res.json({
      success: true,
      stats: {
        totalOrders,
        physicalOrders,
        digitalOrders,
        pendingDispatch,
        dispatched,
        delivered,
        claimedQRs,
        totalRevenue
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 12. SCAN LOGS & HISTORY
// ==========================================
export const getScanLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, eventType, search } = req.query;
    const filter = {};

    if (eventType && eventType !== 'ALL') {
      filter.eventType = eventType;
    }

    if (search) {
      filter.$or = [
        { copyCode: { $regex: search, $options: 'i' } },
        { productId: { $regex: search, $options: 'i' } },
        { vehicleNumber: { $regex: search, $options: 'i' } },
        { callerPhone: { $regex: search, $options: 'i' } },
        { scannerPhone: { $regex: search, $options: 'i' } },
        { reason: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { ipAddress: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await ScanLog.countDocuments(filter);
    const logs = await ScanLog.find(filter)
      .populate('userId', 'name phone')
      .populate('vehicleId', 'vehicleBrand vehicleName vehicleNumber')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit, 10));

    res.json({
      success: true,
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / limit),
      logs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Master Admin Edit for QR / Kit Details
 * Admin can update ANY field on a QR/Kit including renewal price, status, validity, quotas, vehicle, and owner details
 */
export const updateAdminQRDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      qrFor,
      qrType,
      validityDays,
      renewalAmount,
      expiryDate,
      initialCalls,
      initialMessages,
      vehicleBrand,
      vehicleName,
      vehicleNumber,
      emergencyContacts
    } = req.body;

    let qr = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      qr = await QRCode.findById(id).populate('vehicleId');
    }
    if (!qr) {
      qr = await QRCode.findOne({ productId: id }).populate('vehicleId');
    }
    if (!qr) {
      qr = await QRCode.findOne({ copyCode: id }).populate('vehicleId');
    }
    if (!qr) {
      return res.status(404).json({ success: false, message: 'QR record not found' });
    }

    const updates = {};
    if (status) updates.status = status;
    if (qrFor) updates.qrFor = qrFor.trim();
    if (qrType) updates.qrType = qrType.toUpperCase() === 'DIGITAL' ? 'DIGITAL' : 'PHYSICAL';
    if (validityDays !== undefined) updates.validityDays = Number(validityDays);
    if (renewalAmount !== undefined) updates.renewalAmount = Number(renewalAmount);
    if (initialCalls !== undefined) updates.initialCalls = Number(initialCalls);
    if (initialMessages !== undefined) updates.initialMessages = Number(initialMessages);
    if (expiryDate) updates.expiryDate = new Date(expiryDate);

    // Update ALL sibling copies in this product kit
    await QRCode.updateMany(
      { productId: qr.productId },
      updates
    );

    // If vehicle details are provided and QR has a vehicle, update Vehicle
    let updatedVehicle = null;
    if (qr.vehicleId && (vehicleBrand || vehicleName || vehicleNumber || emergencyContacts)) {
      const vUpdates = {};
      if (vehicleBrand) vUpdates.vehicleBrand = vehicleBrand.trim();
      if (vehicleName) vUpdates.vehicleName = vehicleName.trim();
      if (vehicleNumber) vUpdates.vehicleNumber = vehicleNumber.toUpperCase().replace(/\s+/g, '');
      if (emergencyContacts && Array.isArray(emergencyContacts)) {
        vUpdates.emergencyContacts = emergencyContacts.filter(c => c.name && c.number);
      }
      updatedVehicle = await Vehicle.findByIdAndUpdate(qr.vehicleId._id || qr.vehicleId, vUpdates, { new: true });
    }

    // Audit Log
    AuditLog.create({
      action: 'ADMIN_UPDATE_QR_MASTER_DETAILS',
      targetId: qr.productId,
      newValue: { updates, vehicle: updatedVehicle },
      ip: req.ip || ''
    }).catch(() => {});

    const refreshedQR = await QRCode.findById(qr._id).populate('vehicleId');
    res.json({
      success: true,
      message: `QR Kit ${qr.productId} updated successfully by Admin!`,
      qr: refreshedQR,
      vehicle: updatedVehicle
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Master Admin Edit for Vehicle Details
 */
export const updateAdminVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleBrand, vehicleName, vehicleNumber, emergencyContacts, status } = req.body;

    const updates = {};
    if (vehicleBrand) updates.vehicleBrand = vehicleBrand.trim();
    if (vehicleName) updates.vehicleName = vehicleName.trim();
    if (vehicleNumber) updates.vehicleNumber = vehicleNumber.toUpperCase().replace(/\s+/g, '');
    if (emergencyContacts && Array.isArray(emergencyContacts)) {
      updates.emergencyContacts = emergencyContacts.filter(c => c.name && c.number);
    }
    if (status) updates.status = status;

    const vehicle = await Vehicle.findByIdAndUpdate(id, updates, { new: true });
    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    res.json({
      success: true,
      message: 'Vehicle updated successfully by Admin',
      vehicle
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Master Admin Edit for User Details
 */
export const updateAdminUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      whatsappNumber,
      gender,
      address,
      city,
      state,
      pincode,
      landmark,
      role,
      status
    } = req.body;

    let user = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      user = await User.findById(id);
    }
    if (!user && phone) {
      user = await User.findOne({ phone: phone.trim() });
    }
    if (!user) {
      const qr = await QRCode.findOne({ $or: [{ productId: id }, { publicToken: id }] });
      if (qr && qr.userId) {
        user = await User.findById(qr.userId);
      }
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name) user.name = name.trim();
    if (email) user.email = email.trim().toLowerCase();
    if (phone) user.phone = phone.trim();
    if (whatsappNumber) user.whatsappNumber = whatsappNumber.trim();
    if (gender) user.gender = gender;
    if (address) user.address = address.trim();
    if (city) user.city = city.trim();
    if (state) user.state = state.trim();
    if (pincode) user.pincode = pincode.trim();
    if (landmark) user.landmark = landmark.trim();
    if (role) user.role = role;
    if (status) user.status = status;

    await user.save();

    // Also sync QRCode activatedByName & activatedByPhone for linked QRs
    await QRCode.updateMany(
      { userId: user._id },
      {
        activatedByName: user.name,
        activatedByPhone: user.phone,
        activationPhone: user.phone
      }
    );

    res.json({
      success: true,
      message: 'User details updated successfully by Admin',
      user
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get all QR End-Users (Activated QR vehicle holders)
 */
export const getQRUsers = async (req, res) => {
  try {
    const activeQRs = await QRCode.find({ status: 'ACTIVE', isDeleted: { $ne: true } })
      .populate('userId', '-password')
      .populate('buyerId', '-password')
      .populate('vehicleId')
      .populate('orderId')
      .sort({ activationDate: -1 });

    const kitMap = {};
    for (const q of activeQRs) {
      if (!kitMap[q.productId]) {
        kitMap[q.productId] = {
          productId: q.productId,
          batchId: q.batchId,
          qrFor: q.qrFor || 'Car',
          qrType: q.qrType || 'PHYSICAL',
          status: q.status,
          user: q.userId ? {
            _id: q.userId._id,
            name: q.activatedByName || q.userId.name,
            phone: q.activatedByPhone || q.userId.phone,
            whatsappNumber: q.userId.whatsappNumber || q.activatedByPhone || q.userId.phone,
            address: q.userId.address,
            status: q.userId.status
          } : {
            name: q.activatedByName || 'Activated User',
            phone: q.activatedByPhone || q.activationPhone,
            status: 'ACTIVE'
          },
          buyer: q.buyerId ? {
            _id: q.buyerId._id,
            name: q.buyerId.name,
            phone: q.buyerId.phone,
            email: q.buyerId.email
          } : null,
          vehicle: q.vehicleId ? {
            _id: q.vehicleId._id,
            vehicleName: q.vehicleId.vehicleName,
            vehicleBrand: q.vehicleId.vehicleBrand,
            vehicleNumber: q.vehicleId.vehicleNumber,
            emergencyContacts: q.vehicleId.emergencyContacts || []
          } : null,
          activationDate: q.activationDate,
          expiryDate: q.expiryDate,
          copies: [],
          primaryQRId: q._id,
          primaryPublicToken: q.publicToken,
          wallet: null
        };
      }
      kitMap[q.productId].copies.push({
        _id: q._id,
        copyCode: q.copyCode,
        publicToken: q.publicToken
      });
    }

    const qrUserKits = Object.values(kitMap);

    for (const kit of qrUserKits) {
      // If buyer wasn't directly linked on QRCode, resolve from claimed Order
      if (!kit.buyer) {
        const order = await Order.findOne({
          $or: [
            { claimedProductId: kit.productId },
            { 'allocatedQRIds': { $in: kit.copies.map(c => c._id) } }
          ]
        }).populate('userId', 'name phone email');

        if (order && order.userId) {
          kit.buyer = {
            _id: order.userId._id,
            name: order.userId.name,
            phone: order.userId.phone,
            email: order.userId.email
          };
        }
      }

      const wallet = await QuotaWallet.findOne({ qrId: kit.primaryQRId });
      kit.wallet = wallet ? {
        callBalance: wallet.callBalance,
        messageBalance: wallet.messageBalance,
        totalCallsUsed: wallet.totalCallsUsed,
        totalMessagesUsed: wallet.totalMessagesUsed
      } : null;
    }

    res.json({
      success: true,
      totalQRUsers: qrUserKits.length,
      qrUsers: qrUserKits
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get detailed view for a single QR User / Vehicle Owner
 */
export const getQRUserById = async (req, res) => {
  try {
    const { id } = req.params;
    let qrUser = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      qrUser = await User.findById(id).select('-password');
    }

    // Find active QRs for this user or matching productId
    let activeQRs = [];
    if (qrUser) {
      activeQRs = await QRCode.find({
        $or: [{ userId: qrUser._id }, { activatedByPhone: qrUser.phone }],
        isDeleted: { $ne: true }
      })
        .populate('vehicleId')
        .populate('buyerId', '-password')
        .populate('userId', '-password');
    } else {
      activeQRs = await QRCode.find({ productId: id, isDeleted: { $ne: true } })
        .populate('vehicleId')
        .populate('buyerId', '-password')
        .populate('userId', '-password');
      if (activeQRs.length > 0 && activeQRs[0].userId) {
        qrUser = activeQRs[0].userId;
      }
    }

    if (!qrUser && activeQRs.length === 0) {
      return res.status(404).json({ success: false, message: 'QR User not found' });
    }

    if (!qrUser && activeQRs.length > 0) {
      const q0 = activeQRs[0];
      qrUser = {
        _id: q0._id,
        name: q0.activatedByName || 'Driver / Owner',
        phone: q0.activatedByPhone || q0.activationPhone || 'N/A',
        userType: 'QR_USER',
        status: 'ACTIVE'
      };
    }

    // Group into Unique Kit Sets
    const kitMap = {};
    for (const q of activeQRs) {
      if (!kitMap[q.productId]) {
        kitMap[q.productId] = {
          productId: q.productId,
          batchId: q.batchId,
          qrFor: q.qrFor || 'Car',
          qrType: q.qrType || 'PHYSICAL',
          status: q.status,
          vehicle: q.vehicleId ? {
            _id: q.vehicleId._id,
            vehicleName: q.vehicleId.vehicleName,
            vehicleBrand: q.vehicleId.vehicleBrand,
            vehicleNumber: q.vehicleId.vehicleNumber,
            emergencyContacts: q.vehicleId.emergencyContacts || []
          } : null,
          buyer: q.buyerId ? {
            _id: q.buyerId._id,
            name: q.buyerId.name,
            phone: q.buyerId.phone,
            email: q.buyerId.email
          } : null,
          activatedByName: q.activatedByName,
          activatedByPhone: q.activatedByPhone,
          activationDate: q.activationDate,
          expiryDate: q.expiryDate,
          renewalAmount: q.renewalAmount || 199,
          copies: [],
          primaryQRId: q._id,
          primaryPublicToken: q.publicToken,
          wallet: null,
          addons: []
        };
      }
      kitMap[q.productId].copies.push({
        _id: q._id,
        copyCode: q.copyCode,
        publicToken: q.publicToken
      });
    }

    const kits = Object.values(kitMap);
    for (const kit of kits) {
      if (!kit.buyer) {
        const order = await Order.findOne({
          $or: [
            { claimedProductId: kit.productId },
            { 'allocatedQRIds': { $in: kit.copies.map(c => c._id) } }
          ]
        }).populate('userId', 'name phone email');

        if (order && order.userId) {
          kit.buyer = {
            _id: order.userId._id,
            name: order.userId.name,
            phone: order.userId.phone,
            email: order.userId.email
          };
          kit.orderNumber = order.orderNumber;
        }
      }

      const wallet = await QuotaWallet.findOne({ qrId: kit.primaryQRId });
      kit.wallet = wallet ? {
        callBalance: wallet.callBalance,
        messageBalance: wallet.messageBalance,
        totalCallsUsed: wallet.totalCallsUsed,
        totalMessagesUsed: wallet.totalMessagesUsed,
        totalCallsPurchased: wallet.totalCallsPurchased,
        totalMessagesPurchased: wallet.totalMessagesPurchased
      } : null;

      // Addons
      kit.addons = await QuotaTransaction.find({
        $or: [{ userId: qrUser._id }, { productId: kit.productId }],
        type: 'CREDIT',
        source: 'ADDON_PURCHASE'
      }).sort({ createdAt: -1 });
    }

    // Ledger for this QR user
    const quotaLedger = await QuotaTransaction.find({
      $or: [
        { userId: qrUser._id },
        { qrId: { $in: activeQRs.map(q => q._id) } },
        { productId: { $in: kits.map(k => k.productId) } }
      ]
    }).populate('qrId', 'productId copyCode').sort({ createdAt: -1 });

    // Payments made by this QR user (Renewals, Addons, Top-ups)
    const payments = await Payment.find({
      $or: [
        { userId: qrUser._id },
        { customerPhone: qrUser.phone },
        { 'metadata.productId': { $in: kits.map(k => k.productId) } },
        { 'metadata.qrId': { $in: activeQRs.map(q => q._id) } }
      ]
    }).sort({ createdAt: -1 });

    // Vehicles
    const vehicles = await Vehicle.find({
      $or: [
        { userId: qrUser._id },
        { _id: { $in: activeQRs.map(q => q.vehicleId?._id || q.vehicleId).filter(Boolean) } }
      ]
    });

    res.json({
      success: true,
      qrUser,
      kits,
      vehicles,
      payments,
      quotaLedger
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 19. CONTACT INQUIRIES & MESSAGES
// ==========================================
export const getContactMessages = async (req, res) => {
  try {
    const { status, search } = req.query;
    let filter = { isDeleted: { $ne: true } };

    if (status && status !== 'ALL') {
      if (status === 'UNREAD') {
        filter.isRead = { $ne: true };
      } else if (status === 'READ') {
        filter.isRead = true;
      }
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { name: regex },
        { phone: regex },
        { email: regex },
        { message: regex },
        { subject: regex }
      ];
    }

    const messages = await ContactInquiry.find(filter).sort({ createdAt: -1 });
    const unreadCount = await ContactInquiry.countDocuments({ isDeleted: { $ne: true }, isRead: { $ne: true } });
    const totalCount = await ContactInquiry.countDocuments({ isDeleted: { $ne: true } });

    res.json({
      success: true,
      messages,
      unreadCount,
      totalCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const markContactMessageRead = async (req, res) => {
  try {
    const { id } = req.params;
    const { isRead } = req.body;

    const message = await ContactInquiry.findById(id);
    if (!message || message.isDeleted) {
      return res.status(404).json({ success: false, message: 'Contact message not found' });
    }

    const newIsRead = isRead !== undefined ? Boolean(isRead) : true;
    message.isRead = newIsRead;
    message.status = newIsRead ? 'READ' : 'UNREAD';
    if (newIsRead) {
      message.readAt = new Date();
    }
    await message.save();

    res.json({
      success: true,
      message: `Message marked as ${newIsRead ? 'Read' : 'Unread'}`,
      data: message
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteContactMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await ContactInquiry.findById(id);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Contact message not found' });
    }

    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();

    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
