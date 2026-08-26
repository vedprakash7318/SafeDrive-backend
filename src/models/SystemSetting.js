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
  pushNotificationRateLimitCount: { type: Number, default: 10 }
}, { timestamps: true });

export default mongoose.model('SystemSetting', systemSettingSchema);
