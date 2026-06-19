# 🏭 Warehouse Stock Management System

A complete Progressive Web App (PWA) for managing warehouse inventory, sales team allocations, credit approvals, and daily reporting. Designed for Coca-Cola distribution operations.

## 🌐 Live Demo

**Live URL:** [https://warehouse-backend-new-u9rq.onrender.com](https://warehouse-backend-new-u9rq.onrender.com)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [API Endpoints](#api-endpoints)
- [User Roles](#user-roles)
- [Screenshots](#screenshots)
- [Contributing](#contributing)
- [License](#license)

---

## 📖 Overview

The **Warehouse Stock Management System** is a full-featured inventory management solution designed for Coca-Cola warehouse distribution operations. It provides real-time stock tracking, sales team allocation, credit management, and comprehensive reporting.

### Key Capabilities

- **Multi-role Access:** Super Admin, Warehouse Manager, and Sales Team
- **Real-time Stock Tracking:** Monitor inventory levels across multiple sales teams
- **Credit Management:** Full approval workflow with payment tracking
- **Returns Tracking:** Monitor unsold goods and return rates by team
- **Mobile Ready:** Install as PWA on Android devices
- **Multiple Batch Submissions:** Submit sales multiple times per day

---

## 🚀 Features

### Super Admin
- ✅ Full system control
- ✅ Product management (CRUD + Excel upload)
- ✅ User management (create, reset passwords, deactivate)
- ✅ System statistics
- ✅ 2-Factor Authentication

### Warehouse Manager
- ✅ Allocate stock to sales teams
- ✅ View current stock levels
- ✅ Approve/reject credit requests
- ✅ Accept/reject returned goods
- ✅ View daily sales reports
- ✅ Close day operations
- ✅ Returns tracking by team

### Sales Team
- ✅ View allocated stock
- ✅ Confirm receipt of goods
- ✅ Record sales (Cash, Bank Transfer, Credit)
- ✅ Submit day sales (multiple batches)
- ✅ Track credit requests and payments
- ✅ View transaction history
- ✅ Download CSV reports

### PWA Support
- ✅ Installable on mobile devices
- ✅ Offline caching
- ✅ Apple and Android support
- ✅ Home screen icon

---

## 🛠️ Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Backend** | Node.js | v18+ |
| **Framework** | Express.js | ^4.18.2 |
| **Database** | MySQL (Aiven Cloud) | 8.0 |
| **Driver** | mysql2 | ^3.6.0 |
| **File Upload** | Multer | ^1.4.5-lts.1 |
| **Excel Processing** | SheetJS (xlsx) | ^0.18.5 |
| **Frontend** | HTML5, CSS3, Vanilla JS | - |
| **PWA** | Manifest + Service Worker | - |
| **Hosting** | Render.com | - |
| **Version Control** | GitHub | - |

---

## 🏗️ System Architecture
