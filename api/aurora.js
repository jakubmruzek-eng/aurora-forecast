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
            getData('https://services.swpc.noava.gov/json/rtsw/rtsw_wind_1m.json'), // opraveno
            getData('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')
        ]);

        // Bezpečnější stažení plazmatu z prověřeného endpointu, kdyby wind zlobil
        const fallbackWind = await getData('https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json');

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

        const windSource = (Array.isArray(windData) && windData.length > 0) ? windData : fallbackWind;
        if (Array.isArray(windSource) && windSource.length > 0) {
            const sortedWind = windSource.slice().sort((a, b) => new Date(b.time_tag || b[0]) - new Date(a.time_tag || a[0]));
            for (const item of sortedWind) {
                if (speed === 0) {
                    const s = parseFloat(item?.proton_speed || item[2]);
                    if (!isNaN(s) && s > 0) speed = s;
                }
                if (density === 0) {
                    const d = parseFloat(item?.proton_density || item[1]);
                    if (!isNaN(d) && d > 0) density = d;
                }
                if (speed > 0 && density > 0) break;
            }
        }

        if (Array.isArray(kpData) && kpData.length > 1) {
            // Projdeme záznamy od konce a vytáhneme první neprázdnou hodnotu Kp (zkusíme index 1 i 2)
            for (let i = kpData.length - 1; i >= 1; i--) {
                const row = kpData[i];
                let val = parseFloat(row[1]);
                if (isNaN(val) || val <= 0) val = parseFloat(row[2]);
                if (!isNaN(val) && val > 0) {
                    kp = val.toFixed(1);
                    break;
                }
            }

            kpForecast = kpData.slice(-8).map(row => {
                let val = parseFloat(row[1]);
                if (isNaN(val) || val <= 0) val = parseFloat(row[2]);
                if (isNaN(val)) val = 0;
                return {
                    time: row[0],
                    kp: val,
                    status: row[3] || row[2] || 'observed'
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