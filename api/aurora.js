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
        const [magData, windData, kpRaw] = await Promise.all([
            getData('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'),
            getData('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'),
            getRawData('https://services.swpc.noaa.gov/text/planetary-k-index.txt')
        ]);

        let bz = 0;
        let speed = 0;
        let density = 0;
        let kp = '2.0';
        let kpForecast = [];

        if (Array.isArray(magData) && magData.length > 0) {
            const sortedMag = magData.slice().sort((a, b) => new Date(b.time_tag) - new Date(a.time_tag));
            for (const item of sortedMag) {
                const parsedBz = parseValidNumber(item?.bz_gsm);
                if (parsedBz !== null) { bz = parsedBz; break; }
            }
        }

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

        // Zpracování čistého textového výstupu NOAA K-indexu
        if (kpRaw) {
            const lines = kpRaw.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                // Přeskočíme komentáře a hlavičky
                if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(':') || trimmed.includes('NOAA')) continue;
                
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 5) {
                    // Formát NOAA textu: YYYY MM DD HH Kp ...
                    const year = parts[0];
                    const month = parts[1].padStart(2, '0');
                    const day = parts[2].padStart(2, '0');
                    const hour = parts[3].padStart(2, '0');
                    const kpVal = parseFloat(parts[4]);

                    if (!isNaN(kpVal)) {
                        const timeStr = `${year}-${month}-${day}T${hour}:00:00Z`;
                        kpForecast.push({
                            time: timeStr,
                            kp: kpVal,
                            status: parts[5] || 'observed'
                        });
                    }
                }
            }

            // Vezmeme aktuální Kp z posledního platného záznamu
            if (kpForecast.length > 0) {
                kp = kpForecast[kpForecast.length - 1].kp.toFixed(1);
            }

            // Ořízneme na posledních 16 bloků (cca 48 hodin / 2 dny)
            kpForecast = kpForecast.slice(-16);
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');

        return res.status(200).json({ bz, speed, density, kp, kpForecast });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to parse NOAA data', details: error.message });
    }
};