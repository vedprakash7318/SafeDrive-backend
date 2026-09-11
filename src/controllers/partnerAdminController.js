import PartnerProduct from '../models/PartnerProduct.js';
import PartnerOrder from '../models/PartnerOrder.js';
import QRCode from '../models/QRCode.js';
import { createForwardShipment, cancelForwardShipment, createReturnShipment } from '../utils/shipprimeService.js';
import { sendOrderDispatchEmail } from '../utils/emailService.js';

// --- Partner Products (Admin Management) ---

export const createPartnerProduct = async (req, res) => {
  try {
    const { name, category, description, imageUrl, imagePublicId, packages, isActive } = req.body;
    const newProduct = new PartnerProduct({ name, category, description, imageUrl, imagePublicId, packages, isActive });
    await newProduct.save();
    res.status(201).json({ success: true, message: 'Partner product created successfully', data: newProduct });
  } catch (error) {
    console.error('Error in createPartnerProduct:', error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

export const getPartnerProducts = async (req, res) => {
  try {
    const products = await PartnerProduct.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.error('Error in getPartnerProducts:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const updatePartnerProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProduct = await PartnerProduct.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedProduct) return res.status(404).json({ success: false, message: 'Product not found' });
    res.status(200).json({ success: true, message: 'Product updated', data: updatedProduct });
  } catch (error) {
    console.error('Error in updatePartnerProduct:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const deletePartnerProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedProduct = await PartnerProduct.findByIdAndDelete(id);
    if (!deletedProduct) return res.status(404).json({ success: false, message: 'Product not found' });
    res.status(200).json({ success: true, message: 'Product deleted' });
  } catch (error) {
    console.error('Error in deletePartnerProduct:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// --- Partner Orders (Admin Management) ---

export const getPartnerOrders = async (req, res) => {
  try {
    const orders = await PartnerOrder.find().populate('partnerId', 'name email phone').populate('assignedTagIds', 'productId copyCode').sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    console.error('Error in getPartnerOrders:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getAvailablePartnerTags = async (req, res) => {
  try {
    const { category, limit = 100 } = req.query;
    if (!category) {
      return res.status(400).json({ success: false, message: 'Category is required' });
    }
    
    // Fetch available physical tags matching the category, must be printed
    const tags = await QRCode.find({
      qrFor: category,
      qrType: 'PHYSICAL',
      status: 'IN STOCK',
      isPrinted: true
    }).select('_id productId copyCode qrFor batchId').limit(parseInt(limit, 10));
    
    res.status(200).json({ success: true, tags });
  } catch (error) {
    console.error('Error in getAvailablePartnerTags:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePartnerOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus, courierPartner, trackingNumber, trackingLink, paymentStatus, adminNotes, assignedTagIds } = req.body;
    
    const order = await PartnerOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (orderStatus) order.orderStatus = orderStatus;
    if (courierPartner !== undefined) order.courierPartner = courierPartner;
    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
    if (trackingLink !== undefined) order.trackingLink = trackingLink;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    if (adminNotes !== undefined) order.adminNotes = adminNotes;
    
    // Save assigned tags if provided during dispatch
    if (assignedTagIds && Array.isArray(assignedTagIds)) {
      order.assignedTagIds = assignedTagIds;
    }

    if (orderStatus === 'DISPATCHED' || orderStatus === 'SHIPPED') {
      order.dispatchDate = order.dispatchDate || new Date();
      
      // Update assigned QRs to SOLD status when dispatched
      if (order.assignedTagIds && order.assignedTagIds.length > 0) {
        await QRCode.updateMany(
          { _id: { $in: order.assignedTagIds } },
          { $set: { status: 'SOLD' } }
        );
      }

      // Auto-generate AWB if not post office and no tracking yet
      if (!order.trackingNumber && !trackingNumber && courierPartner !== 'Post Office') {
        try {
          const shipData = await createForwardShipment(order);
          if (shipData.success) {
            order.trackingNumber = shipData.awb;
            order.courierPartner = shipData.courier;
            
            try {
              const cloudinary = (await import('../utils/cloudinary.js')).default;
              if (shipData.labelUrl && !shipData.labelUrl.includes('w3.org')) {
                const uploadRes = await cloudinary.uploader.upload(shipData.labelUrl, {
                  folder: 'safedrive/receipts',
                  resource_type: 'auto'
                });
                order.shippingLabelUrl = uploadRes.secure_url;
              } else {
                order.shippingLabelUrl = shipData.labelUrl;
              }
            } catch (uploadErr) {
              console.error('Error uploading ShipPrime label to Cloudinary:', uploadErr);
              order.shippingLabelUrl = shipData.labelUrl;
            }
          }
        } catch (shipErr) {
          console.error('ShipPrime AWB Error:', shipErr.response ? shipErr.response.data : shipErr.message);
          return res.status(400).json({ success: false, message: `ShipPrime Error: ${shipErr.message}` });
        }
      }
    }

    if (orderStatus === 'DELIVERED') {
      order.deliveryDate = order.deliveryDate || new Date();
      
      // Auto-assign the selected QRs to the dealer's inventory
      if (order.assignedTagIds && order.assignedTagIds.length > 0) {
        await QRCode.updateMany(
          { _id: { $in: order.assignedTagIds } },
          { 
            $set: { 
              status: 'ASSIGNED_TO_DEALER',
              dealerId: order.partnerId 
            } 
          }
        );
      }
    }

    await order.save();

    if (orderStatus === 'DISPATCHED' || orderStatus === 'SHIPPED') {
      try {
        if (order.partnerEmail) {
          await sendOrderDispatchEmail(order.partnerEmail, order.partnerName, order.orderNumber, {
            courierName: order.courierPartner,
            trackingNumber: order.trackingNumber,
            trackingLink: order.trackingLink
          });
        }
      } catch (emailErr) {
        console.error('Failed to send dispatch email to partner:', emailErr);
      }
    }

    res.status(200).json({ success: true, message: 'Order status updated', data: order });
  } catch (error) {
    console.error('Error in updatePartnerOrderStatus:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const cancelShipPrimePartnerOrder = async (req, res) => {
  try {
    const order = await PartnerOrder.findById(req.params.id);
    if (!order || !order.trackingNumber) {
      return res.status(400).json({ success: false, message: 'Order or AWB not found.' });
    }
    const result = await cancelForwardShipment(order.trackingNumber);
    if (result.success) {
      order.orderStatus = 'CANCELLED';
      order.trackingNumber = 'CANCELLED-' + order.trackingNumber;
      await order.save();
      return res.status(200).json({ success: true, message: 'Shipment cancelled successfully' });
    }
  } catch (error) {
    console.error('Error cancelling partner shipment:', error);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};

export const returnShipPrimePartnerOrder = async (req, res) => {
  try {
    const order = await PartnerOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
    
    const result = await createReturnShipment(order);
    if (result.success) {
      order.orderStatus = 'RETURNED';
      order.returnTrackingNumber = result.awb;
      await order.save();
      return res.status(200).json({ success: true, message: 'Return shipment initiated', data: result });
    }
  } catch (error) {
    console.error('Error initiating return partner shipment:', error);
    res.status(500).json({ success: false, message: error.message || 'Server Error' });
  }
};
