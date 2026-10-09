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

        // 1. Reálné Bz
        if (Array.isArray(magData) && magData.length > 0) {
            const sortedMag = magData.slice().sort((a, b) => new Date(b.time_tag) - new Date(a.time_tag));
            for (const item of sortedMag) {
                const parsedBz = parseValidNumber(item?.bz_gsm);
                if (parsedBz !== null) { bz = parsedBz; break; }
            }
        }

        // 2. Reálný solární vítr
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

        // 3. Reálné Kp hodnoty přímo z NOAA JSON struktury (pole polí)
        if (Array.isArray(kpData) && kpData.length > 1) {
            // První řádek je hlavička, data začínají od indexu 1
            const rows = kpData.slice(1);

            // Najdeme aktuální Kp z posledních platných záznamů
            for (let i = rows.length - 1; i >= 0; i--) {
                const val = parseValidNumber(rows[i][1]);
                if (val !== null) {
                    kp = val.toFixed(1);
                    break;
                }
            }

            // Převedení všech řádků na čistá data pro časovou osu
            const allBlocks = rows.map(row => {
                const timeVal = row[0];
                const kpVal = parseValidNumber(row[1]);
                // NOAA v posledním sloupci nebo podle aktuálního času určuje status
                const nowTime = new Date().getTime();
                const blockTime = new Date(timeVal).getTime();
                const statusVal = !isNaN(blockTime) && blockTime <= nowTime ? 'observed' : 'estimated';

                return {
                    time: timeVal,
                    kp: kpVal !== null ? kpVal : 0,
                    status: statusVal
                };
            }).filter(item => item.time && item.kp > 0);

            // Vezmeme posledních 16 bloků, které pokrývají aktuální stav a nejbližší výhled
            if (allBlocks.length >= 16) {
                kpForecast = allBlocks.slice(-16);
            } else {
                kpForecast = allBlocks;
            }
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');

        return res.status(200).json({ bz, speed, density, kp, kpForecast });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to process NOAA data', details: error.message });
    }
};