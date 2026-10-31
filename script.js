const REFRESH_INTERVAL = 60000;

const DEFAULT_LOCATION = {
    lat: 66.5039,
    lon: 25.7294,
    name: "Rovaniemi"
};

const TIME_ZONE = "Europe/Helsinki";

let dailySunTimes = {};

function toggleMenu() {
    const navLinks = document.getElementById('navLinks');
    if (navLinks) {
        navLinks.classList.toggle('show');
    }
}

function showSection(e, sectionId) {
    if (e && e.preventDefault) e.preventDefault();

    document.querySelectorAll('.page-section').forEach(sec => {
        sec.classList.remove('active');
        sec.style.display = 'none';
    });

    document.querySelectorAll('.nav-links li').forEach(li => {
        li.classList.remove('active');
    });

    const activeSec = document.getElementById(sectionId);
    if (activeSec) {
        activeSec.classList.add('active');
        activeSec.style.display = 'flex';
    }

    const activeNavLi = document.getElementById(`nav-${sectionId}`);
    if (activeNavLi) {
        activeNavLi.classList.add('active');
    }

    const navLinks = document.getElementById('navLinks');
    if (navLinks) {
        navLinks.classList.remove('show');
    }
}

function getMoonPhaseForDate(year, month, day) {
    let y = year;
    let m = month;
    let d = day;

    let c = 0, e = 0, jd = 0;
    if (m < 3) { y--; m += 12; }
    ++m;
    c = 365.25 * y;
    e = 30.6 * m;
    jd = c + e + d - 694039.0;
    jd /= 29.53058867;
    let phase = jd - Math.floor(jd);
    phase = phase * 100;

    let icon = "🌕";
    if (phase <= 3 || phase >= 97) icon = "🌑";
    else if (phase > 3 && phase < 22) icon = "🌒";
    else if (phase >= 22 && phase <= 28) icon = "🌓";
    else if (phase > 28 && phase < 47) icon = "🌔";
    else if (phase >= 47 && phase <= 53) icon = "🌕";
    else if (phase > 53 && phase < 72) icon = "🌖";
    else if (phase >= 72 && phase <= 78) icon = "🌗";
    else if (phase > 78 && phase < 97) icon = "🌘";

    let illumination = Math.round(phase <= 50 ? phase * 2 : (100 - phase) * 2);
    if (illumination < 0) illumination = 0;

    let phaseName = "New Moon";
    if (phase > 1 && phase < 49) phaseName = "Waxing Crescent";
    else if (phase >= 49 && phase <= 51) phaseName = "First Quarter";
    else if (phase > 51 && phase < 99) phaseName = "Waxing Gibbous";
    else if (phase >= 99 || phase <= 1) phaseName = "Full Moon";
    else phaseName = "Waning Crescent";

    return {
        icon: icon,
        illumination: illumination,
        name: phaseName
    };
}

