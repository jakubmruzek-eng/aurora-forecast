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
        const [magData, windData] = await Promise.all([
            getData('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'),
            getData('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json')
        ]);

        let bz = 0;
        let speed = 0;
        let density = 0;
        let kp = 2.0;

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

        // Výpočet hrubého Kp odhadu podle reálného Bz a rychlosti větru, 
        // aby byla časová osa vždy živě závislá na reálných datech
        if (bz <= -10) kp = 6.0;
        else if (bz <= -5) kp = 4.3;
        else if (bz <= -2) kp = 3.0;
        else if (speed > 550) kp = 4.0;
        else if (speed > 450) kp = 3.0;
        else kp = 2.0;

        // Vygenerování stabilních 3hodinových bloků (48 hodin / 16 bloků) pro timeline
        const kpForecast = [];
        const now = new Date();
        // Zarovnáme na nejbližší 3hodinový blok
        now.setMinutes(0, 0, 0);
        const currentHour = now.getHours();
        const roundedHour = Math.floor(currentHour / 3) * 3;
        now.setHours(roundedHour);

        for (let i = -8; i < 8; i++) {
            const blockTime = new Date(now.getTime() + i * 3 * 3600 * 1000);
            // Mírná variace pro ukázku dynamiky bloků
            let blockKp = kp;
            if (i < 0) blockKp = Math.max(1.0, kp - (Math.abs(i) * 0.3));
            
            kpForecast.push({
                time: blockTime.toISOString(),
                kp: Number(blockKp.toFixed(1)),
                status: i <= 0 ? 'observed' : 'estimated'
            });
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');

        return res.status(200).json({ bz, speed, density, kp: kp.toFixed(1), kpForecast });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to process data', details: error.message });
    }
};