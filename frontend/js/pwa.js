// ============================================================
// PWA Registration and Management
// ============================================================

class PWAManager {
    constructor() {
        this.registration = null;
        this.deferredPrompt = null;
        this.isInstalled = false;
        this.offlineMode = false;
        
        this.init();
    }

    async init() {
        // Check if service workers are supported
        if (!('serviceWorker' in navigator)) {
            console.log('Service workers not supported');
            return;
        }

        // Register service worker
        await this.registerServiceWorker();

        // Setup install prompt
        this.setupInstallPrompt();

        // Setup online/offline handlers
        this.setupNetworkHandlers();

        // Check if already installed
        this.checkInstallStatus();

        // Setup periodic sync
        this.setupBackgroundSync();
    }

    // ============================================================
    // SERVICE WORKER REGISTRATION
    // ============================================================
    async registerServiceWorker() {
        try {
            this.registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });
            console.log('Service Worker registered:', this.registration);

            // Check for updates
            this.registration.addEventListener('updatefound', () => {
                const newWorker = this.registration.installing;
                console.log('New service worker installing...');
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('Update available!');
                        this.showUpdateNotification();
                    }
                });
            });

            // Handle controller change
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log('Service Worker controller changed');
                // Reload to apply new version
                if (confirm('A new version is available. Refresh to update?')) {
                    window.location.reload();
                }
            });

            return this.registration;
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }

    // ============================================================
    // INSTALL PROMPT
    // ============================================================
    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (event) => {
            // Prevent Chrome from automatically showing the prompt
            event.preventDefault();
            
            // Stash the event so it can be triggered later
            this.deferredPrompt = event;
            
            // Show install button
            this.showInstallButton();
            
            console.log('App can be installed');
        });

        // Check if app was installed
        window.addEventListener('appinstalled', (event) => {
            console.log('App installed successfully!');
            this.isInstalled = true;
            this.deferredPrompt = null;
            this.hideInstallButton();
            
            // Send analytics
            this.trackInstall();
        });
    }

    showInstallButton() {
        const existing = document.getElementById('pwa-install-btn');
        if (existing) return;

        const button = document.createElement('button');
        button.id = 'pwa-install-btn';
        button.innerHTML = '📲 Install App';
        button.className = 'pwa-install-btn';
        button.onclick = () => this.promptInstall();
        
        // Position on page
        const container = document.querySelector('.header') || document.body;
        container.prepend(button);
    }

    hideInstallButton() {
        const button = document.getElementById('pwa-install-btn');
        if (button) button.remove();
    }

    async promptInstall() {
        if (!this.deferredPrompt) {
            console.log('Install prompt not available');
            return;
        }

        try {
            // Show the install prompt
            const result = await this.deferredPrompt.prompt();
            
            // Wait for the user to respond to the prompt
            const choiceResult = await result.userChoice;
            
            console.log('User choice:', choiceResult.outcome);
            
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
                this.isInstalled = true;
                this.hideInstallButton();
                this.trackInstall('accepted');
            } else {
                console.log('User dismissed the install prompt');
                this.trackInstall('dismissed');
            }
        } catch (error) {
            console.error('Install prompt error:', error);
        }
    }

    // ============================================================
    // NETWORK HANDLERS
    // ============================================================
    setupNetworkHandlers() {
        window.addEventListener('online', () => {
            console.log('Back online!');
            this.offlineMode = false;
            this.showOnlineNotification();
            this.syncData();
        });

        window.addEventListener('offline', () => {
            console.log('Offline!');
            this.offlineMode = true;
            this.showOfflineNotification();
        });

        // Check initial status
        this.offlineMode = !navigator.onLine;
        if (this.offlineMode) {
            this.showOfflineNotification();
        }
    }

    showOfflineNotification() {
        const toast = this.createToast('📡 You are offline. Some features may be limited.', 'warning');
        document.body.appendChild(toast);
    }

    showOnlineNotification() {
        const toast = this.createToast('✅ Back online! Data synced.', 'success');
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    showUpdateNotification() {
        const toast = this.createToast('🔄 Update available! Refresh to get latest version.', 'info');
        toast.onclick = () => window.location.reload();
        document.body.appendChild(toast);
    }

    createToast(message, type) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 12px 24px;
            background: ${type === 'warning' ? '#ffc107' : type === 'success' ? '#28a745' : '#17a2b8'};
            color: ${type === 'warning' ? '#1a1a2e' : 'white'};
            border-radius: 10px;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 9999;
            max-width: 90%;
            cursor: ${type === 'info' ? 'pointer' : 'default'};
        `;
        return toast;
    }

    // ============================================================
    // BACKGROUND SYNC
    // ============================================================
    setupBackgroundSync() {
        if (!('serviceWorker' in navigator)) return;

        // Register sync
        navigator.serviceWorker.ready.then((registration) => {
            // Sync every 30 minutes
            setInterval(() => {
                if (navigator.onLine) {
                    this.syncData();
                }
            }, 30 * 60 * 1000);

            // Sync on page visibility change
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && navigator.onLine) {
                    this.syncData();
                }
            });
        });
    }

    async syncData() {
        console.log('Syncing data...');
        
        try {
            // Get pending sales from IndexedDB
            const pendingSales = await this.getPendingSales();
            
            if (pendingSales.length > 0) {
                console.log(`Syncing ${pendingSales.length} pending sales...`);
                
                for (const sale of pendingSales) {
                    try {
                        await this.submitSale(sale);
                        await this.removePendingSale(sale.id);
                    } catch (error) {
                        console.error('Error syncing sale:', error);
                    }
                }
            }
            
            // Update last sync time
            localStorage.setItem('lastSyncTime', Date.now().toString());
            console.log('Sync complete!');
        } catch (error) {
            console.error('Sync error:', error);
        }
    }

    // ============================================================
    // INDEXEDDB HELPERS (for offline storage)
    // ============================================================
    getPendingSales() {
        // This would be implemented with your IndexedDB logic
        // For now, return empty array
        return Promise.resolve([]);
    }

    submitSale(sale) {
        // Submit sale to API
        return fetch('/api/sales', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(sale)
        }).then(res => res.json());
    }

    removePendingSale(id) {
        // Remove from IndexedDB
        return Promise.resolve();
    }

    // ============================================================
    // INSTALL STATUS CHECK
    // ============================================================
    checkInstallStatus() {
        // Check if app is installed (display-mode: standalone)
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.isInstalled = true;
            this.hideInstallButton();
        }

        // Check for iOS standalone mode
        if (window.navigator.standalone === true) {
            this.isInstalled = true;
            this.hideInstallButton();
        }
    }

    // ============================================================
    // ANALYTICS
    // ============================================================
    trackInstall(action = 'installed') {
        // Send analytics for install events
        const data = {
            action: action,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            platform: this.getPlatform()
        };
        
        console.log('Install analytics:', data);
        
        // Send to server if online
        if (navigator.onLine) {
            fetch('/api/analytics/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).catch(() => {
                // Store for later sync
                localStorage.setItem('pendingAnalytics', JSON.stringify(data));
            });
        }
    }

    getPlatform() {
        const ua = navigator.userAgent;
        if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
        if (ua.includes('Android')) return 'Android';
        if (ua.includes('Windows')) return 'Windows';
        return 'Other';
    }
}

// ============================================================
// INITIALIZE PWA
// ============================================================
let pwaManager;

document.addEventListener('DOMContentLoaded', () => {
    pwaManager = new PWAManager();
});

// Make available globally
window.PWAManager = PWAManager;