async function fetchDailySunTimes() {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${DEFAULT_LOCATION.lat}&longitude=${DEFAULT_LOCATION.lon}&daily=sunrise,sunset&timezone=${TIME_ZONE}`);
        const data = await res.json();
        
        if (data && data.daily && data.daily.time) {
            dailySunTimes = {};
            for (let i = 0; i < data.daily.time.length; i++) {
                const dateStr = data.daily.time[i];
                const [partsY, partsM, partsD] = dateStr.split('-').map(Number);

                const sunriseIso = data.daily.sunrise[i];
                const sunsetIso = data.daily.sunset[i];

                const sunriseTimeStr = sunriseIso.substring(11, 16);
                const sunsetTimeStr = sunsetIso.substring(11, 16);

                const srDate = new Date(sunriseIso);
                srDate.setMinutes(srDate.getMinutes() - 45);
                const starsDisappearStr = `${String(srDate.getHours()).padStart(2, '0')}:${String(srDate.getMinutes()).padStart(2, '0')}`;

                const ssDate = new Date(sunsetIso);
                ssDate.setMinutes(ssDate.getMinutes() + 45);
                const starsAppearStr = `${String(ssDate.getHours()).padStart(2, '0')}:${String(ssDate.getMinutes()).padStart(2, '0')}`;

                const moonInfo = getMoonPhaseForDate(partsY, partsM, partsD);

                dailySunTimes[dateStr] = {
                    sunriseStr: sunriseTimeStr,
                    sunsetStr: sunsetTimeStr,
                    starsDisappearStr: starsDisappearStr,
                    starsAppearStr: starsAppearStr,
                    moonIcon: moonInfo.icon,
                    moonIllumination: moonInfo.illumination,
                    moonName: moonInfo.name
                };
            }
        }
    } catch (e) {
        console.warn("Nepodařilo se stáhnout denní časy slunce z Open-Meteo", e);
    }
}

async function fetchAuroraData() {
    await fetchDailySunTimes();

    try {
        const response = await fetch(`https://aurora-forecast-blond.vercel.app/api/aurora?t=${Date.now()}`, {
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('API response failed');
        
        const data = await response.json();
        
        updateAuroraUI({
            bz: parseFloat(data.bz),
            speed: parseFloat(data.speed),
            density: parseFloat(data.density),
            kp: parseFloat(data.kp),
            kpForecast: data.kpForecast
        });
    } catch (e) {
        console.warn('Problém s načtením API', e);
    }

    initLocationAndWeather();
    updateMoonPhaseWidget();

    const timestamp = Date.now();
    const mapImg = document.getElementById('ovalMap');
    if (mapImg) mapImg.src = `https://services.swpc.noaa.gov/images/animations/ovation/north/latest.jpg?t=${timestamp}`;

    const sunspotsImg = document.getElementById('sunspotsImg');
    if (sunspotsImg) sunspotsImg.src = `https://services.swpc.noaa.gov/images/animations/suvi/primary/171/latest.png?t=${timestamp}`;

    const coronalHolesImg = document.getElementById('coronalHolesImg');
    if (coronalHolesImg) coronalHolesImg.src = `https://services.swpc.noaa.gov/images/animations/suvi/primary/195/latest.png?t=${timestamp}`;
}

function initLocationAndWeather() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                if (lat < 55 || lat > 75 || lon < 10 || lon > 35) {
                    console.warn('Detekovaná GPS je mimo Nordic region, používám výchozí Rovaniemi.');
                    fetchWeatherAndLocation(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.name);
                } else {
                    fetchWeatherAndLocation(lat, lon);
                }
            },
            (error) => {
                console.warn('GPS přístup odepřen nebo nedostupný, používám výchozí lokaci (Rovaniemi)', error);
                fetchWeatherAndLocation(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.name);
            },
            { timeout: 10000, enableHighAccuracy: true }
        );
    } else {
        console.warn('Geolokace nepodporována, používám výchozí lokaci (Rovaniemi)');
        fetchWeatherAndLocation(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.name);
    }
}

