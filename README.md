# Street Kapda Backend v4.0

## Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your MongoDB URI
npm run dev
```

## API Endpoints

### Auth
- POST `/api/auth/send-otp`
- POST `/api/auth/verify-otp`
- POST `/api/auth/admin-login`
- GET  `/api/auth/profile` *(protected)*
- PUT  `/api/auth/profile` *(protected)*

### Products
- GET  `/api/products` — list with filters
- GET  `/api/products/search?q=...`
- GET  `/api/products/:id`
- GET  `/api/products/:id/similar`
- GET  `/api/products/:id/reviews`
- POST `/api/products/:id/reviews` *(protected)*
- POST `/api/products` *(admin)*
- PUT  `/api/products/:id` *(admin)*
- DELETE `/api/products/:id` *(admin)*

### Orders
- POST `/api/orders` *(protected)*
- GET  `/api/orders/user` *(protected)*
- GET  `/api/orders/:id` *(protected)*
- POST `/api/orders/:id/payment` *(protected)* — upload screenshot

### Notifications
- GET  `/api/notifications` *(protected)*
- PUT  `/api/notifications/:id/read` *(protected)*
- PUT  `/api/notifications/read-all` *(protected)*
- DELETE `/api/notifications/:id` *(protected)*

### Settings (Public)
- GET `/api/settings/qr`
- GET `/api/settings/config`
- GET `/api/settings/page/:key` — privacy_policy | terms_conditions | about_app | refund_policy
- GET `/api/settings/pincode/:pincode`
- GET `/api/settings/key/:key`

### Settings (Admin)
- GET  `/api/settings` *(admin)*
- PUT  `/api/settings/key/:key` *(admin)*
- POST `/api/settings/qr` *(admin)* — upload QR image

### Admin
- GET  `/api/admin/dashboard`
- GET/PUT `/api/admin/orders`
- PUT  `/api/admin/orders/:id/status`
- PUT  `/api/admin/orders/:id/payment`
- GET  `/api/admin/products`
- GET  `/api/admin/users`
- GET/PUT `/api/admin/returns/:id`
- GET/POST/PUT/DELETE `/api/admin/coupons`
- GET/POST `/api/admin/reviews`
- **POST `/api/admin/notifications/broadcast`** — send to ALL users
- **POST `/api/admin/notifications/send`** — send to single user
- GET  `/api/admin/notifications` — history

### Files
- GET `/api/file/:filename` — serve GridFS files

## Socket.IO Events
- Client emits `join` with userId on connect
- Server emits `notification` with notification object
- Server emits `new_payment` when payment screenshot uploaded

## Default Settings (seeded automatically)
- `qr_code` — UPI QR filename
- `privacy_policy` — editable HTML content
- `terms_conditions` — editable HTML content
- `about_app` — editable HTML content
- `refund_policy` — editable HTML content
- `delivery_charge` — default 49
- `free_delivery_min` — default 499
- `return_window_days` — default 7
- `referral_reward` — default 50
- `contact_email`, `contact_phone`, `social_links`
- `app_version`

## Default Admin Credentials
- Email: `admin@streetkapda.com`
- Password: `Admin@123`
