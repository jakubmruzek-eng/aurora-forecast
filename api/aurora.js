// Vykreslení časové osy (3hodinové bloky přesně podle NOAA)
const timelineEl = document.getElementById('timelineContainer');
if (timelineEl) {
    if (kpForecast && Array.isArray(kpForecast) && kpForecast.length > 0) {
        let timelineHtml = '';
        kpForecast.forEach(item => {
            const dateObj = new Date(item.time);
            const dateStr = !isNaN(dateObj) ? `${String(dateObj.getDate()).padStart(2, '0')}.${String(dateObj.getMonth() + 1).padStart(2, '0')}.` : '';
            
            // Určení 3hodinového intervalu podle začátku hodiny
            const startHour = !isNaN(dateObj) ? dateObj.getUTCHours() : 0;
            const endHour = (startHour + 3) % 24;
            const timeRangeStr = `${String(startHour).padStart(2, '0')}:00 - ${String(endHour).padStart(2, '0')}:00 UTC`;

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
                        <span style="font-size: 0.95rem; font-weight: 700; color: #4ef0c6; min-width: 100px;">${timeRangeStr}</span>
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