async function fetchWeatherAndLocation(lat, lon, customName = null) {
    try {
        let locationName = customName || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        
        if (!customName) {
            // Zvýšen detail a upraveno pořadí, aby se preferovaly lokální části, resorty a osady před celým městem
            const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`, {
                headers: { 'User-Agent': 'AuroraTracker/1.0' }
            });
            
            if (revRes.ok) {
                const revData = await revRes.json();
                if (revData && revData.address) {
                    const addr = revData.address;
                    // Hledá co nejkonkrétnější bod (turistické místo, resort, osada, vesnice, čtvrť)
                    const specificPlace = addr.tourism || addr.resort || addr.hamlet || addr.village || addr.suburb || addr.neighbourhood || addr.isolated_dwelling;
                    const broaderArea = addr.city || addr.town || addr.municipality;
                    
                    if (specificPlace) {
                        locationName = broaderArea && broaderArea !== specificPlace ? `${specificPlace}, ${broaderArea}` : specificPlace;
                    } else if (broaderArea) {
                        locationName = broaderArea;
                    }
                }
            }
        }

        const weatherRes = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`, {
            headers: { 'User-Agent': 'AuroraTrackerApp/1.0 (contact@example.com)' }
        });

        if (weatherRes.ok) {
            const data = await weatherRes.json();
            const timeseries = data.properties.timeseries;
            if (!timeseries || timeseries.length === 0) return;

            const currentDetails = timeseries[0].data.instant.details;
            const temp = currentDetails.air_temperature;
            const clouds = currentDetails.cloud_area_fraction;
            const wind = currentDetails.wind_speed;
            const humidity = currentDetails.relative_humidity;

            const dewPoint = (temp - ((100 - humidity) / 5)).toFixed(1);

            const mainTitleEl = document.getElementById('locationTitleMain');
            if (mainTitleEl) mainTitleEl.innerText = `📍 ${locationName}`;

            const weatherEl = document.getElementById('weatherInfo');
            if (weatherEl) weatherEl.innerHTML = `🌡️ ${temp}°C | ☁️ ${clouds}% clouds | 💨 ${wind} m/s`;
            
            const tempEl = document.getElementById('tempVal');
            if (tempEl) tempEl.innerText = `${temp} °C`;
            
            const cloudEl = document.getElementById('cloudVal');
            if (cloudEl) cloudEl.innerText = `${clouds} %`;

            const dewEl = document.getElementById('dewVal');
            if (dewEl) dewEl.innerText = `${dewPoint} °C`;

            renderYrHourlyWeather(timeseries);
        }
    } catch (e) {
        console.warn('Počasí z Yr.no nedostupné', e);
    }
}

function renderYrHourlyWeather(timeseries) {
    const container = document.getElementById('yrIframe');
    if (!container) return;

    let html = `<div style="display: flex; flex-direction: row; gap: 10px; overflow-x: auto; padding-bottom: 8px; width: 100%;">`;
    
    let count = 0;
    for (let i = 0; i < timeseries.length && count < 24; i++) {
        const entry = timeseries[i];
        const timeStr = entry.time;
        const details = entry.data.instant.details;
        
        const dateObj = new Date(timeStr);
        const dateLabel = !isNaN(dateObj) ? `${String(dateObj.getDate()).padStart(2, '0')}.${String(dateObj.getMonth() + 1).padStart(2, '0')}.` : '';
        const timeLabel = timeStr.substring(11, 16);
        
        const temp = details.air_temperature;
        const cloud = details.cloud_area_fraction;
        const wind = details.wind_speed;

        let cloudIcon = '☀️';
        if (cloud > 20 && cloud <= 70) cloudIcon = '⛅';
        else if (cloud > 70) cloudIcon = '☁️';

        html += `
            <div style="flex: 0 0 100px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; text-align: center;">
                <div style="font-size: 0.75rem; color: #a0aec0; margin-bottom: 2px;">${dateLabel}</div>
                <div style="font-size: 0.85rem; color: #4ef0c6; font-weight: 700;">${timeLabel}</div>
                <div style="font-size: 1.3rem; margin: 4px 0;">${cloudIcon}</div>
                <div style="font-size: 0.9rem; font-weight: 700; color: #fff;">${temp}°C</div>
                <div style="font-size: 0.75rem; color: #4ef0c6; margin-top: 2px;">☁️ ${cloud}%</div>
                <div style="font-size: 0.7rem; color: #a0aec0;">💨 ${wind} m/s</div>
            </div>
        `;
        count++;
    }
    html += `</div>`;
    container.innerHTML = html;
}

