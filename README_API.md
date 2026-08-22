# 🚗 Safe Drive - Complete Website REST API Documentation

> **Official Backend API Reference for Website & Mobile Developers**  
> **Live Production Base URL:** `https://safedrive-backend-phqx.onrender.com/api`  
> **Local Base URL:** `http://localhost:5000/api`

---

## 📑 Quick Navigation Index

1. [Base Configuration & Auth Header](#1-base-configuration--headers)
2. [Product & Store APIs (Catalog & Details)](#2-product--store-apis)
3. [User Auth APIs (100% Mobile OTP)](#3-user-authentication-apis)
4. [Checkout & Razorpay Payment APIs](#4-checkout--payment-apis)
5. [Public QR Scan & Caller Features (No Auth)](#5-public-qr-scan--calling-apis)
6. [First-Time QR Registration & Kit Activation](#6-first-time-qr-registration-api)
7. [Customer Dashboard & Vehicle Management (Protected)](#7-customer-dashboard--vehicle-management-apis)
8. [Setup / Postman Admin Creation](#8-admin-setup-endpoint)

---

## 1. Base Configuration & Headers

- **Content-Type:** `application/json` (unless uploading file/multipart)
- **Protected Routes Header:**
```http
Authorization: Bearer <JWT_TOKEN_HERE>
```

---

## 2. Product & Store APIs

### 2.1 Get All Store Products
Fetch all active products (physical sticker kits, digital passes) to render on the website Store/Shop page.
- **Method:** `GET`
- **URL:** `/purchase/products`
- **Auth Required:** No

#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "count": 2,
  "products": [
    {
      "_id": "66c7f8a1e2b4c3d4e5f6a7b8",
      "title": "Car Safety QR Protection Kit (2 Stickers)",
      "description": "Premium waterproof reflective QR stickers for front and rear vehicle glass.",
      "imageUrl": "https://res.cloudinary.com/.../car-kit.webp",
      "qrType": "PHYSICAL",
      "price": 299,
      "originalPrice": 499,
      "discount": 200,
      "initialCalls": 10,
      "initialMessages": 20,
      "validityDays": 365,
      "renewalAmount": 199,
      "features": [
        "Instant Masked Voice Calling to Owner",
        "WhatsApp Direct Emergency Alert",
        "2 Reflective Waterproof Stickers",
        "1-Year Free Validity Included"
      ],
      "isActive": true
    }
  ]
}
```

---

### 2.2 Get Single Product Details (By Product ID)
Fetch full product details to render on individual product page (`/product/:id`).
- **Method:** `GET`
- **URL:** `/purchase/products/:id`
- **Auth Required:** No

#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "product": {
    "_id": "66c7f8a1e2b4c3d4e5f6a7b8",
    "title": "Car Safety QR Protection Kit (2 Stickers)",
    "description": "Premium waterproof reflective QR stickers for front and rear vehicle glass.",
    "imageUrl": "https://res.cloudinary.com/.../car-kit.webp",
    "qrType": "PHYSICAL",
    "price": 299,
    "originalPrice": 499,
    "discount": 200,
    "initialCalls": 10,
    "initialMessages": 20,
    "validityDays": 365,
    "renewalAmount": 199,
    "features": [
      "Instant Masked Voice Calling to Owner",
      "WhatsApp Direct Emergency Alert",
      "2 Reflective Waterproof Stickers",
      "1-Year Free Validity Included"
    ]
  }
}
```

---

## 3. User Authentication APIs

### 3.1 Send Mobile Login OTP
Sends a 6-digit OTP to user's 10-digit Indian mobile number.
- **Method:** `POST`
- **URL:** `/auth/send-login-otp`
- **Auth Required:** No

#### Request Body:
```json
{
  "phone": "9876543210"
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "message": "OTP sent successfully to +91 9876543210",
  "phone": "9876543210"
}
```

---

### 3.2 Verify Mobile Login OTP & Get Token
Verifies OTP and generates user authentication JWT token. *(Test OTP is `123456`)*.
- **Method:** `POST`
- **URL:** `/auth/verify-login-otp`
- **Auth Required:** No

#### Request Body:
```json
{
  "phone": "9876543210",
  "otp": "123456"
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "66c7f8a1e2b4c3d4e5f6a7b8",
    "name": "Rahul Sharma",
    "phone": "9876543210",
    "email": "rahul@example.com",
    "role": "USER"
  }
}
```

---

### 3.3 Get Current Logged-In User Profile
- **Method:** `GET`
- **URL:** `/auth/me`
- **Auth Required:** Yes (`Bearer <token>`)

#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "user": {
    "_id": "66c7f8a1e2b4c3d4e5f6a7b8",
    "name": "Rahul Sharma",
    "phone": "9876543210",
    "email": "rahul@example.com",
    "address": "B-12, Model Town, Jaipur",
    "role": "USER"
  }
}
```

---

### 3.4 Update User Profile
- **Method:** `PUT`
- **URL:** `/user/profile`
- **Auth Required:** Yes (`Bearer <token>`)

#### Request Body:
```json
{
  "name": "Rahul Sharma",
  "email": "rahul.updated@example.com",
  "whatsappNumber": "9876543210",
  "address": "Plot 55, Mansarovar, Jaipur - 302020"
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "user": {
    "name": "Rahul Sharma",
    "phone": "9876543210",
    "email": "rahul.updated@example.com",
    "address": "Plot 55, Mansarovar, Jaipur - 302020"
  }
}
```

---

## 4. Checkout & Payment APIs

### 4.1 Create Razorpay Order
Generates an online order for payment processing.
- **Method:** `POST`
- **URL:** `/purchase/create-order`
- **Auth Required:** No (Guest or Logged-in user)

#### Request Body:
```json
{
  "productId": "66c7f8a1e2b4c3d4e5f6a7b8",
  "name": "Rahul Sharma"
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "orderId": "order_OqX9abc123",
  "amount": 29900,
  "currency": "INR",
  "keyId": "rzp_test_6kz5nGEzi8uXRw"
}
```

---

### 4.2 Complete Purchase & Place Order
Verifies payment signature from Razorpay and provisions the order.
- **Method:** `POST`
- **URL:** `/purchase/complete`
- **Auth Required:** No

#### Request Body:
```json
{
  "productId": "66c7f8a1e2b4c3d4e5f6a7b8",
  "name": "Rahul Sharma",
  "phone": "9876543210",
  "email": "rahul@example.com",
  "address": "Plot 55, Sector 10, Noida",
  "city": "Noida",
  "state": "Uttar Pradesh",
  "pincode": "201301",
  "razorpay_payment_id": "pay_OqX9def456",
  "razorpay_order_id": "order_OqX9abc123",
  "razorpay_signature": "signature_hash_string"
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "message": "Order placed successfully!",
  "orderNumber": "ORD-2026-8912",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "name": "Rahul Sharma",
    "phone": "9876543210"
  }
}
```

---

## 5. Public QR Scan & Calling APIs (No Auth Required)

When a passerby scans the QR code on a vehicle (e.g. `https://website.com/scan/pk_live_sd001c1`):

### 5.1 Lookup Scanned QR by Token
- **Method:** `GET`
- **URL:** `/public/qr/:token`
- **Auth Required:** No

#### ✅ A. If QR is NOT Registered Yet (New Physical Sticker):
```json
{
  "success": true,
  "status": "UNREGISTERED",
  "productId": "SD001",
  "copyCode": "SD001C1",
  "qrFor": "Car",
  "message": "This QR is ready for registration"
}
```

#### ✅ B. If QR is ACTIVE (Protected Vehicle):
```json
{
  "success": true,
  "status": "ACTIVE",
  "copyCode": "SD001C1",
  "requiresVerification": true,
  "maskedPlate": "RJ14****"
}
```

---

### 5.2 Get Public Scan Reasons List
Fetch predefined alert reasons configured by admin.
- **Method:** `GET`
- **URL:** `/public/scan-reasons`
- **Auth Required:** No

#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "reasons": [
    { "id": "1", "title": "Vehicle Blocking Parking / Driveway", "icon": "ban" },
    { "id": "2", "title": "Vehicle Window Open / Lights ON", "icon": "unlock" },
    { "id": "3", "title": "Towed / No Parking Zone Notice", "icon": "alert" },
    { "id": "4", "title": "Accident / Scratch Alert", "icon": "car" }
  ]
}
```

---

### 5.3 Verify Last 4 Digits of Vehicle Plate
Caller enters last 4 digits (e.g. `2024` for `RJ14-AB-2024`) to unlock masked call/message buttons.
- **Method:** `POST`
- **URL:** `/public/qr/:token/verify-plate`
- **Auth Required:** No

#### Request Body:
```json
{
  "last4Digits": "2024"
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "verified": true,
  "vehicleBrand": "Hyundai",
  "vehicleName": "Creta",
  "maskedPhone": "XXXXXX3210",
  "canCall": true,
  "canMessage": true
}
```

---

### 5.4 Initiate Masked Voice Call
- **Method:** `POST`
- **URL:** `/public/qr/:token/call`
- **Auth Required:** No

#### Request Body:
```json
{
  "last4Digits": "2024",
  "reason": "Vehicle Blocking Parking / Driveway"
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "callMode": "DIRECT_TEL",
  "dialNumber": "+919876543210",
  "message": "Call initiated successfully"
}
```

---

### 5.5 Send WhatsApp / SMS Alert
- **Method:** `POST`
- **URL:** `/public/qr/:token/message`
- **Auth Required:** No

#### Request Body:
```json
{
  "last4Digits": "2024",
  "reason": "Vehicle Window is Left Open"
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "whatsappUrl": "https://wa.me/919876543210?text=SafeDrive%20Alert%3A%20Your%20vehicle...",
  "message": "Message alert dispatched"
}
```

---

### 5.6 Trigger Emergency SOS to Family
Broadcasts emergency alert to the 2 emergency contacts configured on the vehicle.
- **Method:** `POST`
- **URL:** `/public/qr/:token/emergency`
- **Auth Required:** No

#### Request Body:
```json
{
  "last4Digits": "2024",
  "location": "Near Central Mall, MG Road, Jaipur"
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "message": "Emergency SOS broadcasted to registered emergency contacts"
}
```

---

## 6. First-Time QR Registration API

When a customer gets their physical stickers delivered, they scan the sticker and activate their vehicle.

### 6.1 Register & Activate Physical QR Kit
- **Method:** `POST`
- **URL:** `/public/qr/:token/register`
- **Auth Required:** No

#### Request Body:
```json
{
  "name": "Rahul Sharma",
  "phone": "9876543210",
  "whatsappNumber": "9876543210",
  "address": "B-12, Model Town, Jaipur",
  "vehicleBrand": "Hyundai",
  "vehicleName": "Creta",
  "vehicleNumber": "RJ14AB2024",
  "emergencyContacts": [
    { "name": "Pooja Sharma (Wife)", "number": "9876500001" },
    { "name": "Amit Sharma (Brother)", "number": "9876500002" }
  ]
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "message": "QR Kit activated successfully! Your vehicle is now protected.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "name": "Rahul Sharma",
    "phone": "9876543210"
  },
  "kit": {
    "productId": "SD001",
    "vehicleNumber": "RJ14AB2024",
    "copiesCount": 2,
    "validityDays": 365,
    "freeCalls": 10,
    "freeMessages": 20
  }
}
```

---

## 7. Customer Dashboard & Vehicle Management APIs

### 7.1 Get User Dashboard (My Vehicles & Balances)
Fetch user's activated kits, sticker copies (`C1`, `C2`), vehicle details, and remaining call/SMS balances.
- **Method:** `GET`
- **URL:** `/user/dashboard`
- **Auth Required:** Yes (`Bearer <token>`)

#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "user": {
    "name": "Rahul Sharma",
    "phone": "9876543210"
  },
  "kits": [
    {
      "productId": "SD001",
      "status": "ACTIVE",
      "copies": [
        { "copyCode": "SD001C1", "publicToken": "pk_live_sd001c1" },
        { "copyCode": "SD001C2", "publicToken": "pk_live_sd001c2" }
      ],
      "vehicle": {
        "_id": "66c7...",
        "vehicleNumber": "RJ14AB2024",
        "vehicleBrand": "Hyundai",
        "vehicleName": "Creta",
        "emergencyContacts": [
          { "name": "Pooja Sharma", "number": "9876500001" },
          { "name": "Amit Sharma", "number": "9876500002" }
        ]
      },
      "wallet": {
        "callBalance": 10,
        "messageBalance": 20,
        "totalCallsUsed": 0,
        "totalMessagesUsed": 0
      },
      "expiryDate": "2027-08-22T00:00:00.000Z"
    }
  ],
  "stats": {
    "totalKits": 1,
    "totalCallsLeft": 10,
    "totalMessagesLeft": 20
  }
}
```

---

### 7.2 Get Available Add-On Packages
- **Method:** `GET`
- **URL:** `/user/packages`
- **Auth Required:** Yes (`Bearer <token>`)

#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "packages": [
    {
      "_id": "pkg_call_50",
      "name": "50 Extra Calls Booster",
      "category": "CALL",
      "quantity": 50,
      "price": 99
    },
    {
      "_id": "pkg_msg_100",
      "name": "100 Extra SMS Alert Booster",
      "category": "MESSAGE",
      "quantity": 100,
      "price": 99
    }
  ]
}
```

---

### 7.3 Buy Extra Add-On Quota (Top-Up Balance)
- **Method:** `POST`
- **URL:** `/user/quota/buy`
- **Auth Required:** Yes (`Bearer <token>`)

#### Request Body:
```json
{
  "qrId": "66c7f8a1e2b4c3d4e5f6a7b8",
  "category": "CALL",
  "quantity": 50,
  "amountPaid": 99,
  "paymentId": "pay_mock_123456"
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "message": "Successfully credited 50 CALL quota to kit SD001",
  "wallet": {
    "callBalance": 60,
    "messageBalance": 20
  }
}
```

---

### 7.4 Renew Annual Kit Subscription
Extends vehicle validity by 365 days and adds renewal bonus quota.
- **Method:** `POST`
- **URL:** `/user/subscription/renew`
- **Auth Required:** Yes (`Bearer <token>`)

#### Request Body:
```json
{
  "qrId": "66c7f8a1e2b4c3d4e5f6a7b8",
  "paymentAmount": 199,
  "paymentId": "pay_mock_999999"
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "message": "Subscription renewed successfully for 365 days",
  "newExpiryDate": "2028-08-22T00:00:00.000Z"
}
```

---

### 7.5 Update Emergency Contacts
- **Method:** `PUT`
- **URL:** `/user/emergency-contacts`
- **Auth Required:** Yes (`Bearer <token>`)

#### Request Body:
```json
{
  "vehicleId": "66c7...",
  "emergencyContacts": [
    { "name": "Pooja Sharma (Wife)", "number": "9876500001" },
    { "name": "Suresh Sharma (Father)", "number": "9876500003" }
  ]
}
```
#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "message": "Emergency contacts updated successfully"
}
```

