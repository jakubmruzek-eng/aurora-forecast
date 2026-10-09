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
                    if (!isNaN(d) && d > 0) density = d;
                }
                if (speed > 0 && density > 0) break;
            }
        }

        if (forecastText) {
            const lines = forecastText.split('\n');
            let capturing = false;
            let dates = [];
            let currentYear = new Date().getFullYear();
            let months = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };

            for (let line of lines) {
                if (line.includes('NOAA Kp index breakdown')) {
                    capturing = true;
                    continue;
                }
                if (capturing) {
                    if (line.includes('Oct') || line.includes('Nov') || line.includes('Dec') || line.includes('Jan') || line.includes('Feb') || line.includes('Mar') || line.includes('Apr') || line.includes('May') || line.includes('Jun') || line.includes('Jul') || line.includes('Aug') || line.includes('Sep')) {
                        const matches = line.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov)\s+\d+/g);
                        if (matches && matches.length > 0) {
                            dates = matches.map(m => {
                                const parts = m.trim().split(/\s+/);
                                return { month: months[parts[0]], day: parseInt(parts[1], 10) };
                            });
                        }
                        continue;
                    }

                    if (line.includes('UT') && dates.length > 0) {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 2) {
                            const timeSlot = parts[0];
                            const startHour = parseInt(timeSlot.split('-')[0], 10);
                            
                            let partIdx = 1;
                            for (let d = 0; d < dates.length; d++) {
                                if (partIdx < parts.length) {
                                    while (partIdx < parts.length && parts[partIdx].startsWith('(')) {
                                        partIdx++;
                                    }
                                    if (partIdx < parts.length) {
                                        const kpVal = parseFloat(parts[partIdx]);
                                        if (!isNaN(kpVal) && kpVal >= 0 && dates[d]) {
                                            const { month, day } = dates[d];
                                            // Použijeme čistý lokální string, aby se čas v prohlížeči neposouval
                                            const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(startHour).padStart(2, '0')}:00:00`;
                                            const nowTime = Date.now();
                                            
                                            kpForecast.push({
                                                time: dateStr,
                                                kp: kpVal,
                                                status: new Date(dateStr).getTime() <= nowTime ? 'observed' : 'predicted'
                                            });
                                        }
                                    }
                                }
                                partIdx++;
                            }
                        }
                    }

                    if (line.trim() === '' && kpForecast.length > 0) {
                        capturing = false;
                    }
                }
            }
        }

        if (kpForecast.length > 0) {
            kpForecast.sort((a, b) => new Date(a.time) - new Date(b.time));
            
            const nowTime = Date.now();
            let currentIndex = kpForecast.findIndex(item => new Date(item.time).getTime() > nowTime);
            if (currentIndex === -1) currentIndex = Math.max(0, kpForecast.length - 12);
            
            let startIndex = Math.max(0, currentIndex - 4);
            let endIndex = startIndex + 16;
            kpForecast = kpForecast.slice(startIndex, endIndex);

            const activeBlock = kpForecast.find(item => new Date(item.time).getTime() >= nowTime);
            if (activeBlock) {
                kp = activeBlock.kp.toFixed(1);
            }
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate');

        return res.status(200).json({ bz, speed, density, kp, kpForecast });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to process 3-day forecast', details: error.message });
    }
};