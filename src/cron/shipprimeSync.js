import cron from 'node-cron';
import Order from '../models/Order.js';
import * as shipprimeService from '../utils/shipprimeService.js';

export const initShipprimeCron = () => {
  // Run every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    console.log('Running ShipPrime Tracking Sync Cron Job...');
    try {
      // Find orders that are dispatched or returned
      const activeOrders = await Order.find({
        deliveryStatus: { $in: ['DISPATCHED', 'RETURNED'] },
        trackingNumber: { $exists: true, $ne: '' }
      });

      if (activeOrders.length === 0) {
        console.log('No active ShipPrime orders to track.');
        return;
      }

      // Group by awb
      const awbToOrder = {};
      const awbList = activeOrders.map(o => {
        awbToOrder[o.trackingNumber] = o;
        return o.trackingNumber;
      });

      // Track in batches (let's say 50 at a time to not overload)
      const batchSize = 50;
      for (let i = 0; i < awbList.length; i += batchSize) {
        const batchAwbs = awbList.slice(i, i + batchSize);
        const trackRes = await shipprimeService.trackShipments(batchAwbs);
        
        if (trackRes.success && trackRes.results) {
          for (const result of trackRes.results) {
            const order = awbToOrder[result.awb];
            if (!order) continue;

            const spStatus = result.status?.toUpperCase();
            
            // Map ShipPrime status to SafeDrive status
            let updated = false;
            if (spStatus === 'DELIVERED' && order.deliveryStatus !== 'DELIVERED') {
              order.deliveryStatus = 'DELIVERED';
              updated = true;
            } else if (spStatus === 'RTO' && order.deliveryStatus !== 'RETURNED') {
              order.deliveryStatus = 'RETURNED';
              updated = true;
            } else if (spStatus === 'CANCELLED' && order.deliveryStatus !== 'CANCELLED') {
              order.deliveryStatus = 'CANCELLED';
              updated = true;
            }

            if (updated) {
              await order.save();
              console.log(`Order ${order.orderNumber} status auto-updated to ${order.deliveryStatus}`);
            }
          }
        }
      }
      console.log('ShipPrime Tracking Sync completed successfully.');
    } catch (err) {
      console.error('ShipPrime Tracking Sync Failed:', err);
    }
  });
};
