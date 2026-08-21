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
import ScanReason from '../models/ScanReason.js';
import SystemSetting from '../models/SystemSetting.js';

// ==========================================
// 1. STATS & ANALYTICS
// ==========================================
export const getStats = async (req, res) => {
  try {
    const totalQRs = await QRCode.countDocuments({ isDeleted: { $ne: true } });
    const activeQRs = await QRCode.countDocuments({ status: 'ACTIVE', isDeleted: { $ne: true } });
    const inStockQRs = await QRCode.countDocuments({ status: { $in: ['GENERATED', 'IN STOCK'] }, isDeleted: { $ne: true } });
    const expiredQRs = await QRCode.countDocuments({ status: 'EXPIRED', isDeleted: { $ne: true } });
    const suspendedQRs = await QRCode.countDocuments({ status: 'SUSPENDED', isDeleted: { $ne: true } });

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
const DEFAULT_QR_TYPES = [
  { name: 'Standard Sticker' },
  { name: 'Metal Card' },
  { name: 'Windshield Tag' },
  { name: 'Two-Wheeler Badge' }
];

export const getQRTypes = async (req, res) => {
  try {
    const showDeleted = req.query.showDeleted === 'true';
    const totalEver = await QRType.countDocuments();
    if (totalEver === 0) {
      await QRType.insertMany(DEFAULT_QR_TYPES);
    }
    const filter = showDeleted ? { isDeleted: true } : { isDeleted: { $ne: true } };
    const types = await QRType.find(filter).sort({ createdAt: 1 });
    res.json({ success: true, types });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createQRType = async (req, res) => {
  try {
    const { name, copiesPerSet = 2 } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'QR Type name is required' });
    }

    const cleanName = name.trim();
    const qrType = await QRType.create({
      name: cleanName,
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
    const { name, copiesPerSet } = req.body;

    const qrType = await QRType.findById(id);
    if (!qrType || qrType.isDeleted) {
      return res.status(404).json({ success: false, message: 'QR Type not found' });
    }

    if (name) qrType.name = name.trim();
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
    const totalEver = await QRTag.countDocuments();
    if (totalEver === 0) {
      await QRTag.insertMany([
        { name: 'DEFAULT-BATCH', description: 'General Distribution Inventory' },
        { name: 'DEALER-NORTH', description: 'North Zone Dealers & Showrooms' },
        { name: 'ONLINE-PROMO', description: 'Online Sales & Direct Website Orders' }
      ]);
    }
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
export const getNextSequenceNumber = async (req, res) => {
  try {
    const lastQR = await QRCode.findOne({ productId: /^SD\d+$/ }).sort({ createdAt: -1 });

    let nextNumber = 1;
    if (lastQR && lastQR.productId) {
      const match = lastQR.productId.match(/\d+$/);
      if (match) {
        nextNumber = parseInt(match[0], 10) + 1;
      }
    }

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
// 5. BATCH QR CODE GENERATION
// ==========================================
export const generateQRBatch = async (req, res) => {
  try {
    const {
      quantity = 10,
      tag = 'DEFAULT-BATCH',
      qrTypeName = 'Standard Sticker',
      qrTypeId,
      initialCalls = 10,
      initialMessages = 20,
      validityDays = 365,
      renewalAmount = 199
    } = req.body;

    const count = parseInt(quantity, 10);
    if (isNaN(count) || count <= 0 || count > 500) {
      return res.status(400).json({ success: false, message: 'Quantity must be between 1 and 500' });
    }

    // Auto-calculate start number from database
    const lastQR = await QRCode.findOne({ productId: /^SD\d+$/ }).sort({ createdAt: -1 });
    let startNum = 1;
    if (lastQR && lastQR.productId) {
      const match = lastQR.productId.match(/\d+$/);
      if (match) {
        startNum = parseInt(match[0], 10) + 1;
      }
    }

    // Determine copiesPerSet from selected QR Type
    let copiesPerSet = 2;
    let chosenQRTypeDoc = null;
    if (qrTypeId) {
      chosenQRTypeDoc = await QRType.findById(qrTypeId);
    } else if (qrTypeName) {
      chosenQRTypeDoc = await QRType.findOne({ name: qrTypeName, isDeleted: { $ne: true } });
    }

    if (chosenQRTypeDoc && chosenQRTypeDoc.copiesPerSet) {
      copiesPerSet = chosenQRTypeDoc.copiesPerSet;
    }

    const generatedQRs = [];

    for (let i = 0; i < count; i++) {
      const num = startNum + i;
      const numFormatted = String(num).padStart(3, '0');
      const productId = `SD${numFormatted}`;

      // Generate C1..C(copiesPerSet)
      for (let c = 1; c <= copiesPerSet; c++) {
        const token = crypto.randomBytes(16).toString('hex');
        const copy = new QRCode({
          productId,
          batchId: tag,
          qrType: qrTypeName,
          qrTypeId: chosenQRTypeDoc?._id || qrTypeId || null,
          copyCode: `${productId}C${c}`,
          publicToken: token,
          status: 'IN STOCK',
          initialCalls: Number(initialCalls),
          initialMessages: Number(initialMessages),
          validityDays: Number(validityDays),
          renewalAmount: Number(renewalAmount)
        });
        generatedQRs.push(copy);
      }
    }

    await QRCode.insertMany(generatedQRs);

    // Update sets counter on Tag and QRType
    await QRTag.findOneAndUpdate({ name: tag }, { $inc: { totalSets: count } });
    if (chosenQRTypeDoc) {
      await QRType.findByIdAndUpdate(chosenQRTypeDoc._id, { $inc: { totalSets: count } });
    } else if (qrTypeId) {
      await QRType.findByIdAndUpdate(qrTypeId, { $inc: { totalSets: count } });
    } else {
      await QRType.findOneAndUpdate({ name: qrTypeName }, { $inc: { totalSets: count } });
    }

    await AuditLog.create({
      adminId: req.user._id,
      action: 'GENERATE_QR_BATCH',
      newValue: {
        tag,
        qrType: qrTypeName,
        copiesPerSet,
        quantity: count,
        totalCopies: count * copiesPerSet,
        startNumber: startNum,
        endNumber: startNum + count - 1,
        initialCalls,
        initialMessages,
        validityDays,
        renewalAmount
      }
    });

    res.json({
      success: true,
      message: `Successfully generated ${count} QR sets (${count * copiesPerSet} stickers [C1-C${copiesPerSet}]: SD${String(startNum).padStart(3, '0')} to SD${String(startNum + count - 1).padStart(3, '0')}) with Type [${qrTypeName}] and Tag [${tag}].`,
      generatedCount: generatedQRs.length
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
    const { validityDays = 365, bonusCalls = 10, bonusMessages = 20, reason = 'Admin Manual Renewal' } = req.body;

    const qr = await QRCode.findById(id);
    if (!qr || qr.isDeleted) {
      return res.status(404).json({ success: false, message: 'QR Code not found' });
    }

    const now = new Date();
    const currentExpiry = qr.expiryDate && new Date(qr.expiryDate) > now ? new Date(qr.expiryDate) : now;
    const newExpiry = new Date(currentExpiry.getTime() + validityDays * 24 * 60 * 60 * 1000);

    qr.expiryDate = newExpiry;
    qr.status = 'ACTIVE';
    await qr.save();

    let wallet = await QuotaWallet.findOne({ qrId: qr._id });
    if (!wallet) {
      wallet = new QuotaWallet({
        userId: qr.userId,
        vehicleId: qr.vehicleId,
        qrId: qr._id,
        callBalance: 0,
        messageBalance: 0
      });
    }

    wallet.callBalance += Number(bonusCalls);
    wallet.messageBalance += Number(bonusMessages);
    await wallet.save();

    res.json({
      success: true,
      message: `QR renewed successfully for ${validityDays} days. Existing balance preserved + ${bonusCalls} calls and ${bonusMessages} messages added.`,
      newExpiryDate: newExpiry,
      currentBalance: {
        calls: wallet.callBalance,
        messages: wallet.messageBalance
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// 7. USERS & VEHICLES MANAGEMENT
// ==========================================
export const getUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'USER' }).select('-password').sort({ createdAt: -1 });

    const userDetails = await Promise.all(
      users.map(async (u) => {
        const vehicles = await Vehicle.find({ userId: u._id });
        const qrs = await QRCode.find({ userId: u._id, isDeleted: { $ne: true } });
        const wallet = await QuotaWallet.findOne({ userId: u._id });
        return {
          ...u.toObject(),
          vehicles,
          qrs,
          wallet
        };
      })
    );

    res.json({ success: true, users: userDetails });
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
    const vehicles = await Vehicle.find().populate('userId', 'name phone status').sort({ createdAt: -1 });
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
    const totalEver = await QuotaPackage.countDocuments();
    if (totalEver === 0) {
      await QuotaPackage.insertMany([
        { name: '10 Extra Calls', category: 'CALL', quantity: 10, price: 49 },
        { name: '25 Extra Calls Booster', category: 'CALL', quantity: 25, price: 99 },
        { name: '50 Extra Calls Mega Pack', category: 'CALL', quantity: 50, price: 179 },
        { name: '20 Extra Messages Top-Up', category: 'MESSAGE', quantity: 20, price: 29 },
        { name: '50 Extra Messages Pack', category: 'MESSAGE', quantity: 50, price: 59 },
        { name: '100 Extra Messages Mega Pack', category: 'MESSAGE', quantity: 100, price: 99 }
      ]);
    }
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
const DEFAULT_REASONS = [
  { title: 'Wrong parking', iconKey: 'ban', color: 'red', isOtherType: false, order: 1 },
  { title: 'Window or gate unlocked', iconKey: 'unlock', color: 'green', isOtherType: false, order: 2 },
  { title: 'Car is going', iconKey: 'car', color: 'blue', isOtherType: false, order: 3 },
  { title: 'Accident', iconKey: 'alert', color: 'rose', isOtherType: false, order: 4 },
  { title: 'Other (Please specify)', iconKey: 'other', color: 'purple', isOtherType: true, order: 5 }
];

export const getScanReasons = async (req, res) => {
  try {
    const showDeleted = req.query.showDeleted === 'true';
    const totalEver = await ScanReason.countDocuments();
    if (totalEver === 0) {
      await ScanReason.insertMany(DEFAULT_REASONS);
    }
    const filter = showDeleted ? { isDeleted: true } : { isDeleted: { $ne: true } };
    const reasons = await ScanReason.find(filter).sort({ order: 1, createdAt: 1 });
    res.json({ success: true, reasons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createScanReason = async (req, res) => {
  try {
    const { title, description, iconKey = 'alert', color = 'indigo', isOtherType = false } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Reason title is required' });
    }

    const count = await ScanReason.countDocuments({ isDeleted: { $ne: true } });
    const reason = await ScanReason.create({
      title: title.trim(),
      description: description || '',
      iconKey,
      color,
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
    const { title, description, iconKey, color, isOtherType, isActive, order } = req.body;

    const reason = await ScanReason.findById(id);
    if (!reason || reason.isDeleted) {
      return res.status(404).json({ success: false, message: 'Reason not found' });
    }

    if (title !== undefined) reason.title = title.trim();
    if (description !== undefined) reason.description = description;
    if (iconKey !== undefined) reason.iconKey = iconKey;
    if (color !== undefined) reason.color = color;
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
      renewalBonusMessages
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
