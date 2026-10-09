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

        if (Array.isArray(magData) && magData.length > 0) {
            const sortedMag = magData.slice().sort((a, b) => new Date(b.time_tag) - new Date(a.time_tag));
            for (const item of sortedMag) {
                const parsed = parseFloat(item?.bz_gsm);
                if (!isNaN(parsed) && parsed > -900) { bz = parsed; break; }
            }
        }

        if (Array.isArray(windData) && windData.length > 0) {
            const sortedWind = windData.slice().sort((a, b) => new Date(b.time_tag) - new Date(a.time_tag));
            for (const item of sortedWind) {
                if (speed === 0) {
                    const s = parseFloat(item?.proton_speed);
                    if (!isNaN(s) && s > 0) speed = s;
                }
                if (density === 0) {
                    const d = parseFloat(item?.proton_density);
                    if (!isNaN(d) && d > 0) density = d;
                }
                if (speed > 0 && density > 0) break;
            }
        }

        if (Array.isArray(kpData) && kpData.length > 1) {
            // První řádek je ["time_tag", "kp", "observed", "station_count"]
            // Zjistíme index sloupce "kp" z hlavičky
            const header = kpData[0];
            const kpIndex = header.indexOf('kp');

            if (kpIndex !== -1) {
                // Najdeme poslední platnou hodnotu pro aktuální Kp
                for (let i = kpData.length - 1; i >= 1; i--) {
                    const val = parseFloat(kpData[i][kpIndex]);
                    if (!isNaN(val)) {
                        kp = val.toFixed(1);
                        break;
                    }
                }

                // Vytáhneme posledních 8 záznamů pro časovou osu
                kpForecast = kpData.slice(-8).map(row => ({
                    time: row[0],
                    kp: parseFloat(row[kpIndex]) || 0,
                    status: row[2] || 'observed'
                }));
            }
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');

        return res.status(200).json({ bz, speed, density, kp, kpForecast });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to parse NOAA data', details: error.message });
    }
};