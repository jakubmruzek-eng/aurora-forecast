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
        const response = await fetch(`https://auroratrack-rho.vercel.app/api/aurora?t=${Date.now()}`, {
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('API response failed');
        
        const data = await response.json();
        
        updateAuroraUI({
            bz: parseFloat(data.bz),
            speed: parseFloat(data.speed),
            density: parseFloat(data.density),
            kp: parseFloat(data.kp)
        });
    } catch (e) {
        console.warn('Problém s načtením API, zkusí se znovu', e);
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
    const defaultLat = 66.5039;
    const defaultLon = 25.7294;
    const defaultName = "Rovaniemi, Finland";

    if (navigator.geolocation && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                fetchWeatherAndLocation(position.coords.latitude, position.coords.longitude);
            },
            () => {
                fetchWeatherAndLocation(defaultLat, defaultLon, defaultName);
            },
            { timeout: 10000 }
        );
    } else {
        fetchWeatherAndLocation(defaultLat, defaultLon, defaultName);
    }
}

async function fetchWeatherAndLocation(lat, lon, customName = null) {
    try {
        let locationName = customName;
        if (!locationName) {
            const revRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
            if (revRes.ok) {
                const revData = await revRes.json();
                const city = revData.city || revData.locality || revData.principalSubdivision || "Current Location";
                const country = revData.countryName || "";
                locationName = country ? `${city}, ${country}` : city;
            } else {
                locationName = "Current GPS Location";
            }
        }

        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m&hourly=temperature_2m,cloud_cover,wind_speed_10m&forecast_days=2`);
        if (weatherRes.ok) {
            const data = await weatherRes.json();
            const temp = data.current.temperature_2m;
            const clouds = data.current.cloud_cover;
            const wind = data.current.wind_speed_10m;
            const humidity = data.current.relative_humidity_2m;

            const dewPoint = (temp - ((100 - humidity) / 5)).toFixed(1);

            const weatherEl = document.getElementById('weatherInfo');
            if (weatherEl) weatherEl.innerHTML = `📍 ${locationName} | 🌡️ ${temp}°C | ☁️ ${clouds}% clouds | 💨 ${wind} m/s`;
            
            const tempEl = document.getElementById('tempVal');
            if (tempEl) tempEl.innerText = `${temp} °C`;
            
            const cloudEl = document.getElementById('cloudVal');
            if (cloudEl) cloudEl.innerText = `${clouds} %`;

            const dewEl = document.getElementById('dewVal');
            if (dewEl) dewEl.innerText = `${dewPoint} °C`;
            
            const yrTitleEl = document.getElementById('yrLocationTitle');
            if (yrTitleEl) yrTitleEl.innerText = `Hourly forecast for ${locationName}`;

            if (data.hourly && data.hourly.time) {
                renderHourlyWeather(data.hourly.time, data.hourly.cloud_cover, data.hourly.temperature_2m, data.hourly.wind_speed_10m);
            }
        }
    } catch (e) {
        console.warn('Počasí nedostupné', e);
    }
}

function renderHourlyWeather(times, clouds, temps, winds) {
    const container = document.getElementById('yrIframe');
    if (!container) return;

    let html = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; max-height: 350px; overflow-y: auto;">`;
    
    const nowHour = new Date().getHours();
    let count = 0;

    for (let i = 0; i < times.length && count < 24; i++) {
        const timeStr = times[i];
        const hour = parseInt(timeStr.substring(11, 13));
        const dayMatch = timeStr.substring(0, 10);
        const todayMatch = new Date().toISOString().substring(0, 10);

        if (hour >= nowHour || dayMatch !== todayMatch) {
            const timeLabel = timeStr.substring(11, 16);
            const cloud = clouds[i];
            const temp = temps[i];
            const wind = winds[i];

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

function updateAuroraUI({ bz, speed, density, kp }) {
    const formattedBz = (bz > 0 ? '+' : '') + Number(bz).toFixed(1);

    const bzEl = document.getElementById('bzVal');
    if (bzEl) bzEl.innerText = `${formattedBz} nT`;
    
    const speedEl = document.getElementById('speedVal');
    if (speedEl) speedEl.innerText = `${Math.round(speed)} km/s`;
    
    const densityEl = document.getElementById('densityVal');
    if (densityEl) densityEl.innerText = `${Number(density).toFixed(1)} p/cm³`;
    
    const kpEl = document.getElementById('kpVal');
    if (kpEl) kpEl.innerText = `${Number(kp).toFixed(1)}`;

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

    const kpNum = parseFloat(kp) || 0;
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