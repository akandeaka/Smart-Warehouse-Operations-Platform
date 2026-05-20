# API Endpoints Documentation

## Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/login | Login with username/password |
| POST | /api/logout | Logout current user |

## Warehouse Manager
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/products | List all products |
| POST | /api/allocations | Allocate stock to team |
| GET | /api/approvals/pending | Get pending credit approvals |
| PUT | /api/approvals/{id} | Approve/reject credit |
| POST | /api/daily/close | Close the day |

## Sales Team
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/team/my-allocations | View allocated stock |
| POST | /api/sales | Create new sale |

## Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/reports/daily | Today's sales report |
| GET | /api/reports/monthly | Monthly sales summary |
