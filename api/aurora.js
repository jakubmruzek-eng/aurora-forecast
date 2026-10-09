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

        // Reálná magnetická data (Bz)
        if (Array.isArray(magData) && magData.length > 0) {
            const sortedMag = magData.slice().sort((a, b) => new Date(b.time_tag) - new Date(a.time_tag));
            for (const item of sortedMag) {
                const parsedBz = parseValidNumber(item?.bz_gsm);
                if (parsedBz !== null) { bz = parsedBz; break; }
            }
        }

        // Reálná data solárního větru (rychlost a hustota)
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

        // Zpracování reálných K-index dat z NOAA produktu (pole polí)
        if (Array.isArray(kpData) && kpData.length > 1) {
            const header = kpData[0];
            let timeIdx = header.indexOf('time_tag');
            if (timeIdx === -1) timeIdx = 0;
            let kpIdx = header.indexOf('kp');
            if (kpIdx === -1) kpIdx = 1;
            let statusIdx = header.indexOf('observer'); // nebo status/source podle struktury NOAA

            const rows = kpData.slice(1);

            // Nalezení aktuálního platného Kp
            for (let i = rows.length - 1; i >= 0; i--) {
                const val = parseValidNumber(rows[i][kpIdx]);
                if (val !== null) {
                    kp = val.toFixed(1);
                    break;
                }
            }

            // Naplnění reálných bloků z NOAA
            kpForecast = rows.map(row => {
                const val = parseValidNumber(row[kpIdx]);
                return {
                    time: row[timeIdx],
                    kp: val !== null ? val : 0,
                    status: row[2] || 'observed'
                };
            }).filter(item => item.time && item.kp >= 0);

            // Vezmeme posledních 16 reálných bloků (48 hodin)
            kpForecast = kpForecast.slice(-16);
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');

        return res.status(200).json({ bz, speed, density, kp, kpForecast });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to process real NOAA data', details: error.message });
    }
};