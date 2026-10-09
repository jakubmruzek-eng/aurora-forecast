const https = require('https');

function getData(url) {
    return new Promise((resolve) => {
        const req = https.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return getData(res.headers.location).then(resolve);
            }
            if (res.statusCode !== 200) return resolve(null);

            let rawData = '';
            res.on('data', chunk => rawData += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(rawData)); } catch (e) { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

function parseValidNumber(val) {
    if (val === null || val === undefined) return null;
    const num = parseFloat(val);
    if (isNaN(num) || num <= -900) return null;
    return num;
}

module.exports = async function handler(req, res) {
    try {
        const [magData, windData, kpData] = await Promise.all([
            getData('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'),
            getData('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'),
            getData('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')
        ]);

        let bz = 0;
        let speed = 0;
        let density = 0;
        let kp = '2.0';
        let kpForecast = [];

        // 1. Bz z rtsw_mag_1m.json[cite: 6]
        if (Array.isArray(magData) && magData.length > 0) {
            const sortedMag = magData.slice().sort((a, b) => new Date(b.time_tag) - new Date(a.time_tag));
            for (const item of sortedMag) {
                const parsedBz = parseValidNumber(item?.bz_gsm);
                if (parsedBz !== null) {
                    bz = parsedBz;
                    break;
                }
            }
        }

        // 2. Rychlost a Hustota z rtsw_wind_1m.json[cite: 6]
        if (Array.isArray(windData) && windData.length > 0) {
            const sortedWind = windData.slice().sort((a, b) => new Date(b.time_tag) - new Date(a.time_tag));
            for (const item of sortedWind) {
                if (speed === 0) {
                    const s = parseValidNumber(item?.proton_speed);
                    if (s !== null && s > 0) speed = s;
                }
                if (density === 0) {
                    const d = parseValidNumber(item?.proton_density);
                    if (d !== null && d > 0) density = d;
                }
                if (speed > 0 && density > 0) break;
            }
        }

        // 3. Kp index a forecast z noaa-planetary-k-index.json[cite: 6]
        if (Array.isArray(kpData) && kpData.length > 1) {
            for (let i = kpData.length - 1; i >= 1; i--) {
                const row = kpData[i];
                const parsedKp = parseValidNumber(row[1]);
                if (parsedKp !== null) {
                    kp = parsedKp.toFixed(1);
                    break;
                }
            }

            // Vezmeme posledních 8 řádků a bezpečně vytáhneme hodnotu z indexu 1
            const sliceRows = kpData.slice(-8);
            kpForecast = sliceRows.map(row => {
                const val = parseFloat(row[1]);
                return {
                    time: row[0],
                    kp: !isNaN(val) ? val : 2.0, // pokud by byl prázdný, dáme fallback 2.0
                    status: row[2] || 'observed'
                };
            });
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');

        return res.status(200).json({ bz, speed, density, kp, kpForecast });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to parse NOAA data', details: error.message });
    }
};