---

### 7.6 Get Customer Quota & Usage Ledger
- **Method:** `GET`
- **URL:** `/user/ledger`
- **Auth Required:** Yes (`Bearer <token>`)

#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "ledger": [
    {
      "_id": "66c7...",
      "productId": "SD001",
      "type": "CREDIT",
      "category": "CALL",
      "quantity": 10,
      "balanceAfter": 10,
      "source": "INITIAL_FREE",
      "reason": "Initial Starter Calling Quota (Included with Kit)",
      "createdAt": "2026-08-22T10:00:00.000Z"
    }
  ]
}
```

---

### 7.7 Get Customer Orders History
- **Method:** `GET`
- **URL:** `/user/orders`
- **Auth Required:** Yes (`Bearer <token>`)

#### ✅ Response (`200 OK`):
```json
{
  "success": true,
  "orders": [
    {
      "_id": "66c7...",
      "orderNumber": "ORD-2026-8912",
      "totalAmount": 299,
      "orderStatus": "DELIVERED",
      "deliveryAddress": "Plot 55, Sector 10, Noida",
      "items": [
        { "title": "Car Safety QR Protection Kit", "quantity": 1, "price": 299 }
      ],
      "createdAt": "2026-08-22T10:00:00.000Z"
    }
  ]
}
```

---

## 8. Admin Setup Endpoint

### 8.1 Create / Reset Admin Account (Postman)
- **Method:** `POST`
- **URL:** `/auth/create-admin`
- **Auth Required:** No

#### Request Body:
```json
{
  "name": "Super Admin",
  "phone": "9999999999",
  "email": "admin@safedrive.com",
  "password": "adminpassword123",
  "role": "SUPER_ADMIN"
}
```
#### ✅ Response (`201 Created` / `200 OK`):
```json
{
  "success": true,
  "message": "Admin account created successfully!",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "admin": {
    "name": "Super Admin",
    "phone": "9999999999",
    "email": "admin@safedrive.com",
    "role": "SUPER_ADMIN"
  }
}
```

---

*Safe Drive QR Vehicle Safety & Protection Backend API Documentation.*