function updateMoonPhaseWidget() {
    const now = new Date();
    const hParts = getHelsinkiParts(now);
    const moonInfo = getMoonPhaseForDate(hParts.year, hParts.month, hParts.day);

    const moonEl = document.getElementById('moonInfo');
    if (moonEl) {
        moonEl.innerHTML = `${moonInfo.icon} ${moonInfo.name} — ${moonInfo.illumination}% illuminated`;
    }
}

function getHelsinkiParts(dateInput) {
    const date = new Date(dateInput);
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    const map = {};
    parts.forEach(p => map[p.type] = p.value);
    
    return {
        year: parseInt(map.year),
        month: parseInt(map.month),
        day: parseInt(map.day),
        hour: parseInt(map.hour),
        minute: parseInt(map.minute),
        dateKey: `${map.year}-${String(map.month).padStart(2, '0')}-${String(map.day).padStart(2, '0')}`
    };
}

function updateAuroraUI({ bz, speed, density, kp, kpForecast }) {
    const formattedBz = (bz > 0 ? '+' : '') + Number(bz).toFixed(1);

    const bzEl = document.getElementById('bzVal');
    if (bzEl) bzEl.innerText = `${formattedBz} nT`;
    
    const speedEl = document.getElementById('speedVal');
    if (speedEl) speedEl.innerText = `${Math.round(speed)} km/s`;
    
    const densityEl = document.getElementById('densityVal');
    if (densityEl) densityEl.innerText = `${Number(density).toFixed(1)} p/cm³`;
    
    const kpEl = document.getElementById('kpVal');
    if (kpEl) kpEl.innerText = `${Number(kp).toFixed(1)}`;

    const kpNum = parseFloat(kp) || 0;
    let gScaleText = "G0 (Quiet)";
    if (kpNum >= 9) gScaleText = "G5 (Extreme)";
    else if (kpNum >= 8) gScaleText = "G4 (Severe)";
    else if (kpNum >= 7) gScaleText = "G3 (Strong)";
    else if (kpNum >= 6) gScaleText = "G2 (Moderate)";
    else if (kpNum >= 5) gScaleText = "G1 (Minor)";

    const forecastKpEl = document.getElementById('forecastKpVal');
    if (forecastKpEl) forecastKpEl.innerText = kpNum.toFixed(1);

    const forecastScaleEl = document.getElementById('forecastScaleVal');
    if (forecastScaleEl) forecastScaleEl.innerText = gScaleText;

    let nextStormHtml = "Žádný G1+ v obzoru";
    if (kpForecast && Array.isArray(kpForecast)) {
        const nextStorm = kpForecast.find(item => parseFloat(item.kp) >= 5);
        if (nextStorm) {
            const hParts = getHelsinkiParts(nextStorm.time);
            const dayStr = `${String(hParts.day).padStart(2, '0')}.${String(hParts.month).padStart(2, '0')}.`;
            const hourStr = `${String(hParts.hour).padStart(2, '0')}:00`;
            const kpVal = parseFloat(nextStorm.kp).toFixed(1);

            let stormColor = "#48bb78";
            if (kpVal >= 9) stormColor = "#f56565";
            else if (kpVal >= 8) stormColor = "#f56565";
            else if (kpVal >= 7) stormColor = "#ed8936";
            else if (kpVal >= 6) stormColor = "#ecc94b";

            nextStormHtml = `
                <div style="font-size: 1.25rem; font-weight: 800; color: ${stormColor};">${dayStr} ${hourStr}</div>
                <div style="font-size: 0.9rem; font-weight: 700; color: ${stormColor}; margin-top: 2px;">(Kp ${kpVal})</div>
            `;
        }
    }

    const nextG1El = document.getElementById('nextG1Val');
    if (nextG1El) nextG1El.innerHTML = nextStormHtml;

    const timelineEl = document.getElementById('timelineContainer');
    if (timelineEl) {
        if (kpForecast && Array.isArray(kpForecast) && kpForecast.length > 0) {
            
            const daysMap = {};

            kpForecast.forEach((item) => {
                const hParts = getHelsinkiParts(item.time);
                if (isNaN(hParts.year)) return;

                const dayKey = hParts.dateKey;
                const localDateObj = new Date(hParts.year, hParts.month - 1, hParts.day);
                const dayName = localDateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'long', weekday: 'long' });
                
                const startHour = hParts.hour;
                const endHour = (startHour + 3) % 24;

                if (!daysMap[dayKey]) {
                    daysMap[dayKey] = {
                        dayName: dayName,
                        dateKey: dayKey,
                        events: []
                    };
                }

                const val = parseFloat(item.kp).toFixed(1);
                let scaleStr = "";
                let stormColor = "#a0aec0";
                if (val >= 9) { scaleStr = " G5 Extreme Storm"; stormColor = "#f56565"; }
                else if (val >= 8) { scaleStr = " G4 Severe Storm"; stormColor = "#f56565"; }
                else if (val >= 7) { scaleStr = " G3 Strong Storm"; stormColor = "#ed8936"; }
                else if (val >= 6) { scaleStr = " G2 Moderate Storm"; stormColor = "#ecc94b"; }
                else if (val >= 5) { scaleStr = " G1 Storm"; stormColor = "#48bb78"; }

                daysMap[dayKey].events.push({
                    sortHour: startHour,
                    sortMin: 0,
                    html: `
                        <div class="scout-row">
                            <div class="scout-time-col">
                                <span class="scout-time">${String(startHour).padStart(2, '0')}:00</span>
                            </div>
                            <div class="scout-desc-col">
                                🌐 <span style="font-weight: 600;">Kp ${val}</span><span style="color: ${stormColor}; font-weight: 700;">${scaleStr}</span> - until ${String(endHour).padStart(2, '0')}:00
                            </div>
                        </div>
                    `
                });
            });

            Object.keys(daysMap).sort().forEach(dayKey => {
                const dayData = daysMap[dayKey];
                
                const sunData = dailySunTimes[dayKey] || {
                    sunriseStr: "08:08",
                    sunsetStr: "15:53",
                    starsDisappearStr: "07:23",
                    starsAppearStr: "16:38",
                    moonIcon: "🌕",
                    moonIllumination: 50
                };

                const [srH, srM] = sunData.sunriseStr.split(':').map(Number);
                const [ssH, ssM] = sunData.sunsetStr.split(':').map(Number);
                const [sdH, sdM] = sunData.starsDisappearStr.split(':').map(Number);
                const [saH, saM] = sunData.starsAppearStr.split(':').map(Number);

                dayData.events.push({
                    sortHour: sdH, sortMin: sdM,
                    html: `
                        <div class="scout-row">
                            <div class="scout-time-col"><span class="scout-time">${sunData.starsDisappearStr}</span></div>
                            <div class="scout-desc-col">⭐ Stars Disappear</div>
                        </div>
                    `
                });
                dayData.events.push({
                    sortHour: srH, sortMin: srM,
                    html: `
                        <div class="scout-row">
                            <div class="scout-time-col"><span class="scout-time">${sunData.sunriseStr}</span></div>
                            <div class="scout-desc-col">🌅 Sunrise</div>
                        </div>
                    `
                });
                dayData.events.push({
                    sortHour: ssH, sortMin: ssM,
                    html: `
                        <div class="scout-row">
                            <div class="scout-time-col"><span class="scout-time">${sunData.sunsetStr}</span></div>
                            <div class="scout-desc-col">🌇 Sunset</div>
                        </div>
                    `
                });
                dayData.events.push({
                    sortHour: saH, sortMin: saM,
                    html: `
                        <div class="scout-row">
                            <div class="scout-time-col"><span class="scout-time">${sunData.starsAppearStr}</span></div>
                            <div class="scout-desc-col">⭐ Stars Appear</div>
                        </div>
                    `
                });

                dayData.events.sort((a, b) => {
                    if (a.sortHour !== b.sortHour) return a.sortHour - b.sortHour;
                    return (a.sortMin || 0) - (b.sortMin || 0);
                });
            });

            let timelineHtml = '<div class="scout-timeline">';

            Object.keys(daysMap).sort().forEach(dayKey => {
                const dayData = daysMap[dayKey];
                const sunData = dailySunTimes[dayKey] || { moonIcon: "🌕", moonIllumination: 50 };

                if (dayData.events.length > 0) {
                    timelineHtml += `
                        <div class="scout-day-header">
                            <span>${dayData.dayName}</span>
                            <span class="scout-moon-header">Moon Phase: ${sunData.moonIcon} ${sunData.moonIllumination}%</span>
                        </div>
                    `;
                    dayData.events.forEach(ev => {
                        timelineHtml += ev.html;
                    });
                }
            });

            timelineHtml += '</div>';
            timelineHtml += `
                <div style="text-align: center; font-size: 0.75rem; color: #718096; margin-top: 10px;">
                    🕒 All times are displayed in Finnish local time (EET / EEST, Rovaniemi)
                </div>
            `;

            timelineEl.innerHTML = timelineHtml;
        } else {
            timelineEl.innerHTML = `<div class="loading-text">Žádná data pro časovou osu nebyla vrácena.</div>`;
        }
    }

    const statusCard = document.getElementById('statusCard');
    const levelEl = document.getElementById('activityLevel');
    const descEl = document.getElementById('activityDesc');

    if (!statusCard || !levelEl || !descEl) return;

    statusCard.className = 'status-card';

    let score = 0;

    if (bz <= -10) score += 45;
    else if (bz <= -7) score += 35;
    else if (bz <= -4) score += 25;
    else if (bz <= -2) score += 12;
    else if (bz < 0) score += 5;

    if (speed >= 600) score += 25;
    else if (speed >= 500) score += 18;
    else if (speed >= 420) score += 10;
    else if (speed >= 380) score += 4;

    if (density >= 20) score += 35;
    else if (density >= 12) score += 22;
    else if (density >= 7) score += 12;
    else if (density >= 4) score += 6;

    if (kpNum >= 6) score += 25;
    else if (kpNum >= 4) score += 15;
    else if (kpNum >= 2.5) score += 8;

    if (score >= 55 || bz <= -10 || density >= 20) {
        statusCard.classList.add('status-masakr');
        levelEl.innerText = "🚨 AURORA MASAKR!";
        levelEl.style.color = "#f56565";
        descEl.innerText = "Strong geomagnetic storm or high solar wind pressure! High probability of vivid auroras overhead.";
    } else if (score >= 30 || bz <= -4 || density >= 10) {
        statusCard.classList.add('status-better');
        levelEl.innerText = "⚡ HIGH ACTIVITY";
        levelEl.style.color = "#ecc94b";
        descEl.innerText = "Elevated solar wind pressure & favorable conditions. Excellent visual chance.";
    } else if (score >= 14 || bz < 0 || density >= 5) {
        statusCard.classList.add('status-good');
        levelEl.innerText = "🟢 MODERATE CHANCE";
        levelEl.style.color = "#48bb78";
        descEl.innerText = "Geomagnetic activity detected. Visible camera activity & faint arcs.";
    } else {
        statusCard.classList.add('status-quiet');
        levelEl.innerText = "QUIET CONDITIONS";
        levelEl.style.color = "#cbd5e0";
        descEl.innerText = "Geomagnetic field is quiet. Wait for solar wind speed, density or Bz to rise/drop.";
    }

    const lastUpdateEl = document.getElementById('lastUpdate');
    if (lastUpdateEl) lastUpdateEl.innerText = new Date().toLocaleTimeString();
}

document.addEventListener("DOMContentLoaded", () => {
    fetchAuroraData();
});

setInterval(fetchAuroraData, REFRESH_INTERVAL);