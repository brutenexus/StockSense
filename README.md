# 📦 StockSense

> **A modern, modular Inventory Management System built to digitize and streamline stock operations.**

StockSense is an Inventory Management System designed to replace manual registers, spreadsheets, and scattered inventory tracking with a **centralized and structured stock management platform**.

It provides a unified workflow for managing products, warehouses, incoming goods, outgoing deliveries, internal transfers, stock adjustments, and inventory history.

---

## ✨ Overview

Managing inventory through Excel sheets, physical registers, and disconnected systems can make it difficult to know what is actually available, where it is located, and what operations are currently pending.

**StockSense** brings these operations together into one system.

The platform is designed around four major inventory workflows:

```text
📥 Receive Stock
      ↓
🏭 Store / Transfer
      ↓
📤 Deliver Stock
      ↓
📊 Track & Adjust
```

Every important stock movement is recorded in the **Stock Ledger**, providing a structured history of inventory activity.

---

## 🎯 Key Features

### 📊 Inventory Dashboard

Get an overview of inventory operations from a centralized dashboard.

* Total products in stock
* Low-stock items
* Out-of-stock items
* Pending receipts
* Pending deliveries
* Scheduled internal transfers
* Dynamic inventory filters

### 📦 Product Management

Manage your complete product catalog.

* Create and update products
* Product name
* SKU / Product Code
* Category
* Unit of Measure
* Initial stock
* Stock availability by location
* Reordering rules

---

### 📥 Receipts — Incoming Stock

Record goods received from vendors.

**Workflow:**

```text
Create Receipt
      ↓
Add Supplier
      ↓
Add Products
      ↓
Enter Quantity
      ↓
Validate
      ↓
Stock Increases
```

**Example:**

```text
Receive 50 Steel Rods

Previous Stock: 100
Received:       +50
-------------------
New Stock:      150
```

---

### 📤 Delivery Orders — Outgoing Stock

Manage products leaving the warehouse for customers or other destinations.

**Workflow:**

```text
Create Delivery
      ↓
Pick Items
      ↓
Pack Items
      ↓
Validate
      ↓
Stock Decreases
```

**Example:**

```text
Available Chairs: 50
Delivered:        -10
----------------------
Remaining:         40
```

---

### 🔄 Internal Transfers

Move inventory between locations while maintaining accurate stock records.

Supported scenarios include:

```text
Main Warehouse → Production Floor

Rack A → Rack B

Warehouse 1 → Warehouse 2
```

Internal transfers don't change the company's total inventory — they update **where the inventory is located**.

Every movement is recorded in the stock ledger.

---

### 🧮 Stock Adjustments

Handle differences between recorded inventory and physical inventory counts.

**Workflow:**

```text
Select Product / Location
          ↓
Enter Physical Count
          ↓
Calculate Difference
          ↓
Update Stock
          ↓
Log Adjustment
```

Useful for handling:

* Damaged products
* Missing stock
* Counting errors
* Inventory discrepancies

**Example:**

```text
Recorded Stock: 100 kg
Physical Stock:  97 kg
Difference:      -3 kg

Adjustment:      -3 kg
```

---

## 🏭 Multi-Warehouse Support

StockSense is designed to support inventory across multiple warehouses and locations.

Example:

```text
                    StockSense
                        │
          ┌─────────────┴─────────────┐
          │                           │
    Main Warehouse              Warehouse 2
          │                           │
     ┌────┴────┐                 ┌────┴────┐
     │         │                 │         │
   Rack A    Rack B           Rack A    Rack B
```

This allows users to track not only **how much stock exists**, but also **where that stock is located**.

---

## 🔎 Search & Smart Filters

Quickly find inventory records using:

* SKU
* Product
* Category
* Warehouse
* Location
* Document type
* Operation status

### Document Types

```text
Receipts
Delivery Orders
Internal Transfers
Adjustments
```

### Operation Status

```text
Draft
Waiting
Ready
Done
Canceled
```

---

## 🚨 Inventory Alerts

StockSense can identify inventory that requires attention.

* Low-stock alerts
* Out-of-stock items
* Pending receipts
* Pending deliveries
* Scheduled internal transfers

This helps inventory teams identify operational tasks without manually checking every product.

---

## 🔐 Authentication

StockSense includes an authentication flow for secure access.

```text
Sign Up / Login
      ↓
Authentication
      ↓
Inventory Dashboard
```

### Password Recovery

Users can reset their password through an **OTP-based password reset flow**.

---

## 🧭 Application Structure

The application is organized around the following modules:

```text
StockSense
│
├── 📊 Dashboard
│
├── 📦 Products
│   ├── Product Management
│   ├── Categories
│   ├── Stock Availability
│   └── Reordering Rules
│
├── ⚙️ Operations
│   ├── Receipts
│   ├── Delivery Orders
│   ├── Inventory Adjustments
│   └── Move History
│
├── 🏭 Warehouse
│
├── 👤 Profile
│   ├── My Profile
│   └── Logout
│
└── 🔐 Authentication
    ├── Login
    ├── Signup
    └── OTP Password Reset
```

