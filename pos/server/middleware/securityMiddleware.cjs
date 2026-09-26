const logger = require('../utils/logger.cjs');

/**
 * VPN and Proxy Suppression Middleware
 * Detects common tunneling headers and blocks unauthorized proxied requests.
 */
const vpnSuppression = (req, res, next) => {
    // Whitelist for internal loopback and common development environments
    const whitelist = ['127.0.0.1', '::1', 'localhost'];
    const clientIp = req.realIp || req.ip;

    if (whitelist.includes(clientIp)) return next();

    // 1. Detect common proxy manipulation headers
    const proxyHeaders = [
        'via',
        'forwarded',
        'x-real-ip',
        'x-proxy-id',
        'proxy-connection'
    ];

    const detectedHeaders = proxyHeaders.filter(h => req.headers[h]);

    // 2. Anonymized Proxy Detection (e.g. TOR, high-anonymity VPNs)
    // Check for weird X-Forwarded-For depths
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
        const ips = forwardedFor.split(',').map(ip => ip.trim());
        if (ips.length > 3) {
            logger.warn(`Deep Proxy Chain detected from ${clientIp}: ${forwardedFor}`);
            return res.status(403).json({
                error: 'Security Breach Protocol: Multi-layered proxy chains are prohibited for financial operations.'
            });
        }
    }

    // 3. Block known public VPN egress/transit headers if present
    // Threshold increased to 2 to allow standard Nginx + 1 downstream proxy (e.g. Cloudflare/Via)
    // Suspicious headers like 'x-proxy-id' or 'proxy-connection' should be monitored more closely
    const sensitiveHeaders = ['x-proxy-id', 'proxy-connection'];
    const hasSensitiveHeader = sensitiveHeaders.some(h => req.headers[h]);

    if (detectedHeaders.length > 2 || hasSensitiveHeader) {
        logger.warn(`VPN/Proxy Suppression triggered for ${clientIp}. Headers: ${detectedHeaders.join(', ')}. Path: ${req.path}`);
        return res.status(403).json({
            error: 'Security Breach Protocol: Unauthorized tunneling detected. Please disconnect from VPN/Proxy to use the POS.'
        });
    }

    next();
};

module.exports = { vpnSuppression };
