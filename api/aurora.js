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

module.exports = async function handler(req, res) {
    try {
        const [magData, windData, forecastText] = await Promise.all([
            getData('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'),
            getData('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'),
            getRawData('https://services.swpc.noaa.gov/text/3-day-forecast.txt')
        ]);

        let bz = 0;
        let speed = 0;
        let density = 0;
        let kp = '2.0';
        let kpForecast = [];

        if (Array.isArray(magData) && magData.length > 0) {
            const sortedMag = magData.slice().sort((a, b) => new Date(b.time_tag) - new Date(a.time_tag));
            for (const item of sortedMag) {
                const val = parseFloat(item?.bz_gsm);
                if (!isNaN(val) && val > -900) { bz = val; break; }
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
                    if (d !== null && d > 0) density = d;
                }
                if (speed > 0 && density > 0) break;
            }
        }

        if (forecastText) {
            const lines = forecastText.split('\n');
            let capturing = false;
            let currentYear = new Date().getFullYear();
            let months = {
                'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
            };

            for (let line of lines) {
                if (line.includes('UNIT: Kp')) {
                    capturing = true;
                    continue;
                }
                if (capturing) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.includes(':') || trimmed.includes('NOAA')) continue;

                    const parts = trimmed.split(/\s+/);
                    if (parts.length >= 10) {
                        const monthStr = parts[0];
                        const dayStr = parts[1];
                        const month = months[monthStr];

                        if (month !== undefined && !isNaN(dayStr)) {
                            const day = parseInt(dayStr, 10);
                            const hours = ['00:00:00', '03:00:00', '06:00:00', '09:00:00', '12:00:00', '15:00:00', '18:00:00', '21:00:00'];
                            
                            for (let i = 0; i < 8; i++) {
                                const kpVal = parseFloat(parts[2 + i]);
                                if (!isNaN(kpVal) && kpVal >= 0) {
                                    const dateObj = new Date(Date.UTC(currentYear, month, day, parseInt(hours[i].substring(0, 2)), 0, 0));
                                    const nowTime = Date.now();
                                    const blockTime = dateObj.getTime();
                                    
                                    kpForecast.push({
                                        time: dateObj.toISOString(),
                                        kp: kpVal,
                                        status: blockTime <= nowTime ? 'observed' : 'predicted'
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        if (kpForecast.length > 0) {
            kpForecast.sort((a, b) => new Date(a.time) - new Date(b.time));
            
            const nowTime = Date.now();
            let currentIndex = kpForecast.findIndex(item => new Date(item.time).getTime() > nowTime);
            if (currentIndex === -1) currentIndex = kpForecast.length - 16;
            
            let startIndex = Math.max(0, currentIndex - 8);
            let endIndex = startIndex + 16;
            kpForecast = kpForecast.slice(startIndex, endIndex);

            const activeBlock = kpForecast.find(item => new Date(item.time).getTime() >= nowTime);
            if (activeBlock) {
                kp = activeBlock.kp.toFixed(1);
            }
        }

        if (kpForecast.length === 0) {
            const now = new Date();
            now.setMinutes(0, 0, 0);
            const baseTime = Math.floor(now.getTime() / (3 * 3600 * 1000)) * (3 * 3600 * 1000) - (8 * 3 * 3600 * 1000);
            for (let i = 0; i < 16; i++) {
                const blockTime = new Date(baseTime + (i * 3 * 3600 * 1000));
                kpForecast.push({
                    time: blockTime.toISOString(),
                    kp: 3.0,
                    status: blockTime.getTime() <= now.getTime() ? 'observed' : 'predicted'
                });
            }
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');

        return res.status(200).json({ bz, speed, density, kp, kpForecast });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to process 3-day forecast', details: error.message });
    }
};