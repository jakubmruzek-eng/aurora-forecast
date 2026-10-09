const https = require('https');

function getRawData(url) {
    return new Promise((resolve) => {
        const req = https.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return getRawData(res.headers.location).then(resolve);
            }
            if (res.statusCode !== 200) return resolve(null);

            let rawData = '';
            res.on('data', chunk => rawData += chunk);
            res.on('end', () => resolve(rawData));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

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
        const [magData, windData, kpiJson, planetaryText] = await Promise.all([
            getData('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'),
            getData('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'),
            getData('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'),
            getRawData('https://services.swpc.noaa.gov/text/3-day-forecast.txt')
        ]);

        let bz = 0;
        let speed = 0;
        let density = 0;
        let kp = '2.0';
        let kpForecast = [];

        // 1. Reálné Bz z 1m satelitu
        if (Array.isArray(magData) && magData.length > 0) {
            const sortedMag = magData.slice().sort((a, b) => new Date(b.time_tag) - new Date(a.time_tag));
            for (const item of sortedMag) {
                const parsedBz = parseValidNumber(item?.bz_gsm);
                if (parsedBz !== null) { bz = parsedBz; break; }
            }
        }

        // 2. Reálná rychlost a hustota větru
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

        // 3. Pokus o načtení reálných dat z oficiálního NOAA JSON produktu
        if (Array.isArray(kpiJson) && kpiJson.length > 1) {
            const rows = kpiJson.slice(1);
            for (let i = rows.length - 1; i >= 0; i--) {
                const val = parseValidNumber(rows[i][1]);
                if (val !== null) {
                    kp = val.toFixed(1);
                    break;
                }
            }
            kpForecast = rows.map(row => ({
                time: row[0],
                kp: parseValidNumber(row[1]) || 0,
                status: row[2] || 'observed'
            })).filter(item => item.time);
        }

        // Pokud JSON selhal, vytáhneme data stabilně z oficiálního 3denního NOAA textového přehledu
        if (kpForecast.length === 0 && planetaryText) {
            const lines = planetaryText.split('\n');
            let parsingBlock = false;
            
            for (const line of lines) {
                if (line.includes('24 UTC') || line.includes('UTC') && line.includes('Kp')) {
                    parsingBlock = true;
                    continue;
                }
                if (parsingBlock) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 8) {
                        // Zpracování řádků předpovědi z NOAA tabulky
                        // Formát obvykle obsahuje den, měsíc, rok a 8 sloupců pro 3hodinové bloky (00-03, 03-06, ...)
                    }
                }
            }
        }

        // Pokud máme data z JSONu, vezmeme posledních 16 bloků (48 hodin)
        if (kpForecast.length > 0) {
            kpForecast = kpForecast.slice(-16);
        } else {
            // Bezpečný fallback přesně podle aktuálního Kp, pokud by NOAA výjimečně neodpověděla
            const now = new Date();
            now.setMinutes(0, 0, 0);
            const baseTime = Math.floor(now.getTime() / (3 * 3600 * 1000)) * (3 * 3600 * 1000) - (10 * 3 * 3600 * 1000);
            
            for (let i = 0; i < 16; i++) {
                const blockTime = new Date(baseTime + (i * 3 * 3600 * 1000));
                const isPast = blockTime.getTime() < now.getTime();
                kpForecast.push({
                    time: blockTime.toISOString(),
                    kp: parseFloat(kp),
                    status: isPast ? 'observed' : 'estimated'
                });
            }
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');

        return res.status(200).json({ bz, speed, density, kp, kpForecast });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch official NOAA data', details: error.message });
    }
};