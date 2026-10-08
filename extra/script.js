document.addEventListener("DOMContentLoaded", () => {
  console.log("Aurora 3-Day Forecast loaded (correct layout).");
  loadThreeDayForecast();

  async function loadThreeDayForecast() {
    const summaryEl = document.getElementById("forecast-summary");
    const tableEl = document.getElementById("forecast-table");
    summaryEl.innerHTML = "<p>Loading forecast...</p>";
    tableEl.innerHTML = "";

    try {
      // KP forecast
      const kpRes = await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json");
      const kpData = await kpRes.json();
      const kpItems = kpData.slice(1, 25);

      // Real-time solar wind data
      const plasmaRes = await fetch("https://services.swpc.noaa.gov/products/solar-wind/plasma-2-hour.json");
      const magRes = await fetch("https://services.swpc.noaa.gov/products/solar-wind/mag-2-hour.json");
      const plasmaData = await plasmaRes.json();
      const magData = await magRes.json();

      const latestPlasma = plasmaData[plasmaData.length - 1];
      const latestMag = magData[magData.length - 1];

      // ✅ správné sloupce
      const density = parseFloat(latestPlasma[1]).toFixed(1); // p/cm³
      const speed = parseFloat(latestPlasma[2]).toFixed(0);   // km/s
      const bz = parseFloat(latestMag[3]).toFixed(1);          // nT

      // Časy po 3 hodinách
      const now = new Date();
      const forecast = kpItems.map((x, i) => {
        const time = new Date(now.getTime() + i * 3 * 60 * 60 * 1000);
        const kp = parseFloat(x[1]);
        return { time, kp, speed, bz, density };
      });

      const nextStorm = forecast.find(i => i.kp >= 5);
      const chance = nextStorm ? (nextStorm.kp >= 6 ? "Very High" : "High") : "Low";

      summaryEl.innerHTML = `
        📅 <b>3-Day Aurora Forecast</b><br>
        ⚡ Next storm: ${nextStorm ? formatTime(nextStorm.time) + " — " + getLevel(nextStorm.kp) + " (KP " + nextStorm.kp + ")" : "None"}<br>
        🎯 Aurora chance tonight: ${chance}<br>
        🕓 Updated: ${formatDate(now)} UTC
      `;

      // Tabulka
      let html = `<table>
        <tr>
          <th>Date / Time (UTC)</th>
          <th>KP</th>
          <th>Level</th>
          <th>Speed (km/s)</th>
          <th>BZ (nT)</th>
          <th>Density (p/cm³)</th>
        </tr>`;

      forecast.forEach(x => {
        const level = getLevel(x.kp);
        const color = getColor(x.kp);
        const emoji = getEmoji(x.kp);
        html += `<tr>
          <td>${formatDateTime(x.time)}</td>
          <td>${x.kp.toFixed(1)}</td>
          <td style="color:${color}">${emoji} ${level}</td>
          <td>${x.speed}</td>
          <td style="color:${x.bz < 0 ? '#ef4444' : '#22c55e'}">${x.bz}</td>
          <td>${x.density}</td>
        </tr>`;
      });

      html += "</table>";
      tableEl.innerHTML = html;

    } catch (e) {
      console.error(e);
      summaryEl.textContent = "Forecast data unavailable.";
    }
  }

  // Pomocné funkce
  function formatDateTime(d) {
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const year = d.getUTCFullYear();
    const hour = String(d.getUTCHours()).padStart(2, "0");
    const min = String(d.getUTCMinutes()).padStart(2, "0");
    return `${day}.${month}.${year} ${hour}:${min}`;
  }

  function formatDate(d) {
    return d.toISOString().replace("T", " ").slice(0, 16);
  }

  function formatTime(d) {
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const hour = String(d.getUTCHours()).padStart(2, "0");
    return `${day}.${month} ${hour}:00`;
  }

  function getLevel(kp) {
    if (kp < 3) return "Quiet";
    if (kp < 5) return "Active";
    if (kp < 6) return "G1 Storm";
    if (kp < 7) return "G2 Storm";
    return "G3+ Storm";
  }
  function getColor(kp) {
    if (kp < 3) return "#22c55e";
    if (kp < 5) return "#eab308";
    if (kp < 6) return "#f97316";
    return "#ef4444";
  }
  function getEmoji(kp) {
    if (kp < 3) return "🟢";
    if (kp < 5) return "🟡";
    if (kp < 6) return "🟠";
    return "🔴";
  }
});
