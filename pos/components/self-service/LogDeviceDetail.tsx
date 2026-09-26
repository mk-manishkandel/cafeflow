import React, { useMemo } from 'react';
import { UAParser } from 'ua-parser-js';

interface LogDeviceDetailProps {
    userAgent?: string;
    ipAddress?: string;
}

const LogDeviceDetail: React.FC<LogDeviceDetailProps> = ({ userAgent, ipAddress }) => {
    const info = useMemo(() => {
        const parser = new UAParser(userAgent || '');
        const device = parser.getDevice();
        const os = parser.getOS();
        const browser = parser.getBrowser();

        const deviceDisplay = device.model
            ? `${device.vendor || ''} ${device.model}`.trim()
            : (os.name ? `${os.name} ${os.version || ''}` : 'Unknown Device');

        return {
            deviceDisplay,
            browserName: browser.name
        };
    }, [userAgent]);

    return (
        <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-700 truncate max-w-[150px]" title={userAgent}>
                {info.deviceDisplay}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] font-bold text-slate-400 tabular-nums px-1.5 py-0.5 bg-slate-50 rounded border border-slate-100 flex items-center gap-1">
                    {ipAddress || '0.0.0.0'}
                </span>
                {info.browserName && (
                    <span className="text-[9px] font-bold text-slate-400 px-1.5 py-0.5 bg-slate-50 rounded border border-slate-100">
                        {info.browserName}
                    </span>
                )}
            </div>
        </div>
    );
};

export default React.memo(LogDeviceDetail);