---

## 📋 Inventory Flow

A typical inventory lifecycle looks like this:

### 1. Receive Goods

```text
Vendor
  │
  ▼
Receipt
  │
  ▼
+100 kg Steel
```

### 2. Transfer Stock

```text
Main Store
    │
    │ Internal Transfer
    ▼
Production Rack
```

The total stock remains unchanged, but the **stock location is updated**.

### 3. Deliver Goods

```text
Warehouse
    │
    │ Delivery
    ▼
Customer
```

Stock is reduced according to the delivered quantity.

### 4. Adjust Inventory

```text
Physical Count
      │
      ▼
Difference Detected
      │
      ▼
Stock Adjustment
      │
      ▼
Stock Ledger
```

---

## 📒 Stock Ledger

Every major inventory movement is recorded in the stock ledger.

Example:

| Operation  | Product | Quantity |           Effect |
| ---------- | ------- | -------: | ---------------: |
| Receipt    | Steel   |   100 kg |             +100 |
| Transfer   | Steel   |   100 kg | Location changed |
| Delivery   | Steel   |    20 kg |              -20 |
| Adjustment | Steel   |     3 kg |               -3 |

This creates a traceable history of stock activity.

---

## 👥 Target Users

StockSense is designed primarily for:

### Inventory Managers

* Manage incoming stock
* Manage outgoing stock
* Monitor inventory
* Track stock movements
* Manage warehouse operations

### Warehouse Staff

* Perform stock transfers
* Pick products
* Handle shelving
* Perform inventory counting
* Process warehouse operations

---

## 🛠️ Core Modules

| Module            | Purpose                          |
| ----------------- | -------------------------------- |
| 📊 Dashboard      | Inventory overview and KPIs      |
| 📦 Products       | Product and SKU management       |
| 📥 Receipts       | Incoming inventory               |
| 📤 Deliveries     | Outgoing inventory               |
| 🔄 Transfers      | Internal stock movement          |
| 🧮 Adjustments    | Physical vs recorded stock       |
| 🏭 Warehouse      | Location management              |
| 📜 Move History   | Inventory movement tracking      |
| 🔔 Alerts         | Low-stock and operational alerts |
| 👤 Profile        | User account management          |
| 🔐 Authentication | Login and password recovery      |

---

## 🗺️ Roadmap

The following roadmap can be used as the project evolves:

### Phase 1 — Core Inventory

* [x] Product management
* [x] Stock tracking
* [x] Receipts
* [x] Delivery orders
* [x] Internal transfers
* [x] Stock adjustments

### Phase 2 — Operations

* [ ] Advanced inventory analytics
* [ ] Improved stock alerts
* [ ] Advanced warehouse management
* [ ] Detailed reporting
* [ ] Exportable inventory reports

### Phase 3 — Intelligence

* [ ] Demand forecasting
* [ ] Automated reorder recommendations
* [ ] Inventory trend analysis
* [ ] Advanced business analytics

---

## 📐 Inventory Logic

The core inventory principle is simple:

```text
Current Stock
=
Previous Stock
+ Incoming Stock
- Outgoing Stock
± Adjustments
```

Transfers work differently because they primarily change the **location of inventory** rather than the total inventory quantity.

---

## 🎨 Design Philosophy

StockSense aims to provide an interface that is:

* Clean
* Structured
* Fast
* Easy to navigate
* Data-focused
* Suitable for daily warehouse operations

The interface is centered around making important inventory information available without forcing users to manually search through spreadsheets or registers.

---

## 📁 Project Concept

StockSense was designed as a modular system so that inventory functionality can be expanded independently.

```text
Authentication
      │
      ▼
Dashboard
      │
 ┌────┼───────────────┐
 ▼    ▼               ▼
Products          Operations
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       Receipts   Deliveries  Transfers
                     │
                     ▼
                Adjustments
                     │
                     ▼
                Stock Ledger
```

---

## 🤝 Contributing

Contributions, improvements, and ideas are welcome.

```bash
# Fork the repository

# Clone your fork
git clone https://github.com/YOUR_USERNAME/StockSense.git

# Create a feature branch
git checkout -b feature/your-feature

# Make your changes

# Commit
git commit -m "feat: add your feature"

# Push
git push origin feature/your-feature
```

Then open a Pull Request.

---

## 📄 Project Reference

The system specification and inventory workflow were defined around the StockSense project requirements, including product management, receipts, deliveries, transfers, adjustments, multi-warehouse support, alerts, and stock ledger tracking.

---

## 📜 License

This project is intended for educational, development, and portfolio purposes.

Add your preferred license here, such as **MIT License**, before publishing if you want the repository to be open source.

---

<div align="center">

### 📦 StockSense

**Manage Stock. Track Movement. Stay In Control.**

Built with ❤️ for smarter inventory management.

</div>
