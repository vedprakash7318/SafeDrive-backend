import mongoose from 'mongoose';

const systemSettingSchema = new mongoose.Schema({
  initialCallQuota: { type: Number, default: 10 },
  initialMessageQuota: { type: Number, default: 20 },
  defaultValidityDays: { type: Number, default: 365 },
  defaultRenewalPrice: { type: Number, default: 199 },
  renewalBonusCalls: { type: Number, default: 10 },
  renewalBonusMessages: { type: Number, default: 20 },
  supportPhone: { type: String, default: '+91 9999999999' },
  supportEmail: { type: String, default: 'support@safedrive.in' },
  pushNotificationCooldownSeconds: { type: Number, default: 30 },
  pushNotificationRateLimitHours: { type: Number, default: 12 },
  pushNotificationRateLimitCount: { type: Number, default: 10 },
  callCooldownSeconds: { type: Number, default: 60 },
  callRateLimitHours: { type: Number, default: 12 },
  callRateLimitCount: { type: Number, default: 5 },
  messageCooldownSeconds: { type: Number, default: 30 },
  messageRateLimitHours: { type: Number, default: 12 },
  messageRateLimitCount: { type: Number, default: 10 },
  sosCooldownSeconds: { type: Number, default: 60 },
  sosRateLimitHours: { type: Number, default: 12 },
  sosRateLimitCount: { type: Number, default: 3 },
  isCODEnabled: { type: Boolean, default: true },
  partnerDashboardMessage: { type: String, default: 'Welcome to your new Partner Portal. Manage your inventory, activate tags for your customers, and track your sales all in one place.' },
  partnerShopMessage: { type: String, default: 'Welcome to our partner shop. Here you can buy tags and other accessories.' },
  websiteOfferText: { type: String, default: 'Smart Vehicle QR Safety Tag at just ₹299' }
}, { timestamps: true });

export default mongoose.model('SystemSetting', systemSettingSchema);
