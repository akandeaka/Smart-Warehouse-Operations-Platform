# 🏭 Smart-Warehouse-Operations-Platform


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

###Technology Stack Overview 1
| **Layer**                        | **Technology**                    | **Version**     |
| -------------------------------- | --------------------------------- | --------------- |
| **Backend Runtime**              | Node.js                           | v18+            |
| **Backend Framework**            | Express.js                        | v4.18.2         |
| **Database**                     | MySQL (Aiven Cloud)               | v8.0            |
| **Database Driver**              | mysql2                            | v3.6.0          |
| **File Upload Management**       | Multer                            | v1.4.5          |
| **Excel File Processing**        | SheetJS (xlsx)                    | v0.18.5         |
| **Frontend**                     | HTML5, CSS3, Vanilla JavaScript   | Latest          |
| **Progressive Web App (PWA)**    | Web App Manifest & Service Worker | Latest          |
| **Cloud Hosting Platform**       | Render.com                        | Managed Service |
| **Version Control & Repository** | GitHub                            | Latest          |

### Technology Stack Overview

* **Node.js (v18+)** powers the server-side application and API services.
* **Express.js (v4.18.2)** provides a lightweight and scalable web application framework.
* **MySQL (v8.0)** hosted on **Aiven Cloud** serves as the primary relational database.
* **mysql2 (v3.6.0)** enables efficient communication between Node.js and MySQL.
* **Multer (v1.4.5)** handles file uploads such as images, documents, and spreadsheets.
* **SheetJS (xlsx v0.18.5)** processes Excel files for data import and export functionality.
* **HTML5, CSS3, and Vanilla JavaScript** provide a responsive and lightweight frontend experience.
* **PWA technologies** (Manifest and Service Worker) enable offline access and app-like functionality.
* **Render.com** hosts and deploys the application in the cloud.
* **GitHub** is used for source code management, version control, and collaboration.

---


## 🏗️ System Architecture
┌─────────────────────────────────────────────────────────────────────────────┐
│ CLIENT LAYER │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │ Login │ │ Super │ │ Manager │ │ Sales │ │
│ │ Page │ │ Admin │ │ Dashboard │ │ Dashboard │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
│ │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Service Worker (sw.js) │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SERVER LAYER │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Express.js Application │ │
│ │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │ │
│ │ │ Auth │ │ Product │ │ Sales │ │ │
│ │ │ Middleware │ │ Routes │ │ Routes │ │ │
│ │ └─────────────┘ └─────────────┘ └─────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ DATABASE LAYER │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ │ users │ │products │ │ sales_ │ │ sales_ │ │ credit_ │ │
│ │ │ │ │ │ orders │ │ teams │ │approvals│ │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘

text

---

## 📦 Installation

### Prerequisites

- Node.js (v16+)
- MySQL database (Aiven, AWS RDS, or local)
- GitHub account
- Render.com account (free tier works)

### Local Development Setup

```bash
# Clone repository
git clone https://github.com/your-username/Warehouse-Stock-Balancing-System.git
cd Warehouse-Stock-Balancing-System

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
DB_HOST=your-database-host
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_NAME=your-database-name
PORT=3000
EOF

