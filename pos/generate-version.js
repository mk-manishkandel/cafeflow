import fs from 'fs';
import path from 'path';

// Read the version from constants/version.ts
const versionPath = path.resolve('./constants/version.ts');
const versionContent = fs.readFileSync(versionPath, 'utf-8');

const versionMatch = versionContent.match(/export const APP_VERSION = '([^']+)';?/);
const version = versionMatch ? versionMatch[1] : '1.0.0';



// Write to public/version.json
const publicDir = path.resolve('./public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir);
}

const versionData = {
    version,
    buildTime: new Date().toISOString()
};

fs.writeFileSync(
    path.join(publicDir, 'version.json'),
    JSON.stringify(versionData, null, 2)
);


