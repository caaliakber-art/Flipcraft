// Minimal service worker so the library can be added to a phone's home screen.
// It does not cache anything: every visit loads the latest issues from the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
