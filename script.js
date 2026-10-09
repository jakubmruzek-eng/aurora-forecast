const REFRESH_INTERVAL = 60000;

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
}

async function fetchAuroraData() {
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
    updateMoonPhase();

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
                fetchWeatherAndLocation(position.coords.latitude, position.coords.longitude);
            },
            (error) => {
                console.warn('GPS přístup odepřen nebo nedostupný', error);
                const mainTitleEl = document.getElementById('locationTitleMain');
                if (mainTitleEl) mainTitleEl.innerText = `📍 Location access required`;
            },
            { timeout: 10000, enableHighAccuracy: true }
        );
    } else {
        const mainTitleEl = document.getElementById('locationTitleMain');
        if (mainTitleEl) mainTitleEl.innerText = `📍 Geolocation not supported`;
    }
}

async function fetchWeatherAndLocation(lat, lon) {
    try {
        let locationName = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        
        // Získání přesného názvu místa přes OpenStreetMap Nominatim
        const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`, {
            headers: { 'User-Agent': 'AuroraTracker/1.0' }
        });
        
        if (revRes.ok) {
            const revData = await revRes.json();
            if (revData && revData.address) {
                const addr = revData.address;
                const place = addr.tourism || addr.village || addr.hamlet || addr.suburb || addr.neighbourhood || addr.city || addr.town || "";
                const country = addr.country || "";
                if (place) {
                    locationName = country ? `${place}, ${country}` : place;
                }
            }
        }

        // Načtení počasí z oficiálního Yr.no (MET Norway) API
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

    let html = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; max-height: 350px; overflow-y: auto;">`;
    
    let count = 0;
    for (let i = 0; i < timeseries.length && count < 24; i++) {
        const entry = timeseries[i];
        const timeStr = entry.time; // např. "2026-10-09T15:00:00Z"
        const details = entry.data.instant.details;
        
        const timeLabel = timeStr.substring(11, 16);
        const temp = details.air_temperature;
        const cloud = details.cloud_area_fraction;
        const wind = details.wind_speed;

        let cloudIcon = '☀️';
        if (cloud > 20 && cloud <= 70) cloudIcon = '⛅';
        else if (cloud > 70) cloudIcon = '☁️';

        html += `
            <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; text-align: center;">
                <div style="font-size: 0.8rem; color: #a0aec0; font-weight: 600;">${timeLabel}</div>
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

function updateMoonPhase() {
    const d = new Date();
    let year = d.getFullYear();
    let month = d.getMonth() + 1;
    const day = d.getDate();

    let c = 0, e = 0, jd = 0;
    if (month < 3) { year--; month += 12; }
    ++month;
    c = 365.25 * year;
    e = 30.6 * month;
    jd = c + e + day - 694039.0;
    jd /= 29.53058867;
    let phase = jd - Math.floor(jd);
    phase = phase * 100;

    let phaseName = "New Moon";
    if (phase > 1 && phase < 49) phaseName = "Waxing Crescent";
    else if (phase >= 49 && phase <= 51) phaseName = "First Quarter";
    else if (phase > 51 && phase < 99) phaseName = "Waxing Gibbous";
    else if (phase >= 99 || phase <= 1) phaseName = "Full Moon";
    else phaseName = "Waning Crescent";
    
    let illumination = Math.round(phase <= 50 ? phase * 2 : (100 - phase) * 2);
    if (illumination < 0) illumination = 0;

    const moonEl = document.getElementById('moonInfo');
    if (moonEl) {
        moonEl.innerHTML = `🟣 ${phaseName} — ${illumination}% illuminated`;
    }
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
    let gScaleDesc = "Normal background geomagnetic conditions.";
    if (kpNum >= 9) { gScaleText = "G5 (Extreme)"; gScaleDesc = "Widespread blackout, severe storms worldwide."; }
    else if (kpNum >= 8) { gScaleText = "G4 (Severe)"; gScaleDesc = "Extremely active conditions, widespread auroras."; }
    else if (kpNum >= 7) { gScaleText = "G3 (Strong)"; gScaleDesc = "Strong geomagnetic storm, high latitude visibility."; }
    else if (kpNum >= 6) { gScaleText = "G2 (Moderate)"; gScaleDesc = "Moderate storm conditions, great northern displays."; }
    else if (kpNum >= 5) { gScaleText = "G1 (Minor)"; gScaleDesc = "Minor storm, elevated activity in Lapland."; }

    const forecastKpEl = document.getElementById('forecastKpVal');
    if (forecastKpEl) forecastKpEl.innerText = kpNum.toFixed(1);

    const forecastScaleEl = document.getElementById('forecastScaleVal');
    if (forecastScaleEl) forecastScaleEl.innerText = gScaleText;

    const forecastGLevelEl = document.getElementById('forecastGLevel');
    if (forecastGLevelEl) forecastGLevelEl.innerText = gScaleText;

    const forecastGDescEl = document.getElementById('forecastGDesc');
    if (forecastGDescEl) forecastGDescEl.innerText = gScaleDesc;

    // Vykreslení časové osy (3hodinové bloky NOAA formát 00-03 UT)
    const timelineEl = document.getElementById('timelineContainer');
    if (timelineEl) {
        if (kpForecast && Array.isArray(kpForecast) && kpForecast.length > 0) {
            let timelineHtml = '';
            kpForecast.forEach(item => {
                const dateObj = new Date(item.time);
                const dateStr = !isNaN(dateObj) ? `${String(dateObj.getDate()).padStart(2, '0')}.${String(dateObj.getMonth() + 1).padStart(2, '0')}.` : '';
                
                const startHour = !isNaN(dateObj) ? dateObj.getUTCHours() : 0;
                const endHour = (startHour + 3) % 24;
                const slotStr = `${String(startHour).padStart(2, '0')}-${String(endHour).padStart(2, '0')} UT`;

                const val = parseFloat(item.kp).toFixed(1);
                
                let scaleStr = "Quiet";
                let badgeColor = "#718096";
                if (val >= 9) { scaleStr = "G5 Extreme"; badgeColor = "#f56565"; }
                else if (val >= 8) { scaleStr = "G4 Severe"; badgeColor = "#f56565"; }
                else if (val >= 7) { scaleStr = "G3 Strong"; badgeColor = "#ed8936"; }
                else if (val >= 6) { scaleStr = "G2 Moderate"; badgeColor = "#ecc94b"; }
                else if (val >= 5) { scaleStr = "G1 Minor Storm"; badgeColor = "#48bb78"; }

                timelineHtml += `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; padding: 12px 16px;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <span style="font-size: 0.85rem; color: #a0aec0; min-width: 45px;">${dateStr}</span>
                            <span style="font-size: 0.95rem; font-weight: 700; color: #4ef0c6; min-width: 90px;">${slotStr}</span>
                            <span style="font-size: 0.95rem; color: #e2e8f0; font-weight: 600;">🌐 Kp ${val}</span>
                        </div>
                        <div>
                            <span style="font-size: 0.8rem; font-weight: 700; color: ${badgeColor}; background: rgba(255,255,255,0.06); padding: 4px 10px; border-radius: 6px;">${scaleStr} (${item.status})</span>
                        </div>
                    </div>
                `;
            });
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
    if (bz <= -10) score += 40;
    else if (bz <= -5) score += 25;
    else if (bz <= -2) score += 15;
    else if (bz < 0) score += 5;

    if (speed >= 600) score += 30;
    else if (speed >= 500) score += 20;
    else if (speed >= 420) score += 10;

    if (kpNum >= 6) score += 30;
    else if (kpNum >= 4) score += 20;
    else if (kpNum >= 2.5) score += 10;

    if (score >= 70 || bz <= -10) {
        statusCard.classList.add('status-masakr');
        levelEl.innerText = "🚨 AURORA MASAKR!";
        levelEl.style.color = "#f56565";
        descEl.innerText = "Strong geomagnetic storm! High probability of vivid auroras overhead.";
    } else if (score >= 40 || bz <= -4) {
        statusCard.classList.add('status-better');
        levelEl.innerText = "⚡ HIGH ACTIVITY";
        levelEl.style.color = "#ecc94b";
        descEl.innerText = "Elevated solar wind & Bz conditions. Excellent visual chance.";
    } else if (score >= 20) {
        statusCard.classList.add('status-good');
        levelEl.innerText = "🟢 MODERATE CHANCE";
        levelEl.style.color = "#48bb78";
        descEl.innerText = "Geomagnetic activity detected. Visible camera activity & faint arcs.";
    } else {
        statusCard.classList.add('status-quiet');
        levelEl.innerText = "QUIET CONDITIONS";
        levelEl.style.color = "#cbd5e0";
        descEl.innerText = "Geomagnetic field is quiet. Wait for solar wind speed or Bz to drop negative.";
    }

    const lastUpdateEl = document.getElementById('lastUpdate');
    if (lastUpdateEl) lastUpdateEl.innerText = new Date().toLocaleTimeString();
}

document.addEventListener("DOMContentLoaded", () => {
    fetchAuroraData();
});

setInterval(fetchAuroraData, REFRESH_INTERVAL);